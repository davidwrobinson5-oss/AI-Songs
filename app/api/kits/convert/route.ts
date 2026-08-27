import { NextResponse } from 'next/server';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function POST(req: Request) {
  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'KITS_API_KEY is not configured yet.' }, { status: 503 });
  }

  try {
    const { modelId, audioUrl, pitchShift = 0 } = await req.json();
    if (!modelId || !audioUrl) {
      return NextResponse.json({ error: 'modelId and audioUrl are required.' }, { status: 400 });
    }

    const form = new FormData();
    form.append('voiceModelId', String(modelId));
    form.append('audioUrl', String(audioUrl));
    form.append('pitchShift', String(pitchShift));

    const response = await fetch(`${KITS_BASE}/voice-conversions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Kits voice conversion failed.' }, { status: 500 });
  }
}
