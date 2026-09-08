import { NextRequest, NextResponse } from 'next/server';
import { enqueuePieJob, listPieJobs } from '../../jobQueue';
import { resolvePieUserId } from '../../usageEntitlements';

const ALLOWED_TYPES = new Set([
  'song_generation',
  'stem_separation',
  'voice_conversion',
  'sheet_transcription',
  'video_generation',
  'originality_analysis',
  'venue_import',
]);

export async function GET() {
  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    const jobs = await listPieJobs(userId);
    return NextResponse.json({ jobs }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('list pie jobs', error);
    return NextResponse.json({ error: 'Could not load jobs.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const type = String(body?.type || '').trim();
  if (!ALLOWED_TYPES.has(type)) return NextResponse.json({ error: 'Unsupported job type.' }, { status: 400 });

  const idempotencyKey = String(body?.idempotencyKey || '').trim() || undefined;
  const provider = body?.provider ? String(body.provider).slice(0, 80) : null;
  const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};

  try {
    const job = await enqueuePieJob({ userId, type, payload, idempotencyKey, provider });
    return NextResponse.json({ job }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('enqueue pie job', error);
    return NextResponse.json({ error: 'Could not queue this job.' }, { status: 503 });
  }
}
