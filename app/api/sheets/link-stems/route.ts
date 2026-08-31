import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { createSourceSeparation } from '../klangio';
import { removeStagedFile, signedStagingUrl } from '../staging';

export const runtime = 'nodejs';
export const maxDuration = 60;

function isBlockedHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be' || host.endsWith('.youtu.be');
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || /^10\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

async function fetchDirectMedia(rawUrl: string) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('DIRECT_LINK_HTTPS_ONLY');
  if (isBlockedHost(url.hostname)) throw new Error('YOUTUBE_UPLOAD_REQUIRED');
  if (isPrivateHost(url.hostname)) throw new Error('PRIVATE_LINK_BLOCKED');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'User-Agent': 'PieMusicAnalyzer/1.0' },
    });
    if (!response.ok) throw new Error('DIRECT_LINK_FETCH_FAILED');
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared && declared > 45 * 1024 * 1024) throw new Error('DIRECT_LINK_TOO_LARGE');
    if (!contentType.startsWith('audio/') && !contentType.startsWith('video/')) throw new Error('DIRECT_LINK_NOT_MEDIA');
    const bytes = await response.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 45 * 1024 * 1024) throw new Error('DIRECT_LINK_TOO_LARGE');
    return new Blob([bytes], { type: contentType || 'audio/mpeg' });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchStagedMedia(path: string, type: string) {
  const signed = await signedStagingUrl(path);
  const response = await fetch(signed, { cache: 'no-store' });
  if (!response.ok) throw new Error('STAGED_MEDIA_FETCH_FAILED');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > 45 * 1024 * 1024) throw new Error('DIRECT_LINK_TOO_LARGE');
  const bytes = await response.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > 45 * 1024 * 1024) throw new Error('DIRECT_LINK_TOO_LARGE');
  return new Blob([bytes], { type: type || response.headers.get('content-type') || 'audio/mpeg' });
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'sheets-link-stems', 6, 60_000);
  if (limited) return limited;

  let stagedPath = '';
  try {
    const body = await req.json() as { url?: string; stagedPath?: string; name?: string; type?: string };
    let blob: Blob;
    let sourceLabel = 'Uploaded media';

    stagedPath = String(body.stagedPath || '');
    if (stagedPath) {
      sourceLabel = String(body.name || 'Uploaded media').slice(0, 120);
      blob = await fetchStagedMedia(stagedPath, String(body.type || 'application/octet-stream'));
    } else {
      const rawUrl = String(body.url || '').trim();
      if (!rawUrl) return NextResponse.json({ error: 'Paste a music link first.' }, { status: 400 });
      const parsed = new URL(rawUrl);
      sourceLabel = parsed.hostname;
      blob = await fetchDirectMedia(rawUrl);
    }

    const jobId = await createSourceSeparation(blob);
    return NextResponse.json({ jobId, sourceLabel }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'YOUTUBE_UPLOAD_REQUIRED') {
      return NextResponse.json({ error: 'For YouTube links, Pie needs you to upload the audio/video file before stem separation.' }, { status: 409 });
    }
    if (message === 'DIRECT_LINK_NOT_MEDIA') {
      return NextResponse.json({ error: 'That link is a webpage, not a direct audio/video file. Upload the media file instead.' }, { status: 415 });
    }
    if (message === 'DIRECT_LINK_TOO_LARGE') {
      return NextResponse.json({ error: 'That media file is too large for analysis. Use a file under 45 MB.' }, { status: 413 });
    }
    if (message === 'DIRECT_LINK_HTTPS_ONLY' || message === 'PRIVATE_LINK_BLOCKED') {
      return NextResponse.json({ error: 'That link cannot be fetched safely.' }, { status: 400 });
    }
    if (message === 'KLANGIO_NOT_CONFIGURED') {
      return NextResponse.json({ error: 'Stem analysis is not configured yet.' }, { status: 503 });
    }
    console.error('Link stem analysis failed', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not start stem analysis.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  } finally {
    if (stagedPath) await removeStagedFile(stagedPath);
  }
}
