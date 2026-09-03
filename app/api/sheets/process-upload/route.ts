import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import {
  PROCESSING_RETRY_COOKIE,
  encodeRetryDescriptor,
  normalizeOutputs,
  startProcessingFromStaged,
  type Outputs,
  type RetryDescriptor,
} from '../processingSource';

export const runtime = 'nodejs';
export const maxDuration = 60;

function attachRetryCookie(response:NextResponse,descriptor:RetryDescriptor|null){
  if(!descriptor)return response;
  response.cookies.set(PROCESSING_RETRY_COOKIE,encodeRetryDescriptor(descriptor),{
    httpOnly:true,
    sameSite:'lax',
    secure:true,
    path:'/',
  });
  return response;
}

export async function POST(req:Request){
  const limited=rateLimit(req,'sheets-process-upload',6,60_000);
  if(limited)return limited;

  let retryDescriptor:RetryDescriptor|null=null;
  try{
    const body=await req.json() as {stagedPath?:string;name?:string;type?:string;outputs?:Outputs};
    const stagedPath=String(body.stagedPath||'');
    if(!stagedPath)return NextResponse.json({error:'Upload the audio file first.'},{status:400});

    const outputs=normalizeOutputs(body.outputs);
    if(!Object.values(outputs).some(Boolean))return NextResponse.json({error:'Choose at least one output.'},{status:400});

    const title=String(body.name||'Android playback recording').slice(0,120);
    const type=String(body.type||'audio/wav');
    retryDescriptor={stagedPath,title,type,outputs,attempt:1};

    const result=await startProcessingFromStaged(retryDescriptor);
    return attachRetryCookie(NextResponse.json(result,{headers:{'Cache-Control':'no-store'}}),retryDescriptor);
  }catch(error){
    const message=error instanceof Error?error.message:'';
    let response:NextResponse;
    if(message==='KLANGIO_NOT_CONFIGURED')response=NextResponse.json({error:'Sheet and stem processing is not configured yet.'},{status:503});
    else if(message==='AUDIO_TOO_LARGE')response=NextResponse.json({error:'Use an audio file under 45 MB.'},{status:413});
    else if(message==='STAGED_AUDIO_FETCH_FAILED')response=NextResponse.json({error:'The saved recording could not be found. Record it again only if it is no longer in your Songs library.'},{status:404});
    else if(message==='NO_OUTPUTS')response=NextResponse.json({error:'Choose at least one output.'},{status:400});
    else {
      console.error('Uploaded audio processing failed',error);
      response=NextResponse.json({error:safeClientError(error,'Could not start the selected processing jobs.')},{status:400,headers:{'Cache-Control':'no-store'}});
    }
    return attachRetryCookie(response,retryDescriptor);
  }
}
