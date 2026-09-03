import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { signedStagingUrl } from '../staging';

export const runtime='nodejs';
export const maxDuration=60;

export async function GET(req:Request){
  const limited=rateLimit(req,'captured-source-download',24,60_000);
  if(limited)return limited;
  try{
    const url=new URL(req.url);
    const path=String(url.searchParams.get('path')||'');
    if(!path.startsWith('pie-primary/staging/')||path.includes('..')||path.includes('\\')){
      return NextResponse.json({error:'Invalid captured recording path.'},{status:400,headers:{'Cache-Control':'no-store'}});
    }
    const signed=await signedStagingUrl(path);
    const response=await fetch(signed,{cache:'no-store'});
    if(!response.ok)throw new Error('CAPTURED_SOURCE_NOT_FOUND');
    const bytes=await response.arrayBuffer();
    return new NextResponse(bytes,{
      headers:{
        'Content-Type':response.headers.get('content-type')||'audio/wav',
        'Content-Disposition':'attachment; filename="pie-recording.wav"',
        'Cache-Control':'private, no-store',
        'X-Content-Type-Options':'nosniff',
      },
    });
  }catch(error){
    console.error('Captured source download failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not download this captured recording.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
