import { NextRequest, NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { currentUser } from '@clerk/nextjs/server';
import { resolvePieUserId } from '../../usageEntitlements';

const SUPPORT_URL='https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-support';
const SUPABASE_KEY='sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';

export async function POST(req:NextRequest){
  try{
    const userId=await resolvePieUserId();
    if(!userId)return NextResponse.json({error:'Authentication required.'},{status:401});
    const user=await currentUser().catch(()=>null);
    const publicMetadata=(user?.publicMetadata||{}) as Record<string,unknown>;
    const isAdmin=publicMetadata.pieAdmin===true||publicMetadata.pieSupportAdmin===true;
    const body=await req.json().catch(()=>({}));
    const action=String(body?.action||'');
    if(action.startsWith('admin')&&!isAdmin)return NextResponse.json({error:'Admin access required.'},{status:403});
    const oidc=await getVercelOidcToken().catch(()=>'');
    if(!oidc)return NextResponse.json({error:'Pie support identity is temporarily unavailable.'},{status:503});
    const response=await fetch(SUPPORT_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({...body,userId,isAdmin}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    return NextResponse.json(data,{status:response.status,headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Support request failed.'},{status:500});}
}
