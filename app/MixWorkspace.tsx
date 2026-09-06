'use client';

import { useEffect, useRef, useState } from 'react';

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

type WorkspaceMode = 'mix' | 'remix' | 'master';
type MasterProfileKey = 'streaming' | 'video' | 'loud' | 'dynamic' | 'archive';

const REMIX_STYLES = [
  { id: 'modern-pop', label: 'Modern Pop', prompt: 'modern polished pop, punchy drums, deep controlled bass, bright wide synths, clean contemporary production' },
  { id: 'worship', label: 'Worship / Arena', prompt: 'modern worship and arena pop, spacious guitars and keys, emotional builds, wide drums, uplifting cinematic dynamics' },
  { id: 'hiphop', label: 'Hip-Hop', prompt: 'modern hip-hop, hard drums, deep 808 bass, tasteful keys and textures, strong pocket, polished commercial production' },
  { id: 'rnb', label: 'R&B / Soul', prompt: 'modern R&B and soul, warm bass, rich keys, silky textures, laid-back pocket, premium vocal-friendly production' },
  { id: 'gospel', label: 'Gospel', prompt: 'contemporary gospel, expressive keys and organ, powerful drums and bass, uplifting dynamics, live musical energy' },
  { id: 'funk', label: 'Funk', prompt: 'modern funk, tight live drums, syncopated bass, rhythmic guitar and keys, energetic groove, polished production' },
  { id: 'rock', label: 'Rock', prompt: 'modern rock, powerful live drums, wide guitars, strong bass, energetic dynamics, clean radio-ready production' },
  { id: 'edm', label: 'EDM / Dance', prompt: 'modern electronic dance production, four-on-the-floor energy, powerful low end, bright synths, builds and drops' },
  { id: 'acoustic', label: 'Acoustic', prompt: 'organic acoustic production, natural piano and guitar, warm percussion, intimate dynamics, spacious realistic room sound' },
  { id: 'cinematic', label: 'Cinematic', prompt: 'cinematic production, orchestral textures, deep percussion, emotional swells, wide atmospheric sound design' },
];

type ExportQualityKey = 'lossless' | 'studio' | 'hires';
type MasterSampleRate = 44100 | 48000 | 96000;

const MASTER_SAMPLE_RATES: Array<{ value: MasterSampleRate; label: string; use: string }> = [
  { value: 44100, label: '44.1 kHz', use: 'Music' },
  { value: 48000, label: '48 kHz', use: 'Studio / Video' },
  { value: 96000, label: '96 kHz', use: 'Hi-Res' },
];

type ExportQuality = {
  label: string;
  description: string;
  sampleRate: number;
  bitDepth: 16 | 24;
};

const EXPORT_QUALITIES: Record<ExportQualityKey, ExportQuality> = {
  lossless: { label: 'Lossless', description: '16-bit / 44.1 kHz WAV · lossless PCM', sampleRate: 44100, bitDepth: 16 },
  studio: { label: 'Studio', description: '24-bit / 48 kHz WAV · studio-resolution PCM', sampleRate: 48000, bitDepth: 24 },
  hires: { label: 'Hi-Res', description: '24-bit / 96 kHz WAV · high-resolution PCM', sampleRate: 96000, bitDepth: 24 },
};

type MasterMetrics = {
  integratedLufs: number;
  truePeakDb: number;
  samplePeakDb: number;
  appliedGainDb: number;
  targetLufs: number | null;
  ceilingDb: number;
  targetLimited: boolean;
};

