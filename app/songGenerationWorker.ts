import { FREE_LIMITS } from './billingConfig';
import {
  claimPieJob,
  claimPieJobs,
  consumePieJobUsage,
  markPieJobFailed,
  markPieJobSucceeded,
  uploadPieJobAudio,
  type PieJob,
} from './jobQueue';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const MAX_PROMPT_CHARS = 4100;
const WORKER_ID = 'vercel-song-worker';
const PRIVATE_STUDIO_OWNER_ID = 'pie-primary';

export type SongWorkerResult = { processed: number };

type ProviderError = {
  detail?: {
    status?: string;
    message?: string;
    data?: { prompt_suggestion?: string };
  };
  error?: string;
  message?: string;
};

type MusicV2Chunk = {
  text?: unknown;
  duration_ms?: unknown;
  positive_styles?: unknown;
  negative_styles?: unknown;
  context_adherence?: unknown;
};

type MusicV2Plan = { chunks: MusicV2Chunk[] };

async function parseProviderError(response: Response): Promise<ProviderError> {
  const raw = await response.text();
  if (!raw) return {};
  try { return JSON.parse(raw) as ProviderError; }
  catch { return { message: raw.slice(0, 500) }; }
}

function sanitizeCompositionPlan(value: unknown): MusicV2Plan | null {
  if (!value || typeof value !== 'object') return null;
  const chunks = (value as { chunks?: unknown }).chunks;
  if (!Array.isArray(chunks) || chunks.length < 1 || chunks.length > 30) return null;

  const safeChunks: MusicV2Chunk[] = [];
  let totalDuration = 0;
  for (const raw of chunks) {
    if (!raw || typeof raw !== 'object') return null;
    const chunk = raw as MusicV2Chunk;
    const text = typeof chunk.text === 'string' ? chunk.text.trim().slice(0, 12_000) : '';
    const duration = Math.round(Number(chunk.duration_ms || 0));
    if (!text || !Number.isFinite(duration) || duration < 3000 || duration > 120000) return null;
    totalDuration += duration;
    const positive = Array.isArray(chunk.positive_styles) ? chunk.positive_styles.map(String).map((item) => item.slice(0, 160)).slice(0, 50) : [];
    const negative = Array.isArray(chunk.negative_styles) ? chunk.negative_styles.map(String).map((item) => item.slice(0, 160)).slice(0, 50) : [];
    const adherence = chunk.context_adherence === 'low' || chunk.context_adherence === 'medium' ? chunk.context_adherence : 'high';
    safeChunks.push({ text, duration_ms: duration, positive_styles: positive, negative_styles: negative, context_adherence: adherence });
  }
  if (totalDuration < 3000 || totalDuration > 600000) return null;
  return { chunks: safeChunks };
}

async function processSongGeneration(job: PieJob) {
  const input = job.input || {};
  const prompt = typeof input.prompt === 'string' ? input.prompt : '';
  const compositionPlan = sanitizeCompositionPlan(input.composition_plan);
  if (!compositionPlan && (!prompt || prompt.length > MAX_PROMPT_CHARS)) {
    await markPieJobFailed(job, 'invalid_prompt', 'The song prompt or composition plan is missing or invalid.', false);
    return;
  }

  const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!apiKey) {
    await markPieJobFailed(job, 'provider_not_configured', 'Music generation is not configured. No Pie credits were used.', false);
    return;
  }

  // The private owner gateway is an internal production-testing surface, not a customer plan.
  // It intentionally has no Stripe plan record, so normal customer allowance checks would
  // otherwise reject every owner smoke test with usageLimit=0 before the provider is called.
  if (job.user_id !== PRIVATE_STUDIO_OWNER_ID) {
    const usage = await consumePieJobUsage(
      job.id,
      'elevenlabs_music_generations',
      FREE_LIMITS.musicGenerationsPerMonth,
    );
    if (!usage.allowed) {
      await markPieJobFailed(job, 'PIE_USAGE_LIMIT', 'This account has reached its music generation allowance.', false);
      return;
    }
  }

  const providerBody = compositionPlan
    ? { composition_plan: compositionPlan, model_id: 'music_v2' }
    : {
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

  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  let objectPath = '';
  try {
    objectPath = await uploadPieJobAudio(job.id, audio, contentType);
  } catch (error) {
    console.error('store generated song', error);
    await markPieJobFailed(job, 'output_storage', 'Generated music could not be saved.', true);
    return;
  }

  await markPieJobSucceeded(job.id, {
    bucket: 'pie-job-output',
    path: objectPath,
    contentType,
    bytes: audio.byteLength,
  });
}

async function runJob(job: PieJob) {
  if (job.type === 'song_generation') return processSongGeneration(job);
  await markPieJobFailed(job, 'unsupported_job', `No worker is configured for ${job.type}.`, false);
}

export async function processSpecificSongJob(jobId: string): Promise<SongWorkerResult> {
  const job = await claimPieJob(jobId, WORKER_ID, 300);
  if (!job) return { processed: 0 };
  await runJob(job);
  return { processed: 1 };
}

export async function processQueuedSongJobs(limit = 2): Promise<SongWorkerResult> {
  const jobs = await claimPieJobs(WORKER_ID, ['song_generation'], limit, 300);
  for (const job of jobs) await runJob(job);
  return { processed: jobs.length };
}
