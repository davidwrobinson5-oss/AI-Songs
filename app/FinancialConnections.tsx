'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

type Connection={id:string;institution_name?:string;status:string;last_synced_at?:string;error_code?:string;error_message?:string};
type Account={id:string;connection_id:string;name?:string;official_name?:string;mask?:string;account_type?:string;account_subtype?:string;currency?:string;current_balance?:number;available_balance?:number};
type Transaction={id:string;account_id?:string;transaction_date?:string;name?:string;merchant_name?:string;amount?:number;currency?:string;category?:string;pending?:boolean};
type StatusPayload={configured:boolean;connections:Connection[];accounts:Account[];transactions:Transaction[]};

declare global { interface Window { Plaid?: { create:(options:Record<string,unknown>)=>{open:()=>void;destroy?:()=>void} } } }

function loadPlaidScript(){return new Promise<void>((resolve,reject)=>{if(window.Plaid)return resolve();const existing=document.querySelector('script[data-pie-plaid]') as HTMLScriptElement|null;if(existing){existing.addEventListener('load',()=>resolve(),{once:true});existing.addEventListener('error',()=>reject(new Error('Plaid Link failed to load.')),{once:true});return;}const script=document.createElement('script');script.src='https://cdn.plaid.com/link/v2/stable/link-initialize.js';script.async=true;script.dataset.piePlaid='true';script.onload=()=>resolve();script.onerror=()=>reject(new Error('Plaid Link failed to load.'));document.head.appendChild(script);});}

export default function FinancialConnections(){
  const [data,setData]=useState<StatusPayload>({configured:false,connections:[],accounts:[],transactions:[]});
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');

  const load=useCallback(async()=>{try{const r=await fetch('/api/plaid/status',{cache:'no-store'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not load financial connections.');setData({configured:Boolean(d.configured),connections:Array.isArray(d.connections)?d.connections:[],accounts:Array.isArray(d.accounts)?d.accounts:[],transactions:Array.isArray(d.transactions)?d.transactions:[]});}catch(error){setMessage(error instanceof Error?error.message:'Could not load financial connections.');}},[]);
  useEffect(()=>{load();},[load]);

  async function connect(){setBusy('connect');setMessage('');try{await loadPlaidScript();const r=await fetch('/api/plaid/link-token',{method:'POST'});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Could not start bank connection.');if(!window.Plaid)throw new Error('Plaid Link is unavailable.');const handler=window.Plaid.create({token:d.link_token,onSuccess:async(publicToken:string,metadata:any)=>{try{setBusy('exchange');const exchange=await fetch('/api/plaid/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({publicToken,institutionId:metadata?.institution?.institution_id,institutionName:metadata?.institution?.name})});const ex=await exchange.json().catch(()=>({}));if(!exchange.ok)throw new Error(ex.error||'Could not save bank connection.');await fetch('/api/plaid/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId:ex.connectionId})});setMessage('Bank connected and transactions synced.');await load();}catch(error){setMessage(error instanceof Error?error.message:'Connection failed.');}finally{setBusy('');}},onExit:(error:any)=>{if(error?.display_message||error?.error_message)setMessage(error.display_message||error.error_message);setBusy('');}});handler.open();}catch(error){setMessage(error instanceof Error?error.message:'Could not open Plaid Link.');setBusy('');}}

  async function sync(connectionId:string){setBusy(connectionId);setMessage('');try{const r=await fetch('/api/plaid/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Sync failed.');setMessage(`Synced ${Number(d.added||0)+Number(d.modified||0)} transaction updates.`);await load();}catch(error){setMessage(error instanceof Error?error.message:'Sync failed.');}finally{setBusy('');}}

  async function disconnect(connectionId:string){if(!window.confirm('Disconnect this bank from Pie? Stored transactions for this connection will also be removed.'))return;setBusy(connectionId);try{const r=await fetch('/api/plaid/disconnect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({connectionId})});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'Disconnect failed.');setMessage('Bank disconnected.');await load();}catch(error){setMessage(error instanceof Error?error.message:'Disconnect failed.');}finally{setBusy('');}}

  const totalBalance=useMemo(()=>data.accounts.reduce((sum,a)=>sum+Number(a.current_balance||0),0),[data.accounts]);
  const recentOutflow=useMemo(()=>data.transactions.filter(t=>Number(t.amount||0)>0).slice(0,30).reduce((sum,t)=>sum+Number(t.amount||0),0),[data.transactions]);

  return <section className="panel" style={{display:'grid',gap:14}}>
    <div><p className="eyebrow">Connected Financials</p><h2>Bank Connections</h2><small>Securely connect business bank and card accounts through Plaid. Pie stores encrypted access credentials server-side and imports balances and transactions for Accounting.</small></div>
    <div className="controlGrid"><div className="statusBox"><small>CONNECTED ACCOUNTS</small><strong>{data.accounts.length}</strong></div><div className="statusBox"><small>CURRENT BALANCES</small><strong>${totalBalance.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div><div className="statusBox"><small>RECENT OUTFLOW SAMPLE</small><strong>${recentOutflow.toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div></div>
    {!data.configured?<div className="statusBox"><strong>Plaid setup required</strong><small>Add PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV and PLAID_TOKEN_ENCRYPTION_KEY in Vercel before connecting a bank.</small></div>:<button type="button" className="primary" disabled={Boolean(busy)} onClick={connect}>{busy==='connect'?'Opening Plaid…':'＋ Connect Bank or Card'}</button>}
    {message&&<div className="statusBox"><small>{message}</small></div>}
    {data.connections.length>0&&<div style={{display:'grid',gap:8}}>{data.connections.map(c=><article key={c.id} className="statusBox" style={{display:'grid',gap:6}}><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{c.institution_name||'Financial Institution'}</strong><small>{c.status}</small></div><small>{c.last_synced_at?`Last synced ${new Date(c.last_synced_at).toLocaleString()}`:'Not synced yet'}</small>{c.error_message&&<small>{c.error_message}</small>}<div className="mixButtons"><button type="button" className="secondary" disabled={Boolean(busy)} onClick={()=>sync(c.id)}>↻ Sync</button><button type="button" className="secondary" disabled={Boolean(busy)} onClick={()=>disconnect(c.id)}>Disconnect</button></div></article>)}</div>}
    {data.transactions.length>0&&<div><div className="songsSectionHead"><strong>Imported Transactions</strong><span>{data.transactions.length}</span></div><div style={{display:'grid',gap:7}}>{data.transactions.slice(0,12).map(t=><article key={t.id} className="statusBox"><div style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{t.merchant_name||t.name||'Transaction'}</strong><strong>${Number(t.amount||0).toLocaleString(undefined,{maximumFractionDigits:2})}</strong></div><small>{t.transaction_date||''}{t.category?` · ${t.category}`:''}{t.pending?' · Pending':''}</small></article>)}</div></div>}
  </section>;
}
