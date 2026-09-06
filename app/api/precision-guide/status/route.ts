import { NextResponse } from 'next/server';
import { rateLimit, safeId } from '../../../security';
import { verifyTaskToken } from '../../../taskAuthorization';
import { resolvePieUserId } from '../../../usageEntitlements';

const BASE = 'https://api.mureka.ai';

function messageFrom(data: any, fallback: string) {
  return data?.error?.message || data?.failed_reason || data?.message || (typeof data?.error === 'string' ? data.error : '') || fallback;
}

export async function GET(req: Request) {
  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Sign in to check this precision guide.' }, { status: 401 });

  const limited = rateLimit(req, `precision-guide-status:${userId}`, 30, 60_000);
  if (limited) return limited;

  const apiKey = process.env.MUREKA_API_KEY?.trim();
  if (!apiKey) return NextResponse.json({ error: 'MUREKA_API_KEY is not configured.' }, { status: 503 });

  try {
    const requestUrl = new URL(req.url);
    const taskId = safeId(requestUrl.searchParams.get('taskId'), 160);
    const taskToken = req.headers.get('x-pie-task-token') || '';
    if (!(await verifyTaskToken(taskToken, userId, taskId, 'precision-guide'))) {
      return NextResponse.json({ error: 'This precision-guide task does not belong to the signed-in account.' }, { status: 403 });
    }

    const response = await fetch(`${BASE}/v1/song/query/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
      cache: 'no-store',
    });
    const task = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: messageFrom(task, `Mureka status check failed (${response.status}).`) }, { status: response.status });
    }

    const status = String(task?.status || 'running').toLowerCase();
    if (['failed', 'timeouted', 'cancelled'].includes(status)) {
      return NextResponse.json({ error: messageFrom(task, `Mureka generation ${status}.`) }, { status: 502 });
    }

    if (status !== 'succeeded') {
      return NextResponse.json({ provider: 'mureka', stage: 'song', taskId, taskToken, status });
    }

    const choices = Array.isArray(task?.choices) ? task.choices : [];
    if (!choices.length) {
      return NextResponse.json({ error: 'Mureka generation succeeded without an audio choice.' }, { status: 502 });
    }

    // Keep the existing MelodyWorkspace handoff shape while the provider is Mureka.
    // The legacy file proxy interprets this value as the Mureka task ID and returns
    // the isolated vocal after Music Engine stem separation.
    return NextResponse.json({
      provider: 'mureka',
      stage: 'complete',
      taskId,
      taskToken,
      status: 'completed',
      vocalFileId: taskId,
      instrumentalFileId: taskId,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not check Mureka precision vocal status.' }, { status: 500 });
  }
}
