import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, safeId } from '../../../security';
import { getChordResult, getJobStatus } from '../klangio';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'sheets-status', 60, 60_000);
  if (limited) return limited;

  try {
    const body = await req.json() as { jobs?: Record<string, unknown> };
    const jobs = body.jobs || {};
    const entries = Object.entries(jobs).slice(0, 12);
    const statuses: Record<string, string> = {};

    await Promise.all(entries.map(async ([key, rawId]) => {
      const jobId = safeId(rawId, 180);
      statuses[key] = await getJobStatus(jobId);
    }));

    console.info('Sheet job statuses', JSON.stringify(statuses));

    let chords: Array<[number, number, string]> | undefined;
    if (typeof jobs.chords === 'string' && statuses.chords === 'COMPLETED') {
      chords = await getChordResult(safeId(jobs.chords, 180));
    }

    return NextResponse.json({ statuses, chords }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Sheet status request failed', error);
    return NextResponse.json(
      { error: safeClientError(error, 'Could not check sheet-music transcription status.') },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
