import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError } from '../../../security';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-generate', 6, 60_000);
  if (limited) return limited;

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Music generation is temporarily unavailable.' }, { status: 503 });
    }

    const body = await readJsonObject(req, 64_000);
    delete body.model_id;
    delete body.modelId;

    const response = await fetch(`${ELEVENLABS_BASE}/v1/music`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ ...body, model_id: 'music_v2' }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('ElevenLabs generation failed', response.status);
      return NextResponse.json({ error: 'Music generation provider rejected the request.' }, { status: response.status >= 500 ? 502 : 400 });
    }

    const audio = await response.arrayBuffer();
    if (!audio.byteLength || audio.byteLength > 80 * 1024 * 1024) {
      return NextResponse.json({ error: 'Music generation returned an invalid audio file.' }, { status: 502 });
    }

    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('ElevenLabs generation request failed');
    return NextResponse.json({ error: safeClientError(error, 'Music generation request failed.') }, { status: 400 });
  }
}
