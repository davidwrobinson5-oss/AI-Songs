'use client';

import { useRef, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';

type TrainingTake = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  duration: number;
  peak: number;
  rms: number;
  quality: 'Good' | 'Check' | 'Too quiet';
};

async function inspectAudio(blob: Blob) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot inspect audio.');
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    let peak = 0;
    let sum = 0;
    let count = 0;
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c);
      const stride = Math.max(1, Math.floor(data.length / 120000));
      for (let i = 0; i < data.length; i += stride) {
        const value = Math.abs(data[i] || 0);
        peak = Math.max(peak, value);
        sum += value * value;
        count++;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    const quality: TrainingTake['quality'] = rms < 0.012 ? 'Too quiet' : peak > 0.985 ? 'Check' : 'Good';
    return { duration: decoded.duration, peak, rms, quality };
  } finally {
    await context.close().catch(() => undefined);
  }
}

function safeName(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, '-').replace(/-+/g, '-');
}

export default function TrainVoiceWorkspace() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [takes, setTakes] = useState<TrainingTake[]>([]);
  const [status, setStatus] = useState('Record or upload clean, dry solo vocals. No music, reverb, delay, doubles, or background noise.');
  const [processing, setProcessing] = useState(false);

  const totalSeconds = takes.reduce((sum, take) => sum + take.duration, 0);
  const goodSeconds = takes.filter((take) => take.quality === 'Good').reduce((sum, take) => sum + take.duration, 0);

  async function addBlob(blob: Blob, name: string) {
    setProcessing(true);
    try {
      const info = await inspectAudio(blob);
      const take: TrainingTake = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name,
        blob,
        url: URL.createObjectURL(blob),
        ...info,
      };
      setTakes((current) => [...current, take]);
      setStatus(info.quality === 'Good' ? 'Take added — quality looks usable.' : info.quality === 'Too quiet' ? 'Take added, but it is very quiet. Re-record closer to the microphone if possible.' : 'Take added. Check it for clipping/distortion before using it for training.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not inspect this recording.');
    } finally {
      setProcessing(false);
    }
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        await addBlob(blob, `voice-take-${takes.length + 1}.webm`);
      };
      recorder.start();
      setRecording(true);
      setStatus('Recording… sing naturally with steady mic distance. Include soft, medium, and strong phrases across your comfortable range.');
    } catch {
      setStatus('Microphone access is required to record voice training takes.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  function removeTake(id: string) {
    setTakes((current) => {
      const found = current.find((take) => take.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return current.filter((take) => take.id !== id);
    });
  }

  async function downloadDataset() {
    if (!takes.length) return;
    setProcessing(true);
    setStatus('Packaging your voice-training dataset…');
    try {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < takes.length; i++) {
        const take = takes[i];
        const ext = take.name.split('.').pop() || 'webm';
        files[`audio/${String(i + 1).padStart(2, '0')}-${safeName(take.name.replace(/\.[^.]+$/, ''))}.${ext}`] = new Uint8Array(await take.blob.arrayBuffer());
      }
      const manifest = {
        createdAt: new Date().toISOString(),
        totalSeconds,
        goodSeconds,
        takeCount: takes.length,
        instructions: 'Upload only recordings you own or have explicit permission to use. Prefer dry solo vocals without effects or accompaniment.',
        takes: takes.map((take) => ({ name: take.name, duration: take.duration, quality: take.quality, peak: take.peak, rms: take.rms })),
      };
      files['training-manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
      const zipped = zipSync(files, { level: 6 });
      const bytes = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'AI-Songs-Voice-Training-Dataset.zip';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus('Dataset packaged. Final voice-model training still has to be submitted in Kits because Kits does not currently expose voice-model creation through its public API.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not package the training dataset.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Voice Lab</p>
      <h1>Train Your Voice</h1>
      <p className="sub">Build a clean training set entirely from your phone. AI-Songs records, checks, organizes, and packages your vocal takes.</p>

      <div className="playerCard">
        <strong>Recording target</strong>
        <small>Aim for several minutes of clean solo singing with varied vowels, consonants, dynamics, and notes across your natural range. Consistency and clean audio matter more than volume.</small>
        <div className="statusBox">Total audio: {Math.floor(totalSeconds / 60)}m {Math.round(totalSeconds % 60)}s · Good-quality audio: {Math.floor(goodSeconds / 60)}m {Math.round(goodSeconds % 60)}s · {takes.length} take(s)</div>
        <div className="mixButtons">
          {!recording ? <button className="primary" onClick={startRecording} disabled={processing}>🎤 Record Training Take</button> : <button className="primary" onClick={stopRecording}>■ Stop Recording</button>}
          <label className="secondary">Upload Vocal Takes<input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={async (event) => { const files = Array.from(event.target.files || []); for (const file of files) await addBlob(file, file.name); }} /></label>
        </div>
      </div>

      {takes.map((take, index) => (
        <div className="playerCard" key={take.id}>
          <strong>Take {index + 1} · {take.quality}</strong>
          <small>{take.name} · {take.duration.toFixed(1)} sec · level {Math.round(take.rms * 1000) / 10}</small>
          <audio controls src={take.url} />
          <button className="secondary" onClick={() => removeTake(take.id)}>Remove Take</button>
        </div>
      ))}

      <div className="playerCard">
        <strong>Training handoff</strong>
        <small>AI-Songs can prepare the entire dataset here. Kits’ current public API supports using trained models but does not expose creation/training of a new clone, so the final training submission still happens in Kits.</small>
        <button className="primary" onClick={downloadDataset} disabled={!takes.length || processing}>{processing ? 'Preparing Dataset…' : 'Package Training Dataset'}</button>
      </div>

      {status && <div className="statusBox">{status}</div>}
    </section>
  );
}
