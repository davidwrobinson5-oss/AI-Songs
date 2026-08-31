import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PROJECT_ID = 'ynkrlatwwwaachijacmb';
const TUS_ENDPOINT = `https://${PROJECT_ID}.storage.supabase.co/storage/v1/upload/resumable`;
const TUS_PREFIX = `${TUS_ENDPOINT}/`;
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

function metadataValue(value: string) {
  return Buffer.from(value, 'utf8').toString('base64');
}

function validUploadUrl(value: string) {
  try {
    const url = new URL(value);
    const expected = new URL(TUS_ENDPOINT);
    return url.protocol === 'https:' && url.host === expected.host && url.href.startsWith(TUS_PREFIX);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) return noStore({ error: 'Authentication required.' }, 401);

  try {
    const body = await req.json();
    const path = String(body?.path || '');
    const token = String(body?.token || '');
    const type = String(body?.type || 'application/octet-stream');
    const size = Number(body?.size || 0);

    if (!path || !token || !Number.isFinite(size) || size <= 0) {
      return noStore({ error: 'Invalid audio upload request.' }, 400);
    }

    const response = await fetch(TUS_ENDPOINT, {
      method: 'POST',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Length': String(Math.floor(size)),
        'Upload-Metadata': [
          `bucketName ${metadataValue('pie-song-audio')}`,
          `objectName ${metadataValue(path)}`,
          `contentType ${metadataValue(type)}`,
          `cacheControl ${metadataValue('3600')}`,
        ].join(','),
        'x-signature': token,
        'x-upsert': 'true',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Pie TUS start failed', response.status, detail.slice(0, 300));
      return noStore({ error: `Audio upload start failed (${response.status}).` }, 502);
    }

    const location = response.headers.get('location') || '';
    const uploadUrl = location ? new URL(location, TUS_ENDPOINT).toString() : '';
    if (!validUploadUrl(uploadUrl)) {
      console.error('Pie TUS returned an invalid upload location.');
      return noStore({ error: 'Audio upload location was invalid.' }, 502);
    }

    return noStore({ uploadUrl, offset: Number(response.headers.get('upload-offset') || 0) });
  } catch (error) {
    console.error('Pie TUS start proxy failed:', error);
    return noStore({ error: error instanceof Error ? error.message : 'Audio upload start failed.' }, 500);
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthenticated())) return noStore({ error: 'Authentication required.' }, 401);

  try {
    const uploadUrl = req.headers.get('x-pie-upload-url') || '';
    const token = req.headers.get('x-pie-upload-token') || '';
    const offset = Number(req.headers.get('x-pie-upload-offset') || '0');

    if (!validUploadUrl(uploadUrl) || !token || !Number.isFinite(offset) || offset < 0) {
      return noStore({ error: 'Invalid audio chunk request.' }, 400);
    }

    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) {
      return noStore({ error: 'Audio chunk is too large.' }, 413);
    }

    const response = await fetch(uploadUrl, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': '1.0.0',
        'Upload-Offset': String(Math.floor(offset)),
        'Content-Type': 'application/offset+octet-stream',
        'x-signature': token,
        'x-upsert': 'true',
      },
      body: Buffer.from(bytes),
      cache: 'no-store',
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('Pie TUS chunk failed', response.status, detail.slice(0, 300));
      return noStore({ error: `Audio chunk upload failed (${response.status}).` }, 502);
    }

    return noStore({ offset: Number(response.headers.get('upload-offset') || offset + bytes.byteLength) });
  } catch (error) {
    console.error('Pie TUS chunk proxy failed:', error);
    return noStore({ error: error instanceof Error ? error.message : 'Audio chunk upload failed.' }, 500);
  }
}
