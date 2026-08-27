import { NextResponse } from 'next/server';

const BASE = 'https://apiv2.soundverse.ai';

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
    const { lyrics, analysis, requestId } = await req.json();
    const notes: MelodyNote[] = Array.isArray(analysis?.notes)
      ? analysis.notes.filter((note: MelodyNote) => Number.isFinite(note?.midi) && Number.isFinite(note?.start) && Number.isFinite(note?.duration))
      : [];

    if (!lyrics?.trim() || !notes.length) {
      return NextResponse.json({ error: 'Fitted lyrics and analyzed melody notes are required.' }, { status: 400 });
    }

    const compactNotes = notes.map((note) => [
      Math.round(Number(note.midi)),
      Math.round(Number(note.start) * 1000) / 1000,
      Math.round(Number(note.duration) * 1000) / 1000,
    ]);
    const encoded = Buffer.from(JSON.stringify(compactNotes), 'utf8').toString('base64url');
    const origin = new URL(req.url).origin;
    const melodyUrl = `${origin}/api/soundverse/melody-file/ai-songs-melody.wav?notes=${encodeURIComponent(encoded)}`;
    const toolId = await getToolId(apiKey, 'melody_to_song', 'v7');

    const response = await fetch(`${BASE}/v1/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': `ai-songs-melody-${safeRequestId(requestId)}`,
      },
      body: JSON.stringify({
        tool_id: toolId,
        license: 1,
        payload_json: JSON.stringify({
          melody: { url: melodyUrl },
          lyrics: String(lyrics).slice(0, 3000),
          versions: 1,
        }),
      }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.message || data?.error || 'Soundverse Melody-to-Song could not start.', detail: data },
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
