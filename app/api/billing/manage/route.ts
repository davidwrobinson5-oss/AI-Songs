import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { billingStripe, ownedBillingSubscription, stripeObjectId } from '../../../billingStripeServer';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== request.nextUrl.origin) return json({ error: 'Request origin could not be verified.' }, 403);
  const { userId } = await auth();
  if (!userId) return json({ error: 'Sign in first.' }, 401);
  const body = await request.json().catch(() => ({}));
  if (!['cancel', 'resume', 'recover'].includes(body.action)) return json({ error: 'Choose a valid billing action.' }, 400);
  try {
    const subscription = await ownedBillingSubscription(userId);
    if (!subscription) return json({ error: 'No subscription is attached to your account.' }, 404);
    if (body.action === 'recover') {
      const invoiceId = stripeObjectId(subscription.latest_invoice);
      if (!invoiceId) return json({ error: 'There is no invoice to pay.' }, 409);
      const invoice = await billingStripe(`/invoices/${encodeURIComponent(invoiceId)}`);
      const invoiceSubscription = stripeObjectId(invoice.parent?.subscription_details?.subscription || invoice.subscription);
      if (invoiceSubscription !== subscription.id || stripeObjectId(invoice.customer) !== stripeObjectId(subscription.customer)
        || invoice.livemode !== subscription.livemode) return json({ error: 'Invoice ownership could not be verified.' }, 403);
      if (invoice.status !== 'open' || invoice.amount_remaining <= 0) return json({ error: 'There is no unpaid invoice. Refresh your billing status.' }, 409);
      const url = new URL(invoice.hosted_invoice_url || '');
      if (url.protocol !== 'https:' || url.hostname !== 'invoice.stripe.com') throw new Error('A secure payment page is unavailable. Contact Pie support.');
      // Let Stripe save a successfully paid invoice's method on this subscription.
      // Do not replace the existing method before payment succeeds.
      if (subscription.payment_settings?.save_default_payment_method !== 'on_subscription') {
        const updated = await billingStripe(`/subscriptions/${subscription.id}`,
          new URLSearchParams({ 'payment_settings[save_default_payment_method]': 'on_subscription' }));
        if (updated.payment_settings?.save_default_payment_method !== 'on_subscription') {
          throw new Error('Could not enable saving your payment method for renewals. Please retry.');
        }
      }
      return json({ url: url.toString() });
    }
    if (process.env.PIE_SCHEDULED_DOWNGRADES_ENABLED !== 'true') return json({ error: 'Self-service subscription changes are not available yet.' }, 503);
    if (!['active', 'trialing', 'past_due'].includes(subscription.status)) return json({ error: 'This subscription has already ended.' }, 409);
    if (subscription.items?.data?.length !== 1 || subscription.pending_update || subscription.pause_collection) return json({ error: 'Contact Pie support to review this subscription before changing it.' }, 409);
    const end = Number(subscription.items.data[0].current_period_end || subscription.current_period_end);
    if (!end) throw new Error('The current renewal date is unavailable.');
    if (body.action === 'cancel' && Number(body.effectiveAt) !== end) return json({ error: 'Your renewal date changed. Refresh and confirm the new date.' }, 409);
    if (body.action === 'resume' && subscription.schedule) return json({ error: 'Contact Pie support to review the existing schedule.' }, 409);
    if (body.action === 'cancel' && subscription.schedule) {
      if (body.replaceSchedule !== true) return json({ error: 'Confirm that cancellation replaces your scheduled plan changes.' }, 409);
      const id = stripeObjectId(subscription.schedule);
      const schedule = await billingStripe(`/subscription_schedules/${encodeURIComponent(id)}`);
      if (stripeObjectId(schedule.subscription) !== subscription.id || schedule.status !== 'active') throw new Error('The existing schedule could not be verified.');
      const released = await billingStripe(`/subscription_schedules/${encodeURIComponent(id)}/release`,
        new URLSearchParams({ preserve_cancel_date: 'true' }), `pie-cancel-release-${id}`);
      if (released.status !== 'released' || stripeObjectId(released.released_subscription) !== subscription.id) throw new Error('The schedule change could not be confirmed. Refresh before retrying.');
    }
    const cancel = body.action === 'cancel';
    const updated = await billingStripe(`/subscriptions/${subscription.id}`,
      new URLSearchParams({ cancel_at_period_end: String(cancel) }));
    if (updated.cancel_at_period_end !== cancel || (cancel && Number(updated.cancel_at) !== end)) {
      throw new Error('The subscription change could not be confirmed. Refresh to check its status.');
    }
    return json({ ok: true, cancelAt: cancel ? end : null });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Billing request failed. Refresh before retrying.' }, 502);
  }
}
