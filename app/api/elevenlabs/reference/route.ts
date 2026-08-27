import { NextResponse } from 'next/server';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY is not configured yet.' }, { status: 503 });
    }

    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Reference audio file is required.' }, { status: 400 });
    }

    const form = new FormData();
    form.append('file', file, file.name || 'reference-audio');

    const response = await fetch(`${ELEVENLABS_BASE}/v1/music/upload`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      cache: 'no-store',
    });

    const text = await response.text();
    if (!response.ok) {
      return new NextResponse(text || 'ElevenLabs reference upload failed.', {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') || 'text/plain' },
      });
    }

    return new NextResponse(text, {
      status: 200,
      headers: { 'Content-Type': response.headers.get('content-type') || 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'ElevenLabs reference upload request failed.' }, { status: 500 });
  }
}
