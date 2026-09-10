import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { cookies } from 'next/headers';
import { SESSION_COOKIE, verifySessionToken } from '../../auth';
import { rateLimit, readJsonObject, safeId } from '../../security';
import { awardPieScore } from '../../scoreServer';

const LIBRARY_URL = `${(process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '')}/functions/v1/pie-library`;
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');
const LEGACY_OWNER_ID = 'pie-primary';

type PlaybackResponse = { url?: string; type?: string; expiresIn?: number; error?: string };
function noStore(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function authenticatedOwnerId() {
  try { const clerk = await auth(); if (clerk.userId) return clerk.userId; } catch {}
  const jar = await cookies();
  const legacyToken = jar.get(SESSION_COOKIE)?.value || '';
  const legacyValid = await verifySessionToken(legacyToken, process.env.AI_SONGS_SESSION_SECRET);
  return legacyValid ? LEGACY_OWNER_ID : '';
}
async function callLibrary(body: unknown, ownerId: string) {
  const vercelOidcToken = await getVercelOidcToken().catch(() => '');
  if (!vercelOidcToken) throw new Error('CLOUD_IDENTITY_UNAVAILABLE');
  return fetch(LIBRARY_URL, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, 'X-Pie-Vercel-OIDC': vercelOidcToken, 'X-Pie-User-Id': ownerId }, body: JSON.stringify(body), cache: 'no-store' });
}
export async function GET(req: NextRequest) {
  const limited=rateLimit(req,'song-library-read',60,60_000);if(limited)return limited;
  try {
    const ownerId = await authenticatedOwnerId();
    if (!ownerId) return noStore({ error: 'Authentication required.' }, 401);
    const songId = safeId(req.nextUrl.searchParams.get('songId'),160);
    if (!songId) return noStore({ error: 'Missing song id.' }, 400);

    // Authenticate through Pie, then hand the browser a short-lived signed storage
    // URL. This keeps songs private while letting the browser stream byte ranges
    // directly from storage instead of relaying the audio body through Vercel.
    const playbackResponse = await callLibrary({ action: 'playbackUrl', songId }, ownerId);
    const playback = await playbackResponse.json().catch(() => ({})) as PlaybackResponse;
    if (!playbackResponse.ok || !playback.url) {
      return noStore({ error: playback.error || 'Could not load song audio.' }, playbackResponse.status >= 500 ? 502 : playbackResponse.status || 400);
    }

    return NextResponse.redirect(playback.url, {
      status: 307,
      headers: {
        'Cache-Control': 'private, no-store',
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) { console.error('Song playback redirect failed'); return noStore({ error: 'Could not load song audio.' }, 400); }
}
export async function POST(req: NextRequest) {
  const limited=rateLimit(req,'song-library-write',30,60_000);if(limited)return limited;
  try {
    const ownerId = await authenticatedOwnerId();
    if (!ownerId) return noStore({ error: 'Authentication required.' }, 401);
    const body = await readJsonObject(req,1_000_000);
    const action=typeof body.action==='string'?body.action.slice(0,64):'';
    if(!action)return noStore({error:'Invalid cloud library request.'},400);
    const response = await callLibrary({...body,action}, ownerId);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) console.info('Pie cloud response diagnostic', { status: response.status });
    if (response.ok && action === 'upsertVersion' && body?.song && typeof body.song==='object' && !Array.isArray(body.song)) {
      const song=body.song as Record<string,unknown>;
      const version=body.version && typeof body.version==='object' && !Array.isArray(body.version)?body.version as Record<string,unknown>:{};
      if(song.id)await awardPieScore('song_saved', String(song.id).slice(0,160), 0, { title: String(song.title || 'Untitled Song').slice(0,300), versionNumber: Number(version.versionNumber || 1) }).catch(() => null);
    }
    return noStore(data, response.ok ? response.status : response.status >= 500 ? 502 : 400);
  } catch (error) { console.error('Song library proxy failed'); return noStore({ error: 'Cloud library request failed.' }, 400); }
}
