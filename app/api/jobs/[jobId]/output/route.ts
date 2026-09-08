import { NextRequest, NextResponse } from 'next/server';
import { createPieJobDownload, getPieJob } from '../../../../jobQueue';
import { resolvePieUserId } from '../../../../usageEntitlements';

export async function GET(_request: NextRequest, context: { params: Promise<{ jobId: string }> }) {
  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { jobId } = await context.params;
  try {
    const job = await getPieJob(jobId, userId);
    if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    if (job.status !== 'succeeded') return NextResponse.json({ error: 'Job output is not ready.' }, { status: 409 });

    const download = await createPieJobDownload(jobId, userId);
    const response = await fetch(download.signedUrl, { cache: 'no-store' });
    if (!response.ok) return NextResponse.json({ error: 'Could not load generated music.' }, { status: 503 });

    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      headers: {
        'Content-Type': download.contentType || response.headers.get('content-type') || 'audio/mpeg',
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
