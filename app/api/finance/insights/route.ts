import { NextResponse } from 'next/server';
import { financeAction } from '../../../plaidServer';

function money(value:number){return Math.round(value*100)/100;}
export async function GET(){
  try{
    const {data}=await financeAction('list');
    const tx=Array.isArray(data.transactions)?data.transactions:[];
    const posted=tx.filter((t:any)=>!t.pending);
    const today=Date.now();
    const windows=[30,90,365].map(days=>{
      const cutoff=today-days*86400000;
      const rows=posted.filter((t:any)=>{const ts=Date.parse(String(t.transaction_date||''));return Number.isFinite(ts)&&ts>=cutoff;});
      let inflow=0,outflow=0;const categories=new Map<string,number>();
      for(const t of rows){const amount=Number(t.amount||0);if(amount<0)inflow+=Math.abs(amount);else outflow+=amount;const category=String(t.category||'UNCATEGORIZED');categories.set(category,(categories.get(category)||0)+(amount>0?amount:0));}
      return {days,inflow:money(inflow),outflow:money(outflow),net:money(inflow-outflow),transactions:rows.length,topExpenseCategories:[...categories.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([category,amount])=>({category,amount:money(amount)}))};
    });
    const accounts=Array.isArray(data.accounts)?data.accounts:[];
    const cash=accounts.filter((a:any)=>['depository','cash'].includes(String(a.account_type||'').toLowerCase())).reduce((n:number,a:any)=>n+Number(a.current_balance||0),0);
    const credit=accounts.filter((a:any)=>String(a.account_type||'').toLowerCase()==='credit').reduce((n:number,a:any)=>n+Number(a.current_balance||0),0);
    const uncategorized=posted.filter((t:any)=>!t.category).length;
    return NextResponse.json({connectedAccounts:accounts.length,cashBalance:money(cash),creditBalance:money(credit),uncategorized,windows,asOf:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Financial insights unavailable.'},{status:400});}
}
