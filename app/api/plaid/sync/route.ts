import { NextRequest, NextResponse } from 'next/server';
import { connectionSecret, financeAction, plaidRequest, PlaidApiError } from '../../../plaidServer';
import { awardPieScore } from '../../../scoreServer';

type SyncPage={added:any[];modified:any[];removed:any[];next_cursor?:string;has_more?:boolean};
function mapTransaction(t:any){return {providerTransactionId:t.transaction_id,providerAccountId:t.account_id,transactionDate:t.date,authorizedDate:t.authorized_date||null,name:t.name,merchantName:t.merchant_name||null,amount:t.amount,currency:t.iso_currency_code||'USD',category:t.personal_finance_category?.primary||t.category?.[0]||null,pending:t.pending,metadata:{payment_channel:t.payment_channel,website:t.website,logo_url:t.logo_url,personal_finance_category:t.personal_finance_category}};}

export async function POST(req:NextRequest){
  try{
    const body=await req.json().catch(()=>({}));
    const connectionId=String(body?.connectionId||'');
    if(!connectionId)return NextResponse.json({error:'Missing financial connection.'},{status:400});
    const token=await connectionSecret(connectionId);
    const accounts=await plaidRequest('/accounts/get',{access_token:token});
    await financeAction('upsertAccounts',{connectionId,accounts:(accounts.accounts||[]).map((a:any)=>({providerAccountId:a.account_id,name:a.name,officialName:a.official_name,mask:a.mask,accountType:a.type,accountSubtype:a.subtype,currency:a.balances?.iso_currency_code||'USD',currentBalance:a.balances?.current,availableBalance:a.balances?.available}))});

    let startingCursor=body?.cursor?String(body.cursor):'';
    if(!startingCursor){
      const listed=await financeAction('list');
      const found=(listed.data.connections||[]).find((c:any)=>c.id===connectionId);
      startingCursor=String(found?.sync_cursor||'');
    }

    let attempts=0;
    while(attempts<3){
      attempts+=1;
      let cursor=startingCursor;
      let hasMore=true;
      let rounds=0;
      const pendingPages:{added:any[];modified:any[];removed:any[];cursor:string}[]=[];
      let totalAdded=0,totalModified=0,totalRemoved=0;
      try{
        while(hasMore&&rounds<20){
          rounds+=1;
          const sync=await plaidRequest('/transactions/sync',{access_token:token,cursor:cursor||undefined,count:500}) as SyncPage;
          const added=(sync.added||[]).map(mapTransaction);
          const modified=(sync.modified||[]).map(mapTransaction);
          const removed=(sync.removed||[]).map((t:any)=>({providerTransactionId:t.transaction_id}));
          cursor=String(sync.next_cursor||cursor||'');
          pendingPages.push({added,modified,removed,cursor});
          totalAdded+=added.length;totalModified+=modified.length;totalRemoved+=removed.length;
          hasMore=Boolean(sync.has_more);
        }
        if(hasMore)throw new Error('Plaid transaction sync exceeded the safe pagination limit.');
        for(const page of pendingPages)await financeAction('applySync',{connectionId,...page});
        const day=new Date().toISOString().slice(0,10);
        await awardPieScore('bank_synced',`${connectionId}:${day}`,0,{added:totalAdded,modified:totalModified,removed:totalRemoved});
        return NextResponse.json({ok:true,added:totalAdded,modified:totalModified,removed:totalRemoved,cursor,restarts:attempts-1},{headers:{'Cache-Control':'no-store'}});
      }catch(error){
        if(error instanceof PlaidApiError&&error.code==='TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'&&attempts<3)continue;
        throw error;
      }
    }
    throw new Error('Plaid sync could not stabilize after multiple retries.');
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Plaid sync failed.'},{status:400});}
}
