import { NextResponse } from 'next/server';
import { FREE_LIMITS } from '../../../billingConfig';
import { consumeUsage, usageDeniedMessage } from '../../../usageEntitlements';

const BASE = process.env.SUNO_API_BASE_URL || 'https://api.suno.com';
const GENERATE_PATH = process.env.SUNO_GENERATE_PATH || '/v0/audio';

export async function POST(req: Request) {
  try {
    const entitlement = await consumeUsage('music_generations', FREE_LIMITS.musicGenerationsPerMonth);
    if (!entitlement.allowed) {
      return NextResponse.json({
        error: usageDeniedMessage('music generations', entitlement),
        code: 'PIE_USAGE_LIMIT',
        usage: { count: entitlement.usageCount, limit: entitlement.usageLimit },
      }, { status: entitlement.userId ? 402 : 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const apiKey = process.env.SUNO_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'SUNO_API_KEY is not configured yet.' }, { status: 503 });
    }

    const body = await req.json();
    const response = await fetch(`${BASE}${GENERATE_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json({
      ...data,
      pieUsage: { count: entitlement.usageCount, limit: entitlement.usageLimit },
      pieOutputQuality: entitlement.outputQuality,
    }, { status: response.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Suno generation request failed.' }, { status: 500 });
  }
}
