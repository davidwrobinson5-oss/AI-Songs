import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { createChordRecognition, createSourceSeparation, createTranscription } from '../klangio';
import { removeStagedFile, signedStagingUrl } from '../staging';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 45 * 1024 * 1024;

function isYouTubeHost(hostname:string){
  const host=hostname.toLowerCase();
  return host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtu.be'||host.endsWith('.youtu.be');
}

function isPrivateHost(hostname:string){
  const host=hostname.toLowerCase();
  return host==='localhost'||host==='127.0.0.1'||host==='::1'||host.endsWith('.local')||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

async function fetchDirectMedia(rawUrl:string){
  const url=new URL(rawUrl);
  if(url.protocol!=='https:')throw new Error('LINK_HTTPS_ONLY');
  if(isYouTubeHost(url.hostname))throw new Error('YOUTUBE_AUTHORIZED_MEDIA_REQUIRED');
  if(isPrivateHost(url.hostname))throw new Error('PRIVATE_LINK_BLOCKED');

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30_000);
  try{
    const response=await fetch(url,{method:'GET',redirect:'follow',cache:'no-store',signal:controller.signal,headers:{'User-Agent':'PieMusicAnalyzer/2.0'}});
    if(!response.ok)throw new Error('LINK_FETCH_FAILED');
    const finalUrl=new URL(response.url||url.toString());
    if(isPrivateHost(finalUrl.hostname))throw new Error('PRIVATE_LINK_BLOCKED');
    const contentType=(response.headers.get('content-type')||'').toLowerCase();
    const declared=Number(response.headers.get('content-length')||0);
    if(declared&&declared>MAX_BYTES)throw new Error('LINK_TOO_LARGE');
    if(!contentType.startsWith('audio/')&&!contentType.startsWith('video/'))throw new Error('LINK_NOT_MEDIA');
    const bytes=new Uint8Array(await response.arrayBuffer());
    if(!bytes.byteLength||bytes.byteLength>MAX_BYTES)throw new Error('LINK_TOO_LARGE');
    return {blob:new Blob([bytes],{type:contentType||'audio/mpeg'}),sourceLabel:finalUrl.hostname};
  }finally{clearTimeout(timer)}
}

async function fetchStagedMedia(path:string,type:string){
  const signed=await signedStagingUrl(path);
  const response=await fetch(signed,{cache:'no-store'});
  if(!response.ok)throw new Error('STAGED_MEDIA_FETCH_FAILED');
  const declared=Number(response.headers.get('content-length')||0);
  if(declared&&declared>MAX_BYTES)throw new Error('LINK_TOO_LARGE');
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(!bytes.byteLength||bytes.byteLength>MAX_BYTES)throw new Error('LINK_TOO_LARGE');
  return new Blob([bytes],{type:type||response.headers.get('content-type')||'audio/mpeg'});
}

export async function POST(req:Request){
  const limited=rateLimit(req,'sheets-link-process',6,60_000);
  if(limited)return limited;

  let stagedPath='';
  try{
    const body=await req.json() as {url?:string;stagedPath?:string;name?:string;type?:string};
    stagedPath=String(body.stagedPath||'');
    let blob:Blob;
    let sourceLabel=String(body.name||'Uploaded media').slice(0,120);

    if(stagedPath){
      blob=await fetchStagedMedia(stagedPath,String(body.type||'application/octet-stream'));
    }else{
      const rawUrl=String(body.url||'').trim();
      if(!rawUrl)return NextResponse.json({error:'Paste a music link first.'},{status:400});
      const result=await fetchDirectMedia(rawUrl);
      blob=result.blob;
      sourceLabel=result.sourceLabel;
    }

    const [full,chords,separation]=await Promise.all([
      createTranscription(blob,'universal',sourceLabel),
      createChordRecognition(blob),
      createSourceSeparation(blob),
    ]);

    return NextResponse.json({jobs:{full,chords,separation},sourceLabel},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message==='YOUTUBE_AUTHORIZED_MEDIA_REQUIRED')return NextResponse.json({error:'YouTube does not expose the audio stream through its official API. Use the Upload Audio / Video button with a file you are authorized to analyze.'},{status:409});
    if(message==='LINK_NOT_MEDIA')return NextResponse.json({error:'That URL is a webpage, not a direct audio/video file. Use a direct media URL or upload the audio/video file.'},{status:415});
    if(message==='LINK_TOO_LARGE')return NextResponse.json({error:'That media source is too large. Use audio/video under 45 MB.'},{status:413});
    if(message==='LINK_HTTPS_ONLY'||message==='PRIVATE_LINK_BLOCKED')return NextResponse.json({error:'That link cannot be fetched safely.'},{status:400});
    if(message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Sheet and stem processing is not configured yet.'},{status:503});
    console.error('Music link processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not analyze that music link.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }finally{
    if(stagedPath)await removeStagedFile(stagedPath);
  }
}
