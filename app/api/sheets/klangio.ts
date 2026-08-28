import { readResponseBytesLimited } from '../../security';

const BASE_URL = 'https://api.klang.io';
const OUTPUTS = ['pdf', 'mxml', 'midi_quant'] as const;
const TRANSCRIPTION_MODELS = new Set(['universal', 'detect', 'piano', 'guitar', 'bass', 'vocal', 'lead', 'drums', 'wind', 'string', 'piano_arrangement']);
const STEMS = new Set(['vocals', 'bass', 'drums', 'piano', 'guitar', 'other']);
const RESULT_FORMATS = new Set(['pdf', 'xml', 'midi', 'midi_quant', 'gp5', 'json']);

export type KlangioStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'COMPLETED';

function apiKey() {
  const value = process.env.KLANGIO_API_KEY?.trim();
  if (!value) throw new Error('KLANGIO_NOT_CONFIGURED');
  return value;
}

async function request(path: string, init: RequestInit = {}, timeoutMs = 45_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${BASE_URL}${path}`, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'kl-api-key': apiKey(),
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function jsonOrThrow(response: Response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Klangio request failed', response.status, data);
    throw new Error('KLANGIO_REQUEST_FAILED');
  }
  return data as Record<string, unknown>;
}

export async function createTranscription(file: Blob, model: string, title: string) {
  if (!TRANSCRIPTION_MODELS.has(model)) throw new Error('INVALID_KLANGIO_MODEL');
  const url = new URL(`${BASE_URL}/transcription`);
  url.searchParams.set('model', model);
  if (title) url.searchParams.set('title', title.slice(0, 120));

  const form = new FormData();
  for (const output of OUTPUTS) form.append('outputs', output);
  form.append('file', file, 'song-audio');

  const response = await request(url.pathname + url.search, { method: 'POST', body: form }, 60_000);
  const data = await jsonOrThrow(response);
  const jobId = String(data.job_id || '');
  if (!jobId) throw new Error('KLANGIO_INVALID_RESPONSE');
  return jobId;
}

export async function createChordRecognition(file: Blob) {
  const url = new URL(`${BASE_URL}/chord-recognition`);
  url.searchParams.set('vocabulary', 'full');
  const form = new FormData();
  form.append('file', file, 'song-audio');
  const response = await request(url.pathname + url.search, { method: 'POST', body: form }, 60_000);
  const data = await jsonOrThrow(response);
  const jobId = String(data.job_id || '');
  if (!jobId) throw new Error('KLANGIO_INVALID_RESPONSE');
  return jobId;
}

export async function createSourceSeparation(file: Blob) {
  const url = new URL(`${BASE_URL}/source-separation`);
  url.searchParams.set('model', 'six-stems');
  url.searchParams.set('output', 'wav');
  const form = new FormData();
  form.append('file', file, 'song-audio');
  const response = await request(url.pathname + url.search, { method: 'POST', body: form }, 60_000);
  const data = await jsonOrThrow(response);
  const jobId = String(data.job_id || '');
  if (!jobId) throw new Error('KLANGIO_INVALID_RESPONSE');
  return jobId;
}

export async function getJobStatus(jobId: string): Promise<KlangioStatus> {
  const response = await request(`/job/${encodeURIComponent(jobId)}/status`, {}, 20_000);
  const data = await jsonOrThrow(response);
  const status = String(data.status || '') as KlangioStatus;
  if (!['IN_QUEUE', 'IN_PROGRESS', 'FAILED', 'COMPLETED'].includes(status)) return 'IN_PROGRESS';
  return status;
}

export async function getChordResult(jobId: string) {
  const response = await request(`/job/${encodeURIComponent(jobId)}/json`, {}, 20_000);
  if (!response.ok) throw new Error('KLANGIO_REQUEST_FAILED');
  const value = await response.json();
  if (!Array.isArray(value)) return [] as Array<[number, number, string]>;
  return value
    .filter((row): row is [number, number, string] => Array.isArray(row) && row.length === 3 && Number.isFinite(Number(row[0])) && Number.isFinite(Number(row[1])) && typeof row[2] === 'string')
    .map((row) => [Number(row[0]), Number(row[1]), row[2]] as [number, number, string]);
}

export async function getStem(jobId: string, stem: string) {
  if (!STEMS.has(stem)) throw new Error('INVALID_STEM');
  const response = await request(`/job/${encodeURIComponent(jobId)}/audio?stem_type=${encodeURIComponent(stem)}`, {}, 60_000);
  if (!response.ok) throw new Error('KLANGIO_REQUEST_FAILED');
  const bytes = await readResponseBytesLimited(response, 60 * 1024 * 1024);
  return new Blob([bytes], { type: response.headers.get('content-type') || 'audio/wav' });
}

export async function getResult(jobId: string, format: string) {
  if (!RESULT_FORMATS.has(format)) throw new Error('INVALID_RESULT_FORMAT');
  const response = await request(`/job/${encodeURIComponent(jobId)}/${encodeURIComponent(format)}`, {}, 45_000);
  if (!response.ok) throw new Error('KLANGIO_REQUEST_FAILED');
  const bytes = await readResponseBytesLimited(response, 40 * 1024 * 1024);
  return {
    bytes,
    contentType: response.headers.get('content-type') || 'application/octet-stream',
  };
}
