import { NextResponse } from 'next/server';
import { rateLimit, readResponseBytesLimited, safeHttpsUrl, safeId } from '../../../security';
import { resolvePieUserId } from '../../../usageEntitlements';

const KITS_BASE = 'https://arpeggi.io/api/kits/v1';

function findAudioUrl(value: unknown, depth = 0): string {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') return /^https:\/\//i.test(value) && /(?:audio|file|url|download|output|result|\.mp3|\.wav|\.m4a)/i.test(value) ? value : '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findAudioUrl(item, depth + 1);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const preferred = ['outputFileUrl','outputUrl','audioUrl','downloadUrl','fileUrl','url','resultUrl'];
    for (const key of preferred) {
      const candidate = object[key];
      if (typeof candidate === 'string' && /^https:\/\//i.test(candidate)) return candidate;
    }
    for (const child of Object.values(object)) {
      const found = findAudioUrl(child, depth + 1);
      if (found) return found;
    }
  }
  return '';
}

export async function GET(req: Request) {
  const limited = rateLimit(req, 'kits-conversion-status', 30, 60_000);
  if (limited) return limited;

  const userId = await resolvePieUserId();
  if (!userId) return NextResponse.json({ error: 'Authentication required.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

  const apiKey = process.env.KITS_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'Voice conversion is temporarily unavailable.' }, { status: 503 });

  try {
    const requestUrl = new URL(req.url);
    const id = safeId(requestUrl.searchParams.get('id'), 160);
    const response = await fetch(`${KITS_BASE}/voice-conversions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: 'no-store' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json({ error: 'Voice conversion status is unavailable.' }, { status: response.status >= 500 ? 502 : 400, headers: { 'Cache-Control': 'no-store' } });

    if (requestUrl.searchParams.get('download') === '1') {
      const audioUrl = findAudioUrl(data);
      if (!audioUrl) return NextResponse.json({ error: 'AI vocal audio is not ready yet.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
      const safeUrl = safeHttpsUrl(audioUrl);
      const audioResponse = await fetch(safeUrl, { cache: 'no-store' });
      if (!audioResponse.ok) return NextResponse.json({ error: 'AI vocal audio could not be retrieved.' }, { status: 502, headers: { 'Cache-Control': 'no-store' } });
      const bytes = await readResponseBytesLimited(audioResponse, 80 * 1024 * 1024);
      const contentType = audioResponse.headers.get('content-type') || 'audio/mpeg';
      return new Response(bytes, { status: 200, headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    }

    return NextResponse.json(data, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'Invalid voice conversion status request.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