const MASTER_PROFILES: Record<MasterProfileKey, { label: string; description: string; masterLevel: number; glue: number; targetLufs: number | null; ceilingDb: number }> = {
  streaming: { label: 'Streaming', description: 'AI Songs target: -14 LUFS · -1.0 dBTP ceiling. Balanced for normalization-oriented streaming playback.', masterLevel: 0.9, glue: 0.54, targetLufs: -14, ceilingDb: -1.0 },
  video: { label: 'YouTube / Video', description: 'AI Songs target: -14 LUFS · -1.0 dBTP ceiling. Clear and present with video-friendly headroom.', masterLevel: 0.9, glue: 0.48, targetLufs: -14, ceilingDb: -1.0 },
  loud: { label: 'Loud / Car / Club', description: 'AI Songs target: -10 LUFS · -0.8 dBTP ceiling. Denser and more aggressive for high-energy playback.', masterLevel: 0.99, glue: 0.76, targetLufs: -10, ceilingDb: -0.8 },
  dynamic: { label: 'Dynamic / Hi-Fi', description: 'AI Songs target: -16 LUFS · -1.0 dBTP ceiling. More transient impact and breathing room.', masterLevel: 0.86, glue: 0.3, targetLufs: -16, ceilingDb: -1.0 },
  archive: { label: 'WAV / Archive', description: 'No loudness normalization · -2.0 dBTP ceiling. Conservative full-resolution master for storage or later mastering.', masterLevel: 0.84, glue: 0.24, targetLufs: null, ceilingDb: -2.0 },
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

function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 16) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const bytesPerSample = bitDepth / 8;
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
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(Math.min(i, buffer.numberOfChannels - 1)));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i] || 0));
      if (bitDepth === 24) {
        let value = Math.round(sample < 0 ? sample * 0x800000 : sample * 0x7fffff);
        if (value < 0) value += 0x1000000;
        view.setUint8(offset, value & 0xff);
        view.setUint8(offset + 1, (value >> 8) & 0xff);
        view.setUint8(offset + 2, (value >> 16) & 0xff);
        offset += 3;
      } else {
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

type BiquadCoefficients = { b0: number; b1: number; b2: number; a1: number; a2: number };

type BiquadState = { x1: number; x2: number; y1: number; y2: number };

function highPassCoefficients(sampleRate: number, frequency: number, q: number): BiquadCoefficients {
  const omega = 2 * Math.PI * frequency / sampleRate;
  const cos = Math.cos(omega);
  const alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha;
  return {
    b0: ((1 + cos) / 2) / a0,
    b1: (-(1 + cos)) / a0,
    b2: ((1 + cos) / 2) / a0,
    a1: (-2 * cos) / a0,
    a2: (1 - alpha) / a0,
  };
}

function highShelfCoefficients(sampleRate: number, frequency: number, gainDb: number): BiquadCoefficients {
  const A = Math.pow(10, gainDb / 40);
  const omega = 2 * Math.PI * frequency / sampleRate;
  const cos = Math.cos(omega);
  const sin = Math.sin(omega);
  const alpha = sin / 2 * Math.sqrt(2);
  const beta = 2 * Math.sqrt(A) * alpha;
  const a0 = (A + 1) - (A - 1) * cos + beta;
  return {
    b0: A * ((A + 1) + (A - 1) * cos + beta) / a0,
    b1: -2 * A * ((A - 1) + (A + 1) * cos) / a0,
    b2: A * ((A + 1) + (A - 1) * cos - beta) / a0,
    a1: 2 * ((A - 1) - (A + 1) * cos) / a0,
    a2: ((A + 1) - (A - 1) * cos - beta) / a0,
  };
}

function processBiquad(sample: number, coefficients: BiquadCoefficients, state: BiquadState) {
  const output = coefficients.b0 * sample + coefficients.b1 * state.x1 + coefficients.b2 * state.x2 - coefficients.a1 * state.y1 - coefficients.a2 * state.y2;
  state.x2 = state.x1;
  state.x1 = sample;
  state.y2 = state.y1;
  state.y1 = output;
  return output;
}

function amplitudeDb(value: number) {
  return 20 * Math.log10(Math.max(1e-9, value));
}

function loudnessFromEnergy(energy: number) {
  return -0.691 + 10 * Math.log10(Math.max(1e-12, energy));
}

function estimateIntersamplePeak(buffer: AudioBuffer, samplePeak: number) {
  let peak = samplePeak;
  const threshold = Math.max(0.05, samplePeak * 0.45);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 1; i < data.length - 2; i++) {
      const p0 = data[i - 1] || 0;
      const p1 = data[i] || 0;
      const p2 = data[i + 1] || 0;
      const p3 = data[i + 2] || 0;
      if (Math.max(Math.abs(p0), Math.abs(p1), Math.abs(p2), Math.abs(p3)) < threshold) continue;
      for (const t of [0.25, 0.5, 0.75]) {
        const t2 = t * t;
        const t3 = t2 * t;
        const value = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
        peak = Math.max(peak, Math.abs(value));
      }
    }
  }
  return peak;
}

