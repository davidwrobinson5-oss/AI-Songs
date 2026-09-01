import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, validateAudioFile } from '../../../security';
import { createChordRecognition, createSourceSeparation, createTranscription } from '../klangio';

export const runtime='nodejs';
export const maxDuration=60;

function yes(v:FormDataEntryValue|null){return String(v||'')==='true'}

export async function POST(req:Request){
  const limited=rateLimit(req,'mobile-audio-process',6,60_000);
  if(limited)return limited;
  try{
    const form=await req.formData();
    const file=form.get('file');
    if(!(file instanceof Blob))throw new Error('INVALID_AUDIO');
    validateAudioFile(file,45*1024*1024);
    const outputs={
      stems:yes(form.get('stems')),
      fullSheet:yes(form.get('fullSheet')),
      partSheets:yes(form.get('partSheets')),
      chords:yes(form.get('chords')),
    };
    if(!Object.values(outputs).some(Boolean))return NextResponse.json({error:'Choose at least one output.'},{status:400});
    const title=String(form.get('title')||'Android playback recording').slice(0,120);
    const jobs:Record<string,string>={};
    const pending:Promise<void>[]=[];
    if(outputs.fullSheet)pending.push(createTranscription(file,'universal',title).then(id=>{jobs.full=id}));
    if(outputs.chords)pending.push(createChordRecognition(file).then(id=>{jobs.chords=id}));
    if(outputs.stems||outputs.partSheets)pending.push(createSourceSeparation(file).then(id=>{jobs.separation=id}));
    await Promise.all(pending);
    return NextResponse.json({jobs,outputs,title},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof Error&&error.message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Klangio is not configured.'},{status:503});
    console.error('Android recording processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not process the Android recording.')},{status:400});
  }
}
