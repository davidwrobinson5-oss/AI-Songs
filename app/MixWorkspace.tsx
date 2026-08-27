'use client';

import { useRef, useState } from 'react';

type TrackKey = 'music' | 'lead' | 'double' | 'harmony';

type TrackSettings = {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
};

type MixSettings = {
  cleanup: number;
  compression: number;
  deEss: number;
  air: number;
  reverb: number;
  delay: number;
  timingMs: number;
  masterLevel: number;
  glue: number;
};

type Props = {
  musicUrl: string;
  leadVocalUrl: string;
  guideVocalUrl?: string;
  songTitle: string;
  onMasterRendered: (blob: Blob) => void | Promise<void>;
};

type Alignment = {
  playbackRate: number;
  startOffset: number;
  sourceOffset: number;
};

const DEFAULT_TRACKS: Record<TrackKey, TrackSettings> = {
  music: { volume: 0.92, pan: 0, mute: false, solo: false },
  lead: { volume: 1, pan: 0, mute: false, solo: false },
  double: { volume: 0.52, pan: -0.28, mute: false, solo: false },
  harmony: { volume: 0.48, pan: 0.28, mute: false, solo: false },
};

const DEFAULT_MIX: MixSettings = {
  cleanup: 0.62,
  compression: 0.58,
  deEss: 0.54,
  air: 0.4,
  reverb: 0.08,
  delay: 0.03,
  timingMs: 0,
  masterLevel: 0.94,
  glue: 0.5,
};

function firstOnsetSeconds(buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const windowSize = Math.max(256, Math.floor(buffer.sampleRate * 0.02));
  const values: number[] = [];
  let peak = 0;
  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(buffer.length, start + windowSize);
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
    values.push(rms);
    peak = Math.max(peak, rms);
  }
  const threshold = Math.max(0.0035, peak * 0.08);
  let consecutive = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i] >= threshold) {
      consecutive++;
      if (consecutive >= 3) return Math.max(0, (i - 2) * windowSize / buffer.sampleRate);
    } else consecutive = 0;
  }
  return 0;
}

function lastActiveSeconds(buffer: AudioBuffer) {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
  const windowSize = Math.max(256, Math.floor(buffer.sampleRate * 0.02));
  const values: number[] = [];
  let peak = 0;
  for (let start = 0; start < buffer.length; start += windowSize) {
    const end = Math.min(buffer.length, start + windowSize);
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
    values.push(rms);
    peak = Math.max(peak, rms);
  }
  const threshold = Math.max(0.0035, peak * 0.06);
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] >= threshold) return Math.min(buffer.duration, (i + 1) * windowSize / buffer.sampleRate);
  }
  return buffer.duration;
}

function getAlignment(guide: AudioBuffer | null, vocal: AudioBuffer, manualMs = 0): Alignment {
  if (!guide) return { playbackRate: 1, startOffset: Math.max(0, manualMs / 1000), sourceOffset: Math.max(0, -manualMs / 1000) };
  const guideOnset = firstOnsetSeconds(guide);
  const vocalOnset = firstOnsetSeconds(vocal);
  const guideEnd = lastActiveSeconds(guide);
  const vocalEnd = lastActiveSeconds(vocal);
  const guideActive = Math.max(0.25, guideEnd - guideOnset);
  const vocalActive = Math.max(0.25, vocalEnd - vocalOnset);
  const playbackRate = Math.min(1.04, Math.max(0.96, vocalActive / guideActive));
  const desired = guideOnset - vocalOnset / playbackRate + manualMs / 1000;
  return {
    playbackRate,
    startOffset: Math.max(0, desired),
    sourceOffset: desired < 0 ? Math.min(-desired * playbackRate, vocal.duration) : 0,
  };
}

