import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import {
  PROCESSING_RETRY_COOKIE,
  decodeRetryDescriptor,
  startProcessingFromStaged,
} from '../processingSource';

export const runtime='nodejs';
export const maxDuration=60;

export async function POST(req:NextRequest){
  const limited=rateLimit(req,'sheets-retry-processing',6,60_000);
  if(limited)return limited;

  try{
    const encoded=req.cookies.get(PROCESSING_RETRY_COOKIE)?.value||'';
    const descriptor=decodeRetryDescriptor(encoded);
    if(!descriptor){
      return NextResponse.json({error:'Pie no longer has the saved processing reference for this recording.'},{status:404,headers:{'Cache-Control':'no-store'}});
    }

    const result=await startProcessingFromStaged(descriptor);
    return NextResponse.json(result,{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Sheet and stem processing is not configured yet.'},{status:503});
    if(message==='AUDIO_TOO_LARGE')return NextResponse.json({error:'Use an audio file under 45 MB.'},{status:413});
    if(message==='STAGED_AUDIO_FETCH_FAILED')return NextResponse.json({error:'The saved recording could not be found. Record it again only if it is no longer in your Songs library.'},{status:404});
    console.error('Retry processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not restart processing from the saved recording.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
