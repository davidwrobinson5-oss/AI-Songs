import { createProviderFetch } from '../../../providerFetch';
const providerFetch = createProviderFetch('elevenlabs/plan');
import { NextResponse } from 'next/server';
import { FREE_LIMITS } from '../../../billingConfig';
import { boundedNumber, rateLimit, readJsonObject, safeClientError, textField } from '../../../security';
import { consumeUsage, resolvePieUserId, usageDeniedMessage } from '../../../usageEntitlements';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-plan', 10, 60_000);
  if (limited) return limited;

  try {
    const userId = await resolvePieUserId();
    if (!userId) return NextResponse.json({ error: 'Sign in to create a music plan.' }, { status: 401 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Music planning is temporarily unavailable.' }, { status: 503 });

    const body = await readJsonObject(req, 20_000);
    const prompt = textField(body.prompt, 8_000);
    if (!prompt) return NextResponse.json({ error: 'A music prompt is required.' }, { status: 400 });
    const musicLengthMs = body.musicLengthMs == null ? undefined : boundedNumber(body.musicLengthMs, 3000, 600000);

    const entitlement = await consumeUsage('elevenlabs_music_plans', FREE_LIMITS.musicGenerationsPerMonth);
    if (!entitlement.allowed) {
      return NextResponse.json({
        error: usageDeniedMessage('music plans', entitlement),
        code: 'PIE_USAGE_LIMIT',
        usage: { count: entitlement.usageCount, limit: entitlement.usageLimit },
      }, { status: entitlement.userId ? 402 : 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const response = await providerFetch(`${ELEVENLABS_BASE}/v1/music/plan`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        model_id: 'music_v2',
        ...(musicLengthMs ? { music_length_ms: musicLengthMs } : {}),
      }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Music Engine plan failed', response.status);
      return NextResponse.json({ error: 'Music planning provider rejected the request.' }, { status: response.status >= 500 ? 502 : 400 });
    }
    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Music Engine plan request failed');
    return NextResponse.json({ error: safeClientError(error, 'Music planning request failed.') }, { status: 400 });
  }
}