function createImpulse(context: BaseAudioContext, seconds = 1.2, decay = 2.8) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function createVocalChain(context: BaseAudioContext, mix: MixSettings) {
  const input = context.createGain();
  const highpass = context.createBiquadFilter();
  const mud = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const deEss = context.createBiquadFilter();
  const air = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const dry = context.createGain();
  const reverb = context.createConvolver();
  const reverbGain = context.createGain();
  const delay = context.createDelay(0.5);
  const delayGain = context.createGain();
  const output = context.createGain();

  highpass.type = 'highpass';
  highpass.frequency.value = 72;
  mud.type = 'peaking';
  mud.frequency.value = 280;
  mud.Q.value = 0.95;
  mud.gain.value = -4 * mix.cleanup;
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 0.9;
  presence.gain.value = 1.3 + 2.2 * mix.cleanup;
  deEss.type = 'peaking';
  deEss.frequency.value = 6800;
  deEss.Q.value = 1.3;
  deEss.gain.value = -5 * mix.deEss;
  air.type = 'highshelf';
  air.frequency.value = 9800;
  air.gain.value = 3.5 * mix.air;
  compressor.threshold.value = -14 - 13 * mix.compression;
  compressor.knee.value = 12;
  compressor.ratio.value = 1.8 + 3 * mix.compression;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.14;
  dry.gain.value = 1;
  reverb.buffer = createImpulse(context);
  reverbGain.gain.value = mix.reverb;
  delay.delayTime.value = 0.16;
  delayGain.gain.value = mix.delay;

  input.connect(highpass).connect(mud).connect(presence).connect(deEss).connect(air).connect(compressor);
  compressor.connect(dry).connect(output);
  compressor.connect(reverb).connect(reverbGain).connect(output);
  compressor.connect(delay).connect(delayGain).connect(output);
  return { input, output };
}

