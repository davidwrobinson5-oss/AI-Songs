import { clerkClient } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

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

export async function POST(request: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Webhook secret missing.' }, { status: 503 });

  const rawBody = await request.text();
  const signature = request.headers.get('stripe-signature') || '';
  if (!(await verifyStripeSignature(rawBody, signature, secret))) {
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  const event = JSON.parse(rawBody);
  const object = event?.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const userId = String(object.client_reference_id || object.metadata?.pie_user_id || '');
    const level = Number(object.metadata?.pie_plan_level || 1);
    const planId = String(object.metadata?.pie_plan_id || 'fun');
    if (userId) {
      await setEntitlement(userId, {
        pieSubscriptionStatus: 'active',
        piePlanId: planId,
        piePlanLevel: level,
        pieStripeCustomerId: object.customer || null,
        pieStripeSubscriptionId: object.subscription || null,
        pieOnboardingCompleted: true,
      });
    }
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.created') {
    const userId = String(object.metadata?.pie_user_id || '');
    const level = Number(object.metadata?.pie_plan_level || 1);
    const planId = String(object.metadata?.pie_plan_id || 'fun');
    if (userId) {
      const status = String(object.status || '');
      const entitled = ['active', 'trialing'].includes(status);
      await setEntitlement(userId, {
        pieSubscriptionStatus: status,
        piePlanId: entitled ? planId : 'fun',
        piePlanLevel: entitled ? level : 1,
        pieStripeCustomerId: object.customer || null,
        pieStripeSubscriptionId: object.id || null,
      });
    }
  }

  if (event.type === 'customer.subscription.deleted') {
    const userId = String(object.metadata?.pie_user_id || '');
    if (userId) {
      await setEntitlement(userId, {
        pieSubscriptionStatus: 'canceled',
        piePlanId: 'fun',
        piePlanLevel: 1,
        pieStripeSubscriptionId: object.id || null,
      });
    }
  }

  if (event.type === 'invoice.payment_failed') {
    const subscriptionDetails = object.parent?.subscription_details || object.subscription_details || {};
    const userId = String(subscriptionDetails.metadata?.pie_user_id || '');
    if (userId) await setEntitlement(userId, { pieSubscriptionStatus: 'past_due' });
  }

  return NextResponse.json({ received: true });
}
