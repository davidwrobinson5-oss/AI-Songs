import { NextResponse } from 'next/server';

const BASE = process.env.SUNO_API_BASE_URL || 'https://api.suno.com';
const GENERATE_PATH = process.env.SUNO_GENERATE_PATH || '/v0/audio';

export async function POST(req: Request) {
  try {
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
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Suno generation request failed.' }, { status: 500 });
  }
}
