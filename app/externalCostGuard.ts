import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from './usageEntitlements';

const ENTITLEMENT_URL = 'https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-entitlements';

export type ExternalCostReservation = {
  userId: string;
  allowed: boolean;
  reservationId: string;
  budgetCents: number | null;
  usedCents: number;
  remainingCents: number | null;
  billingStatus: string;
  reason: string;
};

async function request(userId: string, body: Record<string, unknown>) {
  const oidc = await getVercelOidcToken().catch(() => '');
  if (!oidc) throw new Error('Pie cost-control identity is temporarily unavailable.');

  const response = await fetch(ENTITLEMENT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Pie-Vercel-OIDC': oidc,
    },
    body: JSON.stringify({ ...body, userId }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Pie cost-control service failed.');
  return data;
}

export function elevenMusicReserveCents(durationMs: number, overheadCents = 0) {
  const safeMs = Math.max(3000, Math.min(600000, Number.isFinite(durationMs) ? durationMs : 30000));
  const baseCents = (safeMs / 60000) * 15;
  return Math.max(1, Math.ceil(baseCents * 1.25) + Math.max(0, Math.ceil(overheadCents)));
}

export async function reserveExternalCost(
  usageKey: string,
  provider: string,
  model: string,
  reserveCents: number,
): Promise<ExternalCostReservation> {
  const userId = await resolvePieUserId();
  if (!userId) return { userId: '', allowed: false, reservationId: '', budgetCents: 0, usedCents: 0, remainingCents: 0, billingStatus: 'signed_out', reason: 'Sign in to use this feature.' };
  const reservationId = crypto.randomUUID();
  const data = await request(userId, { action: 'reserveCost', usageKey, provider, model, reserveCents, reservationId });
  return {
    userId,
    allowed: Boolean(data?.allowed),
    reservationId: String(data?.reservationId || reservationId),
    budgetCents: data?.budgetCents == null ? null : Number(data.budgetCents),
    usedCents: Number(data?.usedCents || 0),
    remainingCents: data?.remainingCents == null ? null : Number(data.remainingCents),
    billingStatus: String(data?.billingStatus || 'inactive'),
    reason: String(data?.reason || ''),
  };
}

export async function settleExternalCost(reservationId: string, actualCents: number) {
  const userId = await resolvePieUserId();
  if (!userId || !reservationId) return { ok: false, remainingCents: 0, reason: 'Missing reservation identity.' };
  const data = await request(userId, { action: 'settleCost', reservationId, actualCents });
  return { ok: Boolean(data?.ok), remainingCents: data?.remainingCents == null ? null : Number(data.remainingCents), reason: String(data?.reason || '') };
}

export async function releaseExternalCost(reservationId: string) {
  const userId = await resolvePieUserId();
  if (!userId || !reservationId) return { ok: false, remainingCents: 0, reason: 'Missing reservation identity.' };
  const data = await request(userId, { action: 'releaseCost', reservationId });
  return { ok: Boolean(data?.ok), remainingCents: data?.remainingCents == null ? null : Number(data.remainingCents), reason: String(data?.reason || '') };
}

export function protectedCostDeniedMessage() {
  return 'This generation would exceed the protected creation-cost allowance for your current period. Try a shorter generation or use prepaid creation capacity.';
}
