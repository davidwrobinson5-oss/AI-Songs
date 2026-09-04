import { NextRequest, NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from '../../usageEntitlements';
import { awardPieScore } from '../../scoreServer';

const DATA_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-data';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

async function callData(body:Record<string,unknown>){
  const userId=await resolvePieUserId();
  if(!userId)throw new Error('Authentication required.');
  const oidc=await getVercelOidcToken().catch(()=>'');
  if(!oidc)throw new Error('Pie data identity is temporarily unavailable.');
  const response=await fetch(DATA_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({...body,userId}),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error||'Data request failed.'));
  return {userId,data};
}

export async function GET(){
  try{const {data}=await callData({action:'list'});return NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load data requests.'},{status:400});}
}

export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'create');
    const {data}=await callData({action,...body});
    if(action==='create'&&data?.request?.id)await awardPieScore('data_request',String(data.request.id),0,{categories:data.request.categories,geography:data.request.geography});
    return NextResponse.json(data,{status:action==='create'?201:200,headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Data request failed.'},{status:400});}
}
