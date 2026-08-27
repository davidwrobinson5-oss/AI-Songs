import { NextResponse } from 'next/server';

// Connectivity probe for the production ElevenLabs Music v2 integration.
export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'ELEVENLABS_API_KEY is not configured.' }, { status: 503 });
  }

  const response = await fetch('https://api.elevenlabs.io/v1/music/plan', {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: 'Short uplifting instrumental pop cue for API connectivity test',
      music_length_ms: 3000,
      model_id: 'music_v2',
    }),
    cache: 'no-store',
  });

  const data = await response.json().catch(() => ({}));
  return NextResponse.json({
    ok: response.ok,
    status: response.status,
    connected: response.ok,
    model: 'music_v2',
    detail: response.ok ? 'ElevenLabs Music v2 connection verified.' : data,
  }, { status: response.ok ? 200 : response.status });
}
