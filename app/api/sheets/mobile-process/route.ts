import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, validateAudioFile } from '../../../security';
import { createChordRecognition, createSourceSeparation, createTranscription } from '../klangio';

export const runtime='nodejs';
export const maxDuration=60;

const CAPTURE_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-capture';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

function yes(v:FormDataEntryValue|null){return String(v||'')==='true'}

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

    const outputs={
      stems:yes(form.get('stems')),
      fullSheet:yes(form.get('fullSheet')),
      partSheets:yes(form.get('partSheets')),
      chords:yes(form.get('chords')),
    };
    if(!Object.values(outputs).some(Boolean))throw new Error('NO_OUTPUT_SELECTED');

    const title=String(form.get('title')||'Android playback recording').slice(0,120);
    const jobs:Record<string,string>={};
    const pending:Promise<void>[]=[];
    if(outputs.fullSheet)pending.push(createTranscription(file,'universal',title).then(id=>{jobs.full=id}));
    if(outputs.chords)pending.push(createChordRecognition(file).then(id=>{jobs.chords=id}));
    if(outputs.stems||outputs.partSheets)pending.push(createSourceSeparation(file).then(id=>{jobs.separation=id}));
    await Promise.all(pending);

    await updateCapture(captureId,captureSecret,'accepted','accepted');
    return NextResponse.json({jobs,outputs,title},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(captureValidated&&captureId&&captureSecret){
      try{await updateCapture(captureId,captureSecret,'processingFailed','processingFailed')}catch{}
    }
    if(error instanceof Error&&error.message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Klangio is not configured.'},{status:503,headers:{'Cache-Control':'no-store'}});
    if(error instanceof Error&&error.message==='NO_OUTPUT_SELECTED')return NextResponse.json({error:'Choose at least one output.'},{status:400,headers:{'Cache-Control':'no-store'}});
    if(error instanceof Error&&(error.message==='Capture session not found.'||error.message==='CAPTURE_AUTH_FAILED'))return NextResponse.json({error:'Invalid or expired Pie capture session.'},{status:401,headers:{'Cache-Control':'no-store'}});
    console.error('Android recording processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not process the Android recording.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