function measureMaster(buffer: AudioBuffer) {
  const sampleRate = buffer.sampleRate;
  const hopSamples = Math.max(1, Math.round(sampleRate * 0.1));
  const hopCount = Math.ceil(buffer.length / hopSamples);
  const hopEnergy = new Float64Array(hopCount);
  const highPass = highPassCoefficients(sampleRate, 38.1358, 0.5003);
  const highShelf = highShelfCoefficients(sampleRate, 1681.974, 4.0);
  let samplePeak = 0;

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    const hpState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    const shelfState: BiquadState = { x1: 0, x2: 0, y1: 0, y2: 0 };
    for (let i = 0; i < data.length; i++) {
      const dry = data[i] || 0;
      samplePeak = Math.max(samplePeak, Math.abs(dry));
      const hp = processBiquad(dry, highPass, hpState);
      const weighted = processBiquad(hp, highShelf, shelfState);
      hopEnergy[Math.floor(i / hopSamples)] += weighted * weighted;
    }
  }

  const blockEnergies: number[] = [];
  for (let hop = 0; hop + 3 < hopCount; hop++) {
    let energy = 0;
    for (let offset = 0; offset < 4; offset++) energy += hopEnergy[hop + offset];
    energy /= hopSamples * 4;
    if (loudnessFromEnergy(energy) >= -70) blockEnergies.push(energy);
  }

  let integratedLufs = -70;
  if (blockEnergies.length) {
    const absoluteMean = blockEnergies.reduce((sum, value) => sum + value, 0) / blockEnergies.length;
    const relativeGate = loudnessFromEnergy(absoluteMean) - 10;
    const gated = blockEnergies.filter((energy) => loudnessFromEnergy(energy) >= Math.max(-70, relativeGate));
    if (gated.length) {
      const gatedMean = gated.reduce((sum, value) => sum + value, 0) / gated.length;
      integratedLufs = loudnessFromEnergy(gatedMean);
    }
  }

  const truePeak = estimateIntersamplePeak(buffer, samplePeak);
  return {
    integratedLufs,
    samplePeakDb: amplitudeDb(samplePeak),
    truePeakDb: amplitudeDb(truePeak),
  };
}

function applyLinearGain(buffer: AudioBuffer, gainDb: number) {
  const gain = Math.pow(10, gainDb / 20);
  if (Math.abs(gainDb) < 0.005) return;
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) data[i] *= gain;
  }
}

