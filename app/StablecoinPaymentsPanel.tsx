'use client';

import { useEffect, useState } from 'react';

type Status={stripeConfigured:boolean;stablecoinEnabled:boolean;mode:string;settlement:string;recurringSupported:boolean;notes:string};

export default function StablecoinPaymentsPanel(){
  const [data,setData]=useState<Status|null>(null);
  useEffect(()=>{fetch('/api/billing/crypto-status',{cache:'no-store'}).then(r=>r.json()).then(setData).catch(()=>setData(null));},[]);
  return <section className="panel">
    <p className="eyebrow">Payments + Treasury</p>
    <h2>Stablecoin Payments</h2>
    <p className="sub">Plan for customers to pay eligible one-time Pie charges with stablecoins through Stripe while keeping subscription billing on supported recurring payment rails.</p>
    <div className="controlGrid">
      <div className="statusBox"><small>STRIPE</small><strong>{data?.stripeConfigured?'Configured':'Setup pending'}</strong></div>
      <div className="statusBox"><small>STABLECOIN ACCEPTANCE</small><strong>{data?.stablecoinEnabled?'Enabled':'Planned'}</strong></div>
      <div className="statusBox"><small>SETTLEMENT</small><strong>USD → Bank</strong></div>
      <div className="statusBox"><small>SUBSCRIPTIONS</small><strong>Card / ACH</strong></div>
    </div>
    <div style={{display:'grid',gap:7,marginTop:12}}>
      <small><strong>Planned uses:</strong> merch, one-time services, deposits, event/gig payments, sponsorship invoices, and other eligible non-recurring charges.</small>
      <small><strong>Treasury policy:</strong> default to Stripe settlement in USD and payout to the business bank account. Do not automatically custody volatile crypto inside Pie.</small>
      <small><strong>Stablecoin reserve:</strong> keep this as an optional future treasury feature only if Stripe makes stablecoin-balance settlement available to this account and the accounting/tax treatment is approved.</small>
      {data?.notes&&<small>{data.notes}</small>}
    </div>
  </section>;
}
