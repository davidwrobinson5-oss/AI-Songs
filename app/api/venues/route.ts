import { NextRequest, NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from '../../usageEntitlements';

const VENUES_URL=`${(process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '')}/functions/v1/pie-venues`;
const SUPABASE_KEY=(process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');

function finite(value:string|null){const n=Number(value);return Number.isFinite(n)?n:null;}
function categories(value:string|null){return (value||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean).slice(0,20);}

export async function GET(req:NextRequest){
  try{
    const userId=await resolvePieUserId();
    if(!userId)return NextResponse.json({error:'Authentication required.'},{status:401});
    const {searchParams}=new URL(req.url);
    const west=finite(searchParams.get('west')),south=finite(searchParams.get('south')),east=finite(searchParams.get('east')),north=finite(searchParams.get('north'));
    if(west===null||south===null||east===null||north===null)return NextResponse.json({error:'Invalid map bounds.'},{status:400});
    const oidc=await getVercelOidcToken().catch(()=>'');
    if(!oidc)return NextResponse.json({error:'Pie venue identity is temporarily unavailable.'},{status:503});
    const response=await fetch(VENUES_URL,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_KEY,'X-Pie-Vercel-OIDC':oidc},body:JSON.stringify({west,south,east,north,categories:categories(searchParams.get('categories')),limit:Math.min(1000,Math.max(1,Number(searchParams.get('limit'))||500))}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)return NextResponse.json({error:String(data?.error||'Venue lookup failed.')},{status:response.status});
    return NextResponse.json(data,{headers:{'Cache-Control':'private, max-age=30, stale-while-revalidate=120'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not load venues.'},{status:500});}
}
