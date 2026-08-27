'use client';

import { useRef, useState } from 'react';

type Props = {
  backingUrl: string;
  guideVocalUrl: string;
  drobVocalUrl: string;
  onMasterRendered?: (blob: Blob) => void;
};

type Alignment = {
  playbackRate: number;
  desiredOffset: number;
  drobSourceOffset: number;
};

function firstOnsetSeconds(buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));
  let peakRms = 0;
  const rmsValues: number[] = [];
  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(start + windowSize, buffer.length);
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] || 0;
      sample /= channels.length || 1;
      sum += sample * sample;
      count++;
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    rmsValues.push(rms);
    peakRms = Math.max(peakRms, rms);
  }
  const threshold = Math.max(0.0035, peakRms * 0.08);
  let consecutive = 0;
  for (let i = 0; i < rmsValues.length; i++) {
    if (rmsValues[i] >= threshold) {
      consecutive++;
      if (consecutive >= 3) return Math.max(0, (i - 2) * windowSize / sampleRate);
    } else consecutive = 0;
  }
  return 0;
}

function lastActiveSeconds(buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const sampleRate = buffer.sampleRate;
  const windowSize = Math.max(256, Math.floor(sampleRate * 0.02));
  let peakRms = 0;
  const rmsValues: number[] = [];
  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(start + windowSize, buffer.length);
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] || 0;
      sample /= channels.length || 1;
      sum += sample * sample;
      count++;
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    rmsValues.push(rms);
    peakRms = Math.max(peakRms, rms);
  }
  const threshold = Math.max(0.0035, peakRms * 0.06);
  for (let i = rmsValues.length - 1; i >= 0; i--) {
    if (rmsValues[i] >= threshold) return Math.min(buffer.duration, (i + 1) * windowSize / sampleRate);
  }
  return buffer.duration;
}

