import { NextResponse } from 'next/server';

const BASE = 'https://api.mureka.ai';
const PPQ = 480;

type MelodyNote = {
  midi?: number;
  start: number;
  duration: number;
};

function vlq(value: number) {
  let v = Math.max(0, Math.floor(value));
  const bytes = [v & 0x7f];
  while ((v >>= 7) > 0) bytes.unshift((v & 0x7f) | 0x80);
  return bytes;
}

function u32(value: number) {
  return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function makeMidi(notes: MelodyNote[], tempo: number) {
  const bpm = Math.min(240, Math.max(40, Math.round(tempo || 120)));
  const ticksPerSecond = (PPQ * bpm) / 60;
  const micros = Math.round(60_000_000 / bpm);
  const events: Array<{ tick: number; order: number; bytes: number[] }> = [
    { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (micros >>> 16) & 0xff, (micros >>> 8) & 0xff, micros & 0xff] },
  ];

  let lastTick = 0;
  for (const note of notes) {
    if (!Number.isFinite(note.midi) || !Number.isFinite(note.start) || !Number.isFinite(note.duration)) continue;
    const midi = Math.min(127, Math.max(0, Math.round(Number(note.midi))));
    const startSeconds = Math.min(59.5, Math.max(0, Number(note.start)));
    const endSeconds = Math.min(59.9, Math.max(startSeconds + 0.06, startSeconds + Number(note.duration)));
    const startTick = Math.round(startSeconds * ticksPerSecond);
    const endTick = Math.max(startTick + 1, Math.round(endSeconds * ticksPerSecond));
    events.push({ tick: startTick, order: 2, bytes: [0x90, midi, 92] });
    events.push({ tick: endTick, order: 1, bytes: [0x80, midi, 0] });
    lastTick = Math.max(lastTick, endTick);
  }

  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const track: number[] = [];
  let previousTick = 0;
  for (const event of events) {
    track.push(...vlq(event.tick - previousTick), ...event.bytes);
    previousTick = event.tick;
  }

  const endTick = Math.max(lastTick, Math.round(5 * ticksPerSecond));
  track.push(...vlq(endTick - previousTick), 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64,
    0x00, 0x00, 0x00, 0x06,
    0x00, 0x00,
    0x00, 0x01,
    (PPQ >>> 8) & 0xff, PPQ & 0xff,
  ];
  const chunk = [0x4d, 0x54, 0x72, 0x6b, ...u32(track.length), ...track];
  return Buffer.from([...header, ...chunk]);
}

function messageFrom(data: any, fallback: string) {
  return data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '') || fallback;
}

export async function POST(req: Request) {
  const apiKey = process.env.MUREKA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'MUREKA_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const { lyrics, analysis, tempo = 120 } = await req.json();
    const notes: MelodyNote[] = Array.isArray(analysis?.notes)
      ? analysis.notes.filter((note: MelodyNote) => Number.isFinite(note?.midi) && Number.isFinite(note?.start) && Number.isFinite(note?.duration))
      : [];

    if (!String(lyrics || '').trim() || !notes.length) {
      return NextResponse.json({ error: 'Fitted lyrics and analyzed melody notes are required.' }, { status: 400 });
    }

    const midi = makeMidi(notes, Number(tempo) || 120);
    const uploadForm = new FormData();
    uploadForm.append('purpose', 'melody');
    uploadForm.append('file', new Blob([midi], { type: 'audio/midi' }), 'ai-songs-melody.mid');

    const uploadRes = await fetch(`${BASE}/v1/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      body: uploadForm,
      cache: 'no-store',
    });
    const upload = await uploadRes.json().catch(() => ({}));
    if (!uploadRes.ok) {
      return NextResponse.json({ error: messageFrom(upload, 'Mureka melody upload failed.'), detail: upload }, { status: uploadRes.status });
    }

    const melodyId = upload?.id || upload?.file_id;
    if (!melodyId) return NextResponse.json({ error: 'Mureka did not return a melody file ID.' }, { status: 502 });

    // Mureka documents melody_id as a standalone control. Do not combine it
    // with gender/prompt/reference/vocal controls. Drob supplies the final voice.
    const payload = {
      lyrics: String(lyrics).slice(0, 5000),
      model: 'mureka-9.5',
      melody_id: String(melodyId),
      n: 1,
      stream: false,
    };

    const generationRes = await fetch(`${BASE}/v1/song/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });
    const generation = await generationRes.json().catch(() => ({}));
    if (!generationRes.ok) {
      return NextResponse.json({ error: messageFrom(generation, 'Mureka song generation could not start.'), detail: generation }, { status: generationRes.status });
    }

    const taskId = generation?.id || generation?.task_id;
    if (!taskId) return NextResponse.json({ error: 'Mureka did not return a task ID.' }, { status: 502 });

    return NextResponse.json({
      provider: 'mureka',
      stage: 'song',
      taskId: String(taskId),
      status: generation?.status || 'preparing',
      melodyId: String(melodyId),
      model: generation?.model || 'mureka-9.5',
      traceId: generation?.trace_id || null,
    }, { status: 202 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start Mureka precision vocal generation.' }, { status: 500 });
  }
}
