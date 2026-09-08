const encoder = new TextEncoder();

export const SESSION_COOKIE = 'ai_songs_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;

type SessionPayload = {
  v: 1;
  exp: number;
};

function base64UrlEncode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createSessionToken(secret: string) {
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${body}.${base64UrlEncode(signature)}`;
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined) {
  if (!token || !secret || secret.length < 32) return false;
  const [body, signaturePart, extra] = token.split('.');
  if (!body || !signaturePart || extra) return false;

  try {
    const key = await hmacKey(secret);
    const signature = base64UrlDecode(signaturePart);
    const validSignature = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(body));
    if (!validSignature) return false;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as SessionPayload;
    return payload.v === 1 && Number.isFinite(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export async function securePasswordMatches(input: string, expected: string) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function authConfigured() {
  const password = process.env.AI_SONGS_PASSWORD || '';
  const secret = process.env.AI_SONGS_SESSION_SECRET || '';
  return password.length >= 12 && secret.length >= 32;
}
