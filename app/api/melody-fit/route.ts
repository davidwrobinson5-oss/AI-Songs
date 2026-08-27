import OpenAI from 'openai';
import { NextResponse } from 'next/server';

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Model did not return valid JSON.');
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'OPENAI_API_KEY is not configured yet.' }, { status: 503 });
    }

    const { prompt, vocalRange, lyrics, analysis } = await req.json();
    if (!analysis?.phrases?.length) {
      return NextResponse.json({ error: 'Melody phrase analysis is required.' }, { status: 400 });
    }

    const phraseSummary = analysis.phrases.map((phrase: { index: number; duration: number; noteCount: number; suggestedSyllables: number; notes: string[] }) => ({
      phrase: phrase.index,
      durationSeconds: Math.round(phrase.duration * 100) / 100,
      noteCount: phrase.noteCount,
      targetSyllables: phrase.suggestedSyllables,
      notes: phrase.notes,
    }));

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        {
          role: 'system',
          content: `You are the melody-fit lyric engine for a professional songwriting app. Fit lyrics to an analyzed lead melody while preserving meaning and musical naturalness. Score the final result from 0-100 using: rhythmic/syllable fit 35 points, word stress 25, meaning/theme 15, rhyme 15, singability/breathing 10. Rewrite lines as needed. Do not imitate a living artist exactly. Return ONLY valid JSON with keys: lyrics (string), score (number), notes (short string). Use section labels such as [Verse], [Chorus], [Bridge] when useful.`,
        },
        {
          role: 'user',
          content: `Song request: ${prompt || 'Create an original song'}\nLead vocal range: ${vocalRange || 'unspecified'}\nDetected melody range: ${analysis.lowestNote} to ${analysis.highestNote}\nMelody phrases: ${JSON.stringify(phraseSummary)}\nExisting lyrics, if any:\n${lyrics || '(none — write new lyrics that fit the melody)'}\n\nCreate lyrics whose phrase lengths and stressed syllables naturally fit the detected melody. If there are more lyrical sections than detected phrases, treat the detected phrases as the primary recurring melodic template.`,
        },
      ],
    });

    const parsed = parseJson(response.output_text);
    return NextResponse.json({
      lyrics: String(parsed.lyrics || ''),
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      notes: String(parsed.notes || ''),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Melody lyric fitting failed.' }, { status: 500 });
  }
}
