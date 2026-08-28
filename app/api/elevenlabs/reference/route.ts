import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, validateAudioFile } from '../../../security';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-reference', 8, 60_000);
  if (limited) return limited;

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Reference audio is temporarily unavailable.' }, { status: 503 });
    }

    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 32 * 1024 * 1024) {
      return NextResponse.json({ error: 'Reference audio is too large.' }, { status: 413 });
    }

    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Reference audio file is required.' }, { status: 400 });
    }
    validateAudioFile(file, 30 * 1024 * 1024);

    const safeName = (file.name || 'reference-audio').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const form = new FormData();
    form.append('file', file, safeName || 'reference-audio');

    const response = await fetch(`${ELEVENLABS_BASE}/v1/music/upload`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('ElevenLabs reference upload failed', response.status);
      return NextResponse.json({ error: 'Reference audio provider rejected the upload.' }, { status: response.status >= 500 ? 502 : 400 });
    }

    const text = await response.text();
    if (text.length > 128_000) return NextResponse.json({ error: 'Invalid response from reference audio provider.' }, { status: 502 });
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('ElevenLabs reference upload request failed');
    return NextResponse.json({ error: safeClientError(error, 'Reference audio upload failed.') }, { status: 400 });
  }
}