async function normalizeMasterForProfile(
  buffer: AudioBuffer,
  profile: { targetLufs: number | null; ceilingDb: number },
): Promise<{ buffer: AudioBuffer; metrics: MasterMetrics }> {
  const before = measureMaster(buffer);
  const desiredGainDb = profile.targetLufs === null ? 0 : profile.targetLufs - before.integratedLufs;
  const ceilingGainDb = profile.ceilingDb - before.truePeakDb;
  const rawGainDb = Math.min(desiredGainDb, ceilingGainDb);
  const appliedGainDb = Math.max(-18, Math.min(12, rawGainDb));
  applyLinearGain(buffer, appliedGainDb);

  const metrics: MasterMetrics = {
    integratedLufs: before.integratedLufs + appliedGainDb,
    truePeakDb: before.truePeakDb + appliedGainDb,
    samplePeakDb: before.samplePeakDb + appliedGainDb,
    appliedGainDb,
    targetLufs: profile.targetLufs,
    ceilingDb: profile.ceilingDb,
    targetLimited: profile.targetLufs !== null && appliedGainDb < desiredGainDb - 0.15,
  };
  return { buffer, metrics };
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
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('mix');
  const [remixStyle, setRemixStyle] = useState('modern-pop');
  const [remixCustom, setRemixCustom] = useState('');
  const [remixStrength, setRemixStrength] = useState<'medium' | 'high' | 'xhigh'>('high');
  const [remixing, setRemixing] = useState(false);
  const [remixUrl, setRemixUrl] = useState('');
  const [selectedMasterProfile, setSelectedMasterProfile] = useState<MasterProfileKey>('streaming');
  const [masterMetrics, setMasterMetrics] = useState<MasterMetrics | null>(null);
  const [exportQuality, setExportQuality] = useState<ExportQualityKey>('studio');
  const [masterSampleRate, setMasterSampleRate] = useState<MasterSampleRate>(48000);
  const effectiveMusicUrl = remixUrl || musicUrl;

  function stop() {
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch {}
    }
    sourcesRef.current = [];
    setStatus('Stopped');
  }

  useEffect(() => {
    const stopWebAudio = () => stop();
    window.addEventListener('ai-songs-stop-webaudio', stopWebAudio);
    return () => window.removeEventListener('ai-songs-stop-webaudio', stopWebAudio);
  }, []);

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
      music: effectiveMusicUrl,
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
    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));
    stop();
    if (!effectiveMusicUrl && !leadVocalUrl) {
      setStatus('Create or load a song first.');
      return;
    }
    setStatus('Turning up the heat…');
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

  async function renderMaster(profileKey: MasterProfileKey = selectedMasterProfile) {
    if (!effectiveMusicUrl && !leadVocalUrl) {
      setStatus('Create or load a song first.');
      return;
    }
    const profile = MASTER_PROFILES[profileKey];
    const quality = EXPORT_QUALITIES[exportQuality];
    setSelectedMasterProfile(profileKey);
    setRendering(true);
    setStatus(`Turning up the heat…`);
    try {
      const { buffers, guide } = await decodeAll();
      const masterMix = { ...mix, masterLevel: profile.masterLevel, glue: profile.glue };
      const sampleRate = masterSampleRate;
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
      const master = createMasterBus(offline, masterMix);
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
      const normalizedMaster = await normalizeMasterForProfile(rendered, profile);
      const metrics = normalizedMaster.metrics;
      const blob = audioBufferToWav(normalizedMaster.buffer, quality.bitDepth);
      setMasterMetrics(metrics);
      if (masterUrl) URL.revokeObjectURL(masterUrl);
      setMasterUrl(URL.createObjectURL(blob));
      await onMasterRendered(blob);
      setStatus(`${profile.label} · ${quality.label} ${quality.bitDepth}-bit/${masterSampleRate === 44100 ? '44.1' : Math.round(masterSampleRate / 1000)} kHz · ${metrics.integratedLufs.toFixed(1)} LUFS est. · ${metrics.truePeakDb.toFixed(1)} dBTP est.${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not render the master.');
    } finally {
      setRendering(false);
    }
  }

  async function createRemix() {
    const sourceUrl = effectiveMusicUrl;
    if (!sourceUrl) {
      setStatus('Create or load music before making a remix.');
      return;
    }
    const selectedStyle = REMIX_STYLES.find((style) => style.id === remixStyle) || REMIX_STYLES[0];
    const styleDirection = [selectedStyle.prompt, remixCustom.trim()].filter(Boolean).join(', ');
    setRemixing(true);
    setStatus(`Turning up the heat…`);
    try {
      const sourceResponse = await fetch(sourceUrl);
      if (!sourceResponse.ok) throw new Error('Could not load the current backing track.');
      const sourceBlob = await sourceResponse.blob();
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('This browser cannot analyze the remix source.');
      const context = contextRef.current || new AudioContextCtor();
      contextRef.current = context;
      const decoded = await context.decodeAudioData((await sourceBlob.arrayBuffer()).slice(0));
      const durationMs = Math.min(300000, Math.max(3000, Math.round(decoded.duration * 1000)));

      const form = new FormData();
      form.append('file', sourceBlob, 'current-backing.mp3');
      form.append('style', styleDirection);
      form.append('duration_ms', String(durationMs));
      form.append('condition_strength', remixStrength);
      const response = await fetch('/api/elevenlabs/remix', { method: 'POST', body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Could not create this remix.');
      }
      const blob = await response.blob();
      if (remixUrl) URL.revokeObjectURL(remixUrl);
      setRemixUrl(URL.createObjectURL(blob));
      setStatus(`${selectedStyle.label} remix ready. It is now the backing used by Mix and Master until you choose Original.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not create this remix.');
    } finally {
      setRemixing(false);
    }
  }

  function useOriginalBacking() {
    if (remixUrl) URL.revokeObjectURL(remixUrl);
    setRemixUrl('');
    setStatus('Original backing restored.');
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
        <div><p className="eyebrow">Finish the record</p><h2>{songTitle || 'Untitled Song'}</h2></div>
        <div className="mixBadge">{workspaceMode === 'mix' ? 'Mix' : workspaceMode === 'remix' ? 'Remix' : 'Master'}</div>
      </div>

      <div className="modeGrid" style={{ marginBottom: 16 }}>
        <button className={workspaceMode === 'mix' ? 'modeCard active' : 'modeCard'} onClick={() => setWorkspaceMode('mix')}>
          <span className="icon">🎚️</span><strong>Mix</strong><small>Balance music, Drob, doubles and harmonies. Shape the vocal and stereo image.</small>
        </button>
        <button className={workspaceMode === 'remix' ? 'modeCard active' : 'modeCard'} onClick={() => setWorkspaceMode('remix')}>
          <span className="icon">🔄</span><strong>Remix</strong><small>Re-produce the backing in a new style while keeping your lead vocal separate.</small>
        </button>
        <button className={workspaceMode === 'master' ? 'modeCard active' : 'modeCard'} onClick={() => setWorkspaceMode('master')}>
          <span className="icon">💿</span><strong>Master</strong><small>Render the current original or remix using an output-focused mastering profile.</small>
        </button>
      </div>

      {remixUrl && <div className="statusBox">🔄 Remix backing is active. Mix and Master are using the remix instead of the original.</div>}

      {workspaceMode === 'mix' && (
        <>
          <div className="mixTransport">
            <button className="primary" onClick={playMix}>▶ Play Mix</button>
            <button className="secondary" onClick={stop}>■ Stop</button>
          </div>

          <div className="mixChannels">
            {channel('music', remixUrl ? 'Remix Music' : 'Music', Boolean(effectiveMusicUrl))}
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
            {([['cleanup', 'EQ / Cleanup'], ['compression', 'Compression'], ['deEss', 'De-ess'], ['air', 'Air / Clarity'], ['reverb', 'Reverb'], ['delay', 'Delay']] as Array<[keyof MixSettings, string]>).map(([key, label]) => (
              <label key={key}>{label}<span>{Math.round(mix[key] * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={mix[key]} onChange={(e) => updateMix(key, Number(e.target.value))} /></label>
            ))}
            <label>Lead timing <span>{mix.timingMs >= 0 ? '+' : ''}{Math.round(mix.timingMs)} ms</span><input type="range" min="-500" max="500" step="5" value={mix.timingMs} onChange={(e) => updateMix('timingMs', Number(e.target.value))} /></label>
          </div>
        </>
      )}

      {workspaceMode === 'remix' && (
        <>
          <div className="playerCard">
            <strong>Choose a remix style</strong>
            <small>The backing is regenerated section-by-section from the current song. Drob stays separate so you keep the same vocal identity.</small>
            <div className="chips" style={{ marginTop: 10 }}>
              {REMIX_STYLES.map((style) => <button key={style.id} className={remixStyle === style.id ? 'chip activeChip' : 'chip'} onClick={() => setRemixStyle(style.id)}>{style.label}</button>)}
            </div>
            <label className="controlLabel">Extra direction</label>
            <textarea value={remixCustom} onChange={(event) => setRemixCustom(event.target.value)} maxLength={500} placeholder="Example: darker drums, warmer piano, more live bass, bigger chorus…" />
          </div>

          <div className="playerCard">
            <strong>How far should it move?</strong>
            <div className="chips">
              <button className={remixStrength === 'xhigh' ? 'chip activeChip' : 'chip'} onClick={() => setRemixStrength('xhigh')}>Keep Close</button>
              <button className={remixStrength === 'high' ? 'chip activeChip' : 'chip'} onClick={() => setRemixStrength('high')}>Balanced</button>
              <button className={remixStrength === 'medium' ? 'chip activeChip' : 'chip'} onClick={() => setRemixStrength('medium')}>More Different</button>
            </div>
            <small>Keep Close follows the original backing more strongly. More Different gives the new style more freedom.</small>
          </div>

          <button className="primary" onClick={createRemix} disabled={remixing || !effectiveMusicUrl}>{remixing ? 'Turning up the heat…' : '🔄 Create Remix'}</button>
          {remixUrl && (
            <div className="playerCard">
              <strong>Current remix backing</strong>
              <audio controls src={remixUrl} />
              <div className="mixButtons">
                <button className="primary" onClick={() => setWorkspaceMode('mix')}>Mix This Remix</button>
                <button className="secondary" onClick={useOriginalBacking}>Use Original</button>
              </div>
              <small>The existing lead, double and harmony tracks are not regenerated. They remain available in Mix.</small>
            </div>
          )}
        </>
      )}

      {workspaceMode === 'master' && (
        <>
          <div className="playerCard">
            <strong>Master for the destination</strong>
            <small>Each profile now measures gated K-weighted integrated loudness and a mobile-safe 4× intersample peak estimate, then adjusts final level without crossing the selected peak ceiling. Measurements are production estimates, not a certified broadcast meter.</small>
            {masterMetrics && (
              <div className="statusBox">
                Measured master: {masterMetrics.integratedLufs.toFixed(1)} LUFS est. · {masterMetrics.truePeakDb.toFixed(1)} dBTP est. · sample peak {masterMetrics.samplePeakDb.toFixed(1)} dBFS · gain {masterMetrics.appliedGainDb >= 0 ? '+' : ''}{masterMetrics.appliedGainDb.toFixed(1)} dB{masterMetrics.targetLimited ? ' · peak-limited before loudness target' : ''}
              </div>
            )}
            <div className="modeGrid" style={{ marginTop: 10 }}>
              {(Object.entries(MASTER_PROFILES) as Array<[MasterProfileKey, typeof MASTER_PROFILES[MasterProfileKey]]>).map(([key, profile]) => (
                <button key={key} className={selectedMasterProfile === key ? 'modeCard active' : 'modeCard'} onClick={() => setSelectedMasterProfile(key)}>
                  <strong>{profile.label}</strong><small>{profile.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="playerCard qualityCard">
            <strong>Export quality</strong>
            <small>Choose the actual WAV render format. Hi-Res creates real 24-bit/96 kHz PCM, but it cannot restore detail already lost in a compressed AI source.</small>
            <div className="modeGrid" style={{ marginTop: 10 }}>
              {(Object.entries(EXPORT_QUALITIES) as Array<[ExportQualityKey, ExportQuality]>).map(([key, quality]) => (
                <button key={key} className={exportQuality === key ? 'modeCard active' : 'modeCard'} onClick={() => setExportQuality(key)}>
                  <strong>{quality.label}</strong><small>{quality.description}</small>
                </button>
              ))}
            </div>
            <div className="sampleRatePicker" style={{ marginTop: 14 }}>
              <strong>Sample rate</strong>
              <small>44.1 kHz is standard for music, 48 kHz is standard for studio/video workflows, and 96 kHz is the common Hi-Res option.</small>
              <div className="chips" style={{ marginTop: 10 }}>
                {MASTER_SAMPLE_RATES.map((rate) => (
                  <button key={rate.value} className={masterSampleRate === rate.value ? 'chip activeChip' : 'chip'} onClick={() => setMasterSampleRate(rate.value)}>
                    {rate.label} · {rate.use}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mixFx">
            <h3>Master fine-tune</h3>
            <label>Master level <span>{Math.round(MASTER_PROFILES[selectedMasterProfile].masterLevel * 100)}%</span></label>
            <label>Glue compression <span>{Math.round(MASTER_PROFILES[selectedMasterProfile].glue * 100)}%</span></label>
          </div>

          <button className="primary" onClick={() => renderMaster(selectedMasterProfile)} disabled={rendering}>{rendering ? 'Turning up the heat…' : `💿 Render ${MASTER_PROFILES[selectedMasterProfile].label} Master`}</button>
          {masterUrl && <div className="playerCard"><strong>Latest master</strong><audio controls src={masterUrl} /><small>Saved to Songs as a new version. Use Songs to share or download MP3/WAV.</small></div>}
        </>
      )}

      {status && <div className="statusBox">{status}</div>}
    </section>
  );
}
