import OpenAI from 'openai';
import { NextRequest, NextResponse, after } from 'next/server';
import { enqueuePieJob } from '../../../jobQueue';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../../security';
import { processSpecificSongJob } from '../../../songGenerationWorker';
import { resolvePieUserId } from '../../../usageEntitlements';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const FREEDOM_LEVELS = new Set(['exact', 'light', 'balanced', 'open']);

export const maxDuration = 120;

type LyricsFreedom = 'exact' | 'light' | 'balanced' | 'open';
type MusicV2Chunk = {
  text?: string;
  duration_ms?: number;
  positive_styles?: string[];
  negative_styles?: string[];
  context_adherence?: 'low' | 'medium' | 'high';
};

type MusicV2Plan = { chunks?: MusicV2Chunk[] };

function originalLyricLines(lyrics: string) {
  return lyrics
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^\[[^\]]{1,80}\]$/.test(line));
}

function preservesOriginalLines(original: string, candidate: string) {
  const lines = originalLyricLines(original);
  let cursor = 0;
  for (const line of lines) {
    const index = candidate.indexOf(line, cursor);
    if (index < 0) return false;
    cursor = index + line.length;
  }
  return true;
}

async function expandLyrics(original: string, freedom: LyricsFreedom, prompt: string, vocalRange: string) {
  if (freedom === 'exact') return original;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return original;

  const instructions: Record<Exclude<LyricsFreedom, 'exact'>, string> = {
    light: 'Add very little: optional repeats, tasteful ad-libs, and only tiny connective phrases where musically useful.',
    balanced: 'You may add supporting hook lines, short transitions, tasteful repeats, and small new sections that improve structure and singability.',
    open: 'You may freely build a fuller song around the supplied writing with new hooks, sections, transitions, repeats, and supporting lines, while preserving the writer’s entire original lyric and themes.',
  };

  try {
    const client = new OpenAI({ apiKey });
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        {
          role: 'system',
          content: 'You are arranging a songwriter’s finished lyric for music. Every non-empty original lyric line MUST appear verbatim and in the same order in your output. Never rewrite, delete, shorten, paraphrase, or correct an original line. You may insert new lines only between intact original lines. Preserve all original themes. Section labels may be added or standardized. Return only the final lyrics with section labels.',
        },
        {
          role: 'user',
          content: `Song direction: ${prompt || 'Choose a production direction that serves the lyric.'}\nLead vocal range: ${vocalRange}\nCreative freedom: ${freedom}. ${instructions[freedom]}\n\nORIGINAL LYRICS — PRESERVE EVERY LINE VERBATIM:\n${original}`,
        },
      ],
      max_output_tokens: 6500,
    });
    const candidate = response.output_text.trim();
    return candidate && preservesOriginalLines(original, candidate) ? candidate : original;
  } catch {
    return original;
  }
}

function splitIntoSections(lyrics: string) {
  const lines = lyrics.replace(/\r\n?/g, '\n').split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  const flush = () => {
    const text = current.join('\n').trim();
    if (text) sections.push(text);
    current = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (/^\[[^\]]{1,80}\]$/.test(line.trim())) {
      flush();
      current.push(line.trim());
    } else if (line.trim() || current.length) {
      current.push(line);
      if (current.length >= 12 && !current[0]?.startsWith('[')) flush();
    }
  }
  flush();

  if (!sections.length) return ['[Song]\n' + lyrics.trim()];
  const normalized = sections.map((section, index) => section.startsWith('[') ? section : `[Part ${index + 1}]\n${section}`);

  while (normalized.length > 30) {
    let smallestIndex = 0;
    let smallestSize = Number.POSITIVE_INFINITY;
    for (let i = 0; i < normalized.length - 1; i += 1) {
      const size = normalized[i].length + normalized[i + 1].length;
      if (size < smallestSize) {
        smallestSize = size;
        smallestIndex = i;
      }
    }
    normalized.splice(smallestIndex, 2, `${normalized[smallestIndex]}\n${normalized[smallestIndex + 1]}`);
  }
  return normalized;
}

function wordCount(value: string) {
  return value.replace(/^\[[^\]]+\]\s*/m, '').trim().split(/\s+/).filter(Boolean).length;
}

