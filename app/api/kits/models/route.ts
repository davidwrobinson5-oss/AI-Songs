import { NextResponse } from 'next/server';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function GET() {
  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'KITS_API_KEY is not configured yet.' }, { status: 503 });
  }

  const url = new URL(`${KITS_BASE}/voice-models`);
  url.searchParams.set('myModels', 'true');
  url.searchParams.set('perPage', '100');

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
