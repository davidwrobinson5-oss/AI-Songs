import { NextRequest, NextResponse } from 'next/server';
import { getVercelOidcToken } from '@vercel/oidc';
import { resolvePieUserId } from '../../usageEntitlements';
import { boundedNumber, rateLimit, readJsonObject, safeHttpsUrl, textField } from '../../security';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LIBRARY_URL = `${(process.env.SUPABASE_URL || 'https://ynkrlatwwwaachijacmb.supabase.co').replace(/\/$/, '')}/functions/v1/pie-library`;
const SUPABASE_PUBLISHABLE_KEY = (process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_FwpXHHEMnJuwdJ0MNTGWtw_yyOCZ9wg');
const MAX_CHUNK_BYTES = 2 * 1024 * 1024;
const MAX_AUDIO_BYTES = 500 * 1024 * 1024;

function noStore(body: unknown, status = 200) { return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
async function projectIdentity() { return getVercelOidcToken().catch(() => ''); }
function safeStoragePath(value:unknown){
  const path=textField(value,500);
  if(!path||path.startsWith('/')||path.includes('..')||!/^[A-Za-z0-9._/-]+$/.test(path))throw new Error('INVALID_PATH');
  return path;
}

export async function POST(req: NextRequest) {
  const limited=rateLimit(req,'song-audio-upload-start',20,60_000);if(limited)return limited;
  const userId = await resolvePieUserId();
  if (!userId) return noStore({ error: 'Authentication required.' }, 401);
  try {
    const body = await readJsonObject(req,32_000);
    const path = safeStoragePath(body.path);
    const type = textField(body.type,120,'application/octet-stream');
    const size = boundedNumber(body.size,1,MAX_AUDIO_BYTES);
    const oidc = await projectIdentity();
    if (!oidc) return noStore({ error: 'Cloud identity is temporarily unavailable.' }, 503);
    const response = await fetch(LIBRARY_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_PUBLISHABLE_KEY, 'X-Pie-Vercel-OIDC': oidc, 'X-Pie-User-Id': userId, 'X-Pie-Audio-Action': 'start' }, body: JSON.stringify({ path, type, size }), cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { console.error('Pie audio start proxy failed', response.status); return noStore({ error: 'Audio upload could not be started.' }, response.status >= 500 ? 502 : 400); }
    if(data?.uploadUrl){try{data.uploadUrl=safeHttpsUrl(data.uploadUrl);}catch{return noStore({error:'Cloud upload service returned an invalid destination.'},502);}}
    return noStore(data, 200);
  } catch (error) { console.error('Pie audio start route failed'); return noStore({ error: 'Invalid audio upload request.' }, 400); }
}

export async function PATCH(req: NextRequest) {
  const limited=rateLimit(req,'song-audio-upload-chunk',180,60_000);if(limited)return limited;
  const userId = await resolvePieUserId();
  if (!userId) return noStore({ error: 'Authentication required.' }, 401);
  try {
    const uploadUrl = safeHttpsUrl(req.headers.get('x-pie-upload-url') || '');
    const offset = boundedNumber(req.headers.get('x-pie-upload-offset') || '0',0,MAX_AUDIO_BYTES,0);
    const declared=Number(req.headers.get('content-length')||0);
    if(declared&&declared>MAX_CHUNK_BYTES)return noStore({error:'Audio chunk is too large.'},413);
    const bytes = await req.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > MAX_CHUNK_BYTES) return noStore({ error: 'Audio chunk is too large.' }, 413);
    const oidc = await projectIdentity();
    if (!oidc) return noStore({ error: 'Cloud identity is temporarily unavailable.' }, 503);
    const response = await fetch(LIBRARY_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', apikey: SUPABASE_PUBLISHABLE_KEY, 'X-Pie-Vercel-OIDC': oidc, 'X-Pie-User-Id': userId, 'X-Pie-Audio-Action': 'chunk', 'X-Pie-Upload-Url': uploadUrl, 'X-Pie-Upload-Offset': String(Math.floor(offset)) }, body: Buffer.from(bytes), cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { console.error('Pie audio chunk proxy failed', response.status); return noStore({ error: 'Audio chunk upload failed.' }, response.status >= 500 ? 502 : 400); }
    return noStore(data, 200);
  } catch (error) { console.error('Pie audio chunk route failed'); return noStore({ error: 'Invalid audio chunk request.' }, 400); }
}
