'use client';

import { useRef, useState } from 'react';

export type MelodyNote = {
  midi: number;
  note: string;
  start: number;
  end: number;
  duration: number;
  frequency: number;
};

export type MelodyPhrase = {
  index: number;
  start: number;
  end: number;
  duration: number;
  noteCount: number;
  suggestedSyllables: number;
  notes: string[];
};

export type MelodyAnalysis = {
  duration: number;
  lowestNote: string;
  highestNote: string;
  lowestMidi: number;
  highestMidi: number;
  notes: MelodyNote[];
  phrases: MelodyPhrase[];
};

type Props = {
  prompt: string;
  vocalRange: string;
  lyrics: string;
  initialBlob?: Blob | null;
  initialAnalysis?: MelodyAnalysis | null;
  initialPrecisionGuide?: Blob | null;
  onLyricsFitted: (lyrics: string) => void;
  onMelodyChanged: (blob: Blob, analysis: MelodyAnalysis) => void;
  onPrecisionGuide: (blob: Blob) => void;
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function midiToNote(midi: number) {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectFrequency(samples: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.012) return 0;

  const minLag = Math.max(2, Math.floor(sampleRate / 900));
  const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / 60));
  let bestLag = 0;
  let bestCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0;
    let energyA = 0;
    let energyB = 0;
    const limit = samples.length - lag;
    for (let i = 0; i < limit; i++) {
      const a = samples[i];
      const b = samples[i + lag];
      cross += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const corr = cross / (Math.sqrt(energyA * energyB) || 1);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestCorr < 0.58 || !bestLag) return 0;
  return sampleRate / bestLag;
}

async function analyzeMelody(blob: Blob): Promise<MelodyAnalysis> {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot analyze audio.');

  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const source = decoded.getChannelData(0);
    const targetRate = 8000;
    const stride = Math.max(1, Math.round(decoded.sampleRate / targetRate));
    const down = new Float32Array(Math.floor(source.length / stride));
    for (let i = 0; i < down.length; i++) {
      let sum = 0;
      let count = 0;
      const start = i * stride;
      for (let j = 0; j < stride && start + j < source.length; j++) {
        sum += source[start + j];
        count++;
      }
      down[i] = sum / Math.max(1, count);
    }

    const frameSize = Math.floor(targetRate * 0.05);
    const hopSize = Math.floor(targetRate * 0.04);
    const frames: Array<{ time: number; midi: number; frequency: number }> = [];
    for (let start = 0; start + frameSize < down.length; start += hopSize) {
      const frequency = detectFrequency(down.subarray(start, start + frameSize), targetRate);
      if (frequency >= 60 && frequency <= 900) {
        frames.push({ time: start / targetRate, midi: 69 + 12 * Math.log2(frequency / 440), frequency });
      }
    }

    if (frames.length < 3) throw new Error('I could not detect a stable melody. Try humming one clear note at a time with less background noise.');

    const smoothed = frames.map((frame, i) => ({
      ...frame,
      midi: median(frames.slice(Math.max(0, i - 1), Math.min(frames.length, i + 2)).map((f) => f.midi)),
    }));

    const rawNotes: MelodyNote[] = [];
    let current: MelodyNote | null = null;
    for (const frame of smoothed) {
      const roundedMidi = Math.round(frame.midi);
      const noteStart = frame.time;
      const noteEnd = frame.time + hopSize / targetRate;
      if (!current) {
        current = { midi: roundedMidi, note: midiToNote(roundedMidi), start: noteStart, end: noteEnd, duration: noteEnd - noteStart, frequency: frame.frequency };
        continue;
      }
      const gap = noteStart - current.end;
      if (Math.abs(roundedMidi - current.midi) <= 1 && gap <= 0.09) {
        current.end = noteEnd;
        current.duration = current.end - current.start;
        current.frequency = (current.frequency + frame.frequency) / 2;
      } else {
        if (current.duration >= 0.08) rawNotes.push(current);
        current = { midi: roundedMidi, note: midiToNote(roundedMidi), start: noteStart, end: noteEnd, duration: noteEnd - noteStart, frequency: frame.frequency };
      }
    }
    if (current && current.duration >= 0.08) rawNotes.push(current);
    if (!rawNotes.length) throw new Error('I detected pitch, but not enough stable notes. Try holding each melody note a little longer.');

    const phrases: MelodyPhrase[] = [];
    let phraseNotes: MelodyNote[] = [];
    const closePhrase = () => {
      if (!phraseNotes.length) return;
      const start = phraseNotes[0].start;
      const end = phraseNotes[phraseNotes.length - 1].end;
      const noteDuration = phraseNotes.reduce((sum, n) => sum + n.duration, 0);
      phrases.push({
        index: phrases.length + 1,
        start,
        end,
        duration: end - start,
        noteCount: phraseNotes.length,
        suggestedSyllables: Math.max(2, Math.round(noteDuration / 0.28)),
        notes: phraseNotes.map((n) => n.note),
      });
      phraseNotes = [];
    };

    rawNotes.forEach((note, index) => {
      if (index > 0 && note.start - rawNotes[index - 1].end > 0.48) closePhrase();
      phraseNotes.push(note);
    });
    closePhrase();

    const midis = rawNotes.map((n) => n.midi);
    const lowestMidi = Math.min(...midis);
    const highestMidi = Math.max(...midis);
    return {
      duration: decoded.duration,
      lowestNote: midiToNote(lowestMidi),
      highestNote: midiToNote(highestMidi),
      lowestMidi,
      highestMidi,
      notes: rawNotes,
      phrases,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function blobToMp3(blob: Blob) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot prepare melody audio.');
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const source = decoded.getChannelData(0);
    const samples = new Int16Array(source.length);
    for (let i = 0; i < source.length; i++) samples[i] = Math.max(-32768, Math.min(32767, Math.round(source[i] * 32767)));
    const { Mp3Encoder } = await import('@breezystack/lamejs');
    const encoder = new Mp3Encoder(1, decoded.sampleRate, 128);
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < samples.length; offset += 1152) {
      const encoded = encoder.encodeBuffer(samples.subarray(offset, Math.min(samples.length, offset + 1152)));
      if (encoded.length) chunks.push(new Uint8Array(encoded));
    }
    const finalChunk = encoder.flush();
    if (finalChunk.length) chunks.push(new Uint8Array(finalChunk));
    return new Blob(chunks, { type: 'audio/mpeg' });
  } finally {
    await context.close().catch(() => undefined);
  }
}

