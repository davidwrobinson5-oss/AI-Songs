import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';
import { awardPieScore } from '../../scoreServer';

const LIBRARY_URL = 'https://ynkrlatwwwaachijacmb.supabase.co/functions/v1/pie-library';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg';
const LEGACY_OWNER_ID = 'pie-primary';
const PLAYBACK_FIELDS = ['masterBlob', 'generatedBlob', 'backingBlob', 'drobVocalBlob', 'guideVocalBlob'] as const;

type CloudFile = { url?: string; type?: string };
type CloudVersion = { id?: string; songId?: string; versionNumber?: number; files?: Record<string, CloudFile | undefined> };
type CloudLibrary = { versions?: CloudVersion[] };
function noStore(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function authenticatedOwnerId() {
  try {
    const clerk = await auth();
    if (clerk.userId) return clerk.userId;
  } catch {}
  const jar = await cookies();
  const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
  const legacyValid = await verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);
  return legacyValid ? LEGACY_OWNER_ID : '';
}
async function callLibrary(body: unknown, ownerId: string) {
  const vercelOidcToken = await getVercelOidcToken().catch(() => '');
  if (!vercelOidcToken) throw new Error('Cloud library identity is temporarily unavailable.');
  return fetch(LIBRARY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, 'X-Pie-Vercel-OIDC': vercelOidcToken, 'X-Pie-User-Id': ownerId }, body: JSON.stringify(body), cache: 'no-store' });
}
export async function GET(req: NextRequest) {
  try {
    const ownerId = await authenticatedOwnerId();
    if (!ownerId) return noStore({ error: 'Authentication required.' }, 401);
    const songId = req.nextUrl.searchParams.get('songId') || '';
    if (!songId) return noStore({ error: 'Missing song id.' }, 400);
    const libraryResponse = await callLibrary({ action: 'list' }, ownerId);
    const cloud = await libraryResponse.json().catch(() => ({})) as CloudLibrary & { error?: string };
    if (!libraryResponse.ok) return noStore({ error: cloud.error || 'Could not load song audio.' }, libraryResponse.status);
    const versions = (cloud.versions || []).filter((version) => version.songId === songId).sort((a, b) => Number(b.versionNumber || 0) - Number(a.versionNumber || 0));
    let chosen: CloudFile | undefined;
    for (const version of versions) { for (const field of PLAYBACK_FIELDS) { const file = version.files?.[field]; if (file?.url) { chosen = file; break; } } if (chosen) break; }
    if (!chosen?.url) return noStore({ error: 'No playable audio was found for this song.' }, 404);
    const remoteHeaders: HeadersInit = {}; const range = req.headers.get('range'); if (range) remoteHeaders.Range = range;
    const audioResponse = await fetch(chosen.url, { method: 'GET', headers: remoteHeaders, cache: 'no-store' });
    if (!audioResponse.ok && audioResponse.status !== 206) return noStore({ error: `Cloud audio could not be read (${audioResponse.status}).` }, 502);
    const headers = new Headers(); headers.set('Content-Type', audioResponse.headers.get('content-type') || chosen.type || 'audio/mpeg'); headers.set('Cache-Control', 'private, no-store'); headers.set('Accept-Ranges', audioResponse.headers.get('accept-ranges') || 'bytes');
    const contentLength = audioResponse.headers.get('content-length'); const contentRange = audioResponse.headers.get('content-range'); if (contentLength) headers.set('Content-Length', contentLength); if (contentRange) headers.set('Content-Range', contentRange);
    return new Response(audioResponse.body, { status: audioResponse.status, headers });
  } catch (error) { console.error('Song playback proxy failed:', error); return noStore({ error: error instanceof Error ? error.message : 'Could not load song audio.' }, 500); }
}
export async function POST(req: NextRequest) {
  try {
    const ownerId = await authenticatedOwnerId();
    if (!ownerId) return noStore({ error: 'Authentication required.' }, 401);
    const body = await req.json();
    const response = await callLibrary(body, ownerId);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) console.info('Pie cloud response diagnostic', { status: response.status, error: typeof data?.error === 'string' ? data.error : 'unknown' });
    if (response.ok && body?.action === 'upsertVersion' && body?.song?.id) {
      await awardPieScore('song_saved', String(body.song.id), 0, { title: String(body?.song?.title || 'Untitled Song'), versionNumber: Number(body?.version?.versionNumber || 1) }).catch(() => null);
    }
    return noStore(data, response.status);
  } catch (error) { console.error('Song library proxy failed:', error); return noStore({ error: error instanceof Error ? error.message : 'Cloud library request failed.' }, 500); }
}
