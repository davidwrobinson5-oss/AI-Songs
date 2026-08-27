import { NextResponse } from 'next/server';

const BASE = 'https://api.mureka.ai';

export async function GET() {
  const apiKey = process.env.MUREKA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ ok: false, connected: false, error: 'MUREKA_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const response = await fetch(`${BASE}/v1/account/billing`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error?.message || data?.message || data?.error || `Mureka returned ${response.status}.`;
      return NextResponse.json({ ok: false, connected: false, status: response.status, error: message }, { status: response.status });
    }

    return NextResponse.json({ ok: true, connected: true, status: response.status, provider: 'mureka' });
  } catch (error) {
    return NextResponse.json({ ok: false, connected: false, error: error instanceof Error ? error.message : 'Could not reach Mureka.' }, { status: 502 });
  }
}
