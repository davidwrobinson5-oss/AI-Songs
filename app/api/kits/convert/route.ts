import { NextResponse } from 'next/server';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function POST(req: Request) {
  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'KITS_API_KEY is not configured yet.' }, { status: 503 });
  }

  try {
    const { modelId, separationId, pitchShift = 0 } = await req.json();
    if (!modelId || !separationId) {
      return NextResponse.json({ error: 'modelId and separationId are required.' }, { status: 400 });
    }

    const separationResponse = await fetch(`${KITS_BASE}/vocal-separations/${separationId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });

    const separation = await separationResponse.json().catch(() => ({}));
    if (!separationResponse.ok) {
      return NextResponse.json(separation, { status: separationResponse.status });
    }

    if (separation.status !== 'success') {
      return NextResponse.json({ error: 'Vocal separation is not complete yet.', status: separation.status }, { status: 409 });
    }

    const vocalUrl = separation.vocalAudioFileUrl || separation.lossyVocalAudioFileUrl;
    if (!vocalUrl) {
      return NextResponse.json({ error: 'Kits did not return a vocal stem.' }, { status: 502 });
    }

    const vocalResponse = await fetch(vocalUrl, { cache: 'no-store' });
    if (!vocalResponse.ok) {
      return NextResponse.json({ error: 'Could not retrieve the separated vocal stem.' }, { status: 502 });
    }

    const vocalBlob = await vocalResponse.blob();
    const form = new FormData();
    form.append('voiceModelId', String(modelId));
    form.append('soundFile', vocalBlob, 'vocal-stem.mp3');
    form.append('pitchShift', String(pitchShift));

    const response = await fetch(`${KITS_BASE}/voice-conversions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Kits voice conversion failed.' }, { status: 500 });
  }
}
