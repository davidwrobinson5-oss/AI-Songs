import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

const CAPTURE_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-capture';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const LEGACY_OWNER_ID='pie-primary';

function noStore(body:unknown,status=200){
  return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
}

function errorText(value:unknown,fallback:string){
  if(typeof value==='string'&&value.trim())return value;
  if(value&&typeof value==='object'){
    const record=value as Record<string,unknown>;
    for(const key of ['message','error','details','hint']){
      const candidate=record[key];
      if(typeof candidate==='string'&&candidate.trim())return candidate;
    }
  }
  return fallback;
}

async function authenticatedOwnerId(){
  try{
    const clerk=await auth();
    if(clerk.userId)return clerk.userId;
  }catch{}

  const jar=await cookies();
  const legacyToken=jar.get(SESSION_COOKIE)?.value||'';
  const legacyValid=await verifySessionToken(legacyToken,process.env.AI_SONGS_SESSION_SECRET);
  return legacyValid?LEGACY_OWNER_ID:'';
}

async function callCapture(action:'create'|'status',id:string,oidc:string,ownerId:string){
  const response=await fetch(CAPTURE_URL,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      apikey:SUPABASE_PUBLISHABLE_KEY,
      'X-Pie-Vercel-OIDC':oidc,
      'X-Pie-User-Id':ownerId,
    },
    body:JSON.stringify(action==='status'?{action,id}:{action}),
    cache:'no-store',
  });
  const data=await response.json().catch(()=>({}));
  return {response,data};
}

export async function POST(req:NextRequest){
  try{
    const ownerId=await authenticatedOwnerId();
    if(!ownerId)return noStore({error:'Authentication required.'},401);

    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'');
    if(action!=='create'&&action!=='status')return noStore({error:'Invalid capture action.'},400);

    const oidc=await getVercelOidcToken().catch(()=>'');
    if(!oidc)return noStore({error:'Capture identity is temporarily unavailable. Please try again.'},503);

    const id=String(body?.id||'');
    let {response,data}=await callCapture(action,id,oidc,ownerId);

    if(action==='create'&&response.status>=500){
      ({response,data}=await callCapture(action,id,oidc,ownerId));
    }

    if(!response.ok){
      const message=errorText((data as Record<string,unknown>)?.error,'Could not start the Pie recording session.');
      console.error('Capture session upstream rejected',{action,status:response.status,message});
      return noStore({error:message},response.status);
    }

    if(action==='create'&&(!(data as Record<string,unknown>)?.id||!(data as Record<string,unknown>)?.secret)){
      const message=errorText((data as Record<string,unknown>)?.error,'Pie could not prepare the recording session. Please tap Record and try again.');
      console.error('Capture session create returned incomplete data',{message,keys:Object.keys((data||{}) as object)});
      return noStore({error:message},502);
    }

    return noStore(data,response.status);
  }catch(error){
    console.error('Capture session proxy failed',error);
    return noStore({error:error instanceof Error?error.message:'Capture session failed. Please try again.'},500);
  }
}
