import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from './auth';

const ENTITLEMENT_URL = 'https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-entitlements';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
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
    // Fall through to legacy access.
  }

  const jar = await cookies();
  const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
  const legacyValid = await verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);
  return legacyValid ? LEGACY_OWNER_ID : '';
}

export async function consumeUsage(usageKey: string, freeLimit: number, units = 1): Promise<UsageEntitlement> {
  const userId = await resolvePieUserId();
  if (!userId) {
    return { userId: '', planId: 'fun', planLevel: 1, status: 'signed_out', allowed: false, usageCount: 0, usageLimit: freeLimit, outputQuality: 'standard' };
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
    body: JSON.stringify({ action: 'consume', userId, usageKey, freeLimit, units }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Could not verify Pie usage entitlement.');

  return {
    userId,
    planId: String(data?.planId || 'fun'),
    planLevel: Number(data?.planLevel || 1),
    status: String(data?.status || 'free'),
    allowed: Boolean(data?.allowed),
    usageCount: Number(data?.usageCount || 0),
    usageLimit: data?.usageLimit == null ? null : Number(data.usageLimit),
    outputQuality: data?.outputQuality === 'premium' ? 'premium' : 'standard',
  };
}

export function usageDeniedMessage(label: string, entitlement: UsageEntitlement) {
  if (!entitlement.userId) return 'Sign in to use this Pie feature.';
  if (entitlement.usageLimit == null) return `${label} is temporarily unavailable.`;
  return `You have used all ${entitlement.usageLimit} free ${label.toLowerCase()} this month. Upgrade your Pie stage to continue.`;
}
