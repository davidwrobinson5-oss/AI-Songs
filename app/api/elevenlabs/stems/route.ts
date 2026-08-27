import { NextResponse } from 'next/server';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ELEVENLABS_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const incoming = await req.formData();
    const file = incoming.get('file');
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'Audio file is required.' }, { status: 400 });
    }

    const form = new FormData();
    form.append('file', file, 'generated-song.mp3');
    form.append('stem_variation_id', 'two_stems_v1');

    const response = await fetch(`${ELEVENLABS_BASE}/v1/music/stem-separation?output_format=mp3_48000_192`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: form,
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return new NextResponse(text || 'ElevenLabs stem separation failed.', {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') || 'text/plain' },
      });
    }

    const zip = await response.arrayBuffer();
    return new NextResponse(zip, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'ElevenLabs stem separation failed.' }, { status: 500 });
  }
}