function getAlignment(guide: AudioBuffer, drob: AudioBuffer): Alignment {
  const guideOnset = firstOnsetSeconds(guide);
  const drobOnset = firstOnsetSeconds(drob);
  const guideEnd = lastActiveSeconds(guide);
  const drobEnd = lastActiveSeconds(drob);
  const guideActive = Math.max(0.25, guideEnd - guideOnset);
  const drobActive = Math.max(0.25, drobEnd - drobOnset);
  const rawRate = drobActive / guideActive;
  const playbackRate = Math.min(1.04, Math.max(0.96, rawRate));
  const desiredOffset = guideOnset - (drobOnset / playbackRate);
  const drobSourceOffset = desiredOffset < 0 ? Math.min(-desiredOffset * playbackRate, drob.duration) : 0;
  return { playbackRate, desiredOffset, drobSourceOffset };
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(Math.min(i, buffer.numberOfChannels - 1)));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export default function DrobMixPlayer({ backingUrl, guideVocalUrl, drobVocalUrl, onMasterRendered }: Props) {
  const contextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const [status, setStatus] = useState('');
  const [rendering, setRendering] = useState(false);
  const [masterUrl, setMasterUrl] = useState('');

  function stop() {
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch {}
    }
    sourcesRef.current = [];
    setStatus('Stopped');
  }

  async function loadAudio() {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('This browser does not support precise audio playback.');
    const context = contextRef.current || new AudioContextCtor();
    contextRef.current = context;
    if (context.state === 'suspended') await context.resume();
    const [backingBytes, guideBytes, drobBytes] = await Promise.all([
      fetch(backingUrl).then((r) => { if (!r.ok) throw new Error('Could not load backing track.'); return r.arrayBuffer(); }),
      fetch(guideVocalUrl).then((r) => { if (!r.ok) throw new Error('Could not load guide vocal.'); return r.arrayBuffer(); }),
      fetch(drobVocalUrl).then((r) => { if (!r.ok) throw new Error('Could not load Drob vocal.'); return r.arrayBuffer(); }),
    ]);
    const [backing, guide, drob] = await Promise.all([
      context.decodeAudioData(backingBytes.slice(0)),
      context.decodeAudioData(guideBytes.slice(0)),
      context.decodeAudioData(drobBytes.slice(0)),
    ]);
    return { context, backing, guide, drob };
  }

  async function playAligned() {
    stop();
    setStatus('Analyzing vocal timing…');
    try {
      const { context, backing, guide, drob } = await loadAudio();
      const { playbackRate, desiredOffset, drobSourceOffset } = getAlignment(guide, drob);
      const backingSource = context.createBufferSource();
      const vocalSource = context.createBufferSource();
      const backingGain = context.createGain();
      const vocalGain = context.createGain();
      backingSource.buffer = backing;
      vocalSource.buffer = drob;
      vocalSource.playbackRate.value = playbackRate;
      backingGain.gain.value = 0.92;
      vocalGain.gain.value = 0.95;
      backingSource.connect(backingGain).connect(context.destination);
      vocalSource.connect(vocalGain).connect(context.destination);
      const startAt = context.currentTime + 0.15;
      backingSource.start(startAt);
      if (desiredOffset >= 0) vocalSource.start(startAt + desiredOffset);
      else vocalSource.start(startAt, drobSourceOffset);
      sourcesRef.current = [backingSource, vocalSource];
      const offsetMs = Math.round(desiredOffset * 1000);
      const driftPct = Math.round((playbackRate - 1) * 10000) / 100;
      setStatus(`Aligned Drob: ${offsetMs} ms offset, ${driftPct >= 0 ? '+' : ''}${driftPct}% timing correction`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not auto-align these stems.');
    }
  }

  async function renderMaster() {
    setRendering(true);
    setStatus('Rendering aligned Drob master…');
    if (masterUrl) {
      URL.revokeObjectURL(masterUrl);
      setMasterUrl('');
    }
    try {
      const { backing, guide, drob } = await loadAudio();
      const { playbackRate, desiredOffset, drobSourceOffset } = getAlignment(guide, drob);
      const sampleRate = 44100;
      const vocalStart = Math.max(0, desiredOffset);
      const vocalPlayableDuration = Math.max(0, drob.duration - drobSourceOffset) / playbackRate;
      const totalDuration = Math.max(backing.duration, vocalStart + vocalPlayableDuration) + 0.1;
      const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);
      const backingSource = offline.createBufferSource();
      const vocalSource = offline.createBufferSource();
      const backingGain = offline.createGain();
      const vocalGain = offline.createGain();
      const compressor = offline.createDynamicsCompressor();
      backingSource.buffer = backing;
      vocalSource.buffer = drob;
      vocalSource.playbackRate.value = playbackRate;
      backingGain.gain.value = 0.92;
      vocalGain.gain.value = 0.95;
      compressor.threshold.value = -3;
      compressor.knee.value = 8;
      compressor.ratio.value = 2;
      compressor.attack.value = 0.005;
      compressor.release.value = 0.12;
      backingSource.connect(backingGain).connect(compressor);
      vocalSource.connect(vocalGain).connect(compressor);
      compressor.connect(offline.destination);
      backingSource.start(0);
      if (desiredOffset >= 0) vocalSource.start(desiredOffset);
      else vocalSource.start(0, drobSourceOffset);
      const rendered = await offline.startRendering();
      const wav = audioBufferToWav(rendered);
      onMasterRendered?.(wav);
      const url = URL.createObjectURL(wav);
      setMasterUrl(url);
      const offsetMs = Math.round(desiredOffset * 1000);
      const driftPct = Math.round((playbackRate - 1) * 10000) / 100;
      setStatus(`Master rendered: ${offsetMs} ms offset, ${driftPct >= 0 ? '+' : ''}${driftPct}% timing correction`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not render the Drob master.');
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="playerCard">
      <strong>Drob vocal preview — precision aligned</strong>
      <div className="mixButtons">
        <button className="primary" onClick={playAligned}>▶ Play Auto-Aligned Mix</button>
        <button className="secondary" onClick={stop}>■ Stop</button>
      </div>
      {status && <small>{status}</small>}
      <button className="primary" onClick={renderMaster} disabled={rendering}>{rendering ? 'Rendering Drob Master…' : 'Render Drob Master'}</button>
      {masterUrl && (
        <div className="playerCard">
          <strong>Rendered Drob Master</strong>
          <audio controls src={masterUrl} />
          <a className="primary" href={masterUrl} download="AI-Songs-Drob-Master.wav">Save Drob Master WAV</a>
          <small>This WAV contains the aligned backing track and Drob vocal as one finished file.</small>
        </div>
      )}
      <details>
        <summary>Solo tracks</summary>
        <small>Backing track</small><audio controls src={backingUrl} />
        <small>Original guide vocal</small><audio controls src={guideVocalUrl} />
        <small>Drob vocal</small><audio controls src={drobVocalUrl} />
      </details>
    </div>
  );
}
