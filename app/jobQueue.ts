import { createClient } from '@supabase/supabase-js';
import { getVercelOidcToken } from '@vercel/oidc';
import { randomUUID } from 'node:crypto';

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '');
const JOBS_URL = `${SUPABASE_URL}/functions/v1/pie-jobs`;
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');

export type PieJobStatus = 'queued' | 'running' | 'retrying' | 'succeeded' | 'failed' | 'cancelled';

export type PieJob = {
  id: string;
  user_id: string;
  type: string;
  status: PieJobStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  idempotency_key: string;
  provider: string | null;
  provider_job_id: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  usage_key?: string | null;
  usage_consumed_at?: string | null;
  usage_snapshot?: Record<string, unknown> | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

async function jobApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const oidc = await getVercelOidcToken().catch(() => '');
  if (!oidc) throw new Error('Pie job identity is temporarily unavailable.');

  const response = await fetch(JOBS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'X-Pie-Vercel-OIDC': oidc,
    },
    body: JSON.stringify({ action, ...payload }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Pie job service failed.');
  return data as T;
}

export async function enqueuePieJob(input: {
  userId: string;
  type: string;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
  provider?: string | null;
  maxAttempts?: number;
}) {
  const userId = input.userId.trim();
  const type = input.type.trim().slice(0, 80);
  if (!userId || !type) throw new Error('A user and job type are required.');

  const idempotencyKey = (input.idempotencyKey || randomUUID()).trim().slice(0, 180);
  const result = await jobApi<{ job: PieJob }>('enqueue', {
    userId,
    type,
    payload: input.payload || {},
    idempotencyKey,
    provider: input.provider || null,
    maxAttempts: Math.max(1, Math.min(input.maxAttempts ?? 3, 20)),
  });
  return result.job;
}

export async function getPieJob(jobId: string, userId: string) {
  const result = await jobApi<{ job: PieJob | null }>('get', { jobId, userId });
  return result.job;
}

export async function listPieJobs(userId: string, limit = 30) {
  const result = await jobApi<{ jobs: PieJob[] }>('list', { userId, limit: Math.max(1, Math.min(limit, 100)) });
  return result.jobs || [];
}

export async function claimPieJob(jobId: string, workerId: string, leaseSeconds = 300) {
  const result = await jobApi<{ job: PieJob | null }>('claimOne', { jobId, workerId, leaseSeconds });
  return result.job;
}

export async function claimPieJobs(workerId: string, types: string[], limit = 2, leaseSeconds = 300) {
  const result = await jobApi<{ jobs: PieJob[] }>('claimMany', { workerId, types, limit, leaseSeconds });
  return result.jobs || [];
}

export async function consumePieJobUsage(jobId: string, usageKey: string, freeLimit: number, units = 1) {
  const result = await jobApi<{ usage: {
    planId?: string;
    planLevel?: number;
    status?: string;
    allowed?: boolean;
    usageCount?: number;
    usageLimit?: number | null;
  } }>('consumeUsage', { jobId, usageKey, freeLimit, units });
  return result.usage || {};
}

export async function verifyPieWorkerToken(token: string) {
  if (!token) return false;
  const result = await jobApi<{ valid: boolean }>('verifyWorkerToken', { token });
  return result.valid === true;
}

export async function createPieJobUpload(jobId: string) {
  return jobApi<{ path: string; token: string }>('createUpload', { jobId });
}

export async function uploadPieJobAudio(jobId: string, audio: Uint8Array, contentType: string) {
  const upload = await createPieJobUpload(jobId);
  const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const result = await client.storage.from('pie-job-output').uploadToSignedUrl(upload.path, upload.token, audio, {
    contentType,
    cacheControl: '0',
  });
  if (result.error) throw result.error;
  return upload.path;
}

export async function createPieJobDownload(jobId: string, userId: string) {
  return jobApi<{ signedUrl: string; contentType: string }>('createDownload', { jobId, userId });
}

export async function markPieJobSucceeded(jobId: string, output: Record<string, unknown> = {}) {
  const result = await jobApi<{ job: PieJob }>('markSucceeded', { jobId, output });
  return result.job;
}

export async function markPieJobFailed(job: PieJob, errorCode: string, errorMessage: string, retryable = true) {
  const result = await jobApi<{ job: PieJob }>('markFailed', {
    jobId: job.id,
    errorCode: errorCode.slice(0, 100),
    errorMessage: errorMessage.slice(0, 1500),
    retryable,
  });
  return result.job;
}
