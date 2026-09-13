import { createProviderFetch } from '../../../providerFetch';
const providerFetch = createProviderFetch('elevenlabs/generate');
import { NextResponse } from 'next/server';
import { FREE_LIMITS, musicUsageUnitsForDurationMs } from '../../../billingConfig';
import { boundedNumber, rateLimit, readJsonObject, safeClientError } from '../../../security';
import { consumeUsage, resolvePieUserId, usageDeniedMessage } from '../../../usageEntitlements';

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
  return providerFetch(`${ELEVENLABS_BASE}/v1/music`, {
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
    const userId = await resolvePieUserId();
    if (!userId) return NextResponse.json({ error: 'Sign in to generate music.' }, { status: 401 });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Music generation is temporarily unavailable.' }, { status: 503 });
    }

    const body = await readJsonObject(req, 64_000);
    delete body.model_id;
    delete body.modelId;
    const musicLengthMs = boundedNumber(body.music_length_ms ?? 30000, 3000, 600000, 30000);
    body.music_length_ms = musicLengthMs;

    const prompt = typeof body.prompt === 'string' ? body.prompt : '';
    if (prompt.length > MAX_PROMPT_CHARS) {
      return NextResponse.json(
        {
          error: `The song description and attached lyrics are too long for Music Generator (${prompt.length.toLocaleString()} characters). The maximum is ${MAX_PROMPT_CHARS.toLocaleString()}. Shorten the description or lyrics, then try again.`,
          detail: { status: 'prompt_too_long' },
        },
        { status: 400 },
      );
    }

    const entitlement = await consumeUsage(
      'elevenlabs_music_generations',
      FREE_LIMITS.musicGenerationsPerMonth,
      musicUsageUnitsForDurationMs(musicLengthMs),
    );
    if (!entitlement.allowed) {
      return NextResponse.json({
        error: usageDeniedMessage('music generations', entitlement),
        code: 'PIE_USAGE_LIMIT',
        usage: { count: entitlement.usageCount, limit: entitlement.usageLimit },
      }, { status: entitlement.userId ? 402 : 401, headers: { 'Cache-Control': 'no-store' } });
    }

    let response = await requestMusic(apiKey, body);

    if (!response.ok) {
      const providerError = await parseProviderError(response);
      const status = providerError.detail?.status || '';
      const suggestion = providerError.detail?.data?.prompt_suggestion?.trim();

      if (status === 'bad_prompt' && suggestion && suggestion.length <= MAX_PROMPT_CHARS) {
        return NextResponse.json(
          {
            error: providerError.detail?.message || 'Music Engine rejected this prompt. Review the suggested wording before trying again.',
            detail: {
              status,
              promptSuggestion: suggestion,
            },
          },
          { status: 400 },
        );
      }

      const providerMessage = providerError.detail?.message || providerError.message || providerError.error;
      console.error('Music Engine generation failed', response.status, status || 'unknown');
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
    console.error('Music Engine generation request failed');
    return NextResponse.json({ error: safeClientError(error, 'Music generation request failed.') }, { status: 400 });
  }
}
