import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'lyrics', 10, 60_000);
  if (limited) return limited;

  try {
    const body = await readJsonObject(req, 40_000);
    const prompt = textField(body.prompt, 5_000);
    const vocalRange = textField(body.vocalRange, 40, 'unspecified');
    const lyrics = textField(body.lyrics, 24_000);
    const action = textField(body.action, 20, 'generate');
    if (!['generate', 'rewrite'].includes(action)) {
      return NextResponse.json({ error: 'Invalid lyric action.' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Lyrics generation is temporarily unavailable.' }, { status: 503 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = action === 'rewrite'
      ? 'You are an expert songwriting editor. Rewrite the supplied lyrics while preserving the core meaning. Improve singability, natural word stress, internal rhyme, multisyllabic rhyme where appropriate, memorable hooks, and emotional clarity. Keep section labels such as [Verse 1], [Chorus], [Bridge]. Do not imitate living artists exactly. Return only the revised lyrics.'
      : 'You are an expert songwriting engine for a mobile AI music studio. Write complete original song lyrics with clear section labels. Prioritize memorable hooks, natural singability, strong but not forced rhyme, emotional coherence, varied imagery, and breathing room for a lead singer. Do not imitate living artists exactly. Return only the lyrics.';

    const user = action === 'rewrite'
      ? `Lead vocal range: ${vocalRange}\nSong direction: ${prompt || 'Preserve the current concept.'}\n\nLyrics to improve:\n${lyrics}`
      : `Lead vocal range: ${vocalRange}\nSong request: ${prompt || 'Write an original compelling song.'}\n\nDefault structure: [Intro] [Verse 1] [Chorus] [Verse 2] [Chorus] [Bridge] [Final Chorus]. Adjust if the song concept calls for something better.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_output_tokens: 4000,
    });

    return NextResponse.json({ text: response.output_text.slice(0, 32_000) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Lyrics generation failed');
    return NextResponse.json({ error: safeClientError(error, 'Lyrics generation failed.') }, { status: 400 });
  }
}
