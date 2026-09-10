import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';

const ENTITLEMENT_URL = `${(process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '')}/functions/v1/pie-entitlements`;
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');

export const OVERAGE_PACKS = [
  { id: 'boost', name: 'Boost', credits: 10, price: 6 },
  { id: 'plus', name: 'Plus', credits: 25, price: 12 },
  { id: 'power', name: 'Power', credits: 60, price: 24 },
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

  const computeUsed = Math.max(0, Number(data?.computeUsed || 0));
  const computeLimit = data?.computeLimit == null ? null : Math.max(0, Number(data.computeLimit || 0));
  const overageCredits = Math.max(0, Number(data?.overageCredits || 0));
  const daysElapsed = Math.max(1, Number(data?.daysElapsed || 1));
  const daysRemaining = Math.max(0, Number(data?.daysRemaining || 0));
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
