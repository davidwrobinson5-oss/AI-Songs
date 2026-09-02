import { NextRequest, NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';

const CAPTURE_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-capture';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

function noStore(body:unknown,status=200){
  return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'');
    if(action!=='create'&&action!=='status')return noStore({error:'Invalid capture action.'},400);

    const oidc=await getVercelOidcToken().catch(()=>'');
    if(!oidc)return noStore({error:'Capture identity is temporarily unavailable.'},503);

    const response=await fetch(CAPTURE_URL,{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        apikey:SUPABASE_PUBLISHABLE_KEY,
        'X-Pie-Vercel-OIDC':oidc,
      },
      body:JSON.stringify(action==='status'?{action,id:String(body?.id||'')}:{action}),
      cache:'no-store',
    });
    const data=await response.json().catch(()=>({}));
    return noStore(data,response.status);
  }catch(error){
    console.error('Capture session proxy failed',error);
    return noStore({error:error instanceof Error?error.message:'Capture session failed.'},500);
  }
}
