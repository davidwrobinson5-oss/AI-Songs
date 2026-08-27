import { NextResponse } from 'next/server';
import * as lamejs from '@breezystack/lamejs';

type CompactNote = [number, number, number];

function synthesize(notes: CompactNote[]) {
  const sampleRate = 44100;
  const duration = Math.min(60, Math.max(5, ...notes.map(([, start, duration]) => start + duration + 0.25)));
  const pcm = new Int16Array(Math.ceil(duration * sampleRate));

  for (const [midiRaw, startRaw, durationRaw] of notes) {
    const midi = Math.min(127, Math.max(0, Math.round(midiRaw)));
    const start = Math.max(0, startRaw);
    const noteDuration = Math.max(0.06, durationRaw);
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.min(pcm.length, Math.floor((start + noteDuration) * sampleRate));
    const attack = Math.max(1, Math.floor(sampleRate * 0.015));
    const release = Math.max(1, Math.floor(sampleRate * 0.035));

    for (let i = startSample; i < endSample; i++) {
      const local = i - startSample;
      const remaining = endSample - i;
      const envelope = Math.min(1, local / attack, remaining / release);
      const t = i / sampleRate;
      const fundamental = Math.sin(2 * Math.PI * frequency * t);
      const overtone = 0.2 * Math.sin(2 * Math.PI * frequency * 2 * t);
      const value = (fundamental + overtone) * 0.3 * envelope;
      const mixed = pcm[i] + Math.round(value * 32767);
      pcm[i] = Math.max(-32768, Math.min(32767, mixed));
    }
  }

  const encoder = new lamejs.Mp3Encoder(1, sampleRate, 96);
  const chunks: Uint8Array[] = [];
  const blockSize = 1152;
  for (let i = 0; i < pcm.length; i += blockSize) {
    const encoded = encoder.encodeBuffer(pcm.subarray(i, i + blockSize));
    if (encoded.length) chunks.push(Uint8Array.from(encoded));
  }
  const flushed = encoder.flush();
  if (flushed.length) chunks.push(Uint8Array.from(flushed));
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

export async function GET(req: Request) {
  try {
    const encoded = new URL(req.url).searchParams.get('notes');
    if (!encoded || encoded.length > 40_000) return NextResponse.json({ error: 'Invalid melody payload.' }, { status: 400 });
    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const raw = JSON.parse(decoded);
    if (!Array.isArray(raw) || !raw.length || raw.length > 500) return NextResponse.json({ error: 'Invalid melody notes.' }, { status: 400 });

    const notes: CompactNote[] = raw
      .filter((n: unknown) => Array.isArray(n) && n.length === 3 && n.every((v) => Number.isFinite(Number(v))))
      .map((n: number[]) => [Number(n[0]), Number(n[1]), Number(n[2])]);
    if (!notes.length) return NextResponse.json({ error: 'No valid melody notes.' }, { status: 400 });

    const mp3 = synthesize(notes);
    return new NextResponse(mp3, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Disposition': 'attachment; filename="ai-songs-melody.mp3"',
        'Cache-Control': 'public, max-age=600',
        'Content-Length': String(mp3.length),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not synthesize melody guide.' }, { status: 400 });
  }
}
