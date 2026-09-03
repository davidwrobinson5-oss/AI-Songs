import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import {
  MAX_PROCESSING_ATTEMPTS,
  PROCESSING_RETRY_COOKIE,
  decodeRetryDescriptor,
  encodeRetryDescriptor,
  startProcessingFromStaged,
} from '../processingSource';

export const runtime='nodejs';
export const maxDuration=60;

function clearRetry(response:NextResponse){
  response.cookies.set(PROCESSING_RETRY_COOKIE,'',{httpOnly:true,sameSite:'lax',secure:true,path:'/',maxAge:0});
  return response;
}

export async function POST(req:NextRequest){
  const limited=rateLimit(req,'sheets-retry-processing',6,60_000);
  if(limited)return limited;

  const encoded=req.cookies.get(PROCESSING_RETRY_COOKIE)?.value||'';
  const descriptor=decodeRetryDescriptor(encoded);
  if(!descriptor){
    return clearRetry(NextResponse.json({error:'Pie no longer has a saved processing attempt for this recording.',reset:true},{status:404,headers:{'Cache-Control':'no-store'}}));
  }
  if(descriptor.attempt>=MAX_PROCESSING_ATTEMPTS){
    return clearRetry(NextResponse.json({error:'Pie tried processing this recording three times. Please start a new recording.',reset:true},{status:409,headers:{'Cache-Control':'no-store'}}));
  }

  const next={...descriptor,attempt:descriptor.attempt+1};
  try{
    const result=await startProcessingFromStaged(next);
    const response=NextResponse.json({...result,remainingAttempts:MAX_PROCESSING_ATTEMPTS-next.attempt},{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(PROCESSING_RETRY_COOKIE,encodeRetryDescriptor(next),{httpOnly:true,sameSite:'lax',secure:true,path:'/'});
    return response;
  }catch(error){
    const message=error instanceof Error?error.message:'';
    const exhausted=next.attempt>=MAX_PROCESSING_ATTEMPTS;
    let response:NextResponse;
    if(message==='KLANGIO_NOT_CONFIGURED')response=NextResponse.json({error:'Sheet and stem processing is not configured yet.',reset:exhausted},{status:503});
    else if(message==='AUDIO_TOO_LARGE')response=NextResponse.json({error:'Use an audio file under 45 MB.',reset:exhausted},{status:413});
    else if(message==='STAGED_AUDIO_FETCH_FAILED')response=NextResponse.json({error:'The saved recording could not be found. Please start a new recording.',reset:true},{status:404});
    else {
      console.error('Retry processing failed',error);
      response=NextResponse.json({error:exhausted?'Pie could not process this recording after three attempts. Please start a new recording.':safeClientError(error,'Could not restart processing from the saved recording.'),reset:exhausted,remainingAttempts:Math.max(0,MAX_PROCESSING_ATTEMPTS-next.attempt)},{status:400,headers:{'Cache-Control':'no-store'}});
    }
    if(exhausted||message==='STAGED_AUDIO_FETCH_FAILED')return clearRetry(response);
    response.cookies.set(PROCESSING_RETRY_COOKIE,encodeRetryDescriptor(next),{httpOnly:true,sameSite:'lax',secure:true,path:'/'});
    return response;
  }
}
