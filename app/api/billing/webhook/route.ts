import { billingStripe, stripeObjectId } from '../../../billingStripeServer';
import { stripePlan, stripePlanIdForPrice } from '../../../stripePlans';
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

  // Events can arrive late or out of order. Reconcile current Stripe state instead
  // of allowing an old checkout/failure snapshot to overwrite recovered access.
  const subscriptionEvent = ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type);
  const invoiceEvent = ['invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed'].includes(event.type);
  const checkoutEvent = event.type === 'checkout.session.completed' && object.mode === 'subscription';
  if (subscriptionEvent || invoiceEvent || checkoutEvent) {
    const details = object.parent?.subscription_details || object.subscription_details || {};
    const subscriptionId = subscriptionEvent ? stripeObjectId(object) : stripeObjectId(details.subscription || object.subscription);
    if (!subscriptionId && invoiceEvent) return NextResponse.json({ received: true }); // One-time invoice.
    if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return NextResponse.json({ error: 'Subscription reference missing.' }, { status: 400 });
    const current = await billingStripe(`/subscriptions/${subscriptionId}`);
    const userId = String(current.metadata?.pie_user_id || '');
    const eventUser = String(object.client_reference_id || object.metadata?.pie_user_id || details.metadata?.pie_user_id || '');
    if (current.id !== subscriptionId || current.livemode !== expectsLiveEvent
      || stripeObjectId(current.customer) !== stripeObjectId(object.customer)
      || (eventUser && eventUser !== userId)) {
      return NextResponse.json({ error: 'Subscription identity mismatch.' }, { status: 400 });
    }
    if (!userId) return NextResponse.json({ received: true }); // Not a Pie subscription.
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const linkedSubscription = String(user.publicMetadata?.pieStripeSubscriptionId || '');
    if (linkedSubscription && linkedSubscription !== subscriptionId) {
      const linked = await billingStripe(`/subscriptions/${encodeURIComponent(linkedSubscription)}`);
      if (linked.metadata?.pie_user_id !== userId || stripeObjectId(linked.customer) !== stripeObjectId(current.customer)) {
        return NextResponse.json({ error: 'Linked subscription identity mismatch.' }, { status: 400 });
      }
      if (!['canceled', 'incomplete_expired'].includes(linked.status)) {
        return NextResponse.json({ received: true }); // A prior subscription must not replace the current one.
      }
    }
    const status = String(current.status || '');
    const entitled = ['active', 'trialing'].includes(status);
    const priceId = stripeObjectId(current.items?.data?.[0]?.price);
    const planId = stripePlanIdForPrice(priceId);
    if (entitled && !planId) return NextResponse.json({ error: 'Unrecognized subscription price.' }, { status: 503 });
    const level = planId ? stripePlan(planId)?.level || 0 : 0;
    await Promise.all([
      setEntitlement(userId, {
        pieSubscriptionStatus: status, piePlanId: entitled ? planId : 'none', piePlanLevel: entitled ? level : 0,
        pieStripeCustomerId: stripeObjectId(current.customer), pieStripeSubscriptionId: current.id,
        ...(checkoutEvent ? { pieOnboardingCompleted: true } : {}),
      }),
      syncBillingRecord(userId, {
        status, planId: entitled ? planId! : 'none', planLevel: entitled ? level : 0,
        stripeCustomerId: stripeObjectId(current.customer), stripeSubscriptionId: current.id,
        stripePriceId: priceId, currentPeriodEnd: subscriptionPeriodEnd(current), cancelAtPeriodEnd: Boolean(current.cancel_at_period_end),
      }),
    ]);
  }

  return NextResponse.json({ received: true });
}
