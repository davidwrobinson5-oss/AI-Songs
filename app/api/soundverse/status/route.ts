import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';

export async function GET() {
  const apiKey = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, connected: false, error: 'SOUNDVERSE_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const response = await fetch(`${BASE}/v1/account/balance`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        { ok: false, connected: false, status: response.status, error: data?.error || data?.message || 'Soundverse connection failed.' },
        { status: response.status },
      );
    }

    return NextResponse.json({
      ok: true,
      connected: true,
      status: response.status,
      provider: 'soundverse',
      balanceAvailable: typeof data?.total_effective === 'number',
    });
  } catch {
    return NextResponse.json({ ok: false, connected: false, error: 'Could not reach Soundverse.' }, { status: 502 });
  }
}
