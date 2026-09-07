import { NextResponse } from 'next/server';
import { FREE_LIMITS } from '../../../billingConfig';
import { boundedNumber, rateLimit, readResponseBytesLimited, safeClientError, textField, validateAudioFile } from '../../../security';
import { consumeUsage, resolvePieUserId, usageDeniedMessage } from '../../../usageEntitlements';
import { costAudioError, verifiedAudioDurationMs } from '../../../audioDuration';
import { elevenMusicReserveCents, protectedCostDeniedMessage, releaseExternalCost, reserveExternalCost, settleExternalCost } from '../../../externalCostGuard';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';
const STRENGTHS = new Set(['medium', 'high', 'xhigh']);
const MAX_REMIX_SOURCE_MS = 10 * 60 * 1000;
type ConditionStrength = 'medium' | 'high' | 'xhigh';

type RemixChunk = {
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles: string[];
  context_adherence: 'high';
  conditioning_ref: { song_id: string; range: { start_ms: number; end_ms: number } };
  condition_strength: ConditionStrength;
};

function styleTokens(style: string) {
  const tokens = style.split(/[;,]/g).map((value) => value.trim()).filter(Boolean).slice(0, 20).map((value) => value.slice(0, 120));
  return Array.from(new Set([...tokens, 'instrumental remix', 'same overall pacing', 'section-aware arrangement', 'no lead vocals'])).slice(0, 40);
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-remix', 2, 2 * 60_000);
  if (limited) return limited;

  let generationReservationId = '';
  try {
    const userId = await resolvePieUserId();
    if (!userId) return NextResponse.json({ error: 'Sign in to create a remix.' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'AI remixing is temporarily unavailable.' }, { status: 503 });

    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 34 * 1024 * 1024) return NextResponse.json({ error: 'Remix source is too large.' }, { status: 413 });

    const form = await req.formData();
    const file = form.get('file');
    const style = textField(form.get('style'), 1_500);
    const durationMs = boundedNumber(form.get('duration_ms') ?? 30000, 3000, 300000, 30000);
    const requestedStrength = textField(form.get('condition_strength'), 16, 'high');
    const conditionStrength = (STRENGTHS.has(requestedStrength) ? requestedStrength : 'high') as ConditionStrength;

    if (!(file instanceof File)) return NextResponse.json({ error: 'A song or backing track is required.' }, { status: 400 });
    validateAudioFile(file, 30 * 1024 * 1024);
    if (!style) return NextResponse.json({ error: 'Choose or describe a remix style.' }, { status: 400 });

    let sourceDurationMs: number;
    try { sourceDurationMs = await verifiedAudioDurationMs(file); }
    catch (error) { return NextResponse.json({ error: costAudioError(error) }, { status: 400, headers: { 'Cache-Control': 'no-store' } }); }
    if (sourceDurationMs > MAX_REMIX_SOURCE_MS) return NextResponse.json({ error: 'Remix source audio must be 10 minutes or less.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });

    const entitlement = await consumeUsage('elevenlabs_music_remixes', FREE_LIMITS.musicGenerationsPerMonth);
    if (!entitlement.allowed) {
      return NextResponse.json({ error: usageDeniedMessage('remixes', entitlement), code: 'PIE_USAGE_LIMIT', usage: { count: entitlement.usageCount, limit: entitlement.usageLimit } }, { status: entitlement.userId ? 402 : 401, headers: { 'Cache-Control': 'no-store' } });
    }

    const uploadReserveCents = elevenMusicReserveCents(sourceDurationMs);
    const generationReserveCents = elevenMusicReserveCents(durationMs);
    const uploadReservation = await reserveExternalCost('elevenlabs_music_remix_upload', 'elevenlabs', 'music_v2_upload', uploadReserveCents);
    if (!uploadReservation.allowed) return NextResponse.json({ error: protectedCostDeniedMessage(), code: 'PIE_COST_LIMIT', remainingCostCents: uploadReservation.remainingCents }, { status: 402, headers: { 'Cache-Control': 'no-store' } });

    const generationReservation = await reserveExternalCost('elevenlabs_music_remix_generation', 'elevenlabs', 'music_v2', generationReserveCents);
    if (!generationReservation.allowed) {
      await releaseExternalCost(uploadReservation.reservationId).catch(() => undefined);
      return NextResponse.json({ error: protectedCostDeniedMessage(), code: 'PIE_COST_LIMIT', remainingCostCents: generationReservation.remainingCents }, { status: 402, headers: { 'Cache-Control': 'no-store' } });
    }
    generationReservationId = generationReservation.reservationId;

    const safeName = (file.name || 'remix-source').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const uploadForm = new FormData();
    uploadForm.append('file', file, safeName || 'remix-source');
    let uploadResponse: Response;
    try {
      uploadResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/upload`, { method: 'POST', headers: { 'xi-api-key': apiKey }, body: uploadForm, cache: 'no-store' });
    } finally {
      await settleExternalCost(uploadReservation.reservationId, uploadReserveCents).catch(() => undefined);
    }

    const uploadData = await uploadResponse.json().catch(() => ({})) as { song_id?: string };
    if (!uploadResponse.ok || !uploadData.song_id || uploadData.song_id.length > 200) {
      await releaseExternalCost(generationReservation.reservationId).catch(() => undefined);
      generationReservationId = '';
      console.error('Remix upload failed', uploadResponse.status);
      return NextResponse.json({ error: 'The music provider rejected this remix source.' }, { status: uploadResponse.status >= 500 ? 502 : 400 });
    }

    const chunkCount = Math.max(1, Math.ceil(durationMs / 30000));
    const styles = styleTokens(style);
    const chunks: RemixChunk[] = [];
    let cursor = 0;
    for (let index = 0; index < chunkCount; index++) {
      const remaining = durationMs - cursor;
      const remainingChunks = chunkCount - index;
      const chunkDuration = Math.max(3000, Math.round(remaining / remainingChunks));
      const end = index === chunkCount - 1 ? durationMs : Math.min(durationMs, cursor + chunkDuration);
      const actualDuration = Math.max(3000, end - cursor);
      const referenceStart = Math.min(cursor, Math.max(0, sourceDurationMs - 50));
      const referenceEnd = Math.min(sourceDurationMs, referenceStart + Math.min(30000, actualDuration));
      chunks.push({
        text: `[Remix section ${index + 1}]\nRe-produce this section as an original instrumental arrangement in this direction: ${style}. Preserve the section's pacing, groove landmarks, and musical function so an existing lead vocal can still sit over the new production. Do not add lead vocals.`,
        duration_ms: actualDuration,
        positive_styles: styles,
        negative_styles: ['lead vocals', 'singing', 'spoken vocals', 'tempo drift', 'unrelated song structure'],
        context_adherence: 'high',
        conditioning_ref: { song_id: uploadData.song_id, range: { start_ms: referenceStart, end_ms: Math.max(referenceStart + 50, referenceEnd) } },
        condition_strength: conditionStrength,
      });
      cursor = end;
    }

    let composeResponse: Response;
    try {
      composeResponse = await fetch(`${ELEVENLABS_BASE}/v1/music`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ model_id: 'music_v2', composition_plan: { chunks } }),
        cache: 'no-store',
      });
    } finally {
      await settleExternalCost(generationReservation.reservationId, generationReserveCents).catch(() => undefined);
      generationReservationId = '';
    }

    if (!composeResponse.ok) {
      const detail = (await composeResponse.text().catch(() => '')).slice(0, 800);
      console.error('Remix compose failed', composeResponse.status, detail);
      return NextResponse.json({ error: 'The music provider could not create this remix.' }, { status: composeResponse.status >= 500 ? 502 : 400 });
    }

    const audio = await readResponseBytesLimited(composeResponse, 80 * 1024 * 1024);
    return new NextResponse(audio, { status: 200, headers: { 'Content-Type': composeResponse.headers.get('content-type') || 'audio/mpeg', 'Content-Length': String(audio.byteLength), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
  } catch (error) {
    if (generationReservationId) await releaseExternalCost(generationReservationId).catch(() => undefined);
    console.error('AI remix request failed');
    return NextResponse.json({ error: safeClientError(error, 'Could not create the remix.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
}
