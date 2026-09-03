import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, safeId } from '../../../security';
import { getResult, getStem } from '../klangio';
import { brandPieSheetPdf } from '../piePdf';
import { signedStagingUrl } from '../staging';

export const runtime='nodejs';
export const maxDuration=60;

const LIBRARY_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-library';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const CHUNK_BYTES=2*1024*1024;
const STEMS=new Set(['vocals','drums','bass','guitar','piano','other']);

type Kind='recording'|'sheet'|'chords'|'stem';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function captureId(value:string){
  const id=value.trim();
  if(!/^[a-zA-Z0-9_-]{6,80}$/.test(id))throw new Error('INVALID_CAPTURE_ID');
  return id;
}

async function projectToken(){
  const token=await getVercelOidcToken().catch(()=> '');
  if(!token)throw new Error('PIE_PROJECT_IDENTITY_UNAVAILABLE');
  return token;
}

async function uploadBlob(path:string,blob:Blob){
  const oidc=await projectToken();
  const start=await fetch(LIBRARY_URL,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:SUPABASE_PUBLISHABLE_KEY,
      'X-Pie-Vercel-OIDC':oidc,
      'X-Pie-Audio-Action':'start',
    },
    body:JSON.stringify({path,type:blob.type||'application/octet-stream',size:blob.size}),
    cache:'no-store',
  });
  const started=await start.json().catch(()=>({}));
  if(!start.ok)throw new Error(typeof started?.error==='string'?started.error:'ARCHIVE_START_FAILED');
  const uploadUrl=String(started?.uploadUrl||'');
  let offset=Number(started?.offset||0);
  if(!uploadUrl||!Number.isFinite(offset)||offset<0)throw new Error('ARCHIVE_START_FAILED');

  while(offset<blob.size){
    const end=Math.min(offset+CHUNK_BYTES,blob.size);
    const bytes=await blob.slice(offset,end).arrayBuffer();
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
    if(!chunk.ok)throw new Error(typeof data?.error==='string'?data.error:'ARCHIVE_CHUNK_FAILED');
    const next=Number(data?.offset);
    if(!Number.isFinite(next)||next<=offset)throw new Error('ARCHIVE_CHUNK_FAILED');
    offset=next;
  }
}

async function sourceBlob(path:string){
  if(!path.startsWith('pie-primary/staging/')||path.includes('..')||path.includes('\\'))throw new Error('INVALID_SOURCE_PATH');
  const signed=await signedStagingUrl(path);
  const response=await fetch(signed,{cache:'no-store'});
  if(!response.ok)throw new Error('CAPTURED_SOURCE_NOT_FOUND');
  const bytes=await response.arrayBuffer();
  return new Blob([bytes],{type:response.headers.get('content-type')||'audio/wav'});
}

export async function POST(req:Request){
  const limited=rateLimit(req,'capture-archive-file',24,60_000);
  if(limited)return limited;

  try{
    const body=await req.json() as {captureId?:string;kind?:Kind;stagedPath?:string;jobId?:string;stem?:string};
    const id=captureId(String(body.captureId||''));
    const kind=String(body.kind||'') as Kind;
    let blob:Blob;
    let name='';

    if(kind==='recording'){
      blob=await sourceBlob(String(body.stagedPath||''));
      name='recording.wav';
    }else if(kind==='sheet'){
      const jobId=safeId(String(body.jobId||''),180);
      const result=await getResult(jobId,'pdf');
      const branded=await brandPieSheetPdf(result.bytes);
      blob=new Blob([toArrayBuffer(branded)],{type:'application/pdf'});
      name='pie-sheet.pdf';
    }else if(kind==='chords'){
      const jobId=safeId(String(body.jobId||''),180);
      const result=await getResult(jobId,'json');
      blob=new Blob([result.bytes],{type:result.contentType||'application/json'});
      name='chords.json';
    }else if(kind==='stem'){
      const jobId=safeId(String(body.jobId||''),180);
      const stem=String(body.stem||'').toLowerCase();
      if(!STEMS.has(stem))throw new Error('INVALID_STEM');
      blob=await getStem(jobId,stem);
      name=`${stem}.wav`;
    }else{
      throw new Error('INVALID_ARCHIVE_KIND');
    }

    if(!blob.size)throw new Error('EMPTY_OUTPUT_FILE');
    const path=`pie-primary/staging/library/${id}/${name}`;
    await uploadBlob(path,blob);
    return NextResponse.json({path,name,type:blob.type||'application/octet-stream',size:blob.size},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('Capture output archive failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not save this output file to Pie.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
