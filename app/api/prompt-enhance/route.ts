import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError, textField } from '../../security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FALLBACK_SUGGESTIONS = ['strong hook','dynamic arrangement','radio-ready production','wide stereo mix','memorable chorus','subtle ear candy'];

export async function POST(req: Request) {
  const limited = rateLimit(req, 'prompt-enhance', 12, 60_000);
  if (limited) return limited;
  try {
    const body = await readJsonObject(req, 24_000);
    const prompt = textField(body.prompt, 1400);
    const vocalRange = textField(body.vocalRange, 40, 'Baritone');
    const mode = textField(body.mode, 20, 'music');
    const instrumental = Boolean(body.instrumental);
    if (!prompt) return NextResponse.json({ error: 'Describe the song first.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: 'AI prompt enhancement is not configured yet.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [
        { role: 'system', content: 'You optimize prompts for an AI music generator. Return JSON only with enhancedPrompt and suggestions. Preserve user intent while making it musically specific and controllable. Prioritize genre/subgenre, mood, 1-4 defining instruments, groove/BPM, vocal character or instrumental focus, structure/dynamic arc, production texture, stereo/space, and hook character. Keep enhancedPrompt generally 35-85 words. Avoid contradictions and excessive adjective lists. Do not name or imitate a living artist; translate artist references into neutral musical characteristics. suggestions must be 4-8 short chip phrases that complement the enhanced prompt and avoid repeating phrases already present.' },
        { role: 'user', content: `Mode: ${mode}\nLead range: ${vocalRange}\nInstrumental: ${instrumental ? 'yes' : 'no'}\nCurrent description: ${prompt}` },
      ],
      text: { format: { type: 'json_schema', name: 'music_prompt_enhancement', strict: true, schema: { type: 'object', additionalProperties: false, properties: { enhancedPrompt: { type: 'string' }, suggestions: { type: 'array', minItems: 4, maxItems: 8, items: { type: 'string' } } }, required: ['enhancedPrompt','suggestions'] } } },
    });

    const parsed = JSON.parse(response.output_text || '{}');
    const enhancedPrompt = textField(parsed.enhancedPrompt, 1400);
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions.map((item: unknown) => textField(item, 80)).filter(Boolean).slice(0, 8) : FALLBACK_SUGGESTIONS;
    if (!enhancedPrompt) throw new Error('EMPTY_ENHANCEMENT');
    return NextResponse.json({ enhancedPrompt, suggestions }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('prompt enhance failed', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not enhance the song description.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
