import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, safeId } from '../../../../../security';
import { getStem, getJobStatus } from '../../../klangio';

export const runtime = 'nodejs';
export const maxDuration = 60;

const STEMS = new Set(['vocals','drums','bass','guitar','piano','other']);

export async function GET(req: Request, context: { params: Promise<{ jobId: string; stem: string }> }) {
  const limited = rateLimit(req, 'sheets-stem-download', 24, 60_000);
  if (limited) return limited;

  try {
    const { jobId: rawJobId, stem: rawStem } = await context.params;
    const jobId = safeId(rawJobId, 180);
    const stem = String(rawStem || '').toLowerCase();
    if (!STEMS.has(stem)) return NextResponse.json({ error: 'Unknown stem.' }, { status: 400 });
    const status = await getJobStatus(jobId);
    if (status !== 'COMPLETED') return NextResponse.json({ error: 'Stem separation is not finished yet.', status }, { status: 409 });
    const blob = await getStem(jobId, stem);
    const bytes = await blob.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': blob.type || 'audio/wav',
        'Content-Length': String(bytes.byteLength),
        'Content-Disposition': `inline; filename="${stem}.wav"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Stem download failed', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not load that stem.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
