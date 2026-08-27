import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const CANTAI_BASE = 'https://cantai.app';

type MelodyNote = {
  note: string;
  midi?: number;
  start: number;
  duration: number;
};

type PrecisionPayload = {
  lyrics: string;
  vocalRange: string;
  tempo: number;
  notes: MelodyNote[];
  noteLyrics: string[];
};

function stripSections(lyrics: string) {
  return lyrics
    .split('\n')
    .filter((line) => !/^\s*\[[^\]]+\]\s*$/.test(line))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function makeNoteLyrics(lyrics: string, notes: MelodyNote[], openaiKey?: string) {
  const fallback = stripSections(lyrics)
    .replace(/[^A-Za-z0-9' -]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  if (!openaiKey) {
    return notes.map((_, index) => fallback[index % Math.max(1, fallback.length)] || 'ah');
  }

  const client = new OpenAI({ apiKey: openaiKey });
  const response = await client.responses.create({
    model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
    input: [
      {
        role: 'system',
        content: `You align song lyrics to a monophonic melody for singing synthesis. Return ONLY valid JSON: {"tokens":[...]}. The tokens array MUST contain exactly the requested number of items. Each item must be one short singable lyric syllable or word fragment for one note. Preserve lyric meaning and order. Split multisyllabic words naturally across notes. Do not include section labels, punctuation, explanations, or blank tokens.`,
      },
      {
        role: 'user',
        content: `Need exactly ${notes.length} lyric tokens, one per melody note.\nLyrics:\n${lyrics}\n\nNotes and timing:\n${JSON.stringify(notes.map((n) => ({ note: n.note, midi: n.midi, start: Math.round(n.start * 1000) / 1000, duration: Math.round(n.duration * 1000) / 1000 })))}`,
      },
    ],
  });

  try {
    const cleaned = response.output_text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed.tokens) && parsed.tokens.length === notes.length) {
      return parsed.tokens.map((token: unknown) => String(token || 'ah').trim() || 'ah');
    }
  } catch {}

  return notes.map((_, index) => fallback[index % Math.max(1, fallback.length)] || 'ah');
}

function voiceProfile(vocalRange: string) {
  const lower = vocalRange.toLowerCase();
  if (lower.includes('bass')) return 'Bass';
  if (lower.includes('baritone')) return 'Baritone';
  if (lower.includes('tenor')) return 'Tenor';
  if (lower.includes('alto')) return 'Alto';
  if (lower.includes('soprano')) return 'Soprano';
  return 'Tenor';
}

function isAudio(contentType: string) {
  return contentType.includes('audio/') || contentType.includes('octet-stream');
}

