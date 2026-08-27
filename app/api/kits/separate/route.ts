import { NextResponse } from 'next/server';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function POST(req: Request) {
  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'KITS_API_KEY is not configured yet.' }, { status: 503 });
  }

  try {
    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
    }

    const form = new FormData();
    form.append('soundFile', file, 'generated-song.mp3');

    const response = await fetch(`${KITS_BASE}/vocal-separations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Kits vocal separation failed.' }, { status: 500 });
  }
}
