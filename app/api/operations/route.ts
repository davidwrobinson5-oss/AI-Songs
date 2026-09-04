import { NextRequest, NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { auth, currentUser } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';
import { awardPieScore } from '../../scoreServer';

const OPERATIONS_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-operations';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const LEGACY_OWNER_ID='pie-primary';

function noStore(body:unknown,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});}

async function resolvePieUser(){
  try{
    const clerk=await auth();
    if(clerk.userId){
      const user=await currentUser().catch(()=>null);
      const publicMetadata=(user?.publicMetadata||{}) as Record<string,unknown>;
      const unsafeMetadata=(user?.unsafeMetadata||{}) as Record<string,unknown>;
      const hasBillingProfile=Boolean(publicMetadata.pieOnboardingCompleted||publicMetadata.piePlanLevel||unsafeMetadata.pieOnboardingStartedAt||unsafeMetadata.pieOnboardingCompleted);
      return {userId:hasBillingProfile?clerk.userId:LEGACY_OWNER_ID,user};
    }
  }catch{}
  const jar=await cookies();
  const token=jar.get(SESSION_COOKIE)?.value||'';
  const valid=await verifySessionToken(token,process.env.AI_SONGS_SESSION_SECRET);
  return valid?{userId:LEGACY_OWNER_ID,user:null}:{userId:'',user:null};
}

export async function POST(req:NextRequest){
  try{
    const {userId,user}=await resolvePieUser();
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'');
    if(action!=='scoreTop100'&&!userId)return noStore({error:'Authentication required.'},401);
    const oidc=await getVercelOidcToken().catch(()=>'');
    if(!oidc)return noStore({error:'Pie operations identity is temporarily unavailable.'},503);
    const payload={...body,userId:action==='scoreTop100'?'':userId};
    if(action==='scoreIdentity'&&!payload.displayName){payload.displayName=user?.fullName||user?.firstName||'Pie Artist';}
    const response=await fetch(OPERATIONS_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify(payload),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(response.ok&&action==='contractSave'&&data?.contract?.id){
      await awardPieScore('contract_saved',String(data.contract.id),0,{contractType:String(data.contract.contract_type||body?.contractType||'')});
    }
    return noStore(data,response.status);
  }catch(error){
    console.error('Pie operations proxy failed',error);
    return noStore({error:error instanceof Error?error.message:'Pie operations request failed.'},500);
  }
}
