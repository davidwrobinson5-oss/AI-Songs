import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, validateAudioFile } from '../../../security';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'kits-separate', 4, 60_000);
  if (limited) return limited;

  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Vocal separation is temporarily unavailable.' }, { status: 503 });

  try {
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 82 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio upload is too large.' }, { status: 413 });
    }

    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof Blob)) return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
    validateAudioFile(file, 80 * 1024 * 1024);

    const form = new FormData();
    form.append('inputFile', file, 'generated-song.mp3');

    const response = await fetch(`${KITS_BASE}/vocal-separations`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Kits vocal separation failed', response.status);
      return NextResponse.json({ error: 'Vocal separation provider rejected the request.' }, { status: response.status >= 500 ? 502 : 400 });
    }
    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Kits vocal separation failed');
    return NextResponse.json({ error: safeClientError(error, 'Vocal separation failed.') }, { status: 400 });
  }
}
