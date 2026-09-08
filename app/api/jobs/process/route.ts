import { NextRequest, NextResponse } from 'next/server';
import { verifyPieWorkerToken } from '../../../jobQueue';
import { processQueuedSongJobs, processSpecificSongJob } from '../../../songGenerationWorker';

function bearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

async function processRequest(request: NextRequest) {
  const token = bearerToken(request);
  if (!await verifyPieWorkerToken(token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const jobId = request.nextUrl.searchParams.get('jobId') || '';
  const result = jobId
    ? await processSpecificSongJob(jobId)
    : await processQueuedSongJobs(2);

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  return processRequest(request);
}

export async function POST(request: NextRequest) {
  return processRequest(request);
}
