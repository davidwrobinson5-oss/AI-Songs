import { NextRequest, NextResponse } from 'next/server';
import { getPieJob } from '../../../jobQueue';
import { resolvePieUserId } from '../../../usageEntitlements';

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { jobId } = await context.params;
  try {
    const job = await getPieJob(jobId, userId);
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });

    return NextResponse.json({
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
        provider: job.provider,
        lastErrorCode: job.last_error_code,
        lastErrorMessage: job.last_error_message,
        createdAt: job.created_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      },
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('load pie job', error);
    return NextResponse.json({ error: 'Could not load this job.' }, { status: 503 });
  }
}
