import { NextResponse } from 'next/server';
import { rateLimit, safeId } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function GET(req: Request) {
  const limited = rateLimit(req, 'kits-conversion-status', 30, 60_000);
  if (limited) return limited;

  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Voice conversion is temporarily unavailable.' }, { status: 503 });

  try {
    const id = safeId(new URL(req.url).searchParams.get('id'), 160);
    const response = await fetch(`${KITS_BASE}/voice-conversions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: 'Voice conversion status is unavailable.' }, { status: response.status >= 500 ? 502 : 400, headers: { 'Cache-Control': 'no-store' } });
    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Invalid voice conversion status request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
