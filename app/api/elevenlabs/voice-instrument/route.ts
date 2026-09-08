import { NextResponse } from 'next/server';
import { FREE_LIMITS } from '../../../billingConfig';
import { boundedNumber, rateLimit, readResponseBytesLimited, safeClientError, textField, validateAudioFile } from '../../../security';
import { consumeUsage, resolvePieUserId, usageDeniedMessage } from '../../../usageEntitlements';

export const maxDuration = 120;

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const INSTRUMENTS = new Set(['bass', 'drums', 'guitar', 'keys', 'strings', 'synth', 'percussion']);

type MusicV2Chunk = {
  text?: string;
  duration_ms?: number;
  positive_styles?: string[];
  negative_styles?: string[];
  context_adherence?: 'low' | 'medium' | 'high';
  conditioning_ref?: { song_id: string; range: { start_ms: number; end_ms: number } };
  condition_strength?: 'low' | 'medium' | 'high' | 'xhigh';
  [key: string]: unknown;
};

function instrumentLabel(value: string) {
  return value === 'keys' ? 'piano or keyboard' : value;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'voice-instrument', 6, 60_000);
  if (limited) return limited;

  try {
    const userId = await resolvePieUserId();
    if (!userId) return NextResponse.json({ error: 'Sign in to turn vocal sketches into instruments.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Voice-to-Instruments is temporarily unavailable.' }, { status: 503 });

    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 34 * 1024 * 1024) return NextResponse.json({ error: 'Sketch upload is too large.' }, { status: 413 });

    const form = await req.formData();
    const file = form.get('file');
    const mode = textField(form.get('mode'), 32) || 'instrument';
    const target = (textField(form.get('instrument'), 40) || 'bass').toLowerCase();
    const direction = textField(form.get('direction'), 1200);
    const musicLengthMs = boundedNumber(form.get('music_length_ms') ?? 30000, 3000, 210000, 30000);
    const referenceDurationMs = boundedNumber(form.get('reference_duration_ms') ?? 30000, 250, 30000, 30000);

    if (!(file instanceof File)) return NextResponse.json({ error: 'Record or upload a vocal sketch first.' }, { status: 400 });
    validateAudioFile(file, 30 * 1024 * 1024);
    if (mode !== 'instrument' && mode !== 'song') return NextResponse.json({ error: 'Unknown Voice-to-Instruments mode.' }, { status: 400 });
    if (mode === 'instrument' && !INSTRUMENTS.has(target)) return NextResponse.json({ error: 'Choose a supported instrument.' }, { status: 400 });

    const entitlement = await consumeUsage('elevenlabs_reference_generations', FREE_LIMITS.musicGenerationsPerMonth);
    if (!entitlement.allowed) {
      return NextResponse.json({
        error: usageDeniedMessage('Voice-to-Instruments generations', entitlement),
        code: 'PIE_USAGE_LIMIT',
        usage: { count: entitlement.usageCount, limit: entitlement.usageLimit },
      }, { status: entitlement.userId ? 402 : 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const safeName = (file.name || 'voice-sketch').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const uploadForm = new FormData();
    uploadForm.append('file', file, safeName || 'voice-sketch');
    const uploadResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/upload`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: uploadForm,
      cache: 'no-store',
    });
    const uploadData = await uploadResponse.json().catch(() => ({})) as { song_id?: string };
    if (!uploadResponse.ok || !uploadData.song_id || uploadData.song_id.length > 200) {
      console.error('Voice instrument reference upload failed', uploadResponse.status);
      return NextResponse.json({ error: 'The music provider rejected that sketch.' }, { status: uploadResponse.status >= 500 ? 502 : 400 });
    }

    const prompt = mode === 'instrument'
      ? `Turn a human mouth/voice performance into an isolated studio-quality ${instrumentLabel(target)} performance. The uploaded recording is a performance sketch: preserve its recognizable rhythm, attack pattern, rests, groove, phrasing, and melodic contour as closely as the model allows, but replace the human vocal timbre with a convincing ${instrumentLabel(target)} sound. Use ONLY the target instrument. No singing, spoken voice, beatboxing voice, extra instruments, audience, or count-in.${direction ? ` Creative direction: ${direction}` : ''}`
      : `Build a polished original instrumental song from the uploaded rough arrangement made from AI-rendered instrument sketches. Preserve the recognizable core bass movement, drum groove, guitar/keys phrasing, rhythmic relationships, and overall arrangement suggested by the reference while developing it into a cohesive finished production. No lead vocals. Do not add spoken words or mouth sounds.${direction ? ` Production direction: ${direction}` : ''}`;

    const planResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/plan`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, music_length_ms: musicLengthMs, model_id: 'music_v2' }),
      cache: 'no-store',
    });
    const compositionPlan = await planResponse.json().catch(() => ({})) as { chunks?: MusicV2Chunk[] };
    if (!planResponse.ok || !compositionPlan.chunks?.length || compositionPlan.chunks.length > 100) {
      console.error('Voice instrument plan failed', planResponse.status);
      return NextResponse.json({ error: 'Could not plan the instrument conversion.' }, { status: planResponse.status >= 500 ? 502 : 400 });
    }

    for (const chunk of compositionPlan.chunks) {
      if (chunk.text && chunk.text.length > 12_000) chunk.text = chunk.text.slice(0, 12_000);
      chunk.positive_styles = Array.from(new Set([...(chunk.positive_styles || []), 'instrumental', 'no lead vocals'])).slice(0, 40);
      chunk.negative_styles = Array.from(new Set([...(chunk.negative_styles || []), 'singing', 'spoken vocals', 'mouth sounds', 'beatboxing voice'])).slice(0, 40);
    }
    compositionPlan.chunks[0].conditioning_ref = { song_id: uploadData.song_id, range: { start_ms: 0, end_ms: referenceDurationMs } };
    compositionPlan.chunks[0].condition_strength = 'xhigh';

    const composeResponse = await fetch(`${ELEVENLABS_BASE}/v1/music`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ model_id: 'music_v2', composition_plan: compositionPlan }),
      cache: 'no-store',
    });
    if (!composeResponse.ok) {
      console.error('Voice instrument generation failed', composeResponse.status);
      return NextResponse.json({ error: 'The music provider could not render this sketch.' }, { status: composeResponse.status >= 500 ? 502 : 400 });
    }

    const audio = await readResponseBytesLimited(composeResponse, 80 * 1024 * 1024);
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': composeResponse.headers.get('content-type') || 'audio/mpeg',
        'Content-Length': String(audio.byteLength),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('Voice-to-Instruments request failed');
    return NextResponse.json({ error: safeClientError(error, 'Voice-to-Instruments failed.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
