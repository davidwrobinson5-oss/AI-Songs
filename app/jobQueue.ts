import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

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
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error('Pie job storage is not configured.');
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
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
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? 3, 20));
  const supabase = adminClient();

  const { data, error } = await supabase
    .from('pie_jobs')
    .upsert(
      {
        user_id: userId,
        type,
        input: input.payload || {},
        idempotency_key: idempotencyKey,
        provider: input.provider || null,
        max_attempts: maxAttempts,
      },
      { onConflict: 'user_id,type,idempotency_key', ignoreDuplicates: true },
    )
    .select('*')
    .maybeSingle();

  if (error) throw error;
  if (data) return data as PieJob;

  const existing = await supabase
    .from('pie_jobs')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .eq('idempotency_key', idempotencyKey)
    .single();
  if (existing.error) throw existing.error;
  return existing.data as PieJob;
}

export async function listPieJobs(userId: string, limit = 30) {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('pie_jobs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 100)));
  if (error) throw error;
  return (data || []) as PieJob[];
}

export async function markPieJobSucceeded(jobId: string, output: Record<string, unknown> = {}) {
  const supabase = adminClient();
  const { data, error } = await supabase
    .from('pie_jobs')
    .update({
      status: 'succeeded',
      output,
      completed_at: new Date().toISOString(),
      lease_expires_at: null,
      locked_by: null,
      locked_at: null,
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', jobId)
    .select('*')
    .single();
  if (error) throw error;
  return data as PieJob;
}

export async function markPieJobFailed(job: PieJob, errorCode: string, errorMessage: string, retryable = true) {
  const supabase = adminClient();
  const exhausted = job.attempt_count >= job.max_attempts;
  const shouldRetry = retryable && !exhausted;
  const delaySeconds = Math.min(900, Math.max(10, 15 * 2 ** Math.max(0, job.attempt_count - 1)));
  const nextAttempt = new Date(Date.now() + delaySeconds * 1000).toISOString();

  const { data, error } = await supabase
    .from('pie_jobs')
    .update({
      status: shouldRetry ? 'retrying' : 'failed',
      next_attempt_at: shouldRetry ? nextAttempt : job.next_attempt_at,
      completed_at: shouldRetry ? null : new Date().toISOString(),
      lease_expires_at: null,
      locked_by: null,
      locked_at: null,
      last_error_code: errorCode.slice(0, 100),
      last_error_message: errorMessage.slice(0, 1500),
      updated_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as PieJob;
}
