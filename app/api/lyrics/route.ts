import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { prompt, vocalRange, lyrics, action = 'generate' } = await req.json();
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured yet.' }, { status: 503 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const system = action === 'rewrite'
      ? 'You are an expert songwriting editor. Rewrite the supplied lyrics while preserving the core meaning. Improve singability, natural word stress, internal rhyme, multisyllabic rhyme where appropriate, memorable hooks, and emotional clarity. Keep section labels such as [Verse 1], [Chorus], [Bridge]. Do not imitate living artists exactly. Return only the revised lyrics.'
      : 'You are an expert songwriting engine for a mobile AI music studio. Write complete original song lyrics with clear section labels. Prioritize memorable hooks, natural singability, strong but not forced rhyme, emotional coherence, varied imagery, and breathing room for a lead singer. Do not imitate living artists exactly. Return only the lyrics.';

    const user = action === 'rewrite'
      ? `Lead vocal range: ${vocalRange}\nSong direction: ${prompt || 'Preserve the current concept.'}\n\nLyrics to improve:\n${lyrics || ''}`
      : `Lead vocal range: ${vocalRange}\nSong request: ${prompt || 'Write an original compelling song.'}\n\nDefault structure: [Intro] [Verse 1] [Chorus] [Verse 2] [Chorus] [Bridge] [Final Chorus]. Adjust if the song concept calls for something better.`;

    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });

    return NextResponse.json({ text: response.output_text });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Lyrics generation failed.' }, { status: 500 });
  }
}
