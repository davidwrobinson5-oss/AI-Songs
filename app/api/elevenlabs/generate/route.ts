import { NextResponse } from 'next/server';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function POST(req: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY is not configured yet.' }, { status: 503 });
    }

    const body = await req.json();
    const response = await fetch(`${ELEVENLABS_BASE}/v1/music`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ model_id: 'music_v2', ...body }),
      cache: 'no-store',
    });

    if (!response.ok) {
      const text = await response.text();
      return new NextResponse(text || 'ElevenLabs music generation failed.', {
        status: response.status,
        headers: { 'Content-Type': response.headers.get('content-type') || 'text/plain' },
      });
    }

    const audio = await response.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'ElevenLabs music generation request failed.' }, { status: 500 });
  }
}
