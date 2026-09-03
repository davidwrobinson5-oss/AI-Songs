import { createChordRecognition, createSourceSeparation, createTranscription } from './klangio';
import { signedStagingUrl } from './staging';

export const PROCESSING_RETRY_COOKIE='pie_processing_retry';
export const MAX_PROCESSING_ATTEMPTS=3;

export type Outputs={stems?:boolean;fullSheet?:boolean;partSheets?:boolean;chords?:boolean};
export type RetryDescriptor={stagedPath:string;title:string;type:string;outputs:Outputs;attempt:number};

export function normalizeOutputs(value:Outputs|undefined):Outputs{
  return {
    stems:Boolean(value?.stems),
    fullSheet:Boolean(value?.fullSheet),
    partSheets:Boolean(value?.partSheets),
    chords:Boolean(value?.chords),
  };
}

export function validStagedPath(path:string){
  return path.startsWith('pie-primary/staging/')&&!path.includes('..')&&path.length<500;
}

async function fetchStagedAudio(path:string,type:string){
  if(!validStagedPath(path))throw new Error('STAGED_AUDIO_FETCH_FAILED');
  const signed=await signedStagingUrl(path);
  const response=await fetch(signed,{cache:'no-store'});
  if(!response.ok)throw new Error('STAGED_AUDIO_FETCH_FAILED');
  const declared=Number(response.headers.get('content-length')||0);
  if(declared&&declared>45*1024*1024)throw new Error('AUDIO_TOO_LARGE');
  const bytes=await response.arrayBuffer();
  if(!bytes.byteLength||bytes.byteLength>45*1024*1024)throw new Error('AUDIO_TOO_LARGE');
  return new Blob([bytes],{type:type||response.headers.get('content-type')||'audio/mpeg'});
}

export async function startProcessingFromStaged(descriptor:RetryDescriptor){
  const stagedPath=String(descriptor.stagedPath||'');
  if(!validStagedPath(stagedPath))throw new Error('STAGED_AUDIO_FETCH_FAILED');
  const outputs=normalizeOutputs(descriptor.outputs);
  if(!Object.values(outputs).some(Boolean))throw new Error('NO_OUTPUTS');

  const title=String(descriptor.title||'Android playback recording').slice(0,120);
  const type=String(descriptor.type||'audio/wav');
  const blob=await fetchStagedAudio(stagedPath,type);
  const jobs:Record<string,string>={};
  const pending:Promise<void>[]=[];

  if(outputs.fullSheet)pending.push(createTranscription(blob,'universal',title).then(id=>{jobs.full=id;}));
  if(outputs.chords)pending.push(createChordRecognition(blob).then(id=>{jobs.chords=id;}));
  if(outputs.stems||outputs.partSheets)pending.push(createSourceSeparation(blob).then(id=>{jobs.separation=id;}));

  await Promise.all(pending);
  return {jobs,outputs,title,stagedPath,type,attempt:descriptor.attempt};
}

export function encodeRetryDescriptor(descriptor:RetryDescriptor){
  return Buffer.from(JSON.stringify({
    stagedPath:String(descriptor.stagedPath||''),
    title:String(descriptor.title||'Android playback recording').slice(0,120),
    type:String(descriptor.type||'audio/wav'),
    outputs:normalizeOutputs(descriptor.outputs),
    attempt:Math.min(MAX_PROCESSING_ATTEMPTS,Math.max(1,Number(descriptor.attempt)||1)),
  }),'utf8').toString('base64url');
}

export function decodeRetryDescriptor(value:string):RetryDescriptor|null{
  try{
    const parsed=JSON.parse(Buffer.from(value,'base64url').toString('utf8')) as Partial<RetryDescriptor>;
    const stagedPath=String(parsed?.stagedPath||'');
    if(!validStagedPath(stagedPath))return null;
    const outputs=normalizeOutputs(parsed?.outputs);
    if(!Object.values(outputs).some(Boolean))return null;
    return {
      stagedPath,
      title:String(parsed?.title||'Android playback recording').slice(0,120),
      type:String(parsed?.type||'audio/wav'),
      outputs,
      attempt:Math.min(MAX_PROCESSING_ATTEMPTS,Math.max(1,Number(parsed?.attempt)||1)),
    };
  }catch{return null;}
}