function allocateDurations(sections: string[], preferredMs: number) {
  const counts = sections.map((section) => Math.max(1, wordCount(section)));
  const relaxed = counts.map((count) => Math.max(6000, Math.min(120000, Math.round((count / 105) * 60_000 + 2500))));
  let baseline = relaxed.reduce((sum, value) => sum + value, 0);

  if (baseline > 600_000) {
    const fast = counts.map((count) => Math.max(4000, Math.min(120000, Math.round((count / 180) * 60_000 + 1500))));
    const fastTotal = fast.reduce((sum, value) => sum + value, 0);
    if (fastTotal > 600_000) return null;
    baseline = fastTotal;
    for (let i = 0; i < fast.length; i += 1) relaxed[i] = fast[i];
  }

  const minTotal = sections.length * 3000;
  const target = Math.min(600_000, Math.max(minTotal, preferredMs, baseline));
  const scale = target / baseline;
  const durations = relaxed.map((value) => Math.max(3000, Math.min(120000, Math.round(value * scale))));
  let total = durations.reduce((sum, value) => sum + value, 0);

  if (total > 600_000) {
    const over = total - 600_000;
    for (let i = durations.length - 1, left = over; i >= 0 && left > 0; i -= 1) {
      const reducible = Math.max(0, durations[i] - 3000);
      const cut = Math.min(reducible, left);
      durations[i] -= cut;
      left -= cut;
    }
    total = durations.reduce((sum, value) => sum + value, 0);
  }
  return total <= 600_000 ? durations : null;
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, 'lyrics-song-generation', 4, 60_000);
  if (limited) return limited;

  try {
    const userId = await resolvePieUserId();
    if (!userId) return NextResponse.json({ error: 'Sign in to generate a song from lyrics.' }, { status: 401 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Music generation is temporarily unavailable.' }, { status: 503 });

    const body = await readJsonObject(request, 64_000);
    const lyrics = textField(body.lyrics, 24_000).trim();
    const prompt = textField(body.prompt, 3_200).trim();
    const vocalRange = textField(body.vocalRange, 40, 'unspecified');
    const freedomRaw = textField(body.creativeFreedom, 20, 'exact');
    const creativeFreedom = (FREEDOM_LEVELS.has(freedomRaw) ? freedomRaw : 'exact') as LyricsFreedom;
    const preferredMsRaw = Number(body.preferred_length_ms || 180000);
    const preferredMs = Number.isFinite(preferredMsRaw) ? Math.max(3000, Math.min(600000, Math.round(preferredMsRaw))) : 180000;
    const idempotencyKey = textField(body.idempotencyKey, 180);

    if (!lyrics) return NextResponse.json({ error: 'Paste or write the lyrics you want Pie to use.' }, { status: 400 });

    const lyricsUsed = await expandLyrics(lyrics, creativeFreedom, prompt, vocalRange);
    const sections = splitIntoSections(lyricsUsed);
    const durations = allocateDurations(sections, preferredMs);
    if (!durations) {
      return NextResponse.json({
        error: 'These lyrics are too long to sing clearly inside a single 10-minute Music v2 render. Pie will not drop your words. Split this into connected parts before generating.',
        code: 'LYRICS_EXCEED_SINGLE_RENDER',
      }, { status: 422 });
    }

    const totalDuration = durations.reduce((sum, value) => sum + value, 0);
    const stylePrompt = `${prompt || 'Create a polished original contemporary song whose production serves the emotional meaning of the supplied lyrics.'}\nLead vocal should sit comfortably in a ${vocalRange} range. Focus this plan on genre, instrumentation, groove, dynamics, vocal character, and arrangement. Lyrics will be supplied separately and must be followed closely.`.slice(0, 4000);

    const planResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/plan`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: stylePrompt, music_length_ms: totalDuration, model_id: 'music_v2' }),
      cache: 'no-store',
    });
    const basePlan = await planResponse.json().catch(() => ({})) as MusicV2Plan;
    if (!planResponse.ok || !basePlan.chunks?.length) {
      return NextResponse.json({ error: 'Pie could not plan the music around these lyrics.' }, { status: planResponse.status >= 500 ? 502 : 400 });
    }

    const baseChunks = basePlan.chunks;
    const compositionPlan = {
      chunks: sections.map((text, index) => {
        const source = baseChunks[Math.min(index, baseChunks.length - 1)] || baseChunks[0];
        const exactStyle = creativeFreedom === 'exact' ? ['sing only the supplied lyric words', 'do not add lyrical words'] : ['preserve supplied lyric lines clearly'];
        return {
          text: text.slice(0, 12_000),
          duration_ms: durations[index],
          positive_styles: Array.from(new Set([
            ...(source.positive_styles || []).map(String),
            `${vocalRange} lead vocal`,
            'clear intelligible lyrics',
            ...exactStyle,
          ])).slice(0, 50),
          negative_styles: Array.from(new Set([
            ...(source.negative_styles || []).map(String),
            'instrumental only',
            'unintelligible vocals',
            'spoken narration',
          ])).slice(0, 50),
          context_adherence: 'high' as const,
        };
      }),
    };

    const job = await enqueuePieJob({
      userId,
      type: 'song_generation',
      provider: 'elevenlabs',
      idempotencyKey: idempotencyKey || undefined,
      maxAttempts: 3,
      payload: {
        composition_plan: compositionPlan,
        music_length_ms: totalDuration,
        force_instrumental: false,
        lyric_mode: true,
        lyric_creative_freedom: creativeFreedom,
      },
    });

    if (job.status === 'queued' || job.status === 'retrying') {
      after(async () => {
        try { await processSpecificSongJob(job.id); }
        catch (error) { console.error('background lyrics song worker', error); }
      });
    }

    return NextResponse.json({
      job: {
        id: job.id,
        status: job.status,
        attemptCount: job.attempt_count,
        maxAttempts: job.max_attempts,
        createdAt: job.created_at,
      },
      lyricsUsed,
      creativeFreedom,
      plannedDurationMs: totalDuration,
    }, { status: 202, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('queue lyrics song generation', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not queue song generation from these lyrics.') }, { status: 503 });
  }
}
