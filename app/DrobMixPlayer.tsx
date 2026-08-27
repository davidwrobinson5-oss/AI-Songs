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

type VocalSettings = {
  vocalLevel: number;
  cleanup: number;
  compression: number;
  deEss: number;
  air: number;
  space: number;
};

const PRESETS: Record<string, VocalSettings> = {
  Natural: { vocalLevel: 0.98, cleanup: 0.7, compression: 0.58, deEss: 0.55, air: 0.42, space: 0.07 },
  Warm: { vocalLevel: 1.0, cleanup: 0.58, compression: 0.64, deEss: 0.42, air: 0.24, space: 0.09 },
  Bright: { vocalLevel: 0.96, cleanup: 0.66, compression: 0.52, deEss: 0.7, air: 0.82, space: 0.08 },
  Dry: { vocalLevel: 0.98, cleanup: 0.75, compression: 0.56, deEss: 0.62, air: 0.3, space: 0 },
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

function createImpulse(context: BaseAudioContext, seconds = 1.15, decay = 2.7) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const envelope = Math.pow(1 - i / length, decay);
      data[i] = (Math.random() * 2 - 1) * envelope;
    }
  }
  return impulse;
}

function createVocalChain(context: BaseAudioContext, settings: VocalSettings) {
  const input = context.createGain();
  const highpass = context.createBiquadFilter();
  const mudCut = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const deEss = context.createBiquadFilter();
  const air = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const level = context.createGain();
  const dry = context.createGain();
  const wet = context.createGain();
  const convolver = context.createConvolver();
  const output = context.createGain();

  highpass.type = 'highpass';
  highpass.frequency.value = 72;
  highpass.Q.value = 0.72;

  mudCut.type = 'peaking';
  mudCut.frequency.value = 285;
  mudCut.Q.value = 0.95;
  mudCut.gain.value = -4.2 * settings.cleanup;

  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 0.9;
  presence.gain.value = 1.6 + settings.cleanup * 1.3;

  deEss.type = 'peaking';
  deEss.frequency.value = 6900;
  deEss.Q.value = 1.35;
  deEss.gain.value = -4.8 * settings.deEss;

  air.type = 'highshelf';
  air.frequency.value = 9800;
  air.gain.value = 3.2 * settings.air;

  compressor.threshold.value = -14 - settings.compression * 12;
  compressor.knee.value = 12;
  compressor.ratio.value = 1.8 + settings.compression * 2.8;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.14;

  level.gain.value = settings.vocalLevel;
  dry.gain.value = Math.max(0.72, 1 - settings.space * 0.7);
  wet.gain.value = settings.space;
  convolver.buffer = createImpulse(context);

  input.connect(highpass);
  highpass.connect(mudCut);
  mudCut.connect(presence);
  presence.connect(deEss);
  deEss.connect(air);
  air.connect(compressor);
  compressor.connect(level);
  level.connect(dry).connect(output);
  level.connect(convolver).connect(wet).connect(output);

  return { input, output };
}

