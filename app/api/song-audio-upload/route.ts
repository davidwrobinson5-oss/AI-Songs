import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LIBRARY_URL = 'https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-library';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;

function noStore(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function isAuthenticated() {
  let clerkSignedIn = false;
  try {
    const clerk = await auth();
    clerkSignedIn = Boolean(clerk.userId);
  } catch {
    clerkSignedIn = false;
  }

  if (clerkSignedIn) return true;

  const jar = await cookies();
  const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
  return verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);
}

async function projectIdentity() {
  return getVercelOidcToken().catch(() => '');
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return noStore({ error: 'Authentication required.' }, 401);

  try {
    const body = await req.json();
    const path = String(body?.path || '');
    const type = String(body?.type || 'application/octet-stream');
    const size = Number(body?.size || 0);

    if (!path || !Number.isFinite(size) || size <= 0) {
      return noStore({ error: 'Invalid audio upload request.' }, 400);
    }

    const oidc = await projectIdentity();
    if (!oidc) return noStore({ error: 'Cloud identity is temporarily unavailable.' }, 503);

    const response = await fetch(LIBRARY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'X-Pie-Vercel-OIDC': oidc,
        'X-Pie-Audio-Action': 'start',
      },
      body: JSON.stringify({ path, type, size }),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Pie audio start proxy failed', response.status, data?.error || 'unknown');
      return noStore({ error: data?.error || 'Audio upload start failed.' }, response.status);
    }

    return noStore(data, 200);
  } catch (error) {
    console.error('Pie audio start route failed:', error);
    return noStore({ error: error instanceof Error ? error.message : 'Audio upload start failed.' }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticated())) return noStore({ error: 'Authentication required.' }, 401);

  try {
    const uploadUrl = req.headers.get('x-pie-upload-url') || '';
    const offset = Number(req.headers.get('x-pie-upload-offset') || '0');
    const bytes = await req.arrayBuffer();

    if (!uploadUrl || !Number.isFinite(offset) || offset < 0) {
      return noStore({ error: 'Invalid audio chunk request.' }, 400);
    }
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) {
      return noStore({ error: 'Audio chunk is too large.' }, 413);
    }

    const oidc = await projectIdentity();
    if (!oidc) return noStore({ error: 'Cloud identity is temporarily unavailable.' }, 503);

    const response = await fetch(LIBRARY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        'X-Pie-Vercel-OIDC': oidc,
        'X-Pie-Audio-Action': 'chunk',
        'X-Pie-Upload-Url': uploadUrl,
        'X-Pie-Upload-Offset': String(Math.floor(offset)),
      },
      body: Buffer.from(bytes),
      cache: 'no-store',
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error('Pie audio chunk proxy failed', response.status, data?.error || 'unknown');
      return noStore({ error: data?.error || 'Audio chunk upload failed.' }, response.status);
    }

    return noStore(data, 200);
  } catch (error) {
    console.error('Pie audio chunk route failed:', error);
    return noStore({ error: error instanceof Error ? error.message : 'Audio chunk upload failed.' }, 500);
  }
}
