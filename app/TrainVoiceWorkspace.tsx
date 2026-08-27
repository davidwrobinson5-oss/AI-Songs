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
  included: boolean;
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

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

async function toMonoWav(blob: Blob) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot prepare WAV training files.');
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const sampleRate = decoded.sampleRate;
    const samples = new Float32Array(decoded.length);
    for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) samples[i] += (data[i] || 0) / decoded.numberOfChannels;
    }

    const dataLength = samples.length * 2;
    const output = new ArrayBuffer(44 + dataLength);
    const view = new DataView(output);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
    return new Uint8Array(output);
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
  const selectedTakes = takes.filter((take) => take.included);
  const selectedSeconds = selectedTakes.reduce((sum, take) => sum + take.duration, 0);
  const recommendedReady = selectedSeconds >= 30 * 60;
  const minimumReady = selectedSeconds >= 10 * 60;

  async function addBlob(blob: Blob, name: string) {
    setProcessing(true);
    try {
      const info = await inspectAudio(blob);
      const take: TrainingTake = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name,
        blob,
        url: URL.createObjectURL(blob),
        included: info.quality === 'Good',
        ...info,
      };
      setTakes((current) => [...current, take]);
      setStatus(info.quality === 'Good'
        ? 'Take added and selected for training.'
        : info.quality === 'Too quiet'
          ? 'Take added but excluded because it is very quiet. Re-record closer to the microphone if possible.'
          : 'Take added but excluded until you listen for clipping or distortion.');
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

  function toggleTake(id: string) {
    setTakes((current) => current.map((take) => take.id === id ? { ...take, included: !take.included } : take));
  }

  async function prepareForKits() {
    if (!selectedTakes.length) return;
    setProcessing(true);
    setStatus('Converting selected takes to clean mono WAV files for Kits…');
    try {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < selectedTakes.length; i++) {
        const take = selectedTakes[i];
        setStatus(`Preparing Kits WAV ${i + 1} of ${selectedTakes.length}…`);
        const wav = await toMonoWav(take.blob);
        files[`Kits-Training-WAV/${String(i + 1).padStart(2, '0')}-${safeName(take.name.replace(/\.[^.]+$/, ''))}.wav`] = wav;
      }

      const manifest = {
        createdAt: new Date().toISOString(),
        selectedSeconds,
        selectedMinutes: selectedSeconds / 60,
        selectedTakeCount: selectedTakes.length,
        target: 'Kits Professional Voice Cloning',
        guidance: 'Kits recommends 10-60 minutes of dry monophonic vocals, with about 30 minutes recommended. Review every included file before submitting.',
        takes: selectedTakes.map((take) => ({ name: take.name, duration: take.duration, quality: take.quality, peak: take.peak, rms: take.rms })),
      };
      files['README-KITS.txt'] = strToU8('AI-Songs prepared these files as mono PCM WAV files. Listen through them before uploading. Remove any take containing music, effects, doubles, clipping, heavy room noise, or another voice. Then open Kits Professional Voice Cloning, choose Upload Files, add the WAV files, and submit training.');
      files['training-manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

      const zipped = zipSync(files, { level: 4 });
      const bytes = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'AI-Songs-Kits-Training-WAVs.zip';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setStatus('Kits-ready WAV package created. Extract the ZIP, then upload the WAV files using Kits Professional Voice Cloning → Upload Files.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not prepare the Kits training package.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Voice Lab</p>
      <h1>Train Your Voice</h1>
      <p className="sub">Record or upload vocals in AI-Songs, inspect the takes, select the best recordings, and prepare a Kits-ready training package from your phone.</p>

      <div className="playerCard">
        <strong>Kits Professional Voice target</strong>
        <small>Kits accepts uploaded training audio. Aim for 10–60 minutes of dry, monophonic vocals; about 30 minutes is the recommended target.</small>
        <div className="statusBox">
          Selected: {Math.floor(selectedSeconds / 60)}m {Math.round(selectedSeconds % 60)}s · Total recorded: {Math.floor(totalSeconds / 60)}m {Math.round(totalSeconds % 60)}s · {selectedTakes.length}/{takes.length} takes selected
        </div>
        <div className="statusBox">{recommendedReady ? '✓ Recommended 30-minute target reached.' : minimumReady ? '✓ Kits minimum reached. More clean variety can improve the model.' : `Need about ${Math.ceil((10 * 60 - selectedSeconds) / 60)} more minute(s) to reach the 10-minute minimum.`}</div>
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
          <label className="toggleRow">
            <input type="checkbox" checked={take.included} onChange={() => toggleTake(take.id)} />
            <span><strong>Include in Kits training set</strong><small>{take.quality === 'Good' ? 'Automatically selected because the level check passed.' : 'Listen carefully before including this take.'}</small></span>
          </label>
          <button className="secondary" onClick={() => removeTake(take.id)}>Remove Take</button>
        </div>
      ))}

      <div className="playerCard">
        <strong>Prepare Voice for Kits</strong>
        <small>AI-Songs converts the selected phone recordings into mono PCM WAV files and packages them together. Kits still requires the final upload/train confirmation on its site because new voice training is not exposed through the public API.</small>
        <button className="primary" onClick={prepareForKits} disabled={!selectedTakes.length || processing}>{processing ? 'Preparing Kits Files…' : 'Prepare Voice for Kits'}</button>
        <a className="secondary" href="https://app.kits.ai/voices/train" target="_blank" rel="noreferrer">Open Kits Voice Training</a>
      </div>

      {status && <div className="statusBox">{status}</div>}
    </section>
  );
}
