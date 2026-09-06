import { NextResponse } from 'next/server';
import { rateLimit } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';
import { plaidConfigured, plaidRequest } from '../../../plaidServer';

export async function POST(req: Request){
  const limited=rateLimit(req,'plaid-link-token',8,60_000);if(limited)return limited;
  try{
    const userId=await resolvePieUserId();
    if(!userId)return NextResponse.json({error:'Authentication required.'},{status:401,headers:{'Cache-Control':'no-store'}});
    if(!plaidConfigured())return NextResponse.json({error:'Plaid is not configured yet.',code:'PLAID_NOT_CONFIGURED'},{status:503,headers:{'Cache-Control':'no-store'}});
    const webhook=process.env.PLAID_WEBHOOK_URL||undefined;
    const redirectUri=process.env.PLAID_REDIRECT_URI||undefined;
    const data=await plaidRequest('/link/token/create',{
      user:{client_user_id:userId},client_name:'Pie',products:['transactions'],country_codes:['US'],language:'en',transactions:{days_requested:365},
      ...(webhook?{webhook}:{}),...(redirectUri?{redirect_uri:redirectUri}:{}),
    });
    return NextResponse.json({link_token:data.link_token,expiration:data.expiration},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('Plaid link token creation failed');return NextResponse.json({error:'Could not start bank connection.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
