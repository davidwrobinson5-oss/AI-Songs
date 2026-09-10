import { auth, clerkClient, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const TRIAL_DAYS = 7;

const PRICE_BY_PLAN: Record<string, { priceId: string; level: number }> = {
  release_planning: { priceId: 'price_1UC0VzGnh6vO8OMLvPvwc5pX', level: 2 },
  prelaunch: { priceId: 'price_1UC0W7Gnh6vO8OMLtkDefW54', level: 3 },
  launch: { priceId: 'price_1UC0WGGnh6vO8OMLTjv4lQpA', level: 4 },
  campaign: { priceId: 'price_1UC0WPGnh6vO8OMLf2Dtnuwf', level: 5 },
  gigs: { priceId: 'price_1UC0WbGnh6vO8OMLdDzJKJcJ', level: 6 },
  national: { priceId: 'price_1UC0WlGnh6vO8OMLaDaGHl4H', level: 7 },
  international: { priceId: 'price_1UC0WsGnh6vO8OMLboLKsv3o', level: 8 },
};

function verificationIsComplete(item: { verification?: { status?: string | null } | null } | null | undefined) {
  return item?.verification?.status === 'verified';
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const planId = String(body?.planId || '');
  const signupSessionId = String(body?.signupSessionId || '');
  const signupUserId = String(body?.signupUserId || '');
  const plan = PRICE_BY_PLAN[planId];
  if (!plan) return NextResponse.json({ error: 'Choose a valid paid Pie plan.' }, { status: 400 });

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return NextResponse.json({ error: 'Stripe billing is not configured yet.' }, { status: 503 });

  if (process.env.VERCEL_ENV !== 'production' && stripeSecret.startsWith('sk_live_')) {
    return NextResponse.json(
      { error: 'Pie Preview is configured with a live Stripe key. Use the Pie sandbox secret key in Vercel Preview, then retry.' },
      { status: 503 },
    );
  }

  let userId = '';
  let user: Awaited<ReturnType<typeof currentUser>> = null;

  const signedIn = await auth();
  if (signedIn.userId) {
    userId = signedIn.userId;
    user = await currentUser();
  } else if (signupSessionId && signupUserId) {
    try {
      const client = await clerkClient();
      const session = await client.sessions.getSession(signupSessionId);
      if (session.userId !== signupUserId || !['active', 'pending'].includes(String(session.status))) {
        return NextResponse.json({ error: 'Pie could not verify this signup session. Please restart signup.' }, { status: 401 });
      }
      userId = session.userId;
      user = await client.users.getUser(userId);
    } catch {
      return NextResponse.json({ error: 'Pie could not verify this signup session. Please restart signup.' }, { status: 401 });
    }
  } else {
    return NextResponse.json({ error: 'Complete Pie signup verification first.' }, { status: 401 });
  }

  if (!user || user.id !== userId) {
    return NextResponse.json({ error: 'We could not verify your Pie account.' }, { status: 401 });
  }

  const primaryEmail = user.primaryEmailAddress;
  if (!primaryEmail?.emailAddress || !verificationIsComplete(primaryEmail)) {
    return NextResponse.json({ error: 'Verify your email address before verifying your payment method.' }, { status: 403 });
  }

  const verifiedPhone = user.phoneNumbers.find((phone) => verificationIsComplete(phone));
  if (!verifiedPhone) {
    return NextResponse.json({ error: 'Verify your phone number before verifying your payment method.' }, { status: 403 });
  }

  const email = primaryEmail.emailAddress;
  const origin = request.nextUrl.origin;

  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', plan.priceId);
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', userId);
  params.set('customer_email', email);
  params.set('success_url', `${origin}/onboarding/complete?session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/signin?created=1&checkout=cancelled`);
  params.set('allow_promotion_codes', 'true');
  params.set('payment_method_collection', 'always');
  // Signup intentionally uses card-only Checkout. Explicit payment method types
  // keep Stripe from showing Link, Amazon Pay, Klarna, Cash App, bank methods,
  // and the extra payment-method chooser before the card form.
  params.set('payment_method_types[0]', 'card');
  params.set('subscription_data[trial_period_days]', String(TRIAL_DAYS));
  params.set('metadata[pie_user_id]', userId);
  params.set('metadata[pie_plan_id]', planId);
  params.set('metadata[pie_plan_level]', String(plan.level));
  params.set('metadata[pie_trial_days]', String(TRIAL_DAYS));
  params.set('metadata[pie_phone_verified]', 'true');
  params.set('subscription_data[metadata][pie_user_id]', userId);
  params.set('subscription_data[metadata][pie_plan_id]', planId);
  params.set('subscription_data[metadata][pie_plan_level]', String(plan.level));
  params.set('subscription_data[metadata][pie_trial_days]', String(TRIAL_DAYS));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  let response: Response;
  try {
    response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
      cache: 'no-store',
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json(
      { error: timedOut ? 'Card verification took too long to respond. Please try again.' : 'Secure card verification could not be reached. Please try again.' },
      { status: 504 },
    );
  } finally {
    clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.url) {
    const stripeError = data?.error && typeof data.error === 'object' ? data.error : {};
    console.error('Pie Stripe checkout failed', {
      status: response.status,
      type: typeof stripeError?.type === 'string' ? stripeError.type : undefined,
      code: typeof stripeError?.code === 'string' ? stripeError.code : undefined,
    });

    if (response.status === 401) {
      return NextResponse.json(
        { error: 'Pie Stripe sandbox credentials need attention. Update the Preview STRIPE_SECRET_KEY and retry.' },
        { status: 503 },
      );
    }

    return NextResponse.json({ error: 'Secure card verification could not be started. Please try again.' }, { status: 502 });
  }

  return NextResponse.json({ url: data.url }, { headers: { 'Cache-Control': 'no-store' } });
}
