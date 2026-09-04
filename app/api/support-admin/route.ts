import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

const SUPPORT_ADMIN_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-support-admin';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

async function isAdmin(){
  try{
    const {userId}=await auth();
    if(userId){
      const user=await currentUser().catch(()=>null);
      const pub=(user?.publicMetadata||{}) as Record<string,unknown>;
      const allowedIds=(process.env.PIE_ADMIN_USER_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
      return pub.pieAdmin===true||pub.pieSupportAdmin===true||allowedIds.includes(userId);
    }
  }catch{}
  const jar=await cookies();
  const token=jar.get(SESSION_COOKIE)?.value||'';
  return verifySessionToken(token,process.env.AI_SONGS_SESSION_SECRET);
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
