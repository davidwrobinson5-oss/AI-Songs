import OpenAI from 'openai';
import { NextResponse } from 'next/server';
import { rateLimit, safeClientError } from '../../../security';
import { removeStagedFile, signedStagingUrl } from '../staging';

export const runtime = 'nodejs';
export const maxDuration = 300;

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_NOTES = 2200;
const CHOIR_ROLES = new Set(['soprano', 'alto', 'tenor', 'bass']);

function cleanJson(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

function finite(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeScore(raw: any) {
  const tempo = Math.min(240, Math.max(35, finite(raw?.tempo, 100)));
  const parts = Array.isArray(raw?.parts) ? raw.parts.slice(0, 32) : [];
  let noteCount = 0;
  const safeParts = parts.map((part: any, index: number) => {
    const notes = Array.isArray(part?.notes) ? part.notes : [];
    const safeNotes: Array<{midi:number;startBeat:number;durationBeats:number;velocity:number}> = [];
    for (const note of notes) {
      if (noteCount >= MAX_NOTES) break;
      const midi = Math.round(finite(note?.midi, -1));
      const startBeat = finite(note?.startBeat, -1);
      const durationBeats = finite(note?.durationBeats, 0);
      if (midi < 21 || midi > 108 || startBeat < 0 || durationBeats <= 0 || durationBeats > 32) continue;
      safeNotes.push({
        midi,
        startBeat: Math.min(4096, startBeat),
        durationBeats: Math.min(32, durationBeats),
        velocity: Math.min(1, Math.max(0.08, finite(note?.velocity, 0.72))),
      });
      noteCount += 1;
    }
    const rawChoirRole = String(part?.choirRole || '').toLowerCase();
    const choirRole = CHOIR_ROLES.has(rawChoirRole) ? rawChoirRole : '';
    return {
      name: String(part?.name || `Part ${index + 1}`).slice(0, 80),
      instrument: String(part?.instrument || (choirRole ? 'voice' : 'instrument')).slice(0, 80),
      isVocal: Boolean(part?.isVocal || choirRole),
      choirRole,
      lyrics: String(part?.lyrics || '').slice(0, 12_000),
      notes: safeNotes,
    };
  }).filter((part: any) => part.notes.length > 0 || part.lyrics);

  return {
    title: String(raw?.title || 'Imported Score').slice(0, 120),
    composer: String(raw?.composer || '').slice(0, 120),
    tempo,
    key: String(raw?.key || 'Unknown').slice(0, 40),
    timeSignature: String(raw?.timeSignature || '4/4').slice(0, 20),
    style: String(raw?.style || '').slice(0, 600),
    lyrics: String(raw?.lyrics || '').slice(0, 20_000),
    parts: safeParts,
    noteCount,
  };
}

async function readStaged(path: string) {
  const url = await signedStagingUrl(path);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Could not read staged sheet file.');
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared && declared > MAX_FILE_BYTES) throw new Error('SHEET_TOO_LARGE');
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_FILE_BYTES) throw new Error('SHEET_TOO_LARGE');
  return bytes;
}

export async function POST(req: Request) {
  const limited = rateLimit(req, 'sheets-import-score', 4, 60_000);
  if (limited) return limited;

  let stagedPath = '';
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Score reading is temporarily unavailable.' }, { status: 503 });
    }

    const body = await req.json() as { stagedPath?: string; name?: string; type?: string };
    stagedPath = String(body.stagedPath || '');
    if (!stagedPath) return NextResponse.json({ error: 'Upload the music-sheet file first.' }, { status: 400 });

    const filename = String(body.name || 'score').replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120);
    const fileType = String(body.type || 'application/pdf').toLowerCase();
    const bytes = await readStaged(stagedPath);
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const instructions = `Read this uploaded music score accurately enough to reconstruct its composition. Return ONLY valid JSON, no markdown.\n\nJSON shape:\n{\n  "title": string,\n  "composer": string,\n  "tempo": number,\n  "key": string,\n  "timeSignature": string,\n  "style": string,\n  "lyrics": string,\n  "parts": [\n    {\n      "name": string,\n      "instrument": string,\n      "isVocal": boolean,\n      "choirRole": "soprano" | "alto" | "tenor" | "bass" | "",\n      "lyrics": string,\n      "notes": [{"midi": number, "startBeat": number, "durationBeats": number, "velocity": number}]\n    }\n  ]\n}\n\nUse MIDI note numbers 21-108. startBeat begins at 0. Preserve rests with gaps and chords with shared startBeat. Use the written tempo when visible. Expand repeats into the performed sequence when practical. Detect every clearly written instrument and vocal staff. IMPORTANT: choir writing must identify Soprano, Alto, Tenor, and Choir Bass as distinct vocal parts using choirRole. Choir Bass is NOT bass guitar/electric bass/acoustic bass; instrument bass must use choirRole "". Transcribe printed lyrics per vocal part when possible. Keep the total note-event count under ${MAX_NOTES}; for a large score preserve the whole-song structure and prioritize complete SATB voices, melody, instrument bass, harmony, percussion cues, and principal accompaniment across the whole piece.`;

    const lowerName = filename.toLowerCase();
    let content: any[];
    if (lowerName.endsWith('.xml') || lowerName.endsWith('.musicxml') || fileType.includes('xml')) {
      const xml = bytes.toString('utf8').slice(0, 1_500_000);
      content = [{ type: 'input_text', text: `${instructions}\n\nMusicXML/XML source:\n${xml}` }];
    } else if (fileType.startsWith('image/')) {
      const dataUrl = `data:${fileType};base64,${bytes.toString('base64')}`;
      content = [
        { type: 'input_text', text: instructions },
        { type: 'input_image', image_url: dataUrl, detail: 'high' },
      ];
    } else {
      const mime = fileType || 'application/pdf';
      const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
      content = [
        { type: 'input_text', text: instructions },
        { type: 'input_file', filename, file_data: dataUrl },
      ];
    }

    const response = await client.responses.create({
      model: process.env.OPENAI_VISION_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-5.6',
      input: [{ role: 'user', content }],
    });

    const parsed = JSON.parse(cleanJson(response.output_text || '{}'));
    const score = sanitizeScore(parsed);
    if (!score.parts.length || score.noteCount < 2) {
      return NextResponse.json({ error: 'Pie could not detect enough notation in that file. Try a clearer PDF or photo.' }, { status: 422 });
    }

    return NextResponse.json({ score }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'SHEET_TOO_LARGE') {
      return NextResponse.json({ error: 'Music-sheet files must be 20 MB or smaller.' }, { status: 413 });
    }
    console.error('Score import failed', error);
    return NextResponse.json({ error: safeClientError(error, 'Could not read the uploaded music sheets.') }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  } finally {
    if (stagedPath) await removeStagedFile(stagedPath);
  }
}
