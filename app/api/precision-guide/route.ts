import OpenAI from 'openai';
import { NextResponse } from 'next/server';

const CANTAI_BASE = 'https://cantai.app';

type MelodyNote = {
  note: string;
  start: number;
  duration: number;
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
        content: `You align song lyrics to a monophonic melody for singing synthesis. Return ONLY valid JSON: {"tokens":[...]}. The tokens array MUST contain exactly the requested number of items. Each item must be one short singable lyric syllable or word fragment for one note. Preserve the lyric meaning and order. Split multisyllabic words across notes with natural syllables. Do not include section labels, punctuation, explanations, or blank tokens.`,
      },
      {
        role: 'user',
        content: `Need exactly ${notes.length} lyric tokens, one per melody note.\nLyrics:\n${lyrics}\n\nNotes and timing:\n${JSON.stringify(notes.map((n) => ({ note: n.note, start: Math.round(n.start * 1000) / 1000, duration: Math.round(n.duration * 1000) / 1000 })))}`,
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

export async function POST(req: Request) {
  const apiKey = process.env.CANTAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'CANTAI_API_KEY is not configured yet.', needsSetup: true },
      { status: 503 },
    );
  }

  try {
    const { lyrics, vocalRange = 'Tenor', analysis, tempo = 120 } = await req.json();
    const notes: MelodyNote[] = Array.isArray(analysis?.notes)
      ? analysis.notes
          .filter((n: MelodyNote) => n?.note && Number.isFinite(n?.start) && Number.isFinite(n?.duration))
          .map((n: MelodyNote) => ({ note: n.note, start: n.start, duration: n.duration }))
      : [];

    if (!lyrics?.trim() || !notes.length) {
      return NextResponse.json({ error: 'Fitted lyrics and analyzed melody notes are required.' }, { status: 400 });
    }

    const noteLyrics = await makeNoteLyrics(lyrics, notes, process.env.OPENAI_API_KEY);
    const payload = {
      song: {
        notes: notes.map((n) => n.note),
        lyrics: noteLyrics,
        tempo,
        starts: notes.map((n) => Math.round(n.start * 1000) / 1000),
        durations: notes.map((n) => Math.round(n.duration * 1000) / 1000),
      },
      voiceProfile: voiceProfile(vocalRange),
      outputFormat: 'wav',
      reverb: false,
    };

    const response = await fetch(`${CANTAI_BASE}/v1/synthesize`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'audio/wav, application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    });

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok) {
      const text = await response.text();
      return new NextResponse(text || 'Cantai singing synthesis failed.', {
        status: response.status,
        headers: { 'Content-Type': contentType || 'text/plain' },
      });
    }

    if (contentType.includes('audio/') || contentType.includes('octet-stream')) {
      const bytes = await response.arrayBuffer();
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': contentType.includes('audio/') ? contentType : 'audio/wav',
          'Cache-Control': 'no-store',
        },
      });
    }

    const data = await response.json().catch(() => ({}));
    const providerUrl = data.audio_url || data.audioUrl || data.download_url || data.downloadUrl || data.url;
    if (typeof providerUrl === 'string' && providerUrl.startsWith('http')) {
      const audioResponse = await fetch(providerUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: 'no-store',
      });
      if (!audioResponse.ok) {
        return NextResponse.json({ error: 'Cantai generated the guide but the audio could not be retrieved.' }, { status: 502 });
      }
      const bytes = await audioResponse.arrayBuffer();
      return new NextResponse(bytes, {
        status: 200,
        headers: {
          'Content-Type': audioResponse.headers.get('content-type') || 'audio/wav',
          'Cache-Control': 'no-store',
        },
      });
    }

    const jobId = data.job_id || data.jobId || data.id;
    if (jobId) {
      return NextResponse.json({ jobId: String(jobId), status: data.status || 'queued' }, { status: 202 });
    }

    return NextResponse.json({ error: 'Cantai returned an unsupported response.', detail: data }, { status: 502 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Precision guide vocal generation failed.' }, { status: 500 });
  }
}
