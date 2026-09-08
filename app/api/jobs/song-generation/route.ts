import { NextRequest, NextResponse } from 'next/server';
import { enqueuePieJob } from '../../../jobQueue';
import { rateLimit, readJsonObject, safeClientError } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';

const MAX_PROMPT_CHARS = 4100;
const ALLOWED_LENGTHS = new Set([30000, 60000, 120000, 180000, 210000]);

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, 'song-generation-queue', 6, 60_000);
  if (limited) return limited;

  try {
    const userId = await resolvePieUserId();
    if (!userId) return NextResponse.json({ error: 'Sign in to generate music.' }, { status: 401 });

    const body = await readJsonObject(request, 64_000);
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    const musicLengthMs = Number(body.music_length_ms || 30000);
    const forceInstrumental = Boolean(body.force_instrumental);
    const idempotencyKey = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim().slice(0, 180) : '';

    if (!prompt) return NextResponse.json({ error: 'Describe the music you want Pie to create.' }, { status: 400 });
    if (prompt.length > MAX_PROMPT_CHARS) {
      return NextResponse.json({
        error: `The song description and attached lyrics are too long for Music Generator (${prompt.length.toLocaleString()} characters). The maximum is ${MAX_PROMPT_CHARS.toLocaleString()}.`,
        detail: { status: 'prompt_too_long' },
      }, { status: 400 });
    }
    if (!ALLOWED_LENGTHS.has(musicLengthMs)) {
      return NextResponse.json({ error: 'Choose a supported song duration.' }, { status: 400 });
    }

    const job = await enqueuePieJob({
      userId,
      type: 'song_generation',
      provider: 'elevenlabs',
      idempotencyKey: idempotencyKey || undefined,
      maxAttempts: 3,
      payload: {
        prompt,
        music_length_ms: musicLengthMs,
        force_instrumental: forceInstrumental,
      },
    });

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
        createdAt: job.created_at,
      },
    }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('queue song generation', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not queue music generation.') }, { status: 503 });
  }
}
