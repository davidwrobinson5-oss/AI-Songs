import { NextResponse } from 'next/server';
import { boundedNumber, rateLimit, readResponseBytesLimited, safeClientError, textField, validateAudioFile } from '../../../security';

const ELEVENLABS_BASE = 'https://api.elevenlabs.io';

type MusicV2Chunk = {
  text?: string;
  duration_ms?: number;
  positive_styles?: string[];
  negative_styles?: string[];
  context_adherence?: 'low' | 'medium' | 'high';
  conditioning_ref?: {
    song_id: string;
    range: { start_ms: number; end_ms: number };
  };
  condition_strength?: 'low' | 'medium' | 'high' | 'xhigh';
  [key: string]: unknown;
};

export async function POST(req: Request) {
  const limited = rateLimit(req, 'elevenlabs-generate-reference', 4, 60_000);
  if (limited) return limited;

  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'Reference-based generation is temporarily unavailable.' }, { status: 503 });

    const declared = Number(req.headers.get('content-length') || 0);
    if (declared && declared > 34 * 1024 * 1024) {
      return NextResponse.json({ error: 'Reference upload is too large.' }, { status: 413 });
    }

    const form = await req.formData();
    const file = form.get('file');
    const prompt = textField(form.get('prompt'), 8_000);
    const musicLengthMs = boundedNumber(form.get('music_length_ms') ?? 30000, 3000, 600000, 30000);
    const referenceDurationMs = boundedNumber(form.get('reference_duration_ms') ?? 30000, 50, 30000, 30000);
    const forceInstrumental = String(form.get('force_instrumental') || 'true') === 'true';

    if (!(file instanceof File)) return NextResponse.json({ error: 'Reference audio file is required.' }, { status: 400 });
    validateAudioFile(file, 30 * 1024 * 1024);
    if (!prompt) return NextResponse.json({ error: 'Describe the music you want to build from the reference.' }, { status: 400 });

    const safeName = (file.name || 'reference-audio').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const uploadForm = new FormData();
    uploadForm.append('file', file, safeName || 'reference-audio');
    const uploadResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/upload`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: uploadForm,
      cache: 'no-store',
    });

    const uploadData = await uploadResponse.json().catch(() => ({})) as { song_id?: string };
    if (!uploadResponse.ok || !uploadData.song_id || uploadData.song_id.length > 200) {
      console.error('Reference upload failed', uploadResponse.status);
      return NextResponse.json({ error: 'Reference audio provider rejected the upload.' }, { status: uploadResponse.status >= 500 ? 502 : 400 });
    }

    const planPrompt = forceInstrumental
      ? `${prompt}\n\nCreate an original instrumental composition with no lead vocals. Use the uploaded reference only for sound, production style, instrumentation, tempo, groove, and mood. Do not copy the composition.`
      : `${prompt}\n\nCreate an original composition. Use the uploaded reference only for sound, production style, instrumentation, tempo, groove, and mood. Do not copy the composition.`;

    const planResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/plan`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: planPrompt, music_length_ms: musicLengthMs, model_id: 'music_v2' }),
      cache: 'no-store',
    });

    const compositionPlan = await planResponse.json().catch(() => ({})) as { chunks?: MusicV2Chunk[] };
    if (!planResponse.ok || !compositionPlan.chunks?.length || compositionPlan.chunks.length > 100) {
      console.error('Reference plan failed', planResponse.status);
      return NextResponse.json({ error: 'Could not create a safe composition plan.' }, { status: planResponse.status >= 500 ? 502 : 400 });
    }

    for (const chunk of compositionPlan.chunks) {
      if (chunk.text && chunk.text.length > 12_000) chunk.text = chunk.text.slice(0, 12_000);
      if (Array.isArray(chunk.positive_styles)) chunk.positive_styles = chunk.positive_styles.slice(0, 40).map((value) => String(value).slice(0, 160));
      if (Array.isArray(chunk.negative_styles)) chunk.negative_styles = chunk.negative_styles.slice(0, 40).map((value) => String(value).slice(0, 160));
    }

    const firstChunk = compositionPlan.chunks[0];
    firstChunk.conditioning_ref = {
      song_id: uploadData.song_id,
      range: { start_ms: 0, end_ms: referenceDurationMs },
    };
    firstChunk.condition_strength = 'high';

    if (forceInstrumental) {
      for (const chunk of compositionPlan.chunks) {
        chunk.positive_styles = Array.from(new Set([...(chunk.positive_styles || []), 'instrumental', 'no lead vocals']));
        chunk.negative_styles = Array.from(new Set([...(chunk.negative_styles || []), 'lead vocals', 'singing', 'spoken vocals']));
      }
    }

    const composeResponse = await fetch(`${ELEVENLABS_BASE}/v1/music`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ model_id: 'music_v2', composition_plan: compositionPlan }),
      cache: 'no-store',
    });

    if (!composeResponse.ok) {
      console.error('Reference-conditioned generation failed', composeResponse.status);
      return NextResponse.json({ error: 'Reference-based generation provider rejected the request.' }, { status: composeResponse.status >= 500 ? 502 : 400 });
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
    console.error('Reference-conditioned generation request failed');
    return NextResponse.json({ error: safeClientError(error, 'Reference-based music generation failed.') }, { status: 400 });
  }
}
