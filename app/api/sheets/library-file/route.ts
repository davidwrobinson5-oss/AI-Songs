import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { signedStagingUrl } from '../staging';

export const runtime='nodejs';
export const maxDuration=60;

function safeFileName(value:string){
  return value.replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)||'pie-file';
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
    return new NextResponse(bytes,{
      headers:{
        'Content-Type':response.headers.get('content-type')||'application/octet-stream',
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
