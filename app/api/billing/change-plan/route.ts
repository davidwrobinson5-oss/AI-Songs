import { auth, currentUser } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';
import { planById } from '../../../billingConfig';
import { pieDeploymentTarget } from '../../../deploymentEnvironment';
import { stripeEnvironmentSafe, stripePlan, stripePlanIdForPrice } from '../../../stripePlans';

type StripeResult = { ok: boolean; status: number; data: any };

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

async function stripeRequest(
  stripeSecret: string,
  path: string,
  method: 'GET' | 'POST' = 'GET',
  params?: URLSearchParams,
  idempotencyKey?: string,
): Promise<StripeResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Stripe-Version': '2026-07-29.dahlia',
        ...(params ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: params?.toString(),
      cache: 'no-store',
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) };
  } finally {
    clearTimeout(timeout);
  }
}

function subscriptionPeriodEnd(subscription: any) {
  const candidates = [subscription?.current_period_end, subscription?.items?.data?.[0]?.current_period_end];
  for (const candidate of candidates) {
    const value = Number(candidate || 0);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function priceId(item: any) {
  return String(typeof item?.price === 'string' ? item.price : item?.price?.id || '');
}

function scheduleId(schedule: any) {
  return String(typeof schedule === 'string' ? schedule : schedule?.id || '');
}

function pendingPhase(schedule: any, effectiveAt: number) {
  const phases = Array.isArray(schedule?.phases) ? schedule.phases : [];
  return phases.find((phase: any) => Number(phase?.start_date || 0) >= effectiveAt) || null;
}

function pendingChange(schedule: any, effectiveAt: number) {
  const phase = pendingPhase(schedule, effectiveAt);
  const pendingPriceId = priceId(phase?.items?.[0]);
  const planId = stripePlanIdForPrice(pendingPriceId);
  if (!planId) return null;
  const plan = planById(planId);
  return {
    planId,
    planName: plan.name,
    monthlyPrice: plan.monthlyPrice,
    effectiveAt: new Date(Number(phase.start_date) * 1000).toISOString(),
  };
}

async function loadOwnedSubscription(stripeSecret: string, userId: string) {
  const user = await currentUser();
  const subscriptionId = String(user?.publicMetadata?.pieStripeSubscriptionId || '');
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) {
    return { error: json({ error: 'No paid Pie subscription is attached to this account.' }, 404) };
  }

  const params = new URLSearchParams({ 'expand[]': 'schedule' });
  const result = await stripeRequest(stripeSecret, `/subscriptions/${encodeURIComponent(subscriptionId)}?${params}`, 'GET');
  if (!result.ok) {
    console.error('Pie could not retrieve the subscription for plan management.', { status: result.status });
    return { error: json({ error: 'Your subscription could not be loaded from Stripe. Please try again.' }, 502) };
  }

  const subscription = result.data;
  const stripeUserId = String(subscription?.metadata?.pie_user_id || '');
  const clerkCustomerId = String(user?.publicMetadata?.pieStripeCustomerId || '');
  const stripeCustomerId = String(subscription?.customer?.id || subscription?.customer || '');
  if (subscription?.id !== subscriptionId || stripeUserId !== userId || (clerkCustomerId && clerkCustomerId !== stripeCustomerId)) {
    console.error('Rejected a Pie plan change because subscription ownership did not match.', { userId, subscriptionId });
    return { error: json({ error: 'Pie could not verify ownership of this subscription.' }, 403) };
  }

  return { subscription };
}

async function loadSchedule(stripeSecret: string, value: any) {
  if (value && typeof value === 'object' && Array.isArray(value.phases)) return value;
  const id = scheduleId(value);
  if (!id) return null;
  const result = await stripeRequest(stripeSecret, `/subscription_schedules/${encodeURIComponent(id)}`);
  return result.ok ? result.data : null;
}

function appendMetadata(params: URLSearchParams, phaseIndex: number, metadata: Record<string, unknown>) {
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') params.set(`phases[${phaseIndex}][metadata][${key}]`, value);
  }
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return json({ error: 'Sign in first.' }, 401);

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret || !stripeEnvironmentSafe()) return json({ pending: null });

  try {
    const loaded = await loadOwnedSubscription(stripeSecret, userId);
    if (loaded.error) return loaded.error;
    const subscription = loaded.subscription;
    const effectiveAt = subscriptionPeriodEnd(subscription);
    const schedule = await loadSchedule(stripeSecret, subscription.schedule);
    return json({ enabled: process.env.PIE_SCHEDULED_DOWNGRADES_ENABLED === 'true', pending: schedule && effectiveAt ? pendingChange(schedule, effectiveAt) : null });
  } catch (error) {
    console.error('Pie could not load a pending plan change.', error instanceof Error ? error.message : 'unknown');
    return json({ error: 'Your pending plan change could not be loaded.' }, 502);
  }
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return json({ error: 'This plan change request was rejected.' }, 403);

  const { userId } = await auth();
  if (!userId) return json({ error: 'Sign in first.' }, 401);
  // Enable only after sandbox end-to-end validation with schedule write access.
  if (process.env.PIE_SCHEDULED_DOWNGRADES_ENABLED !== 'true') {
    return json({ error: 'Self-service downgrades are not enabled yet. Contact Pie support.' }, 503);
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return json({ error: 'Stripe billing is not configured yet.' }, 503);
  if (!stripeEnvironmentSafe()) {
    return json({
      error: pieDeploymentTarget() === 'production'
        ? 'Production billing is not fully configured with live Stripe prices.'
        : 'This non-production deployment must use the Pie Stripe test configuration.',
    }, 503);
  }

  const body = await request.json().catch(() => ({}));
  const targetPlanId = String(body?.planId || '');
  const targetStripePlan = stripePlan(targetPlanId);
  if (!targetStripePlan) return json({ error: 'Choose a valid paid Pie plan.' }, 400);

  try {
    const loaded = await loadOwnedSubscription(stripeSecret, userId);
    if (loaded.error) return loaded.error;
    const subscription = loaded.subscription;

    if (Boolean(subscription.livemode) !== (pieDeploymentTarget() === 'production')) {
      return json({ error: 'Subscription billing environment mismatch.' }, 409);
    }
    if (subscription.cancel_at_period_end || subscription.cancel_at || subscription.pending_update || subscription.pause_collection) {
      return json({ error: 'This subscription has a pending change or pause. Contact Pie support before scheduling a downgrade.' }, 409);
    }

    if (subscription.status !== 'active') {
      return json({ error: 'Plan downgrades can be scheduled after the paid subscription becomes active.' }, 409);
    }
    const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
    if (items.length !== 1) return json({ error: 'This subscription needs support assistance before its plan can be changed.' }, 409);
    if (subscription?.discount || (Array.isArray(subscription?.discounts) && subscription.discounts.length)) {
      return json({ error: 'Contact Pie support to change a subscription that has a promotion attached.' }, 409);
    }

    const currentPriceId = priceId(items[0]);
    const currentPlanId = stripePlanIdForPrice(currentPriceId);
    if (!currentPlanId) return json({ error: 'The current Stripe price is not mapped to a Pie plan.' }, 409);
    const currentPlan = planById(currentPlanId);
    const targetPlan = planById(targetPlanId);
    if (targetPlan.level >= currentPlan.level) {
      return json({ error: targetPlan.level === currentPlan.level ? 'You are already on this plan.' : 'Upgrades are not available in this downgrade flow.' }, 400);
    }

    const effectiveAt = subscriptionPeriodEnd(subscription);
    if (!effectiveAt) return json({ error: 'Stripe did not return a valid renewal date for this subscription.' }, 409);

    let schedule = await loadSchedule(stripeSecret, subscription.schedule);
    if (subscription.schedule && !schedule) {
      return json({ error: 'The existing schedule could not be verified. No change was made.' }, 502);
    }
    const existingPending = schedule ? pendingChange(schedule, effectiveAt) : null;
    if (existingPending) {
      if (existingPending.planId === targetPlanId) {
        return json({ scheduled: true, pending: existingPending });
      }
      return json({ error: `A downgrade to ${existingPending.planName} is already scheduled. Contact Pie support to replace it.` }, 409);
    }
    if (schedule) {
      return json({ error: 'This subscription already has a schedule. Contact Pie support to review it.' }, 409);
    }

    if (!schedule || ['released', 'completed', 'canceled'].includes(String(schedule.status || ''))) {
      const createParams = new URLSearchParams({ from_subscription: subscription.id });
      const created = await stripeRequest(
        stripeSecret,
        '/subscription_schedules',
        'POST',
        createParams,
        `pie-downgrade-create-${subscription.id}-${effectiveAt}`,
      );
      if (!created.ok || !created.data?.id) {
        console.error('Pie could not create a Stripe subscription schedule.', { status: created.status });
        return json({ error: 'Stripe could not schedule this downgrade. No plan change was made.' }, 502);
      }
      schedule = created.data;
    }

    const phaseStart = Number(schedule?.current_phase?.start_date || schedule?.phases?.[0]?.start_date || items[0]?.current_period_start || subscription.current_period_start || 0);
    if (!phaseStart || phaseStart >= effectiveAt) {
      return json({ error: 'Stripe returned an invalid current billing phase. No downgrade was scheduled.' }, 502);
    }

    const update = new URLSearchParams();
    update.set('end_behavior', 'release');
    update.set('proration_behavior', 'none');
    update.set('phases[0][start_date]', String(phaseStart));
    update.set('phases[0][end_date]', String(effectiveAt));
    update.set('phases[0][items][0][price]', currentPriceId);
    update.set('phases[0][items][0][quantity]', String(Math.max(1, Number(items[0]?.quantity || 1))));
    update.set('phases[0][proration_behavior]', 'none');
    appendMetadata(update, 0, subscription.metadata || {});

    update.set('phases[1][start_date]', String(effectiveAt));
    update.set('phases[1][duration][interval]', 'month');
    update.set('phases[1][duration][interval_count]', '1');
    update.set('phases[1][items][0][price]', targetStripePlan.priceId);
    update.set('phases[1][items][0][quantity]', '1');
    update.set('phases[1][proration_behavior]', 'none');
    appendMetadata(update, 1, {
      ...(subscription.metadata || {}),
      pie_user_id: userId,
      pie_plan_id: targetPlanId,
      pie_plan_level: String(targetPlan.level),
    });

    const updated = await stripeRequest(
      stripeSecret,
      `/subscription_schedules/${encodeURIComponent(schedule.id)}`,
      'POST',
      update,
      `pie-downgrade-update-${subscription.id}-${targetPlanId}-${effectiveAt}`,
    );
    if (!updated.ok) {
      console.error('Pie could not configure the Stripe subscription schedule.', { status: updated.status });
      return json({ error: 'The schedule update could not be confirmed. Contact Pie support to check its status before retrying.' }, 502);
    }

    return json({
      scheduled: true,
      pending: {
        planId: targetPlanId,
        planName: targetPlan.name,
        monthlyPrice: targetPlan.monthlyPrice,
        effectiveAt: new Date(effectiveAt * 1000).toISOString(),
      },
    });
  } catch (error) {
    console.error('Pie plan downgrade failed.', error instanceof Error ? error.message : 'unknown');
    // A timeout does not prove Stripe rejected the write. Never release a
    // potentially successful schedule as automatic error recovery.
    return json({ error: 'The downgrade result could not be confirmed. Refresh to check the schedule, or contact Pie support before retrying.' }, 502);
  }
}
