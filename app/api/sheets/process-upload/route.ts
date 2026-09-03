import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import {
  PROCESSING_RETRY_COOKIE,
  PROCESSING_RETRY_MAX_AGE,
  encodeRetryDescriptor,
  normalizeOutputs,
  startProcessingFromStaged,
  type Outputs,
} from '../processingSource';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req:Request){
  const limited=rateLimit(req,'sheets-process-upload',6,60_000);
  if(limited)return limited;

  try{
    const body=await req.json() as {stagedPath?:string;name?:string;type?:string;outputs?:Outputs};
    const stagedPath=String(body.stagedPath||'');
    if(!stagedPath)return NextResponse.json({error:'Upload the audio file first.'},{status:400});

    const outputs=normalizeOutputs(body.outputs);
    if(!Object.values(outputs).some(Boolean))return NextResponse.json({error:'Choose at least one output.'},{status:400});

    const title=String(body.name||'Android playback recording').slice(0,120);
    const type=String(body.type||'audio/wav');
    const descriptor={stagedPath,title,type,outputs};

    // Store the retry source before starting provider jobs. If provider startup
    // fails, Pie can still retry from the already-saved recording.
    const response=NextResponse.json(await startProcessingFromStaged(descriptor),{headers:{'Cache-Control':'no-store'}});
    response.cookies.set(PROCESSING_RETRY_COOKIE,encodeRetryDescriptor(descriptor),{
      httpOnly:true,
      sameSite:'lax',
      secure:true,
      path:'/',
      maxAge:PROCESSING_RETRY_MAX_AGE,
    });
    return response;
  }catch(error){
    const message=error instanceof Error?error.message:'';
    if(message==='KLANGIO_NOT_CONFIGURED')return NextResponse.json({error:'Sheet and stem processing is not configured yet.'},{status:503});
    if(message==='AUDIO_TOO_LARGE')return NextResponse.json({error:'Use an audio file under 45 MB.'},{status:413});
    if(message==='STAGED_AUDIO_FETCH_FAILED')return NextResponse.json({error:'The saved recording could not be found. Record it again only if it is no longer in your Songs library.'},{status:404});
    if(message==='NO_OUTPUTS')return NextResponse.json({error:'Choose at least one output.'},{status:400});
    console.error('Uploaded audio processing failed',error);
    return NextResponse.json({error:safeClientError(error,'Could not start the selected processing jobs.')},{status:400,headers:{'Cache-Control':'no-store'}});
  }
}
