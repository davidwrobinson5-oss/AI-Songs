'use client';

import { useRef, useState } from 'react';

type Props = {
  backingUrl: string;
  guideVocalUrl: string;
  drobVocalUrl: string;
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
    } else {
      consecutive = 0;
    }
  }
  return 0;
}

export default function DrobMixPlayer({ backingUrl, guideVocalUrl, drobVocalUrl }: Props) {
  const contextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const [status, setStatus] = useState('');

  function stop() {
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch {}
    }
    sourcesRef.current = [];
    setStatus('Stopped');
  }

  async function playAligned() {
    stop();
    setStatus('Analyzing vocal timing…');

    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setStatus('This browser does not support precise audio playback.');
      return;
    }

    const context = contextRef.current || new AudioContextCtor();
    contextRef.current = context;
    if (context.state === 'suspended') await context.resume();

    try {
      const [backingBytes, guideBytes, drobBytes] = await Promise.all([
        fetch(backingUrl).then((r) => r.arrayBuffer()),
        fetch(guideVocalUrl).then((r) => r.arrayBuffer()),
        fetch(drobVocalUrl).then((r) => r.arrayBuffer()),
      ]);

      const [backing, guide, drob] = await Promise.all([
        context.decodeAudioData(backingBytes.slice(0)),
        context.decodeAudioData(guideBytes.slice(0)),
        context.decodeAudioData(drobBytes.slice(0)),
      ]);

      const guideOnset = firstOnsetSeconds(guide);
      const drobOnset = firstOnsetSeconds(drob);
      const desiredOffset = guideOnset - drobOnset;

      const backingSource = context.createBufferSource();
      const vocalSource = context.createBufferSource();
      const backingGain = context.createGain();
      const vocalGain = context.createGain();

      backingSource.buffer = backing;
      vocalSource.buffer = drob;
      backingGain.gain.value = 0.92;
      vocalGain.gain.value = 0.95;

      backingSource.connect(backingGain).connect(context.destination);
      vocalSource.connect(vocalGain).connect(context.destination);

      const startAt = context.currentTime + 0.15;
      backingSource.start(startAt);
      if (desiredOffset >= 0) {
        vocalSource.start(startAt + desiredOffset);
      } else {
        vocalSource.start(startAt, Math.min(-desiredOffset, drob.duration));
      }

      sourcesRef.current = [backingSource, vocalSource];
      setStatus(`Auto-aligned Drob by ${Math.round(desiredOffset * 1000)} ms`);
    } catch {
      setStatus('Could not auto-align these stems.');
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
      <details>
        <summary>Solo tracks</summary>
        <small>Backing track</small>
        <audio controls src={backingUrl} />
        <small>Original guide vocal</small>
        <audio controls src={guideVocalUrl} />
        <small>Drob vocal</small>
        <audio controls src={drobVocalUrl} />
      </details>
    </div>
  );
}
