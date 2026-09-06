import { getVercelOidcToken } from '@vercel/oidc';
import { NextRequest, NextResponse } from 'next/server';
import { isPieAdmin } from '../../adminAuth';
import { rateLimit, readJsonObject, safeId, textField } from '../../security';

const SUPPORT_ADMIN_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-support-admin';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

async function callSupportAdmin(body:Record<string,unknown>){
  const oidc=await getVercelOidcToken().catch(()=>'');
  if(!oidc)throw new Error('Pie support identity is temporarily unavailable.');
  const response=await fetch(SUPPORT_ADMIN_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify(body),cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(String(data?.error||'Support operations failed.'));
  return data;
}

export async function GET(req:NextRequest){
  const limited=rateLimit(req,'support-admin-read',30,60_000);if(limited)return limited;
  if(!(await isPieAdmin('support')))return NextResponse.json({error:'Support operations are restricted to Pie administration.'},{status:403});
  try{return NextResponse.json(await callSupportAdmin({action:'list'}),{headers:{'Cache-Control':'no-store'}});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load support operations.'},{status:500});}
}

export async function POST(req:NextRequest){
  const limited=rateLimit(req,'support-admin-write',20,60_000);if(limited)return limited;
  if(!(await isPieAdmin('support')))return NextResponse.json({error:'Support operations are restricted to Pie administration.'},{status:403});
  try{
    const body=await readJsonObject(req,24_000);
    const action=textField(body.action,24);
    if(!['messages','reply','update'].includes(action))return NextResponse.json({error:'Unsupported support operation.'},{status:400});
    const caseId=safeId(body.caseId,160);
    const payload:Record<string,unknown>={action,caseId};
    if(action==='reply')payload.message=textField(body.message,10_000);
    if(action==='update'){
      payload.assignedTo=textField(body.assignedTo,160);
      payload.specialistType=textField(body.specialistType,160);
      payload.priority=textField(body.priority,24);
      payload.status=textField(body.status,24);
      payload.escalate=body.escalate===true;
    }
    return NextResponse.json(await callSupportAdmin(payload),{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Support operation failed.'},{status:500});}
}
