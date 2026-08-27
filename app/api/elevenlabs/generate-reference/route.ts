import { NextResponse } from 'next/server';

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
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'ELEVENLABS_API_KEY is not configured yet.' }, { status: 503 });
    }

    const form = await req.formData();
    const file = form.get('file');
    const prompt = String(form.get('prompt') || '').trim();
    const musicLengthMs = Math.max(3000, Math.min(600000, Number(form.get('music_length_ms') || 30000)));
    const referenceDurationMs = Math.max(50, Math.min(30000, Number(form.get('reference_duration_ms') || 30000)));
    const forceInstrumental = String(form.get('force_instrumental') || 'true') === 'true';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Reference audio file is required.' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Describe the music you want to build from the reference.' }, { status: 400 });
    }

    const uploadForm = new FormData();
    uploadForm.append('file', file, file.name || 'reference-audio');
    const uploadResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/upload`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: uploadForm,
      cache: 'no-store',
    });

    const uploadText = await uploadResponse.text();
    if (!uploadResponse.ok) {
      return new NextResponse(uploadText || 'Reference audio upload failed.', {
        status: uploadResponse.status,
        headers: { 'Content-Type': uploadResponse.headers.get('content-type') || 'text/plain' },
      });
    }

    const uploadData = JSON.parse(uploadText) as { song_id?: string };
    if (!uploadData.song_id) {
      return NextResponse.json({ error: 'ElevenLabs did not return a reference song ID.' }, { status: 502 });
    }

    const planPrompt = forceInstrumental
      ? `${prompt}\n\nCreate an original instrumental composition with no lead vocals. Use the uploaded reference only for sound, production style, instrumentation, tempo, groove, and mood. Do not copy the composition.`
      : `${prompt}\n\nCreate an original composition. Use the uploaded reference only for sound, production style, instrumentation, tempo, groove, and mood. Do not copy the composition.`;

    const planResponse = await fetch(`${ELEVENLABS_BASE}/v1/music/plan`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: planPrompt,
        music_length_ms: musicLengthMs,
        model_id: 'music_v2',
      }),
      cache: 'no-store',
    });

    const planText = await planResponse.text();
    if (!planResponse.ok) {
      return new NextResponse(planText || 'Could not create a Music v2 composition plan.', {
        status: planResponse.status,
        headers: { 'Content-Type': planResponse.headers.get('content-type') || 'text/plain' },
      });
    }

    const compositionPlan = JSON.parse(planText) as { chunks?: MusicV2Chunk[] };
    if (!compositionPlan.chunks?.length) {
      return NextResponse.json({ error: 'ElevenLabs returned an empty Music v2 composition plan.' }, { status: 502 });
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
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        model_id: 'music_v2',
        composition_plan: compositionPlan,
      }),
      cache: 'no-store',
    });

    if (!composeResponse.ok) {
      const text = await composeResponse.text();
      return new NextResponse(text || 'Reference-conditioned music generation failed.', {
        status: composeResponse.status,
        headers: { 'Content-Type': composeResponse.headers.get('content-type') || 'text/plain' },
      });
    }

    const audio = await composeResponse.arrayBuffer();
    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': composeResponse.headers.get('content-type') || 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Reference-Song-Id': uploadData.song_id,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Reference-conditioned music generation request failed.' }, { status: 500 });
  }
}
