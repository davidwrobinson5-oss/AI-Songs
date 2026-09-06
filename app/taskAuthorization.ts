type TaskScope = 'precision-guide';

type TaskTokenPayload = {
  v: 1;
  ownerId: string;
  taskId: string;
  scope: TaskScope;
  exp: number;
};

const encoder = new TextEncoder();

function signingSecret() {
  const secret = process.env.PIE_TASK_SIGNING_SECRET
    || process.env.AI_SONGS_SESSION_SECRET
    || process.env.CLERK_SECRET_KEY
    || '';
  if (secret.length < 32) throw new Error('TASK_AUTH_NOT_CONFIGURED');
  return secret;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function key() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function createTaskToken(ownerId: string, taskId: string, scope: TaskScope, lifetimeSeconds = 2 * 60 * 60) {
  const payload: TaskTokenPayload = {
    v: 1,
    ownerId,
    taskId,
    scope,
    exp: Math.floor(Date.now() / 1000) + lifetimeSeconds,
  };
  const body = encode(encoder.encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await key(), encoder.encode(body)));
  return `${body}.${encode(signature)}`;
}

export async function verifyTaskToken(token: string, ownerId: string, taskId: string, scope: TaskScope) {
  const [body, signaturePart, extra] = token.split('.');
  if (!body || !signaturePart || extra) return false;

  try {
    const valid = await crypto.subtle.verify('HMAC', await key(), decode(signaturePart), encoder.encode(body));
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(decode(body))) as TaskTokenPayload;
    return payload.v === 1
      && payload.ownerId === ownerId
      && payload.taskId === taskId
      && payload.scope === scope
      && Number.isFinite(payload.exp)
      && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
