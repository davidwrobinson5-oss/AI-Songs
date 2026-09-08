import { NextRequest, NextResponse } from 'next/server';
import { getPieJob, pieJobAdminClient } from '../../../../jobQueue';
import { resolvePieUserId } from '../../../../usageEntitlements';

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { jobId } = await context.params;
  try {
    const job = await getPieJob(jobId, userId);
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    if (job.status !== 'succeeded') return NextResponse.json({ error: 'Job output is not ready.' }, { status: 409 });

    const bucket = typeof job.output?.bucket === 'string' ? job.output.bucket : '';
    const path = typeof job.output?.path === 'string' ? job.output.path : '';
    const contentType = typeof job.output?.contentType === 'string' ? job.output.contentType : 'audio/mpeg';
    if (bucket !== 'pie-job-output' || !path || !path.startsWith(`${userId}/`)) {
      return NextResponse.json({ error: 'Job output is unavailable.' }, { status: 404 });
    }

    const supabase = pieJobAdminClient();
    const download = await supabase.storage.from(bucket).download(path);
    if (download.error || !download.data) {
      console.error('download pie job output', download.error);
      return NextResponse.json({ error: 'Could not load generated music.' }, { status: 503 });
    }

    const bytes = await download.data.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('serve pie job output', error);
    return NextResponse.json({ error: 'Could not load generated music.' }, { status: 503 });
  }
}
