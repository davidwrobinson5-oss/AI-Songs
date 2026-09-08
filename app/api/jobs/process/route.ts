import { NextRequest, NextResponse } from 'next/server';
import { FREE_LIMITS } from '../../../billingConfig';
import {
  claimPieJob,
  claimPieJobs,
  consumePieJobUsage,
  markPieJobFailed,
  markPieJobSucceeded,
  pieJobAdminClient,
  type PieJob,
  verifyPieWorkerToken,
} from '../../../jobQueue';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const MAX_PROMPT_CHARS = 4100;
const WORKER_ID = 'vercel-song-worker';

type ProviderError = {
  detail?: {
    status?: string;
    message?: string;
    data?: {
      prompt_suggestion?: string;
    };
  };
  error?: string;
  message?: string;
};

function bearerToken(request: NextRequest) {
  const header = request.headers.get('authorization') || '';
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
}

async function parseProviderError(response: Response): Promise<ProviderError> {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw) as ProviderError; }
  catch { return { message: raw.slice(0, 500) }; }
}

async function processSongGeneration(job: PieJob) {
  const input = job.input || {};
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
    await markPieJobFailed(job, 'invalid_prompt', 'The song prompt is missing or too long.', false);
    return;
  }

  const usage = await consumePieJobUsage(
    job.id,
    'elevenlabs_music_generations',
    FREE_LIMITS.musicGenerationsPerMonth,
  );
  if (!usage.allowed) {
    await markPieJobFailed(job, 'PIE_USAGE_LIMIT', 'This account has reached its music generation allowance.', false);
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    await markPieJobFailed(job, 'provider_unavailable', 'Music generation is temporarily unavailable.', true);
    return;
  }

  const providerBody = {
    prompt,
    music_length_ms: Number(input.music_length_ms || 30000),
    force_instrumental: Boolean(input.force_instrumental),
    model_id: 'music_v2',
  };

  let response: Response;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);
    try {
      response = await fetch(`${ELEVENLABS_BASE}/v1/music`, {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify(providerBody),
        cache: 'no-store',
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    await markPieJobFailed(job, timedOut ? 'provider_timeout' : 'provider_network', timedOut ? 'Music provider timed out.' : 'Music provider could not be reached.', true);
    return;
  }

  if (!response.ok) {
    const providerError = await parseProviderError(response);
    const status = providerError.detail?.status || `http_${response.status}`;
    const message = providerError.detail?.message || providerError.message || providerError.error || 'Music provider rejected the request.';
    const retryable = response.status >= 500 || response.status === 408 || response.status === 409 || response.status === 429;
    await markPieJobFailed(job, status, message, retryable);
    return;
  }

  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.byteLength || audio.byteLength > 80 * 1024 * 1024) {
    await markPieJobFailed(job, 'invalid_audio', 'Music generation returned an invalid audio file.', true);
    return;
  }

  const supabase = pieJobAdminClient();
  const objectPath = `${job.user_id}/${job.id}.mp3`;
  const upload = await supabase.storage
    .from('pie-job-output')
    .upload(objectPath, audio, {
      contentType: response.headers.get('content-type') || 'audio/mpeg',
      upsert: true,
      cacheControl: '0',
    });
  if (upload.error) {
    await markPieJobFailed(job, 'output_storage', 'Generated music could not be saved.', true);
    return;
  }

  await markPieJobSucceeded(job.id, {
    bucket: 'pie-job-output',
    path: objectPath,
    contentType: response.headers.get('content-type') || 'audio/mpeg',
    bytes: audio.byteLength,
  });
}

async function runJob(job: PieJob) {
  if (job.type === 'song_generation') return processSongGeneration(job);
  await markPieJobFailed(job, 'unsupported_job', `No worker is configured for ${job.type}.`, false);
}

async function processRequest(request: NextRequest) {
  const token = bearerToken(request);
  if (!await verifyPieWorkerToken(token)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const jobId = request.nextUrl.searchParams.get('jobId') || '';
  const jobs = jobId
    ? [await claimPieJob(jobId, WORKER_ID, 300)].filter(Boolean) as PieJob[]
    : await claimPieJobs(WORKER_ID, ['song_generation'], 2, 300);

  for (const job of jobs) await runJob(job);
  return NextResponse.json({ processed: jobs.length }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  return processRequest(request);
}

export async function POST(request: NextRequest) {
  return processRequest(request);
}
