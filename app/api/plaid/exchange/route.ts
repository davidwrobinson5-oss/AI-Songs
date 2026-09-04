import { NextRequest, NextResponse } from 'next/server';
import { encryptAccessToken, financeAction, plaidRequest } from '../../../plaidServer';

export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const publicToken=String(body?.publicToken||'');
    if(!publicToken)return NextResponse.json({error:'Missing Plaid public token.'},{status:400});
    const exchange=await plaidRequest('/item/public_token/exchange',{public_token:publicToken});
    const accessToken=String(exchange.access_token||'');
    const itemId=String(exchange.item_id||'');
    if(!accessToken||!itemId)throw new Error('Plaid did not return a usable connection.');
    let institutionId=body?.institutionId?String(body.institutionId):null;
    let institutionName=body?.institutionName?String(body.institutionName):null;
    try{
      const item=await plaidRequest('/item/get',{access_token:accessToken});
      institutionId=String(item?.item?.institution_id||institutionId||'')||null;
      if(institutionId&&!institutionName){const inst=await plaidRequest('/institutions/get_by_id',{institution_id:institutionId,country_codes:['US']});institutionName=String(inst?.institution?.name||'')||null;}
    }catch{}
    const encryptedAccessToken=await encryptAccessToken(accessToken);
    const {data}=await financeAction('saveConnection',{itemId,institutionId,institutionName,encryptedAccessToken});
    const connectionId=String(data.connectionId||'');
    const accounts=await plaidRequest('/accounts/get',{access_token:accessToken});
    await financeAction('upsertAccounts',{connectionId,accounts:(accounts.accounts||[]).map((a:any)=>({providerAccountId:a.account_id,name:a.name,officialName:a.official_name,mask:a.mask,accountType:a.type,accountSubtype:a.subtype,currency:a.balances?.iso_currency_code||'USD',currentBalance:a.balances?.current,availableBalance:a.balances?.available}))});
    return NextResponse.json({ok:true,connectionId},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Could not connect bank account.'},{status:400});}
}
