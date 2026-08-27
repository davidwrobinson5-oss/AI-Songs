import { NextResponse } from 'next/server';
import { unzipSync } from 'fflate';

const MUREKA_BASE = 'https://api.mureka.ai';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

function collectUrls(value: unknown, urls: string[] = [], depth = 0) {
  if (depth > 8 || value == null) return urls;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^https?:\/\//i.test(trimmed) && !urls.includes(trimmed)) urls.push(trimmed);
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
  if (!taskRes.ok) throw new Error(task?.error?.message || task?.message || `Mureka returned ${taskRes.status}.`);
  if (String(task?.status || '').toLowerCase() !== 'succeeded') throw new Error(`Mureka song is ${task?.status || 'not ready'}.`);

  const choices = Array.isArray(task?.choices) ? task.choices : [];
  const candidates = collectUrls(choices);
  if (!candidates.length) throw new Error('Mureka did not expose a generated-song audio URL.');

  for (const url of candidates) {
    try {
      const audioRes = await fetch(url, { cache: 'no-store', redirect: 'follow' });
      if (!audioRes.ok) continue;
      const contentType = audioRes.headers.get('content-type') || '';
      if (!contentType.startsWith('audio/') && !contentType.includes('octet-stream')) continue;
      const bytes = await audioRes.arrayBuffer();
      if (!bytes.byteLength) continue;
      return {
        blob: new Blob([bytes], { type: contentType.startsWith('audio/') ? contentType : 'audio/mpeg' }),
        contentType: contentType.startsWith('audio/') ? contentType : 'audio/mpeg',
      };
    } catch {
      // Try the next Mureka URL candidate.
    }
  }

  throw new Error('Could not download the completed Mureka song.');
}

function audioMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mpeg';
}

export async function GET(req: Request) {
  const murekaKey = process.env.MUREKA_API_KEY?.trim();
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!murekaKey) return NextResponse.json({ error: 'MUREKA_API_KEY is not configured.' }, { status: 503 });
  if (!elevenLabsKey) return NextResponse.json({ error: 'ELEVENLABS_API_KEY is not configured.' }, { status: 503 });

  try {
    const requestUrl = new URL(req.url);
    // Legacy query name retained so existing saved/client flows keep working.
    const taskId = requestUrl.searchParams.get('fileId');
    const archiveRequested = requestUrl.searchParams.get('archive') === '1';
    if (!taskId) return NextResponse.json({ error: 'fileId is required.' }, { status: 400 });

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
      const text = await stemsRes.text();
      return NextResponse.json({ error: text || 'ElevenLabs stem separation failed.' }, { status: stemsRes.status });
    }

    const archiveBytes = new Uint8Array(await stemsRes.arrayBuffer());
    if (archiveRequested) {
      return new NextResponse(archiveBytes, {
        status: 200,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': String(archiveBytes.byteLength),
          'Cache-Control': 'no-store',
          'X-Precision-Provider': 'mureka',
        },
      });
    }

    // Legacy behavior: return only the vocal stem.
    const archive = unzipSync(archiveBytes);
    const entries = Object.entries(archive).filter(([name]) => /\.(mp3|wav|m4a)$/i.test(name));
    const vocalEntry = entries.find(([name]) => /vocal/i.test(name) && !/instrumental|accompaniment|backing|music/i.test(name));
    if (!vocalEntry) return NextResponse.json({ error: 'Could not identify the vocal stem returned by ElevenLabs.' }, { status: 502 });

    const bytes = vocalEntry[1];
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': audioMime(vocalEntry[0]),
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'no-store',
        'X-Precision-Provider': 'mureka',
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Could not build the Mureka precision vocal.' }, { status: 500 });
  }
}
