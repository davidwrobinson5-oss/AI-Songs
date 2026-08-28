import { NextResponse } from 'next/server';
import { unzipSync } from 'fflate';
import { rateLimit, readResponseBytesLimited, safeHttpsUrl, safeId } from '../../../security';

const MUREKA_BASE = 'https://api.mureka.ai';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const MAX_SONG_BYTES = 80 * 1024 * 1024;
const MAX_STEM_ARCHIVE_BYTES = 140 * 1024 * 1024;

function collectUrls(value: unknown, urls: string[] = [], depth = 0) {
  if (depth > 8 || value == null || urls.length >= 12) return urls;

  if (typeof value === 'string') {
    try {
      const safe = safeHttpsUrl(value);
      if (!urls.includes(safe)) urls.push(safe);
    } catch {
      // Ignore unsafe/non-HTTPS URL candidates from upstream metadata.
    }
    return urls;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, urls, depth + 1);
    return urls;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const priorityKeys = ['wav_url', 'audio_url', 'mp3_url', 'song_url', 'url', 'stream_url'];
    for (const key of priorityKeys) {
      if (key in record) collectUrls(record[key], urls, depth + 1);
    }
    for (const [key, item] of Object.entries(record)) {
      if (!priorityKeys.includes(key)) collectUrls(item, urls, depth + 1);
    }
  }

  return urls;
}

async function fetchMurekaSong(apiKey: string, taskId: string) {
  const taskRes = await fetch(`${MUREKA_BASE}/v1/song/query/${encodeURIComponent(taskId)}`, {
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    cache: 'no-store',
  });
  const task = await taskRes.json().catch(() => ({}));
  if (!taskRes.ok) throw new Error('MUREKA_TASK_FAILED');
  if (String(task?.status || '').toLowerCase() !== 'succeeded') throw new Error('MUREKA_NOT_READY');

  const choices = Array.isArray(task?.choices) ? task.choices : [];
  const candidates = collectUrls(choices);
  if (!candidates.length) throw new Error('MUREKA_AUDIO_MISSING');

  for (const url of candidates) {
    try {
      const audioRes = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (!audioRes.ok) continue;
      const finalUrl = safeHttpsUrl(audioRes.url || url);
      if (!finalUrl) continue;
      const contentType = (audioRes.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('audio/') && !contentType.includes('octet-stream')) continue;
      const bytes = await readResponseBytesLimited(audioRes, MAX_SONG_BYTES);
      if (!bytes.byteLength) continue;
      const type = contentType.startsWith('audio/') ? contentType.split(';')[0] : 'audio/mpeg';
      return { blob: new Blob([bytes], { type }), contentType: type };
    } catch {
      // Try the next vetted Mureka URL candidate.
    }
  }

  throw new Error('MUREKA_AUDIO_DOWNLOAD_FAILED');
}

function audioMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mpeg';
}

export async function GET(req: Request) {
  const limited = rateLimit(req, 'mureka-stems', 4, 60_000);
  if (limited) return limited;

  const murekaKey = process.env.MUREKA_API_KEY?.trim();
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!murekaKey || !elevenLabsKey) {
    return NextResponse.json({ error: 'Precision vocal processing is temporarily unavailable.' }, { status: 503 });
  }

  try {
    const requestUrl = new URL(req.url);
    const taskId = safeId(requestUrl.searchParams.get('fileId'), 160);
    const archiveRequested = requestUrl.searchParams.get('archive') === '1';

    const song = await fetchMurekaSong(murekaKey, taskId);
    const stemForm = new FormData();
    stemForm.append('file', song.blob, song.contentType.includes('wav') ? 'mureka-song.wav' : 'mureka-song.mp3');
    stemForm.append('stem_variation_id', 'two_stems_v1');

    const stemsRes = await fetch(`${ELEVENLABS_BASE}/v1/music/stem-separation?output_format=mp3_44100_192`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenLabsKey },
      body: stemForm,
      cache: 'no-store',
    });
    if (!stemsRes.ok) {
      console.error('ElevenLabs stem separation failed', stemsRes.status);
      return NextResponse.json({ error: 'Stem separation provider rejected the request.' }, { status: stemsRes.status >= 500 ? 502 : 400 });
    }

    const archiveBytes = await readResponseBytesLimited(stemsRes, MAX_STEM_ARCHIVE_BYTES);
    if (!archiveBytes.byteLength) return NextResponse.json({ error: 'Stem separation returned an empty file.' }, { status: 502 });

    if (archiveRequested) {
      return new NextResponse(archiveBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(archiveBytes.byteLength),
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'X-Precision-Provider': 'mureka',
        },
      });
    }

    const archive = unzipSync(archiveBytes);
    const entries = Object.entries(archive).filter(([name, bytes]) => /\.(mp3|wav|m4a)$/i.test(name) && bytes.byteLength <= MAX_SONG_BYTES);
    const vocalEntry = entries.find(([name]) => /vocal/i.test(name) && !/instrumental|accompaniment|backing|music/i.test(name));
    if (!vocalEntry) return NextResponse.json({ error: 'Could not identify the vocal stem.' }, { status: 502 });

    const bytes = vocalEntry[1];
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': audioMime(vocalEntry[0]),
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Precision-Provider': 'mureka',
      },
    });
  } catch (error) {
    console.error('Mureka precision-vocal pipeline failed', error instanceof Error ? error.message : 'unknown');
    const status = error instanceof Error && error.message === 'MUREKA_NOT_READY' ? 409 : 400;
    return NextResponse.json({ error: status === 409 ? 'The source song is not ready yet.' : 'Could not build the precision vocal.' }, { status });
  }
}
