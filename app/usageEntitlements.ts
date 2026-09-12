import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from './auth';

const ENTITLEMENT_URL = `${(process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '')}/functions/v1/pie-entitlements`;
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');
const LEGACY_OWNER_ID = 'pie-primary';

export type UsageEntitlement = {
  userId: string;
  planId: string;
  planLevel: number;
  status: string;
  allowed: boolean;
  usageCount: number;
  usageLimit: number | null;
  outputQuality: 'standard' | 'premium';
};

export async function resolvePieUserId() {
  try {
    const clerk = await auth();
    if (clerk.userId) return clerk.userId;
  } catch {
    // Fall through to legacy owner access.
  }

  const jar = await cookies();
  const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
  const legacyValid = await verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);
  return legacyValid ? LEGACY_OWNER_ID : '';
}

export async function consumeUsage(usageKey: string, trialLimit: number, units = 1): Promise<UsageEntitlement> {
  const userId = await resolvePieUserId();
  if (!userId) {
    return { userId: '', planId: 'none', planLevel: 0, status: 'signed_out', allowed: false, usageCount: 0, usageLimit: trialLimit, outputQuality: 'standard' };
  }

  const oidc = await getVercelOidcToken().catch(() => '');
  if (!oidc) throw new Error('Pie entitlement identity is temporarily unavailable.');

  const response = await fetch(ENTITLEMENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'X-Pie-Vercel-OIDC': oidc,
    },
    body: JSON.stringify({ action: 'consume', requestId: crypto.randomUUID(), userId, usageKey, freeLimit: trialLimit, units }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not verify Pie usage entitlement.');

  return {
    userId,
    planId: String(data?.planId || 'none'),
    planLevel: Number(data?.planLevel || 0),
    status: String(data?.status || 'inactive'),
    allowed: Boolean(data?.allowed),
    usageCount: Number(data?.usageCount || 0),
    usageLimit: data?.usageLimit == null ? null : Number(data.usageLimit),
    outputQuality: data?.outputQuality === 'premium' ? 'premium' : 'standard',
  };
}

export function usageDeniedMessage(label: string, entitlement: UsageEntitlement) {
  if (!entitlement.userId) return 'Sign in to use this Pie feature.';
  if (entitlement.status === 'canceled' || entitlement.status === 'past_due' || entitlement.planLevel === 0) {
    return `Choose an active Pie subscription to use ${label.toLowerCase()}.`;
  }
  if (entitlement.status === 'trialing' && entitlement.usageLimit != null) {
    return `You have reached the ${label.toLowerCase()} limit for your free trial. Continue with your selected paid plan to keep using this feature.`;
  }
  if (entitlement.status === 'active') {
    return `You have reached your included ${label.toLowerCase()} allowance or monthly Pie credit budget. Open Usage & top-ups to add optional prepaid credits. Pie never adds surprise overage charges.`;
  }
  if (entitlement.usageLimit == null) return `${label} is temporarily unavailable.`;
  return `${label} is unavailable for this account.`;
}
