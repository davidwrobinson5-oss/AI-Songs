import { NextResponse } from 'next/server';

type CompactNote = [number, number, number];

function synthesizeWav(notes: CompactNote[]) {
  const sampleRate = 22050;
  const duration = Math.min(59, Math.max(5, ...notes.map(([, start, noteDuration]) => start + noteDuration + 0.25)));
  const samples = new Int16Array(Math.ceil(duration * sampleRate));

  for (const [midiRaw, startRaw, durationRaw] of notes) {
    const midi = Math.min(127, Math.max(0, Math.round(midiRaw)));
    const start = Math.max(0, startRaw);
    const noteDuration = Math.max(0.06, durationRaw);
    const frequency = 440 * Math.pow(2, (midi - 69) / 12);
    const startSample = Math.floor(start * sampleRate);
    const endSample = Math.min(samples.length, Math.floor((start + noteDuration) * sampleRate));
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
      const mixed = samples[i] + Math.round(value * 32767);
      samples[i] = Math.max(-32768, Math.min(32767, mixed));
    }
  }

  const pcmBuffer = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    pcmBuffer.writeInt16LE(samples[i], i * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]);
}

export async function GET(req: Request) {
  try {
    const encoded = new URL(req.url).searchParams.get('notes');
    if (!encoded || encoded.length > 40_000) {
      return NextResponse.json({ error: 'Invalid melody payload.' }, { status: 400 });
    }

    const decoded = Buffer.from(encoded, 'base64url').toString('utf8');
    const raw = JSON.parse(decoded);
    if (!Array.isArray(raw) || !raw.length || raw.length > 500) {
      return NextResponse.json({ error: 'Invalid melody notes.' }, { status: 400 });
    }

    const notes: CompactNote[] = raw
      .filter((n: unknown) => Array.isArray(n) && n.length === 3 && n.every((v) => Number.isFinite(Number(v))))
      .map((n: number[]) => [Number(n[0]), Number(n[1]), Number(n[2])]);

    if (!notes.length) {
      return NextResponse.json({ error: 'No valid melody notes.' }, { status: 400 });
    }

    const wav = synthesizeWav(notes);
    return new NextResponse(wav, {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Content-Disposition': 'inline; filename="ai-songs-melody.wav"',
        'Cache-Control': 'public, max-age=600',
        'Content-Length': String(wav.length),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not synthesize melody guide.' },
      { status: 400 },
    );
  }
}
