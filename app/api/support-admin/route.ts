import { auth, currentUser } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextRequest, NextResponse } from 'next/server';

const SUPPORT_ADMIN_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-support-admin';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

async function isAdmin(){
  const {userId}=await auth();
  if(!userId)return false;
  const user=await currentUser().catch(()=>null);
  const pub=(user?.publicMetadata||{}) as Record<string,unknown>;
  const unsafe=(user?.unsafeMetadata||{}) as Record<string,unknown>;
  const hasBillingProfile=Boolean(pub.pieOnboardingCompleted||pub.piePlanLevel||unsafe.pieOnboardingStartedAt||unsafe.pieOnboardingCompleted);
  return pub.pieAdmin===true||!hasBillingProfile;
}

async function callSupportAdmin(body:Record<string,unknown>){
  const oidc=await getVercelOidcToken().catch(()=>'');
  if(!oidc)throw new Error('Pie support identity is temporarily unavailable.');
  const response=await fetch(SUPPORT_ADMIN_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error||'Support operations failed.'));
  return data;
}

export async function GET(){
  if(!(await isAdmin()))return NextResponse.json({error:'Support operations are restricted to Pie administration.'},{status:403});
  try{return NextResponse.json(await callSupportAdmin({action:'list'}),{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load support operations.'},{status:500});}
}

export async function POST(req:NextRequest){
  if(!(await isAdmin()))return NextResponse.json({error:'Support operations are restricted to Pie administration.'},{status:403});
  try{
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'');
    if(!['messages','reply','update'].includes(action))return NextResponse.json({error:'Unsupported support operation.'},{status:400});
    return NextResponse.json(await callSupportAdmin({...body,action}),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Support operation failed.'},{status:500});}
}