export default function MelodyWorkspace({ prompt, vocalRange, lyrics, initialBlob, initialAnalysis, initialPrecisionGuide, onLyricsFitted, onMelodyChanged, onPrecisionGuide }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [melodyBlob, setMelodyBlob] = useState<Blob | null>(initialBlob || null);
  const [audioUrl, setAudioUrl] = useState(initialBlob ? URL.createObjectURL(initialBlob) : '');
  const [analysis, setAnalysis] = useState<MelodyAnalysis | null>(initialAnalysis || null);
  const [status, setStatus] = useState(initialAnalysis ? 'Saved melody analysis loaded.' : '');
  const [analyzing, setAnalyzing] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [fitScore, setFitScore] = useState<number | null>(null);
  const [fitNotes, setFitNotes] = useState('');
  const [guideLoading, setGuideLoading] = useState(false);
  const [precisionGuideUrl, setPrecisionGuideUrl] = useState(initialPrecisionGuide ? URL.createObjectURL(initialPrecisionGuide) : '');

  function setBlob(blob: Blob) {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setMelodyBlob(blob);
    setAudioUrl(URL.createObjectURL(blob));
    setAnalysis(null);
    setFitScore(null);
    setStatus('Melody loaded. Tap Analyze Melody.');
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start();
      setRecording(true);
      setStatus('Recording melody… hum or sing clearly, then tap Stop.');
    } catch {
      setStatus('Microphone permission is required to record a melody. You can also upload an audio file.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function analyze() {
    if (!melodyBlob) return;
    setAnalyzing(true);
    setStatus('Detecting notes, timing, and phrases…');
    try {
      const result = await analyzeMelody(melodyBlob);
      setAnalysis(result);
      onMelodyChanged(melodyBlob, result);
      setStatus(`Detected ${result.notes.length} notes across ${result.phrases.length} phrase${result.phrases.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not analyze this melody.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function fitLyrics() {
    if (!analysis) return;
    setFitting(true);
    setStatus('Fitting lyrics to melody phrases…');
    try {
      const response = await fetch('/api/melody-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, vocalRange, lyrics, analysis }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not fit lyrics to the melody.');
      if (data.lyrics) onLyricsFitted(data.lyrics);
      setFitScore(typeof data.score === 'number' ? data.score : null);
      setFitNotes(data.notes || '');
      setStatus('Melody-fit lyrics are ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not fit lyrics to the melody.');
    } finally {
      setFitting(false);
    }
  }

  async function generatePrecisionGuide() {
    if (!analysis || !lyrics.trim() || !melodyBlob) return;
    setGuideLoading(true);
    setStatus('Preparing your recorded melody for Mureka…');
    const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const melodyMp3 = await blobToMp3(melodyBlob);
      const form = new FormData();
      form.append('melody', melodyMp3, 'ai-songs-melody.mp3');
      form.append('lyrics', lyrics);
      form.append('requestId', requestId);

      const startRes = await fetch('/api/precision-guide', { method: 'POST', body: form });
      const start = await startRes.json();
      if (!startRes.ok) throw new Error(start?.error || start?.message || 'Could not start Mureka melody generation.');

      let stage = String(start.stage || 'song');
      let taskId = String(start.taskId || '');
      if (!taskId) throw new Error('Mureka did not return a task ID.');

      for (let attempt = 0; attempt < 120; attempt++) {
        setStatus('Mureka is singing your fitted lyrics to your recorded melody…');
        await sleep(3000);
        const pollRes = await fetch(`/api/precision-guide/status?stage=${encodeURIComponent(stage)}&taskId=${encodeURIComponent(taskId)}&requestId=${encodeURIComponent(requestId)}`, { cache: 'no-store' });
        const poll = await pollRes.json();
        if (!pollRes.ok) throw new Error(poll?.error || 'Mureka precision vocal generation failed.');

        if (poll.stage === 'complete' && poll.vocalFileId) {
          setStatus('Isolating the Mureka vocal with ElevenLabs…');
          const audioRes = await fetch(`/api/soundverse/file?fileId=${encodeURIComponent(String(poll.vocalFileId))}`, { cache: 'no-store' });
          if (!audioRes.ok) throw new Error('Could not isolate the Mureka vocal.');
          const blob = await audioRes.blob();
          if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);
          const url = URL.createObjectURL(blob);
          setPrecisionGuideUrl(url);
          onPrecisionGuide(blob);
          setStatus('Precision guide vocal ready via Mureka — isolated and ready for Drob.');
          return;
        }

        if (poll.stage && poll.taskId) {
          stage = String(poll.stage);
          taskId = String(poll.taskId);
        }
      }
      throw new Error('Mureka generation timed out. Try again.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not generate the precision guide vocal.');
    } finally {
      setGuideLoading(false);
    }
  }

  return (
    <div className="musicControls">
      <div className="playerCard">
        <strong>1. Record or upload your melody</strong>
        <small>Hum, sing, or whistle one clear lead melody. A dry recording with little background noise works best.</small>
        <div className="mixButtons">
          {!recording ? <button className="primary" onClick={startRecording}>🎤 Record Melody</button> : <button className="primary" onClick={stopRecording}>■ Stop Recording</button>}
          <label className="secondary">Upload Audio<input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (file) setBlob(file); }} /></label>
        </div>
        {audioUrl && <audio controls src={audioUrl} />}
      </div>

      {melodyBlob && <button className="primary" onClick={analyze} disabled={analyzing}>{analyzing ? 'Analyzing Melody…' : '2. Analyze Melody'}</button>}

      {analysis && (
        <div className="playerCard">
          <strong>Melody map</strong>
          <small>Range: {analysis.lowestNote} – {analysis.highestNote} · {analysis.notes.length} notes · {analysis.phrases.length} phrases</small>
          {analysis.phrases.map((phrase) => <div className="statusBox" key={phrase.index}>Phrase {phrase.index}: {phrase.notes.join(' ')} · about {phrase.suggestedSyllables} syllables</div>)}
          <button className="primary" onClick={fitLyrics} disabled={fitting}>{fitting ? 'Fitting Lyrics…' : '3. Fit Lyrics to This Melody'}</button>
        </div>
      )}

      {fitScore !== null && <div className="statusBox">Melody fit score: {fitScore}/100{fitNotes ? ` · ${fitNotes}` : ''}</div>}

      {analysis && lyrics.trim() && (
        <div className="playerCard">
          <strong>Precision Vocal Engine — Mureka</strong>
          <small>AI-Songs sends your recorded melody directly to Mureka with the fitted lyrics, then isolates the vocal for Drob conversion.</small>
          <button className="primary" onClick={generatePrecisionGuide} disabled={guideLoading}>{guideLoading ? 'Building Precision Vocal…' : '4. Generate Precision Guide Vocal'}</button>
          {precisionGuideUrl && <><small>Isolated melody-following guide vocal</small><audio controls src={precisionGuideUrl} /></>}
        </div>
      )}

      {status && <div className="statusBox">{status}</div>}
    </div>
  );
}
