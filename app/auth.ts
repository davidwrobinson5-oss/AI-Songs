const encoder = new TextEncoder();

export const SESSION_COOKIE = 'ai_songs_session';
export const SESSION_SECONDS = 60 * 60 * 24 * 7;
export const OWNER_GATEWAY_COOKIE = 'pie_owner_gateway';
export const OWNER_GATEWAY_SECONDS = 60 * 60 * 24 * 30;

// Only the SHA-256 digest is stored in source. The actual owner gateway key is never committed.
const OWNER_GATEWAY_KEY_SHA256 = '5f6cf63bfef0eeda338e8b242bcc998bde7894d6313e01718d6526e9d8227e0d';

type SessionPayload = {
  v: 1;
  exp: number;
};

type OwnerGatewayPayload = {
  v: 1;
  kind: 'owner-gateway';
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

function hexToBytes(value: string) {
  if (!/^[0-9a-f]{64}$/i.test(value)) return new Uint8Array();
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function constantTimeBytesEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
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

async function signBody(body: string, secret: string) {
  const key = await hmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `${body}.${base64UrlEncode(signature)}`;
}

async function verifySignedBody(token: string | undefined, secret: string | undefined) {
  if (!token || !secret || secret.length < 32) return null;
  const [body, signaturePart, extra] = token.split('.');
  if (!body || !signaturePart || extra) return null;

  try {
    const key = await hmacKey(secret);
    const signature = base64UrlDecode(signaturePart);
    const validSignature = await crypto.subtle.verify('HMAC', key, signature, encoder.encode(body));
    if (!validSignature) return null;
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(body))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function createSessionToken(secret: string) {
  const payload: SessionPayload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return signBody(body, secret);
}

export async function verifySessionToken(token: string | undefined, secret: string | undefined) {
  const payload = await verifySignedBody(token, secret);
  if (!payload) return false;
  return payload.v === 1 && Number.isFinite(payload.exp) && Number(payload.exp) > Math.floor(Date.now() / 1000);
}

export async function createOwnerGatewayToken(secret: string) {
  const payload: OwnerGatewayPayload = {
    v: 1,
    kind: 'owner-gateway',
    exp: Math.floor(Date.now() / 1000) + OWNER_GATEWAY_SECONDS,
  };
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  return signBody(body, secret);
}

export async function verifyOwnerGatewayToken(token: string | undefined, secret: string | undefined) {
  const payload = await verifySignedBody(token, secret);
  if (!payload) return false;
  return payload.v === 1 && payload.kind === 'owner-gateway' && Number.isFinite(payload.exp) && Number(payload.exp) > Math.floor(Date.now() / 1000);
}

export async function ownerGatewayKeyMatches(input: string) {
  if (!input || input.length < 32 || input.length > 128) return false;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(input)));
  return constantTimeBytesEqual(digest, hexToBytes(OWNER_GATEWAY_KEY_SHA256));
}

export async function securePasswordMatches(input: string, expected: string) {
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(input)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  return constantTimeBytesEqual(new Uint8Array(a), new Uint8Array(b));
}

export function authConfigured() {
  const password = process.env.AI_SONGS_PASSWORD || '';
  const secret = process.env.AI_SONGS_SESSION_SECRET || '';
  return password.length >= 12 && secret.length >= 32;
}
