import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, validateAudioFile } from '../../../security';
import { createSourceSeparation } from '../klangio';

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

export async function POST(req: Request) {
  const limited = rateLimit(req, 'sheets-link-stems', 6, 60_000);
  if (limited) return limited;

  try {
    const contentType = req.headers.get('content-type') || '';
    let blob: Blob;
    let sourceLabel = 'Uploaded media';

    if (contentType.includes('application/json')) {
      const body = await req.json() as { url?: string };
      const rawUrl = String(body.url || '').trim();
      if (!rawUrl) return NextResponse.json({ error: 'Paste a music link first.' }, { status: 400 });
      const parsed = new URL(rawUrl);
      sourceLabel = parsed.hostname;
      blob = await fetchDirectMedia(rawUrl);
    } else {
      const form = await req.formData();
      const file = form.get('file');
      if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an audio or video file.' }, { status: 400 });
      validateAudioFile(file, 45 * 1024 * 1024);
      blob = file;
      sourceLabel = file.name || 'Uploaded media';
    }

    const jobId = await createSourceSeparation(blob);
    return NextResponse.json({ jobId, sourceLabel }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'YOUTUBE_UPLOAD_REQUIRED') {
      return NextResponse.json({ error: 'For YouTube links, Pie can analyze the link but needs you to upload the audio/video file before stem separation.' }, { status: 409 });
    }
    if (message === 'DIRECT_LINK_NOT_MEDIA') {
      return NextResponse.json({ error: 'That link is a webpage, not a direct audio/video file. Upload the media file instead.' }, { status: 415 });
    }
    if (message === 'DIRECT_LINK_TOO_LARGE') {
      return NextResponse.json({ error: 'That media file is too large for direct link analysis. Upload a smaller copy.' }, { status: 413 });
    }
    if (message === 'DIRECT_LINK_HTTPS_ONLY' || message === 'PRIVATE_LINK_BLOCKED') {
      return NextResponse.json({ error: 'That link cannot be fetched safely.' }, { status: 400 });
    }
    if (message === 'KLANGIO_NOT_CONFIGURED') {
      return NextResponse.json({ error: 'Stem analysis is not configured yet.' }, { status: 503 });
    }
    console.error('Link stem analysis failed', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not start stem analysis.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
