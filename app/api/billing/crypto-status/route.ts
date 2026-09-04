import { NextResponse } from 'next/server';

export async function GET(){
  const stripeConfigured=Boolean(process.env.STRIPE_SECRET_KEY);
  const stablecoinEnabled=process.env.STRIPE_STABLECOIN_ENABLED==='true';
  return NextResponse.json({
    stripeConfigured,
    stablecoinEnabled,
    mode:stablecoinEnabled?'stablecoin-payments':'planned',
    settlement:'usd_stripe_balance_then_bank',
    recurringSupported:false,
    notes:stablecoinEnabled
      ? 'Stablecoin acceptance is enabled for eligible one-time payment flows. Subscription billing remains on supported recurring rails.'
      : 'Request Stablecoin and Crypto in Stripe, complete Stripe review, then set STRIPE_STABLECOIN_ENABLED=true after approval.',
  },{headers:{'Cache-Control':'no-store'}});
}
