import { NextResponse } from 'next/server';

const AUDIO_TYPES = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/mp4',
  'audio/m4a',
  'audio/aac',
  'audio/ogg',
  'audio/webm',
  'application/octet-stream',
]);

type RateRecord = { count: number; resetAt: number };
const globalStore = globalThis as typeof globalThis & { __aiSongsRateLimit?: Map<string, RateRecord> };
const rateStore = globalStore.__aiSongsRateLimit || new Map<string, RateRecord>();
globalStore.__aiSongsRateLimit = rateStore;

function clientIp(req: Request) {
  return (
    req.headers.get('x-vercel-forwarded-for') ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export function rateLimit(req: Request, bucket: string, limit: number, windowMs = 60_000) {
  const now = Date.now();
  const key = `${bucket}:${clientIp(req)}`;
  const current = rateStore.get(key);
  if (!current || current.resetAt <= now) {
    rateStore.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  if (current.count >= limit) {
    const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' } },
    );
  }
  current.count += 1;
  return null;
}

export async function readJsonObject(req: Request, maxBytes = 128_000) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  const text = await req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('REQUEST_TOO_LARGE');
  const value = JSON.parse(text || '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('INVALID_JSON_OBJECT');
  return value as Record<string, unknown>;
}

export function textField(value: unknown, maxLength: number, fallback = '') {
  if (value == null) return fallback;
  const text = String(value).trim();
  if (text.length > maxLength) throw new Error('TEXT_TOO_LONG');
  return text;
}

export function safeId(value: unknown, maxLength = 160) {
  const text = textField(value, maxLength);
  if (!text || !/^[A-Za-z0-9._:-]+$/.test(text)) throw new Error('INVALID_ID');
  return text;
}

export function boundedNumber(value: unknown, min: number, max: number, fallback?: number) {
  if (value == null || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error('INVALID_NUMBER');
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) throw new Error('INVALID_NUMBER');
  return number;
}

export function booleanField(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

export function validateAudioFile(file: Blob, maxBytes: number) {
  if (file.size <= 0 || file.size > maxBytes) throw new Error('INVALID_AUDIO_SIZE');
  const type = (file.type || 'application/octet-stream').toLowerCase().split(';')[0];
  if (!AUDIO_TYPES.has(type)) throw new Error('INVALID_AUDIO_TYPE');
}

export function safeClientError(error: unknown, fallback = 'Request could not be completed.') {
  if (!(error instanceof Error)) return fallback;
  if (error.message === 'REQUEST_TOO_LARGE' || error.message === 'TEXT_TOO_LONG' || error.message === 'INVALID_AUDIO_SIZE') {
    return 'The request is larger than allowed.';
  }
  if (error.message === 'INVALID_AUDIO_TYPE') return 'Unsupported audio file type.';
  if (error.message === 'INVALID_ID' || error.message === 'INVALID_NUMBER' || error.message === 'INVALID_JSON_OBJECT') {
    return 'Invalid request data.';
  }
  return fallback;
}

export async function readResponseBytesLimited(response: Response, maxBytes: number) {
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > maxBytes) throw new Error('UPSTREAM_FILE_TOO_LARGE');
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error('UPSTREAM_FILE_TOO_LARGE');
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
