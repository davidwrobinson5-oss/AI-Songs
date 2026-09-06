import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, readJsonObject, textField } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';
import { encryptAccessToken, financeAction, plaidRequest } from '../../../plaidServer';
import { awardPieScore } from '../../../scoreServer';

export async function POST(req:NextRequest){
  const limited=rateLimit(req,'plaid-exchange',6,60_000);if(limited)return limited;
  try{
    const userId=await resolvePieUserId();
    if(!userId)return NextResponse.json({error:'Authentication required.'},{status:401,headers:{'Cache-Control':'no-store'}});
    const body=await readJsonObject(req,16_000);
    const publicToken=textField(body.publicToken,1000);
    if(!publicToken)return NextResponse.json({error:'Missing Plaid public token.'},{status:400,headers:{'Cache-Control':'no-store'}});
    const exchange=await plaidRequest('/item/public_token/exchange',{public_token:publicToken});
    const accessToken=String(exchange.access_token||'');
    const itemId=String(exchange.item_id||'');
    if(!accessToken||!itemId)throw new Error('PLAID_EXCHANGE_FAILED');
    let institutionId=body.institutionId?textField(body.institutionId,160):null;
    let institutionName=body.institutionName?textField(body.institutionName,240):null;
    try{
      const item=await plaidRequest('/item/get',{access_token:accessToken});
      institutionId=String(item?.item?.institution_id||institutionId||'').slice(0,160)||null;
      if(institutionId&&!institutionName){const inst=await plaidRequest('/institutions/get_by_id',{institution_id:institutionId,country_codes:['US']});institutionName=String(inst?.institution?.name||'').slice(0,240)||null;}
    }catch{}
    const encryptedAccessToken=await encryptAccessToken(accessToken);
    const {data}=await financeAction('saveConnection',{itemId,institutionId,institutionName,encryptedAccessToken});
    const connectionId=String(data.connectionId||'');
    if(!connectionId)throw new Error('FINANCE_CONNECTION_FAILED');
    const accounts=await plaidRequest('/accounts/get',{access_token:accessToken});
    await financeAction('upsertAccounts',{connectionId,accounts:(accounts.accounts||[]).slice(0,100).map((a:any)=>({providerAccountId:a.account_id,name:a.name,officialName:a.official_name,mask:a.mask,accountType:a.type,accountSubtype:a.subtype,currency:a.balances?.iso_currency_code||'USD',currentBalance:a.balances?.current,availableBalance:a.balances?.available}))});
    await awardPieScore('bank_connected',connectionId,0,{institutionName:institutionName||'',accountCount:Array.isArray(accounts.accounts)?accounts.accounts.length:0});
    return NextResponse.json({ok:true,connectionId},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('Plaid exchange failed');return NextResponse.json({error:'Could not connect bank account.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
