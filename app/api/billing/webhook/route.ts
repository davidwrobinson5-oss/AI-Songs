import { clerkClient } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextRequest, NextResponse } from 'next/server';
import { pieDeploymentTarget } from '../../../deploymentEnvironment';

const ENTITLEMENT_URL = `${(process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '')}/functions/v1/pie-entitlements`;
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');

function parseSignature(header: string) {
  const parts = header.split(',').map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith('t='))?.slice(2) || '';
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));
  return { timestamp, signatures };
}

async function hmacHex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  return Array.from(signature).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

async function verifyStripeSignature(rawBody: string, header: string, secret: string) {
  const { timestamp, signatures } = parseSignature(header);
  if (!timestamp || !signatures.length) return false;
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = await hmacHex(secret, `${timestamp}.${rawBody}`);
  return signatures.some((signature) => safeEqual(signature, expected));
}

async function entitlementAction(payload: Record<string, unknown>) {
  const oidc = await getVercelOidcToken().catch(() => '');
  if (!oidc) throw new Error('Billing sync identity unavailable.');
  const response = await fetch(ENTITLEMENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'X-Pie-Vercel-OIDC': oidc,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data?.error === 'string' ? data.error : 'Billing database sync failed.');
  }
  return response.json().catch(() => ({}));
}

async function setEntitlement(userId: string, values: Record<string, unknown>) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...(user.publicMetadata || {}),
      ...values,
      pieEntitlementUpdatedAt: new Date().toISOString(),
    },
  });
}

async function syncBillingRecord(userId: string, values: {
  planId: string;
  planLevel: number;
  status: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: number | null;
  cancelAtPeriodEnd?: boolean;
}) {
  await entitlementAction({ action: 'syncBilling', userId, ...values });
}

function subscriptionPeriodEnd(object: any) {
  const candidates = [
    object?.current_period_end,
    object?.items?.data?.[0]?.current_period_end,
    object?.trial_end,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate || 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

async function grantOverageFromCheckout(object: any) {
  const userId = String(object.client_reference_id || object.metadata?.pie_user_id || '');
  const credits = Number(object.metadata?.pie_overage_credits || 0);
  const sessionId = String(object.id || '');
  if (!userId || !Number.isInteger(credits) || credits < 1 || credits > 10000 || !sessionId) return;
  await entitlementAction({ action: 'grantOverage', userId, credits, stripeSessionId: sessionId });
}

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook secret missing.' }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSignature(rawBody, signature, secret))) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const target = pieDeploymentTarget();
  const expectsLiveEvent = target === 'production';
  if (Boolean(event?.livemode) !== expectsLiveEvent) {
    console.error('Rejected Stripe webhook from the wrong billing environment.', {
      target,
      livemode: Boolean(event?.livemode),
      eventType: String(event?.type || ''),
    });
    return NextResponse.json({ error: 'Stripe event environment mismatch.' }, { status: 400 });
  }

  const object = event?.data?.object || {};
  const checkoutType = String(object.metadata?.pie_checkout_type || '');

  if (event.type === 'checkout.session.completed' && checkoutType === 'overage_topup') {
    if (String(object.payment_status || '') === 'paid') await grantOverageFromCheckout(object);
    return NextResponse.json({ received: true });
  }

  if (event.type === 'checkout.session.async_payment_succeeded' && checkoutType === 'overage_topup') {
    await grantOverageFromCheckout(object);
    return NextResponse.json({ received: true });
  }

  if (event.type === 'checkout.session.completed') {
    const userId = String(object.client_reference_id || object.metadata?.pie_user_id || '');
    const level = Number(object.metadata?.pie_plan_level || 0);
    const planId = String(object.metadata?.pie_plan_id || 'none');
    if (userId) {
      await Promise.all([
        setEntitlement(userId, {
          pieSubscriptionStatus: 'trialing',
          piePlanId: planId,
          piePlanLevel: level,
          pieStripeCustomerId: object.customer || null,
          pieStripeSubscriptionId: object.subscription || null,
          pieOnboardingCompleted: true,
        }),
        syncBillingRecord(userId, {
          planId,
          planLevel: level,
          status: 'trialing',
          stripeCustomerId: object.customer || null,
          stripeSubscriptionId: object.subscription || null,
        }),
      ]);
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const userId = String(object.metadata?.pie_user_id || '');
    const level = Number(object.metadata?.pie_plan_level || 0);
    const planId = String(object.metadata?.pie_plan_id || 'none');
    if (userId) {
      const status = String(object.status || '');
      const entitled = ['active', 'trialing'].includes(status);
      const priceId = String(object.items?.data?.[0]?.price?.id || '') || null;
      await Promise.all([
        setEntitlement(userId, {
          pieSubscriptionStatus: status,
          piePlanId: entitled ? planId : 'none',
          piePlanLevel: entitled ? level : 0,
          pieStripeCustomerId: object.customer || null,
          pieStripeSubscriptionId: object.id || null,
        }),
        syncBillingRecord(userId, {
          planId: entitled ? planId : 'none',
          planLevel: entitled ? level : 0,
          status,
          stripeCustomerId: object.customer || null,
          stripeSubscriptionId: object.id || null,
          stripePriceId: priceId,
          currentPeriodEnd: subscriptionPeriodEnd(object),
          cancelAtPeriodEnd: Boolean(object.cancel_at_period_end),
        }),
      ]);
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const userId = String(object.metadata?.pie_user_id || '');
    if (userId) {
      await Promise.all([
        setEntitlement(userId, {
          pieSubscriptionStatus: 'canceled',
          piePlanId: 'none',
          piePlanLevel: 0,
          pieStripeSubscriptionId: object.id || null,
        }),
        syncBillingRecord(userId, {
          planId: 'none',
          planLevel: 0,
          status: 'canceled',
          stripeCustomerId: object.customer || null,
          stripeSubscriptionId: object.id || null,
          stripePriceId: String(object.items?.data?.[0]?.price?.id || '') || null,
          cancelAtPeriodEnd: true,
        }),
      ]);
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const subscriptionDetails = object.parent?.subscription_details || object.subscription_details || {};
    const userId = String(subscriptionDetails.metadata?.pie_user_id || '');
    if (userId) {
      await Promise.all([
        setEntitlement(userId, { pieSubscriptionStatus: 'past_due', piePlanId: 'none', piePlanLevel: 0 }),
        syncBillingRecord(userId, {
          planId: 'none', planLevel: 0, status: 'past_due',
          stripeCustomerId: typeof object.customer === 'string' ? object.customer : object.customer?.id || null,
          stripeSubscriptionId: typeof subscriptionDetails.subscription === 'string'
            ? subscriptionDetails.subscription : subscriptionDetails.subscription?.id
              || (typeof object.subscription === 'string' ? object.subscription : object.subscription?.id) || null,
        }),
      ]);
    }
  }

  return NextResponse.json({ received: true });
}
