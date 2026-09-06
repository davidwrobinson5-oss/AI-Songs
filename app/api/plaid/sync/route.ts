import { NextRequest, NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeId, textField } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';
import { connectionSecret, financeAction, plaidRequest, PlaidApiError } from '../../../plaidServer';
import { awardPieScore } from '../../../scoreServer';

type SyncPage={added:any[];modified:any[];removed:any[];next_cursor?:string;has_more?:boolean};
function mapTransaction(t:any){return {providerTransactionId:t.transaction_id,providerAccountId:t.account_id,transactionDate:t.date,authorizedDate:t.authorized_date||null,name:String(t.name||'').slice(0,500),merchantName:t.merchant_name?String(t.merchant_name).slice(0,500):null,amount:t.amount,currency:t.iso_currency_code||'USD',category:t.personal_finance_category?.primary||t.category?.[0]||null,pending:Boolean(t.pending),metadata:{payment_channel:t.payment_channel,website:t.website,logo_url:t.logo_url,personal_finance_category:t.personal_finance_category}};}

export async function POST(req:NextRequest){
  const limited=rateLimit(req,'plaid-sync',4,60_000);if(limited)return limited;
  try{
    const userId=await resolvePieUserId();
    if(!userId)return NextResponse.json({error:'Authentication required.'},{status:401,headers:{'Cache-Control':'no-store'}});
    const body=await readJsonObject(req,16_000);
    const connectionId=safeId(body.connectionId,160);
    const token=await connectionSecret(connectionId);
    const accounts=await plaidRequest('/accounts/get',{access_token:token});
    await financeAction('upsertAccounts',{connectionId,accounts:(accounts.accounts||[]).slice(0,100).map((a:any)=>({providerAccountId:a.account_id,name:a.name,officialName:a.official_name,mask:a.mask,accountType:a.type,accountSubtype:a.subtype,currency:a.balances?.iso_currency_code||'USD',currentBalance:a.balances?.current,availableBalance:a.balances?.available}))});

    let startingCursor=body.cursor?textField(body.cursor,1000):'';
    if(!startingCursor){
      const listed=await financeAction('list');
      const found=(listed.data.connections||[]).find((c:any)=>c.id===connectionId);
      startingCursor=String(found?.sync_cursor||'').slice(0,1000);
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
          cursor=String(sync.next_cursor||cursor||'').slice(0,1000);
          pendingPages.push({added,modified,removed,cursor});
          totalAdded+=added.length;totalModified+=modified.length;totalRemoved+=removed.length;
          hasMore=Boolean(sync.has_more);
        }
        if(hasMore)throw new Error('SYNC_PAGE_LIMIT');
        for(const page of pendingPages)await financeAction('applySync',{connectionId,...page});
        const day=new Date().toISOString().slice(0,10);
        await awardPieScore('bank_synced',`${connectionId}:${day}`,0,{added:totalAdded,modified:totalModified,removed:totalRemoved});
        return NextResponse.json({ok:true,added:totalAdded,modified:totalModified,removed:totalRemoved,cursor,restarts:attempts-1},{headers:{'Cache-Control':'no-store'}});
      }catch(error){
        if(error instanceof PlaidApiError&&error.code==='TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION'&&attempts<3)continue;
        throw error;
      }
    }
    throw new Error('SYNC_UNSTABLE');
  }catch(error){console.error('Plaid sync failed');return NextResponse.json({error:'Bank synchronization could not be completed.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
