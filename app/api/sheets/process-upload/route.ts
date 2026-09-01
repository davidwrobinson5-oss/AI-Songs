import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { createChordRecognition, createSourceSeparation, createTranscription } from '../klangio';
import { removeStagedFile, signedStagingUrl } from '../staging';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function fetchStagedAudio(path:string,type:string){
  const signed=await signedStagingUrl(path);
  const response=await fetch(signed,{cache:'no-store'});
  if(!response.ok)throw new Error('STAGED_AUDIO_FETCH_FAILED');
  const declared=Number(response.headers.get('content-length')||0);
  if(declared&&declared>45*1024*1024)throw new Error('AUDIO_TOO_LARGE');
  const bytes=await response.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>45*1024*1024)throw new Error('AUDIO_TOO_LARGE');
  return new Blob([bytes],{type:type||response.headers.get('content-type')||'audio/mpeg'});
}

export async function POST(req:Request){
  const limited=rateLimit(req,'sheets-process-upload',6,60_000);
  if(limited)return limited;

  let stagedPath='';
  try{
    const body=await req.json() as {stagedPath?:string;name?:string;type?:string};
    stagedPath=String(body.stagedPath||'');
    if(!stagedPath)return NextResponse.json({error:'Upload the audio file first.'},{status:400});
    const title=String(body.name||'Uploaded song').slice(0,120);
    const blob=await fetchStagedAudio(stagedPath,String(body.type||'audio/mpeg'));
    const [full,chords,separation]=await Promise.all([
      createTranscription(blob,'universal',title),
      createChordRecognition(blob),
      createSourceSeparation(blob),
    ]);
    return NextResponse.json({jobs:{full,chords,separation}},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Sheet and stem processing is not configured yet.'},{status:503});
    if(message==='AUDIO_TOO_LARGE')return NextResponse.json({error:'Use an audio file under 45 MB.'},{status:413});
    console.error('Uploaded audio processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not start sheet music and stem processing.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }finally{
    if(stagedPath)await removeStagedFile(stagedPath);
  }
}
