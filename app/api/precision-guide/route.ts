import { NextResponse } from 'next/server';

const BASE = 'https://api.mureka.ai';

function messageFrom(data: any, fallback: string) {
  return data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : '') || fallback;
}

export async function POST(req: Request) {
  const apiKey = process.env.MUREKA_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: 'MUREKA_API_KEY is not configured.' }, { status: 503 });
  }

  try {
    const incoming = await req.formData();
    const melody = incoming.get('melody');
    const lyrics = String(incoming.get('lyrics') || '').trim();

    if (!(melody instanceof Blob) || !melody.size || !lyrics) {
      return NextResponse.json({ error: 'Melody audio and fitted lyrics are required.' }, { status: 400 });
    }

    if (melody.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Melody audio must be 10 MB or smaller.' }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.append('purpose', 'melody');
    uploadForm.append('file', melody, 'ai-songs-melody.mp3');

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

    const generationRes = await fetch(`${BASE}/v1/song/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        lyrics: lyrics.slice(0, 5000),
        model: 'auto',
        melody_id: String(melodyId),
        n: 1,
        stream: false,
      }),
      cache: 'no-store',
    });
    const generation = await generationRes.json().catch(() => ({}));
    if (!generationRes.ok) {
      return NextResponse.json({ error: messageFrom(generation, 'Mureka song generation could not start.'), detail: generation }, { status: generationRes.status });
    }

    const taskId = generation?.id || generation?.task_id;
    if (!taskId) return NextResponse.json({ error: 'Mureka did not return a task ID.' }, { status: 502 });

    console.info('Mureka precision task started', {
      taskId: String(taskId),
      model: generation?.model || 'auto',
      traceId: generation?.trace_id || null,
      melodyId: String(melodyId),
    });

    return NextResponse.json({
      provider: 'mureka',
      stage: 'song',
      taskId: String(taskId),
      status: generation?.status || 'preparing',
      melodyId: String(melodyId),
      model: generation?.model || 'auto',
      traceId: generation?.trace_id || null,
    }, { status: 202 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not start Mureka precision vocal generation.' }, { status: 500 });
  }
}
