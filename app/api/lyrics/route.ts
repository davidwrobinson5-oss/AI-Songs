import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

export async function POST(req: Request) {
  const limited = rateLimit(req, 'lyrics', 14, 60_000);
  if (limited) return limited;

  try {
    const body = await readJsonObject(req, 60_000);
    const prompt = textField(body.prompt, 5_000);
    const vocalRange = textField(body.vocalRange, 40, 'unspecified');
    const lyrics = textField(body.lyrics, 24_000);
    const action = textField(body.action, 30, 'generate');
    const emotionalArc = textField(body.emotionalArc, 120);
    const word = textField(body.word, 500);
    const line = textField(body.line, 2_000);
    const brief = body.brief && typeof body.brief === 'object' ? body.brief as Record<string, unknown> : {};
    const briefText = Object.entries(brief)
      .map(([key, value]) => `${key}: ${typeof value === 'string' ? value : ''}`)
      .filter((entry) => !entry.endsWith(': '))
      .join('\n');

    const allowed = ['generate', 'rewrite', 'plan', 'hook', 'word-bank', 'line-polish', 'critique'];
    if (!allowed.includes(action)) {
      return NextResponse.json({ error: 'Invalid lyric action.' }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Lyrics generation is temporarily unavailable.' }, { status: 503 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const common = `Lead vocal range: ${vocalRange}\nSong direction: ${prompt || 'Original compelling pop song.'}\nEmotional arc: ${emotionalArc || 'Choose the strongest arc for the concept.'}\nCreative brief:\n${briefText || 'No brief supplied.'}`;

    let system = '';
    let user = '';

    if (action === 'generate') {
      system = 'You are a world-class songwriting coach and pop lyric editor. Create a complete original song using strong commercial songwriting craft without imitating any living artist. Prioritize a memorable title/hook, conversational language, concrete imagery, natural prosody, clean section contrast, singable vowels, emotional movement, and a chorus that is easy to remember after one listen. Use section labels. Verse 2 must add new information. The bridge must reveal a new truth, decision, cost, or perspective. Return only the finished lyrics.';
      user = `${common}\n\nDefault structure: [Intro] [Verse 1] [Pre-Chorus] [Chorus] [Verse 2] [Pre-Chorus] [Chorus] [Bridge] [Final Chorus] [Tag]. Adjust only when the concept clearly needs a better structure.`;
    } else if (action === 'rewrite') {
      system = 'You are a senior songwriting editor. Rewrite the supplied song while preserving its core meaning. Improve hook strength, section function, imagery, specificity, natural word stress, rhyme quality, internal rhyme where useful, conversational flow, emotional clarity, and singability. Remove clichés and filler. Keep section labels. Do not imitate living artists exactly. Return only the revised lyrics.';
      user = `${common}\n\nLyrics to improve:\n${lyrics}`;
    } else if (action === 'plan') {
      system = 'You are a songwriting professor building a practical pop-song outline. Create a section-by-section writing blueprint from the supplied brief. For each section give its job, what new information belongs there, emotional intensity, key image, likely title/hook placement, approximate line count, and one question the writer must answer. Keep it concise and usable.';
      user = common;
    } else if (action === 'hook') {
      system = 'You are a pop hook specialist. Generate 12 original title + hook ideas from the supplied creative brief. Favor short, conversational, emotionally loaded phrases that are easy to pronounce and remember. Mix direct titles, image-based titles, contrast, repetition, and twist phrases. For each, include the title, one chorus hook line, and why it sticks. Do not reference existing song titles unless unavoidable generic language.';
      user = common;
    } else if (action === 'word-bank') {
      system = 'You are a context-aware songwriter thesaurus and rhyme coach. For the supplied word, phrase, feeling, or idea, return a compact writing bank with: stronger verbs, concrete nouns, conversational alternatives, emotional shades, sensory images, perfect rhymes if natural, near/slant rhymes, internal-rhyme fragments, and singable open-vowel alternatives. Avoid random dictionary dumping; every suggestion should fit the song context.';
      user = `${common}\n\nTarget word/phrase/idea: ${word}`;
    } else if (action === 'line-polish') {
      system = 'You are a lyric line editor. Analyze one lyric line for meaning, cliché, imagery, natural speech, prosody, likely word stress, rhyme potential, syllable pressure, and singability. Then provide 8 stronger original alternatives ranging from plain/conversational to vivid/poetic, while preserving the intended meaning. Keep the answer compact.';
      user = `${common}\n\nLine to improve: ${line}`;
    } else {
      system = 'You are a strict but constructive song doctor. Score the supplied song from 1-10 for Hook, Structure, Emotional Arc, Originality, Imagery, Prosody/Singability, Rhyme/Sound, Verse Development, Chorus Payoff, and Memorability. Identify the three weakest spots, quote only short snippets when necessary, explain exactly why they underperform, and provide precise replacement strategies or lines. Finish with the single highest-impact revision to make next.';
      user = `${common}\n\nSong to critique:\n${lyrics}`;
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_output_tokens: action === 'generate' || action === 'rewrite' ? 4500 : 2500,
    });

    return NextResponse.json({ text: response.output_text.slice(0, 32_000) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Lyrics generation failed');
    return NextResponse.json({ error: safeClientError(error, 'Lyrics generation failed.') }, { status: 400 });
  }
}