function createMasterBus(context: BaseAudioContext, mix: MixSettings) {
  const input = context.createGain();
  const compressor = context.createDynamicsCompressor();
  const output = context.createGain();
  compressor.threshold.value = -5 - mix.glue * 8;
  compressor.knee.value = 8;
  compressor.ratio.value = 1.5 + mix.glue * 1.8;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.16;
  output.gain.value = mix.masterLevel;
  input.connect(compressor).connect(output);
  return { input, output };
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const blockAlign = channels * 2;
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
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
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

async function fetchAudioBytes(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load one of the song tracks.');
  return response.arrayBuffer();
}

export default function MixWorkspace({ musicUrl, leadVocalUrl, guideVocalUrl = '', songTitle, onMasterRendered }: Props) {
  const contextRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const [tracks, setTracks] = useState<Record<TrackKey, TrackSettings>>(DEFAULT_TRACKS);
  const [mix, setMix] = useState<MixSettings>(DEFAULT_MIX);
  const [doubleUrl, setDoubleUrl] = useState('');
  const [harmonyUrl, setHarmonyUrl] = useState('');
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

  function updateTrack(key: TrackKey, patch: Partial<TrackSettings>) {
    setTracks((current) => ({ ...current, [key]: { ...current[key], ...patch } }));
  }

  function updateMix(key: keyof MixSettings, value: number) {
    setMix((current) => ({ ...current, [key]: value }));
  }

  function loadUpload(kind: 'double' | 'harmony', file?: File) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (kind === 'double') {
      if (doubleUrl) URL.revokeObjectURL(doubleUrl);
      setDoubleUrl(url);
    } else {
      if (harmonyUrl) URL.revokeObjectURL(harmonyUrl);
      setHarmonyUrl(url);
    }
  }

  async function decodeAll() {
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('This browser does not support the mixer audio engine.');
    const context = contextRef.current || new AudioContextCtor();
    contextRef.current = context;
    if (context.state === 'suspended') await context.resume();

    const urls: Record<TrackKey, string> = {
      music: musicUrl,
      lead: leadVocalUrl,
      double: doubleUrl,
      harmony: harmonyUrl,
    };
    const buffers = {} as Record<TrackKey, AudioBuffer | null>;
    for (const key of Object.keys(urls) as TrackKey[]) {
      buffers[key] = urls[key] ? await context.decodeAudioData((await fetchAudioBytes(urls[key])).slice(0)) : null;
    }
    const guide = guideVocalUrl ? await context.decodeAudioData((await fetchAudioBytes(guideVocalUrl)).slice(0)) : null;
    return { context, buffers, guide };
  }

  function audible(key: TrackKey) {
    const anySolo = (Object.keys(tracks) as TrackKey[]).some((track) => tracks[track].solo);
    if (tracks[key].mute) return false;
    return !anySolo || tracks[key].solo;
  }

  function connectTrack(context: BaseAudioContext, source: AudioBufferSourceNode, key: TrackKey, masterInput: AudioNode) {
    const gain = context.createGain();
    const panner = context.createStereoPanner();
    gain.gain.value = audible(key) ? tracks[key].volume : 0;
    panner.pan.value = tracks[key].pan;
    if (key === 'music') {
      source.connect(gain).connect(panner).connect(masterInput);
      return;
    }
    const vocal = createVocalChain(context, mix);
    source.connect(vocal.input);
    vocal.output.connect(gain).connect(panner).connect(masterInput);
  }

  function startTrack(source: AudioBufferSourceNode, key: TrackKey, startAt: number, guide: AudioBuffer | null) {
    const buffer = source.buffer;
    if (!buffer) return;
    if (key === 'music') {
      source.start(startAt);
      return;
    }
    const alignment = getAlignment(guide, buffer, key === 'lead' ? mix.timingMs : 0);
    source.playbackRate.value = alignment.playbackRate;
    source.start(startAt + alignment.startOffset, alignment.sourceOffset);
  }

  async function playMix() {
    stop();
    if (!musicUrl && !leadVocalUrl) {
      setStatus('Create or load a song first.');
      return;
    }
    setStatus('Loading multitrack mix…');
    try {
      const { context, buffers, guide } = await decodeAll();
      const master = createMasterBus(context, mix);
      master.output.connect(context.destination);
      const startAt = context.currentTime + 0.12;
      const started: AudioBufferSourceNode[] = [];
      for (const key of Object.keys(buffers) as TrackKey[]) {
        const buffer = buffers[key];
        if (!buffer) continue;
        const source = context.createBufferSource();
        source.buffer = buffer;
        connectTrack(context, source, key, master.input);
        startTrack(source, key, startAt, guide);
        started.push(source);
      }
      sourcesRef.current = started;
      setStatus('Playing current mix. Changes apply the next time you press Play Mix.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not play the mix.');
    }
  }

  async function renderMaster() {
    if (!musicUrl && !leadVocalUrl) {
      setStatus('Create or load a song first.');
      return;
    }
    setRendering(true);
    setStatus('Rendering full-quality WAV master…');
    try {
      const { buffers, guide } = await decodeAll();
      const sampleRate = 44100;
      let totalDuration = 1;
      for (const key of Object.keys(buffers) as TrackKey[]) {
        const buffer = buffers[key];
        if (!buffer) continue;
        if (key === 'music') totalDuration = Math.max(totalDuration, buffer.duration);
        else {
          const alignment = getAlignment(guide, buffer, key === 'lead' ? mix.timingMs : 0);
          totalDuration = Math.max(totalDuration, alignment.startOffset + Math.max(0, buffer.duration - alignment.sourceOffset) / alignment.playbackRate);
        }
      }
      const offline = new OfflineAudioContext(2, Math.ceil((totalDuration + 1.5) * sampleRate), sampleRate);
      const master = createMasterBus(offline, mix);
      master.output.connect(offline.destination);
      for (const key of Object.keys(buffers) as TrackKey[]) {
        const buffer = buffers[key];
        if (!buffer) continue;
        const source = offline.createBufferSource();
        source.buffer = buffer;
        connectTrack(offline, source, key, master.input);
        startTrack(source, key, 0, guide);
      }
      const rendered = await offline.startRendering();
      const blob = audioBufferToWav(rendered);
      if (masterUrl) URL.revokeObjectURL(masterUrl);
      setMasterUrl(URL.createObjectURL(blob));
      await onMasterRendered(blob);
      setStatus('Master rendered and saved as a new Songs version.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not render the master.');
    } finally {
      setRendering(false);
    }
  }

  const channel = (key: TrackKey, label: string, available: boolean) => (
    <div className="mixChannel" key={key}>
      <div className="mixChannelHead">
        <div><strong>{label}</strong><small>{available ? 'Ready' : 'No track yet'}</small></div>
        <div className="mixToggleRow">
          <button className={tracks[key].mute ? 'mixTiny activeMixTiny' : 'mixTiny'} onClick={() => updateTrack(key, { mute: !tracks[key].mute })}>M</button>
          <button className={tracks[key].solo ? 'mixTiny activeMixTiny' : 'mixTiny'} onClick={() => updateTrack(key, { solo: !tracks[key].solo })}>S</button>
        </div>
      </div>
      <label>Volume <span>{Math.round(tracks[key].volume * 100)}%</span></label>
      <input type="range" min="0" max="1.5" step="0.01" value={tracks[key].volume} onChange={(e) => updateTrack(key, { volume: Number(e.target.value) })} />
      <label>Pan <span>{tracks[key].pan === 0 ? 'C' : tracks[key].pan < 0 ? `L${Math.round(Math.abs(tracks[key].pan) * 100)}` : `R${Math.round(tracks[key].pan * 100)}`}</span></label>
      <input type="range" min="-1" max="1" step="0.01" value={tracks[key].pan} onChange={(e) => updateTrack(key, { pan: Number(e.target.value) })} />
    </div>
  );

  return (
    <section className="panel mixConsole">
      <div className="mixTopline">
        <div><p className="eyebrow">Now mixing</p><h2>{songTitle || 'Untitled Song'}</h2></div>
        <div className="mixBadge">4-track</div>
      </div>

      <div className="mixTransport">
        <button className="primary" onClick={playMix}>▶ Play Mix</button>
        <button className="secondary" onClick={stop}>■ Stop</button>
      </div>

      <div className="mixChannels">
        {channel('music', 'Music', Boolean(musicUrl))}
        {channel('lead', 'Lead Vocal', Boolean(leadVocalUrl))}
        {channel('double', 'Double', Boolean(doubleUrl))}
        {channel('harmony', 'Harmony', Boolean(harmonyUrl))}
      </div>

      <div className="mixUploads">
        <label className="secondary">＋ Add Double<input type="file" accept="audio/*" hidden onChange={(e) => loadUpload('double', e.target.files?.[0])} /></label>
        <label className="secondary">＋ Add Harmony<input type="file" accept="audio/*" hidden onChange={(e) => loadUpload('harmony', e.target.files?.[0])} /></label>
      </div>

      <div className="mixFx">
        <h3>Vocal polish</h3>
        {([
          ['cleanup', 'EQ / Cleanup'],
          ['compression', 'Compression'],
          ['deEss', 'De-ess'],
          ['air', 'Air / Clarity'],
          ['reverb', 'Reverb'],
          ['delay', 'Delay'],
        ] as Array<[keyof MixSettings, string]>).map(([key, label]) => (
          <label key={key}>{label}<span>{Math.round(mix[key] * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix[key]} onChange={(e) => updateMix(key, Number(e.target.value))} /></label>
        ))}
        <label>Lead timing <span>{mix.timingMs >= 0 ? '+' : ''}{Math.round(mix.timingMs)} ms</span><input type="range" min="-500" max="500" step="5" value={mix.timingMs} onChange={(e) => updateMix('timingMs', Number(e.target.value))} /></label>
      </div>

      <div className="mixFx">
        <h3>Master bus</h3>
        <label>Master level <span>{Math.round(mix.masterLevel * 100)}%</span><input type="range" min="0.5" max="1.2" step="0.01" value={mix.masterLevel} onChange={(e) => updateMix('masterLevel', Number(e.target.value))} /></label>
        <label>Glue compression <span>{Math.round(mix.glue * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix.glue} onChange={(e) => updateMix('glue', Number(e.target.value))} /></label>
      </div>

      <button className="primary" onClick={renderMaster} disabled={rendering}>{rendering ? 'Rendering Master…' : '🎚️ Render & Save Master'}</button>
      {status && <div className="statusBox">{status}</div>}
      {masterUrl && <div className="playerCard"><strong>Latest master</strong><audio controls src={masterUrl} /><small>Saved to Songs as a new version. Use Songs to share or download MP3/WAV.</small></div>}
    </section>
  );
}
