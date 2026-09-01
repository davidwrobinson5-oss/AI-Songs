import { NextResponse } from 'next/server';
import { Innertube } from 'youtubei.js';
import { rateLimit, safeClientError } from '../../../security';
import { createChordRecognition, createSourceSeparation, createTranscription } from '../klangio';
import { removeStagedFile, signedStagingUrl } from '../staging';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_BYTES = 45 * 1024 * 1024;
const MAX_YOUTUBE_SECONDS = 15 * 60;

function isYouTubeHost(hostname:string){
  const host=hostname.toLowerCase();
  return host==='youtube.com'||host.endsWith('.youtube.com')||host==='youtu.be'||host.endsWith('.youtu.be');
}

function isPrivateHost(hostname:string){
  const host=hostname.toLowerCase();
  return host==='localhost'||host==='127.0.0.1'||host==='::1'||host.endsWith('.local')||/^10\./.test(host)||/^192\.168\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function youtubeVideoId(url:URL){
  if(url.hostname.toLowerCase().includes('youtu.be'))return url.pathname.split('/').filter(Boolean)[0]||'';
  const v=url.searchParams.get('v');
  if(v)return v;
  const parts=url.pathname.split('/').filter(Boolean);
  if(['shorts','embed','live'].includes(parts[0]||''))return parts[1]||'';
  return '';
}

async function readStreamLimited(stream:ReadableStream<Uint8Array>){
  const reader=stream.getReader();
  const chunks:Uint8Array[]=[];
  let total=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!value)continue;
      total+=value.byteLength;
      if(total>MAX_BYTES)throw new Error('LINK_TOO_LARGE');
      chunks.push(value);
    }
  }finally{
    reader.releaseLock();
  }
  if(!total)throw new Error('LINK_FETCH_FAILED');
  const merged=new Uint8Array(total);
  let offset=0;
  for(const chunk of chunks){merged.set(chunk,offset);offset+=chunk.byteLength;}
  return merged;
}

async function fetchYouTubeAudio(rawUrl:string){
  const parsed=new URL(rawUrl);
  const id=youtubeVideoId(parsed);
  if(!id)throw new Error('YOUTUBE_INVALID_URL');

  const youtube=await Innertube.create({generate_session_locally:true});
  const info=await youtube.getInfo(id);
  const duration=Number(info.basic_info.duration||0);
  if(duration&&duration>MAX_YOUTUBE_SECONDS)throw new Error('YOUTUBE_TOO_LONG');

  const stream=await info.download({type:'audio',quality:'best'});
  const bytes=await readStreamLimited(stream);
  const title=String(info.basic_info.title||'YouTube audio').slice(0,120);
  return {blob:new Blob([bytes],{type:'audio/mp4'}),sourceLabel:title};
}

async function fetchDirectMedia(rawUrl:string){
  const url=new URL(rawUrl);
  if(url.protocol!=='https:')throw new Error('LINK_HTTPS_ONLY');
  if(isPrivateHost(url.hostname))throw new Error('PRIVATE_LINK_BLOCKED');

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),30_000);
  try{
    const response=await fetch(url,{method:'GET',redirect:'follow',cache:'no-store',signal:controller.signal,headers:{'User-Agent':'PieMusicAnalyzer/2.1'}});
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
  const limited=rateLimit(req,'sheets-link-process',4,60_000);
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
      const parsed=new URL(rawUrl);
      if(isYouTubeHost(parsed.hostname)){
        const result=await fetchYouTubeAudio(rawUrl);
        blob=result.blob;
        sourceLabel=result.sourceLabel;
      }else{
        const result=await fetchDirectMedia(rawUrl);
        blob=result.blob;
        sourceLabel=result.sourceLabel;
      }
    }

    const [full,chords,separation]=await Promise.all([
      createTranscription(blob,'universal',sourceLabel),
      createChordRecognition(blob),
      createSourceSeparation(blob),
    ]);

    return NextResponse.json({jobs:{full,chords,separation},sourceLabel},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message==='YOUTUBE_INVALID_URL')return NextResponse.json({error:'That YouTube link is not recognized.'},{status:400});
    if(message==='YOUTUBE_TOO_LONG')return NextResponse.json({error:'Use a YouTube source under 15 minutes for this first version.'},{status:413});
    if(message==='LINK_NOT_MEDIA')return NextResponse.json({error:'That URL is a webpage, not a direct audio/video file. YouTube links are supported; other sites need a direct media URL.'},{status:415});
    if(message==='LINK_TOO_LARGE')return NextResponse.json({error:'That media source is too large. Use audio/video under 45 MB.'},{status:413});
    if(message==='LINK_HTTPS_ONLY'||message==='PRIVATE_LINK_BLOCKED')return NextResponse.json({error:'That link cannot be fetched safely.'},{status:400});
    if(message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Sheet and stem processing is not configured yet.'},{status:503});
    console.error('Music link processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not analyze that music link.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }finally{
    if(stagedPath)await removeStagedFile(stagedPath);
  }
}
