import { NextResponse } from 'next/server';

const BASE = 'https://api.mureka.ai';

function messageFrom(data: any, fallback: string) {
  return data?.error?.message || data?.failed_reason || data?.message || (typeof data?.error === 'string' ? data.error : '') || fallback;
}

export async function GET(req: Request) {
  const apiKey = process.env.MUREKA_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MUREKA_API_KEY is not configured.' }, { status: 503 });

  try {
    const taskId = new URL(req.url).searchParams.get('taskId');
    if (!taskId) return NextResponse.json({ error: 'taskId is required.' }, { status: 400 });

    const response = await fetch(`${BASE}/v1/song/query/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const task = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: messageFrom(task, `Mureka status check failed (${response.status}).`), detail: task }, { status: response.status });
    }

    const status = String(task?.status || 'running').toLowerCase();
    if (['failed', 'timeouted', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: messageFrom(task, `Mureka generation ${status}.`), detail: task }, { status: 502 });
    }

    if (status !== 'succeeded') {
      return NextResponse.json({ provider: 'mureka', stage: 'song', taskId, status });
    }

    const choices = Array.isArray(task?.choices) ? task.choices : [];
    if (!choices.length) {
      return NextResponse.json({ error: 'Mureka generation succeeded without an audio choice.', detail: task }, { status: 502 });
    }

    return NextResponse.json({ provider: 'mureka', stage: 'complete', taskId, status: 'completed' });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check Mureka precision vocal status.' }, { status: 500 });
  }
}
