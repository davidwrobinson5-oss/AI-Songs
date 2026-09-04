import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

function fallbackScore(prompt: string, lyrics: string) {
  const words = lyrics.toLowerCase().match(/[a-z0-9']+/g) || [];
  const unique = new Set(words);
  const lexical = words.length ? unique.size / words.length : 0.5;
  const sections = (lyrics.match(/^\s*\[[^\]]+\]/gm) || []).length;
  const hook = /\[(chorus|hook)\]/i.test(lyrics);
  const score = Math.max(0, Math.min(100, Math.round(58 + lexical * 22 + Math.min(10, sections) + (hook ? 7 : 0) + (prompt.trim() ? 3 : 0))));
  return {
    score,
    label: score >= 88 ? 'Release-Ready Signals' : score >= 78 ? 'Strong Song' : score >= 68 ? 'Promising Draft' : 'Needs Another Pass',
    summary: 'This provisional score uses structural and lyric signals because the deeper AI evaluator was unavailable.',
    dimensions: [
      { name: 'Structure', score: Math.min(100, 58 + sections * 6), detail: `${sections} labeled song sections detected.` },
      { name: 'Hook Readiness', score: hook ? 82 : 58, detail: hook ? 'A chorus or hook section is present.' : 'No explicit chorus/hook section was detected.' },
      { name: 'Lyric Distinctiveness', score: Math.round(60 + lexical * 30), detail: `${Math.round(lexical * 100)}% unique-word ratio.` },
      { name: 'Concept Clarity', score: prompt.trim() ? 78 : 58, detail: prompt.trim() ? 'A song direction is attached.' : 'No song direction is attached.' },
    ],
    nextMoves: ['Strengthen the title/hook so it can be remembered after one listen.', 'Make Verse 2 add new information rather than repeat Verse 1.', 'Check every important line for natural speech stress and singability.'],
  };
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'song-score', 12, 60_000);
  if (limited) return limited;
  try {
    const body = await readJsonObject(req, 48_000);
    const title = textField(body.title, 220, 'Untitled Song');
    const lyrics = textField(body.lyrics, 24_000);
    const prompt = textField(body.prompt, 6_000);
    const vocalRange = textField(body.vocalRange, 60, 'unspecified');

    if (!process.env.OPENAI_API_KEY) return NextResponse.json(fallbackScore(prompt, lyrics), { headers: { 'Cache-Control': 'no-store' } });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        { role: 'system', content: 'You are Pie Song Intelligence, a strict but useful professional songwriting evaluator. Score the supplied song as a commercial song draft, not the performer. Return valid JSON only with keys: score (0-100 integer), label (short string), summary (2 sentences max), dimensions (array of exactly 8 objects with name, score 0-100, detail), nextMoves (array of exactly 3 concise strings). Dimension names must be Hook, Structure, Emotional Arc, Lyrics, Melody Readiness, Singability, Memorability, Release Readiness. Do not claim audio qualities you cannot inspect; for Melody Readiness and Singability, score only from available lyric/prosody/vocal-range evidence and say so.' },
        { role: 'user', content: `Title: ${title}\nVocal range: ${vocalRange}\nSong direction: ${prompt || 'None provided'}\n\nLyrics:\n${lyrics || 'No lyrics provided yet.'}` },
      ],
      max_output_tokens: 1800,
    });

    const raw = response.output_text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    try {
      const parsed = JSON.parse(raw);
      return NextResponse.json(parsed, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
      return NextResponse.json(fallbackScore(prompt, lyrics), { headers: { 'Cache-Control': 'no-store' } });
    }
  } catch (error) {
    return NextResponse.json({ error: safeClientError(error, 'Song scoring failed.') }, { status: 400 });
  }
}
