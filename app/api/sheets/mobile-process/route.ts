import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, validateAudioFile } from '../../../security';

export const runtime='nodejs';
export const maxDuration=60;

const CAPTURE_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-capture';
const LIBRARY_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-library';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const CHUNK_BYTES=2*1024*1024;

function safeName(name:string){
  return (name||'recording.wav').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-100)||'recording.wav';
}

async function updateCapture(id:string,secret:string,status:string,result?:string){
  const response=await fetch(CAPTURE_URL,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:SUPABASE_PUBLISHABLE_KEY,
    },
    body:JSON.stringify({action:'update',id,secret,status,result:result??null}),
    cache:'no-store',
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(typeof data?.error==='string'?data.error:'CAPTURE_AUTH_FAILED');
}

async function pieProjectToken(){
  const token=await getVercelOidcToken().catch(()=> '');
  if(!token)throw new Error('PIE_PROJECT_IDENTITY_UNAVAILABLE');
  return token;
}

async function stageRecording(file:Blob,fileName:string,captureId:string){
  const oidc=await pieProjectToken();
  const path=`pie-primary/staging/${Date.now()}_${captureId.slice(0,8)}_${safeName(fileName)}`;

  const start=await fetch(LIBRARY_URL,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:SUPABASE_PUBLISHABLE_KEY,
      'X-Pie-Vercel-OIDC':oidc,
      'X-Pie-Audio-Action':'start',
    },
    body:JSON.stringify({path,type:file.type||'audio/wav',size:file.size}),
    cache:'no-store',
  });
  const started=await start.json().catch(()=>({}));
  if(!start.ok)throw new Error(typeof started?.error==='string'?started.error:'STAGING_START_FAILED');

  const uploadUrl=String(started?.uploadUrl||'');
  let offset=Number(started?.offset||0);
  if(!uploadUrl||!Number.isFinite(offset)||offset<0)throw new Error('STAGING_START_FAILED');

  while(offset<file.size){
    const end=Math.min(offset+CHUNK_BYTES,file.size);
    const bytes=await file.slice(offset,end).arrayBuffer();
    const chunk=await fetch(LIBRARY_URL,{
      method:'POST',
      headers:{
        'Content-Type':'application/octet-stream',
        apikey:SUPABASE_PUBLISHABLE_KEY,
        'X-Pie-Vercel-OIDC':oidc,
        'X-Pie-Audio-Action':'chunk',
        'X-Pie-Upload-Url':uploadUrl,
        'X-Pie-Upload-Offset':String(offset),
      },
      body:Buffer.from(bytes),
      cache:'no-store',
    });
    const data=await chunk.json().catch(()=>({}));
    if(!chunk.ok)throw new Error(typeof data?.error==='string'?data.error:'STAGING_CHUNK_FAILED');
    const next=Number(data?.offset);
    if(!Number.isFinite(next)||next<=offset)throw new Error('STAGING_CHUNK_FAILED');
    offset=next;
  }

  return path;
}

export async function POST(req:Request){
  const limited=rateLimit(req,'mobile-audio-process',6,60_000);
  if(limited)return limited;

  let captureId='';
  let captureSecret='';
  let captureValidated=false;

  try{
    const form=await req.formData();
    captureId=String(form.get('captureId')||'').trim();
    captureSecret=String(form.get('captureSecret')||'').trim();
    if(!captureId||captureSecret.length<32)return NextResponse.json({error:'Invalid Pie capture session.'},{status:401,headers:{'Cache-Control':'no-store'}});

    const file=form.get('file');
    if(!(file instanceof Blob))throw new Error('INVALID_AUDIO');
    validateAudioFile(file,45*1024*1024);

    await updateCapture(captureId,captureSecret,'uploading');
    captureValidated=true;

    const title=String(form.get('title')||'Android playback recording').slice(0,120);
    const fileName=file instanceof File?file.name:'recording.wav';
    const stagedPath=await stageRecording(file,fileName,captureId);
    const result=JSON.stringify({version:2,awaitingSelection:true,stagedPath,title});

    await updateCapture(captureId,captureSecret,'accepted',result);
    return NextResponse.json({awaitingSelection:true,stagedPath,title},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(captureValidated&&captureId&&captureSecret){
      try{await updateCapture(captureId,captureSecret,'uploadFailed','uploadFailed')}catch{}
    }
    if(error instanceof Error&&(error.message==='Capture session not found.'||error.message==='CAPTURE_AUTH_FAILED'))return NextResponse.json({error:'Invalid or expired Pie capture session.'},{status:401,headers:{'Cache-Control':'no-store'}});
    console.error('Android recording staging failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not upload the Android recording to Pie.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
