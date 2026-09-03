import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { createChordRecognition, createSourceSeparation, createTranscription } from '../klangio';
import { signedStagingUrl } from '../staging';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Outputs={stems?:boolean;fullSheet?:boolean;partSheets?:boolean;chords?:boolean};

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

  try{
    const body=await req.json() as {stagedPath?:string;name?:string;type?:string;outputs?:Outputs};
    const stagedPath=String(body.stagedPath||'');
    if(!stagedPath)return NextResponse.json({error:'Upload the audio file first.'},{status:400});

    const outputs:Outputs={
      stems:Boolean(body.outputs?.stems),
      fullSheet:Boolean(body.outputs?.fullSheet),
      partSheets:Boolean(body.outputs?.partSheets),
      chords:Boolean(body.outputs?.chords),
    };
    if(!Object.values(outputs).some(Boolean))return NextResponse.json({error:'Choose at least one output.'},{status:400});

    const title=String(body.name||'Android playback recording').slice(0,120);
    const blob=await fetchStagedAudio(stagedPath,String(body.type||'audio/wav'));
    const jobs:Record<string,string>={};
    const pending:Promise<void>[]=[];

    if(outputs.fullSheet)pending.push(createTranscription(blob,'universal',title).then(id=>{jobs.full=id;}));
    if(outputs.chords)pending.push(createChordRecognition(blob).then(id=>{jobs.chords=id;}));
    if(outputs.stems||outputs.partSheets)pending.push(createSourceSeparation(blob).then(id=>{jobs.separation=id;}));

    await Promise.all(pending);
    // Keep the staged source recording. It is now the durable source for the
    // Songs library, downloads, and retries if a downstream analysis job fails.
    return NextResponse.json({jobs,outputs,title,stagedPath},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Sheet and stem processing is not configured yet.'},{status:503});
    if(message==='AUDIO_TOO_LARGE')return NextResponse.json({error:'Use an audio file under 45 MB.'},{status:413});
    if(message==='STAGED_AUDIO_FETCH_FAILED')return NextResponse.json({error:'The saved recording could not be found. Record it again only if it is no longer in your Songs library.'},{status:404});
    console.error('Uploaded audio processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not start the selected processing jobs.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
