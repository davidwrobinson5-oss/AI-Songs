import { NextResponse } from 'next/server';
import { boundedNumber, rateLimit, safeClientError, safeId, validateAudioFile } from '../../../security';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'kits-convert', 6, 60_000);
  if (limited) return limited;

  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Voice conversion is temporarily unavailable.' }, { status: 503 });
  }

  try {
    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 42 * 1024 * 1024) {
      return NextResponse.json({ error: 'Vocal upload is too large.' }, { status: 413 });
    }

    const incoming = await req.formData();
    const file = incoming.get('file');
    const modelId = safeId(incoming.get('modelId'), 160);
    const pitchShift = boundedNumber(incoming.get('pitchShift') ?? '0', -12, 12, 0);

    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: 'A vocal file is required.' }, { status: 400 });
    }
    validateAudioFile(file, 40 * 1024 * 1024);

    const form = new FormData();
    form.append('voiceModelId', modelId);
    form.append('soundFile', file, 'clean-guide-vocal.mp3');
    form.append('pitchShift', String(pitchShift));

    const response = await fetch(`${KITS_BASE}/voice-conversions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Kits conversion failed', response.status);
      return NextResponse.json({ error: 'Voice conversion provider rejected the request.' }, { status: response.status >= 500 ? 502 : 400 });
    }
    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Kits voice conversion failed');
    return NextResponse.json({ error: safeClientError(error, 'Voice conversion failed.') }, { status: 400 });
  }
}
