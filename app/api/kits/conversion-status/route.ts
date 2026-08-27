import { NextResponse } from 'next/server';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function GET(req: Request) {
  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'KITS_API_KEY is not configured yet.' }, { status: 503 });

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required.' }, { status: 400 });

  const response = await fetch(`${KITS_BASE}/voice-conversions/${id}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  return NextResponse.json(data, { status: response.status });
}
