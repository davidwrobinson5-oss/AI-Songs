import { currentUser } from '@clerk/nextjs/server';
import { stripeEnvironmentSafe } from './stripePlans';
import { pieDeploymentTarget } from './deploymentEnvironment';

export const stripeObjectId = (value: any): string => typeof value === 'string' ? value : value?.id || '';

export async function billingStripe(path: string, params?: URLSearchParams, key?: string) {
  if (!stripeEnvironmentSafe()) throw new Error('Billing configuration is unavailable.');
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      'Stripe-Version': '2026-07-29.dahlia',
      ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    body: params?.toString(), cache: 'no-store', signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Billing Stripe request failed', { path, status: response.status, code: body?.error?.code });
    throw new Error('Stripe could not complete this request. Refresh to check the current status before retrying.');
  }
  return body;
}

export async function ownedBillingSubscription(userId: string) {
  const user = await currentUser();
  const id = String(user?.publicMetadata?.pieStripeSubscriptionId || '');
  if (!/^sub_[A-Za-z0-9]+$/.test(id)) return null;
  const subscription = await billingStripe(`/subscriptions/${id}`);
  if (user?.id !== userId || subscription.id !== id || subscription.metadata?.pie_user_id !== userId
    || stripeObjectId(subscription.customer) !== user.publicMetadata?.pieStripeCustomerId
    || subscription.livemode !== (pieDeploymentTarget() === 'production')) {
    throw new Error('Subscription ownership could not be verified.');
  }
  return subscription;
}