async function audioResponseFromProvider(response: Response, provider: string, authHeader?: string) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${provider}: ${text || `request failed (${response.status})`}`);
  }

  if (isAudio(contentType)) {
    const bytes = await response.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType.includes('audio/') ? contentType : 'audio/wav',
        'Cache-Control': 'no-store',
        'X-Precision-Provider': provider,
      },
    });
  }

  const data = await response.json().catch(() => ({}));
  const providerUrl = data.audio_url || data.audioUrl || data.download_url || data.downloadUrl || data.url;
  if (typeof providerUrl === 'string' && providerUrl.startsWith('http')) {
    const headers: Record<string, string> = {};
    if (authHeader) headers.Authorization = authHeader;
    const audioResponse = await fetch(providerUrl, { headers, cache: 'no-store' });
    if (!audioResponse.ok) throw new Error(`${provider}: generated audio could not be retrieved.`);
    const bytes = await audioResponse.arrayBuffer();
    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': audioResponse.headers.get('content-type') || 'audio/wav',
        'Cache-Control': 'no-store',
        'X-Precision-Provider': provider,
      },
    });
  }

  const jobId = data.job_id || data.jobId || data.id;
  if (jobId) {
    return NextResponse.json(
      { jobId: String(jobId), status: data.status || 'queued', provider },
      { status: 202, headers: { 'X-Precision-Provider': provider } },
    );
  }

  throw new Error(`${provider}: unsupported response.`);
}

async function synthesizeWithDiffSinger(payload: PrecisionPayload) {
  const rawBase = process.env.DIFFSINGER_API_URL?.trim();
  if (!rawBase) return null;

  const base = rawBase.replace(/\/$/, '');
  const apiKey = process.env.DIFFSINGER_API_KEY?.trim();
  const authHeader = apiKey ? `Bearer ${apiKey}` : undefined;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'audio/wav, application/json',
  };
  if (authHeader) headers.Authorization = authHeader;

  const response = await fetch(`${base}/v1/synthesize`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      format: 'wav',
      dry: true,
      tempo: payload.tempo,
      voiceProfile: voiceProfile(payload.vocalRange),
      lyrics: payload.noteLyrics,
      notes: payload.notes.map((n, index) => ({
        note: n.note,
        midi: n.midi,
        lyric: payload.noteLyrics[index] || 'ah',
        start: Math.round(n.start * 1000) / 1000,
        duration: Math.round(n.duration * 1000) / 1000,
      })),
    }),
    cache: 'no-store',
  });

  return audioResponseFromProvider(response, 'diffsinger', authHeader);
}

async function synthesizeWithCantai(payload: PrecisionPayload) {
  const apiKey = process.env.CANTAI_API_KEY?.trim();
  if (!apiKey) return null;

  const authHeader = `Bearer ${apiKey}`;
  const response = await fetch(`${CANTAI_BASE}/v1/synthesize`, {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'audio/wav, application/json',
    },
    body: JSON.stringify({
      song: {
        notes: payload.notes.map((n) => n.note),
        lyrics: payload.noteLyrics,
        tempo: payload.tempo,
        starts: payload.notes.map((n) => Math.round(n.start * 1000) / 1000),
        durations: payload.notes.map((n) => Math.round(n.duration * 1000) / 1000),
      },
      voiceProfile: voiceProfile(payload.vocalRange),
      outputFormat: 'wav',
      reverb: false,
    }),
    cache: 'no-store',
  });

  return audioResponseFromProvider(response, 'cantai', authHeader);
}

export async function POST(req: Request) {
  try {
    const { lyrics, vocalRange = 'Tenor', analysis, tempo = 120 } = await req.json();
    const notes: MelodyNote[] = Array.isArray(analysis?.notes)
      ? analysis.notes
          .filter((n: MelodyNote) => n?.note && Number.isFinite(n?.start) && Number.isFinite(n?.duration))
          .map((n: MelodyNote) => ({ note: n.note, midi: n.midi, start: n.start, duration: n.duration }))
      : [];

    if (!lyrics?.trim() || !notes.length) {
      return NextResponse.json({ error: 'Fitted lyrics and analyzed melody notes are required.' }, { status: 400 });
    }

    const noteLyrics = await makeNoteLyrics(lyrics, notes, process.env.OPENAI_API_KEY);
    const payload: PrecisionPayload = {
      lyrics,
      vocalRange,
      tempo: Number.isFinite(Number(tempo)) ? Number(tempo) : 120,
      notes,
      noteLyrics,
    };

    const preferred = (process.env.PRECISION_VOCAL_PROVIDER || 'auto').toLowerCase();
    const errors: string[] = [];

    if (preferred === 'diffsinger' || preferred === 'auto') {
      try {
        const result = await synthesizeWithDiffSinger(payload);
        if (result) return result;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'DiffSinger failed.');
        if (preferred === 'diffsinger') {
          return NextResponse.json({ error: errors[0] }, { status: 502 });
        }
      }
    }

    if (preferred === 'cantai' || preferred === 'auto') {
      try {
        const result = await synthesizeWithCantai(payload);
        if (result) return result;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : 'Cantai failed.');
        if (preferred === 'cantai') {
          return NextResponse.json({ error: errors[errors.length - 1] }, { status: 502 });
        }
      }
    }

    if (errors.length) {
      return NextResponse.json(
        { error: 'No precision vocal provider completed the render.', detail: errors.join(' | ') },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        error: 'No precision vocal provider is configured yet.',
        needsSetup: true,
        setup: 'Configure DIFFSINGER_API_URL for a self-hosted DiffSinger-compatible service, or CANTAI_API_KEY as an optional fallback.',
      },
      { status: 503 },
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Precision guide vocal generation failed.' }, { status: 500 });
  }
}
