import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';
import { billingStripe, ownedBillingSubscription, stripeObjectId } from '../../../billingStripeServer';
import { billingTiming } from '../../../billingTiming';

const ENTITLEMENT_URL = `${(process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '')}/functions/v1/pie-entitlements`;
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');

export const OVERAGE_PACKS = [
  { id: 'boost', name: 'Boost', credits: 10, price: 8 },
  { id: 'plus', name: 'Plus', credits: 25, price: 18 },
  { id: 'power', name: 'Power', credits: 60, price: 39 },
] as const;

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });

  const oidc = await getVercelOidcToken().catch(() => '');
  if (!oidc) return NextResponse.json({ error: 'Usage service is temporarily unavailable.' }, { status: 503 });

  const response = await fetch(ENTITLEMENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'X-Pie-Vercel-OIDC': oidc,
    },
    body: JSON.stringify({ action: 'summary', userId }),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) return NextResponse.json({ error: data?.error || 'Could not load usage.' }, { status: 502 });

  let timing: ReturnType<typeof billingTiming> = null;
  let management: { available: boolean; periodEnd?: number; cancelAt?: number | null; hasSchedule?: boolean; status?: string } = { available: false };
  try {
    const sub = await ownedBillingSubscription(userId);
    if (sub) {
      const item = sub.items?.data?.[0];
      const end = Number(item?.current_period_end || sub.current_period_end);
      management = { available: process.env.PIE_SCHEDULED_DOWNGRADES_ENABLED === 'true', periodEnd: end,
        cancelAt: sub.cancel_at || null, hasSchedule: Boolean(sub.schedule), status: sub.status };
      let now = Date.now() / 1000;
      if (!sub.livemode && sub.test_clock) {
        const clock = await billingStripe(`/test_helpers/test_clocks/${encodeURIComponent(stripeObjectId(sub.test_clock))}`);
        if (clock.id !== stripeObjectId(sub.test_clock) || clock.livemode !== false || clock.status !== 'ready') throw new Error('Simulation is not ready.');
        now = Number(clock.frozen_time);
      }
      timing = billingTiming(Number(item?.current_period_start || sub.current_period_start), end, now);
    }
  } catch { console.warn('Billing timing or management details unavailable'); }

  const computeUsed = Math.max(0, Number(data?.computeUsed || 0));
  const computeLimit = data?.computeLimit == null ? null : Math.max(0, Number(data.computeLimit || 0));
  const overageCredits = Math.max(0, Number(data?.overageCredits || 0));
  const daysElapsed = timing?.daysElapsed || 1;
  const daysRemaining = timing?.daysRemaining || 0;
  const cycleDays = daysElapsed + daysRemaining;
  const averagePerDay = computeUsed / daysElapsed;
  const projectedTotal = Math.ceil(averagePerDay * cycleDays);
  const projectedShortfall = computeLimit == null ? 0 : Math.max(0, projectedTotal - computeLimit - overageCredits);
  const includedRemaining = computeLimit == null ? null : Math.max(0, computeLimit - computeUsed);
  const availableNow = computeLimit == null ? null : includedRemaining + overageCredits;

  let recommendedPackId = 'boost';
  if (projectedShortfall > 10 && projectedShortfall <= 25) recommendedPackId = 'plus';
  if (projectedShortfall > 25) recommendedPackId = 'power';

  return NextResponse.json({
    ...data,
    management,
    forecastAvailable: Boolean(timing),
    daysElapsed,
    daysRemaining,
    resetAt: timing?.resetAt || data.resetAt || null,
    computeUsed,
    computeLimit,
    overageCredits,
    includedRemaining,
    availableNow,
    averagePerDay: Number(averagePerDay.toFixed(2)),
    projectedTotal,
    projectedShortfall,
    recommendedPackId,
    packs: OVERAGE_PACKS,
    creditCosts: {
      musicOrRemix: 4,
      voiceRender: 2,
      stemsOrSheets: 3,
      normalAi: 1,
      heavyVoiceTraining: 8,
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