function createMasterBus(context: BaseAudioContext) {
  const input = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const safety = context.createGain();
  compressor.threshold.value = -7;
  compressor.knee.value = 9;
  compressor.ratio.value = 2.1;
  compressor.attack.value = 0.004;
  compressor.release.value = 0.13;
  safety.gain.value = 0.94;
  input.connect(compressor).connect(safety);
  return { input, output: safety };
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
  const [settings, setSettings] = useState<VocalSettings>(PRESETS.Natural);
  const [presetName, setPresetName] = useState('Natural');

  function stop() {
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch {}
    }
    sourcesRef.current = [];
    setStatus('Stopped');
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (!preset) return;
    setPresetName(name);
    setSettings({ ...preset });
  }

  function updateSetting(key: keyof VocalSettings, value: number) {
    setPresetName('Custom');
    setSettings((current) => ({ ...current, [key]: value }));
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
    setStatus('Analyzing vocal timing and applying Drob polish…');
    try {
      const { context, backing, guide, drob } = await loadAudio();
      const { playbackRate, desiredOffset, drobSourceOffset } = getAlignment(guide, drob);
      const backingSource = context.createBufferSource();
      const vocalSource = context.createBufferSource();
      const backingGain = context.createGain();
      const vocalChain = createVocalChain(context, settings);
      const master = createMasterBus(context);

      backingSource.buffer = backing;
      vocalSource.buffer = drob;
      vocalSource.playbackRate.value = playbackRate;
      backingGain.gain.value = 0.9;

      backingSource.connect(backingGain).connect(master.input);
      vocalSource.connect(vocalChain.input);
      vocalChain.output.connect(master.input);
      master.output.connect(context.destination);

      const startAt = context.currentTime + 0.15;
      backingSource.start(startAt);
      if (desiredOffset >= 0) vocalSource.start(startAt + desiredOffset);
      else vocalSource.start(startAt, drobSourceOffset);
      sourcesRef.current = [backingSource, vocalSource];
      const offsetMs = Math.round(desiredOffset * 1000);
      const driftPct = Math.round((playbackRate - 1) * 10000) / 100;
      setStatus(`${presetName} polish · ${offsetMs} ms offset · ${driftPct >= 0 ? '+' : ''}${driftPct}% timing correction`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not auto-align these stems.');
    }
  }

  async function renderMaster() {
    setRendering(true);
    setStatus('Rendering polished, aligned Drob master…');
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
      const totalDuration = Math.max(backing.duration, vocalStart + vocalPlayableDuration) + 1.4;
      const offline = new OfflineAudioContext(2, Math.ceil(totalDuration * sampleRate), sampleRate);
      const backingSource = offline.createBufferSource();
      const vocalSource = offline.createBufferSource();
      const backingGain = offline.createGain();
      const vocalChain = createVocalChain(offline, settings);
      const master = createMasterBus(offline);

      backingSource.buffer = backing;
      vocalSource.buffer = drob;
      vocalSource.playbackRate.value = playbackRate;
      backingGain.gain.value = 0.9;

      backingSource.connect(backingGain).connect(master.input);
      vocalSource.connect(vocalChain.input);
      vocalChain.output.connect(master.input);
      master.output.connect(offline.destination);

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
      setStatus(`Polished master rendered · ${offsetMs} ms offset · ${driftPct >= 0 ? '+' : ''}${driftPct}% timing correction`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not render the Drob master.');
    } finally {
      setRendering(false);
    }
  }

  return (
    <div className="playerCard">
      <strong>Drob Vocal Polish + Precision Mix</strong>
      <small>Non-destructive cleanup: low-cut, mud reduction, presence, de-essing, compression, air, light room space, and master protection.</small>

      <div className="chips">
        {Object.keys(PRESETS).map((name) => (
          <button key={name} className={presetName === name ? 'chip activeChip' : 'chip'} onClick={() => applyPreset(name)}>{name}</button>
        ))}
      </div>

      <details>
        <summary>Fine-tune vocal polish</summary>
        <label className="controlLabel">Vocal level · {Math.round(settings.vocalLevel * 100)}%
          <input type="range" min="0.65" max="1.35" step="0.01" value={settings.vocalLevel} onChange={(e) => updateSetting('vocalLevel', Number(e.target.value))} />
        </label>
        <label className="controlLabel">Cleanup · {Math.round(settings.cleanup * 100)}%
          <input type="range" min="0" max="1" step="0.01" value={settings.cleanup} onChange={(e) => updateSetting('cleanup', Number(e.target.value))} />
        </label>
        <label className="controlLabel">Compression · {Math.round(settings.compression * 100)}%
          <input type="range" min="0" max="1" step="0.01" value={settings.compression} onChange={(e) => updateSetting('compression', Number(e.target.value))} />
        </label>
        <label className="controlLabel">De-ess · {Math.round(settings.deEss * 100)}%
          <input type="range" min="0" max="1" step="0.01" value={settings.deEss} onChange={(e) => updateSetting('deEss', Number(e.target.value))} />
        </label>
        <label className="controlLabel">Air · {Math.round(settings.air * 100)}%
          <input type="range" min="0" max="1" step="0.01" value={settings.air} onChange={(e) => updateSetting('air', Number(e.target.value))} />
        </label>
        <label className="controlLabel">Space · {Math.round(settings.space * 100)}%
          <input type="range" min="0" max="0.24" step="0.01" value={settings.space} onChange={(e) => updateSetting('space', Number(e.target.value))} />
        </label>
      </details>

      <div className="mixButtons">
        <button className="primary" onClick={playAligned}>▶ Play Polished Mix</button>
        <button className="secondary" onClick={stop}>■ Stop</button>
      </div>
      {status && <small>{status}</small>}
      <button className="primary" onClick={renderMaster} disabled={rendering}>{rendering ? 'Rendering Polished Master…' : 'Render Polished Drob Master'}</button>
      {masterUrl && (
        <div className="playerCard">
          <strong>Rendered Polished Drob Master</strong>
          <audio controls src={masterUrl} />
          <a className="primary" href={masterUrl} download="AI-Songs-Drob-Polished-Master.wav">Save Polished Master WAV</a>
          <small>This WAV contains the matching backing track and the aligned, polished Drob vocal.</small>
        </div>
      )}
      <details>
        <summary>Solo tracks</summary>
        <small>Backing track</small><audio controls src={backingUrl} />
        <small>Original guide vocal</small><audio controls src={guideVocalUrl} />
        <small>Raw Drob vocal</small><audio controls src={drobVocalUrl} />
      </details>
    </div>
  );
}
