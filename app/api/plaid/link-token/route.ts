import { NextResponse } from 'next/server';
import { resolvePieUserId } from '../../../usageEntitlements';
import { plaidConfigured, plaidRequest } from '../../../plaidServer';

export async function POST(){
  try{
    const userId=await resolvePieUserId();
    if(!userId)return NextResponse.json({error:'Authentication required.'},{status:401});
    if(!plaidConfigured())return NextResponse.json({error:'Plaid is not configured yet.',code:'PLAID_NOT_CONFIGURED'},{status:503});
    const webhook=process.env.PLAID_WEBHOOK_URL||undefined;
    const redirectUri=process.env.PLAID_REDIRECT_URI||undefined;
    const data=await plaidRequest('/link/token/create',{
      user:{client_user_id:userId},
      client_name:'Pie',
      products:['transactions'],
      country_codes:['US'],
      language:'en',
      transactions:{days_requested:365},
      ...(webhook?{webhook}:{}),
      ...(redirectUri?{redirect_uri:redirectUri}:{}),
    });
    return NextResponse.json({link_token:data.link_token,expiration:data.expiration},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not start Plaid Link.'},{status:400});}
}
