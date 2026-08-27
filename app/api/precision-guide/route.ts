import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';
const PPQ = 480;

type MelodyNote = {
  midi?: number;
  start: number;
  duration: number;
};

type Tool = {
  id?: string;
  operation?: string;
  model?: string;
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
    {
      tick: 0,
      order: 0,
      bytes: [0xff, 0x51, 0x03, (micros >>> 16) & 0xff, (micros >>> 8) & 0xff, micros & 0xff],
    },
  ];

  let lastTick = 0;
  for (const note of notes) {
    if (!Number.isFinite(note.midi) || !Number.isFinite(note.start) || !Number.isFinite(note.duration)) continue;
    const midi = Math.min(127, Math.max(0, Math.round(note.midi as number)));
    const startSeconds = Math.min(59.5, Math.max(0, note.start));
    const endSeconds = Math.min(59.9, Math.max(startSeconds + 0.06, startSeconds + note.duration));
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

  const minimumEndTick = Math.round(5 * ticksPerSecond);
  const endTick = Math.max(lastTick, minimumEndTick);
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

async function getToolId(apiKey: string, operation: string, model: string) {
  const response = await fetch(`${BASE}/v1/tools`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error || 'Could not load Soundverse tools.');
  const tools: Tool[] = Array.isArray(data) ? data : Array.isArray(data?.tools) ? data.tools : [];
  const tool = tools.find((item) => item.operation === operation && item.model === model);
  if (!tool?.id) throw new Error(`Soundverse ${operation} ${model} is not enabled for this account.`);
  return tool.id;
}

function safeRequestId(value: unknown) {
  const clean = String(value || '').replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 120);
  return clean || `${Date.now()}`;
}

export async function POST(req: Request) {
  const apiKey = process.env.SOUNDVERSE_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'SOUNDVERSE_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const { lyrics, analysis, tempo = 120, requestId } = await req.json();
    const notes: MelodyNote[] = Array.isArray(analysis?.notes)
      ? analysis.notes.filter((note: MelodyNote) => Number.isFinite(note?.midi) && Number.isFinite(note?.start) && Number.isFinite(note?.duration))
      : [];

    if (!lyrics?.trim() || !notes.length) {
      return NextResponse.json({ error: 'Fitted lyrics and analyzed melody notes are required.' }, { status: 400 });
    }

    const midi = makeMidi(notes, Number(tempo) || 120);
    const encoded = midi.toString('base64url');
    const origin = new URL(req.url).origin;
    const midiUrl = `${origin}/api/soundverse/midi-file/ai-songs-melody.mid?data=${encodeURIComponent(encoded)}`;
    const toolId = await getToolId(apiKey, 'midi_to_song', 'v7');

    const response = await fetch(`${BASE}/v1/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': `ai-songs-midi-${safeRequestId(requestId)}`,
      },
      body: JSON.stringify({
        tool_id: toolId,
        license: 1,
        payload_json: JSON.stringify({
          midi: { url: midiUrl },
          lyrics: String(lyrics).slice(0, 3000),
          versions: 1,
        }),
      }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || 'Soundverse MIDI-to-Song could not start.', detail: data },
        { status: response.status },
      );
    }

    const taskId = data?.task_id || data?.job_id || data?.id;
    if (!taskId) return NextResponse.json({ error: 'Soundverse did not return a task ID.' }, { status: 502 });

    return NextResponse.json(
      { provider: 'soundverse', stage: 'song', taskId: String(taskId), status: data?.status || 'queued' },
      { status: 202 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start Soundverse precision vocal generation.' }, { status: 500 });
  }
}
