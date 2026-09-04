import { NextRequest, NextResponse } from 'next/server';
import { connectionSecret, financeAction, plaidRequest } from '../../../plaidServer';

export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const connectionId=String(body?.connectionId||'');
    if(!connectionId)return NextResponse.json({error:'Missing financial connection.'},{status:400});
    const token=await connectionSecret(connectionId);
    const accounts=await plaidRequest('/accounts/get',{access_token:token});
    await financeAction('upsertAccounts',{connectionId,accounts:(accounts.accounts||[]).map((a:any)=>({providerAccountId:a.account_id,name:a.name,officialName:a.official_name,mask:a.mask,accountType:a.type,accountSubtype:a.subtype,currency:a.balances?.iso_currency_code||'USD',currentBalance:a.balances?.current,availableBalance:a.balances?.available}))});

    let cursor=body?.cursor?String(body.cursor):'';
    if(!cursor){
      const listed=await financeAction('list');
      const found=(listed.data.connections||[]).find((c:any)=>c.id===connectionId);
      cursor=String(found?.sync_cursor||'');
    }

    let hasMore=true;let rounds=0;let totalAdded=0,totalModified=0,totalRemoved=0;
    while(hasMore&&rounds<20){
      rounds+=1;
      const sync=await plaidRequest('/transactions/sync',{access_token:token,cursor:cursor||undefined,count:500});
      const added=(sync.added||[]).map((t:any)=>({providerTransactionId:t.transaction_id,providerAccountId:t.account_id,transactionDate:t.date,authorizedDate:t.authorized_date||null,name:t.name,merchantName:t.merchant_name||null,amount:t.amount,currency:t.iso_currency_code||'USD',category:t.personal_finance_category?.primary||t.category?.[0]||null,pending:t.pending,metadata:{payment_channel:t.payment_channel,website:t.website,logo_url:t.logo_url,personal_finance_category:t.personal_finance_category}}));
      const modified=(sync.modified||[]).map((t:any)=>({providerTransactionId:t.transaction_id,providerAccountId:t.account_id,transactionDate:t.date,authorizedDate:t.authorized_date||null,name:t.name,merchantName:t.merchant_name||null,amount:t.amount,currency:t.iso_currency_code||'USD',category:t.personal_finance_category?.primary||t.category?.[0]||null,pending:t.pending,metadata:{payment_channel:t.payment_channel,website:t.website,logo_url:t.logo_url,personal_finance_category:t.personal_finance_category}}));
      const removed=(sync.removed||[]).map((t:any)=>({providerTransactionId:t.transaction_id}));
      cursor=String(sync.next_cursor||cursor||'');
      await financeAction('applySync',{connectionId,added,modified,removed,cursor});
      totalAdded+=added.length;totalModified+=modified.length;totalRemoved+=removed.length;hasMore=Boolean(sync.has_more);
    }
    return NextResponse.json({ok:true,added:totalAdded,modified:totalModified,removed:totalRemoved,cursor},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Plaid sync failed.'},{status:400});}
}
