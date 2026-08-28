import { NextResponse } from 'next/server';
import { rateLimit, safeClientError, safeId, textField, validateAudioFile } from '../../../security';
import { createChordRecognition, createSourceSeparation, createTranscription, getStem } from '../klangio';

const STEM_MODELS: Record<string, string> = {
  drums: 'drums',
  bass: 'bass',
  guitar: 'guitar',
  piano: 'piano',
  vocals: 'vocal',
};

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const limited = rateLimit(req, 'sheets-transcribe', 12, 60_000);
  if (limited) return limited;

  try {
    const contentType = req.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await req.json() as Record<string, unknown>;
      const mode = textField(body.mode, 24);
      if (mode !== 'stem') throw new Error('INVALID_MODE');
      const separationJobId = safeId(body.separationJobId, 180);
      const stem = textField(body.stem, 24);
      const model = STEM_MODELS[stem];
      if (!model) throw new Error('INVALID_STEM');
      const stemBlob = await getStem(separationJobId, stem);
      const jobId = await createTranscription(stemBlob, model, `${stem} part`);
      return NextResponse.json({ jobId }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const form = await req.formData();
    const mode = textField(form.get('mode'), 24);
    const title = textField(form.get('title'), 120, 'AI Songs');
    const file = form.get('file');
    if (!(file instanceof Blob)) throw new Error('INVALID_AUDIO');
    validateAudioFile(file, 45 * 1024 * 1024);

    let jobId = '';
    if (mode === 'full') jobId = await createTranscription(file, 'universal', title);
    else if (mode === 'lead') jobId = await createTranscription(file, 'vocal', `${title} lead vocal`);
    else if (mode === 'chords') jobId = await createChordRecognition(file);
    else if (mode === 'separate') jobId = await createSourceSeparation(file);
    else throw new Error('INVALID_MODE');

    return NextResponse.json({ jobId }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'KLANGIO_NOT_CONFIGURED') {
      return NextResponse.json(
        { error: 'Klangio is not configured yet. Add KLANGIO_API_KEY in Vercel.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    console.error('Sheet transcription request failed', error);
    return NextResponse.json(
      { error: safeClientError(error, 'Could not start sheet-music transcription.') },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
