import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const PRICE_BY_PLAN: Record<string, { priceId: string; level: number }> = {
  release_planning: { priceId: 'price_1UC0VzGnh6vO8OMLvPvwc5pX', level: 2 },
  prelaunch: { priceId: 'price_1UC0W7Gnh6vO8OMLtkDefW54', level: 3 },
  launch: { priceId: 'price_1UC0WGGnh6vO8OMLTjv4lQpA', level: 4 },
  campaign: { priceId: 'price_1UC0WPGnh6vO8OMLf2Dtnuwf', level: 5 },
  gigs: { priceId: 'price_1UC0WbGnh6vO8OMLdDzJKJcJ', level: 6 },
  national: { priceId: 'price_1UC0WlGnh6vO8OMLaDaGHl4H', level: 7 },
  international: { priceId: 'price_1UC0WsGnh6vO8OMLboLKsv3o', level: 8 },
};

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return NextResponse.json({ error: 'Stripe billing is not configured yet.' }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const planId = String(body?.planId || '');
  const plan = PRICE_BY_PLAN[planId];
  if (!plan) return NextResponse.json({ error: 'Choose a valid paid Pie plan.' }, { status: 400 });

  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress || undefined;
  const origin = request.nextUrl.origin;

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', plan.priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', userId);
  if (email) params.set('customer_email', email);
  params.set('success_url', `${origin}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/onboarding?cancelled=1`);
  params.set('allow_promotion_codes', 'true');
  params.set('phone_number_collection[enabled]', 'true');
  params.set('metadata[pie_user_id]', userId);
  params.set('metadata[pie_plan_id]', planId);
  params.set('metadata[pie_plan_level]', String(plan.level));
  params.set('subscription_data[metadata][pie_user_id]', userId);
  params.set('subscription_data[metadata][pie_plan_id]', planId);
  params.set('subscription_data[metadata][pie_plan_level]', String(plan.level));

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
    return NextResponse.json({ error: data?.error?.message || 'Checkout could not be started.' }, { status: 502 });
  }

  return NextResponse.json({ url: data.url });
}
