import { NextResponse } from 'next/server';
import { rateLimit, readJsonObject, safeClientError } from '../../../security';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const MAX_PROMPT_CHARS = 4100;

type ProviderError = {
  detail?: {
    status?: string;
    message?: string;
    data?: {
      prompt_suggestion?: string;
    };
  };
  error?: string;
  message?: string;
};

async function parseProviderError(response: Response): Promise<ProviderError> {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ProviderError;
  } catch {
    return { message: raw.slice(0, 500) };
  }
}

async function requestMusic(apiKey: string, body: Record<string, unknown>) {
  return fetch(`${ELEVENLABS_BASE}/v1/music`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({ ...body, model_id: 'music_v2' }),
    cache: 'no-store',
  });
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-generate', 6, 60_000);
  if (limited) return limited;

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Music generation is temporarily unavailable.' }, { status: 503 });
    }

    const body = await readJsonObject(req, 64_000);
    delete body.model_id;
    delete body.modelId;

    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (prompt.length > MAX_PROMPT_CHARS) {
      return NextResponse.json(
        {
          error: `The song description and attached lyrics are too long for ElevenLabs Music v2 (${prompt.length.toLocaleString()} characters). The maximum is ${MAX_PROMPT_CHARS.toLocaleString()}. Shorten the description or lyrics, then try again.`,
          detail: { status: 'prompt_too_long' },
        },
        { status: 400 },
      );
    }

    let response = await requestMusic(apiKey, body);

    if (!response.ok) {
      const providerError = await parseProviderError(response);
      const status = providerError.detail?.status || '';
      const suggestion = providerError.detail?.data?.prompt_suggestion?.trim();

      // ElevenLabs returns a compliant prompt suggestion for some bad_prompt
      // rejections (for example, copyrighted artist/style references). Retry once
      // with that provider-approved suggestion instead of making the user rewrite it.
      if (status === 'bad_prompt' && suggestion && suggestion.length <= MAX_PROMPT_CHARS) {
        response = await requestMusic(apiKey, { ...body, prompt: suggestion });
        if (response.ok) {
          const audio = await response.arrayBuffer();
          if (!audio.byteLength || audio.byteLength > 80 * 1024 * 1024) {
            return NextResponse.json({ error: 'Music generation returned an invalid audio file.' }, { status: 502 });
          }
          return new NextResponse(audio, {
            status: 200,
            headers: {
              'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
              'X-AI-Songs-Prompt-Adjusted': '1',
            },
          });
        }

        const retryError = await parseProviderError(response);
        const retryMessage = retryError.detail?.message || retryError.message || retryError.error;
        console.error('ElevenLabs generation retry failed', response.status, retryError.detail?.status || 'unknown');
        return NextResponse.json(
          {
            error: retryMessage || 'ElevenLabs rejected the adjusted music request.',
            detail: {
              status: retryError.detail?.status || 'provider_rejected',
              data: retryError.detail?.data,
            },
          },
          { status: response.status >= 500 ? 502 : 400 },
        );
      }

      const providerMessage = providerError.detail?.message || providerError.message || providerError.error;
      console.error('ElevenLabs generation failed', response.status, status || 'unknown');
      return NextResponse.json(
        {
          error: providerMessage || 'Music generation provider rejected the request.',
          detail: {
            status: status || 'provider_rejected',
            data: providerError.detail?.data,
          },
        },
        { status: response.status >= 500 ? 502 : 400 },
      );
    }

    const audio = await response.arrayBuffer();
    if (!audio.byteLength || audio.byteLength > 80 * 1024 * 1024) {
      return NextResponse.json({ error: 'Music generation returned an invalid audio file.' }, { status: 502 });
    }

    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('ElevenLabs generation request failed');
    return NextResponse.json({ error: safeClientError(error, 'Music generation request failed.') }, { status: 400 });
  }
}
