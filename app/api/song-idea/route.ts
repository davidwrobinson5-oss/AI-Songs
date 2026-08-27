import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { mode, vocalRange, prompt } = await req.json();
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured yet.' }, { status: 503 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        {
          role: 'system',
          content: 'You are the songwriting engine for a mobile AI music studio. Return a concise creative direction with title ideas, structure, lyrical theme, melody guidance, and production notes. Do not imitate living artists exactly.',
        },
        {
          role: 'user',
          content: `Starting mode: ${mode}\nLead vocal range: ${vocalRange}\nSong request: ${prompt || 'Create an original compelling song direction.'}`,
        },
      ],
    });

    return NextResponse.json({ text: response.output_text });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Song generation failed.' }, { status: 500 });
  }
}
