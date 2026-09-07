import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const PACKS: Record<string, { name: string; credits: number; amountCents: number }> = {
  boost: { name: 'Pie Boost — 10 credits', credits: 10, amountCents: 600 },
  plus: { name: 'Pie Plus — 25 credits', credits: 25, amountCents: 1200 },
  power: { name: 'Pie Power — 60 credits', credits: 60, amountCents: 2400 },
};

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return NextResponse.json({ error: 'Stripe billing is not configured yet.' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const packId = String(body?.packId || '');
  const pack = PACKS[packId];
  if (!pack) return NextResponse.json({ error: 'Choose a valid Pie top-up pack.' }, { status: 400 });

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress || undefined;
  const origin = request.nextUrl.origin;
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(pack.amountCents));
  params.set('line_items[0][price_data][product_data][name]', pack.name);
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', userId);
  if (email) params.set('customer_email', email);
  params.set('success_url', `${origin}/billing/usage?topup=success`);
  params.set('cancel_url', `${origin}/billing/usage?topup=cancelled`);
  params.set('metadata[pie_checkout_type]', 'overage_topup');
  params.set('metadata[pie_user_id]', userId);
  params.set('metadata[pie_overage_pack_id]', packId);
  params.set('metadata[pie_overage_credits]', String(pack.credits));

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${stripeSecret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) {
    return NextResponse.json({ error: data?.error?.message || 'Top-up checkout could not be started.' }, { status: 502 });
  }

  return NextResponse.json({ url: data.url });
}
