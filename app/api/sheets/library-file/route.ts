import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { signedStagingUrl } from '../staging';

export const runtime='nodejs';
export const maxDuration=60;

function safeFileName(value:string){
  return value.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)||'pie-file';
}

function contentTypeForName(name:string,upstream:string|null){
  const lower=name.toLowerCase();
  if(lower.endsWith('.pdf'))return 'application/pdf';
  if(lower.endsWith('.wav'))return 'audio/wav';
  if(lower.endsWith('.mp3'))return 'audio/mpeg';
  if(lower.endsWith('.m4a'))return 'audio/mp4';
  if(lower.endsWith('.aac'))return 'audio/aac';
  if(lower.endsWith('.flac'))return 'audio/flac';
  if(lower.endsWith('.json'))return 'application/json; charset=utf-8';
  if(lower.endsWith('.txt'))return 'text/plain; charset=utf-8';
  if(lower.endsWith('.xml')||lower.endsWith('.musicxml'))return 'application/xml; charset=utf-8';
  if(lower.endsWith('.mxl'))return 'application/vnd.recordare.musicxml';
  if(lower.endsWith('.mid')||lower.endsWith('.midi'))return 'audio/midi';
  const normalized=(upstream||'').trim().toLowerCase();
  if(normalized&&normalized!=='application/octet-stream'&&normalized!=='binary/octet-stream')return upstream as string;
  return 'application/octet-stream';
}

export async function GET(req:Request){
  const limited=rateLimit(req,'capture-library-file',36,60_000);
  if(limited)return limited;
  try{
    const url=new URL(req.url);
    const path=String(url.searchParams.get('path')||'');
    if(!path.startsWith('pie-primary/staging/library/')||path.includes('..')||path.includes('\\')){
      return NextResponse.json({error:'Invalid saved file path.'},{status:400,headers:{'Cache-Control':'no-store'}});
    }
    const signed=await signedStagingUrl(path);
    const response=await fetch(signed,{cache:'no-store'});
    if(!response.ok)throw new Error('SAVED_FILE_NOT_FOUND');
    const bytes=await response.arrayBuffer();
    const name=safeFileName(String(url.searchParams.get('name')||path.split('/').pop()||'pie-file'));
    const mode=url.searchParams.get('download')==='1'?'attachment':'inline';
    const contentType=contentTypeForName(name,response.headers.get('content-type'));
    return new NextResponse(bytes,{
      headers:{
        'Content-Type':contentType,
        'Content-Disposition':`${mode}; filename="${name}"`,
        'Content-Length':String(bytes.byteLength),
        'Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff',
      },
    });
  }catch(error){
    console.error('Saved capture file failed',error);
    return NextResponse.json({error:safeClientError(error,'That saved file could not be opened.')},{status:404,headers:{'Cache-Control':'no-store'}});
  }
}
