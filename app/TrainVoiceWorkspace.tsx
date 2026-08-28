'use client';

import { useMemo, useRef, useState } from 'react';
import { zipSync, strToU8 } from 'fflate';

type TrainingMode = 'speech' | 'singing';
type Quality = 'Good' | 'Check' | 'Too quiet';
type VoiceRange = 'Bass' | 'Baritone' | 'Tenor' | 'Alto' | 'Soprano';

type TrainingPrompt = {
  id: string;
  sectionId: string;
  title: string;
  mode: TrainingMode;
  instruction: string;
  script: string;
  semitones?: number[];
  baseShift?: number;
};

type TrainingSection = {
  id: string;
  title: string;
  icon: string;
  targetMinutes: number;
  description: string;
};

type TrainingTake = {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  duration: number;
  peak: number;
  rms: number;
  clippingPct: number;
  silencePct: number;
  pitchLow?: number;
  pitchHigh?: number;
  quality: Quality;
  included: boolean;
  sectionId?: string;
  promptId?: string;
  promptTitle?: string;
  mode?: TrainingMode;
};

const SECTIONS: TrainingSection[] = [
  { id: 'identity', title: 'Speaking Identity', icon: '🗣️', targetMinutes: 5, description: 'Natural speech captures pronunciation, consonants, tone, and the identity of your voice.' },
  { id: 'core', title: 'Core Singing', icon: '🎵', targetMinutes: 8, description: 'Comfortable singing establishes the strongest, most natural part of your voice.' },
  { id: 'range', title: 'Range Builder', icon: '🎹', targetMinutes: 6, description: 'Guided scales give the model clean examples as your voice moves through registers.' },
  { id: 'upper', title: 'Upper Register', icon: '🚀', targetMinutes: 6, description: 'Extra high-note material teaches Drob what your real upper voice sounds like instead of forcing the model to guess.' },
  { id: 'expression', title: 'Style & Expression', icon: '✨', targetMinutes: 5, description: 'Different dynamics, vowels, emotion, sustain, and vibrato make the finished model more musical.' },
];

const RANGE_ROOT_MIDI: Record<VoiceRange, number> = {
  Bass: 43,      // G2
  Baritone: 48,  // C3
  Tenor: 52,     // E3
  Alto: 55,      // G3
  Soprano: 60,   // C4
};

const PROMPTS: TrainingPrompt[] = [
  { id: 'id-1', sectionId: 'identity', title: 'Natural introduction', mode: 'speech', instruction: 'Speak naturally at your normal volume. Do not perform or imitate a radio voice.', script: 'My voice changes with every story I tell. Some words are soft and thoughtful, while others carry energy and confidence. I want this recording to sound like me on an ordinary day.' },
  { id: 'id-2', sectionId: 'identity', title: 'Clear consonants', mode: 'speech', instruction: 'Read clearly without exaggerating. Keep a steady mic distance.', script: 'Bright mornings bring fresh beginnings. Crisp drums, deep bass, warm keys, and clear words can turn a simple idea into something people remember.' },
  { id: 'id-3', sectionId: 'identity', title: 'Soft speech', mode: 'speech', instruction: 'Speak a little softer while keeping the words clear and supported.', script: 'There are quiet moments when a voice does not need to push. A calm sentence can still carry strength, detail, warmth, and purpose.' },
  { id: 'id-4', sectionId: 'identity', title: 'Strong speech', mode: 'speech', instruction: 'Use confident projection without shouting or clipping the microphone.', script: 'When the moment calls for energy, I can speak with conviction. The sound stays controlled, focused, and clear even when the emotion gets stronger.' },

  { id: 'core-1', sectionId: 'core', title: 'Comfortable five-note phrase', mode: 'singing', instruction: 'Match the reference notes on “ah.” Keep it relaxed and connected.', script: 'Sing: ah — ah — ah — ah — ah', semitones: [0, 2, 4, 5, 7, 5, 4, 2, 0] },
  { id: 'core-2', sectionId: 'core', title: 'Natural lyric phrase', mode: 'singing', instruction: 'Sing the words naturally. Prioritize your real tone over volume.', script: 'Sing: I can feel the light breaking through', semitones: [0, 2, 4, 4, 5, 7, 5, 4, 2, 0] },
  { id: 'core-3', sectionId: 'core', title: 'Sustained vowels', mode: 'singing', instruction: 'Hold each vowel smoothly for about two seconds with no added effects.', script: 'Sing and sustain: ah — eh — ee — oh — oo', semitones: [0, 2, 4, 2, 0] },
  { id: 'core-4', sectionId: 'core', title: 'Connected melody', mode: 'singing', instruction: 'Use one smooth breath where comfortable. Do not oversing.', script: 'Sing: Every step is moving me forward', semitones: [0, 2, 4, 5, 7, 9, 7, 5, 4, 2, 0] },

  { id: 'range-1', sectionId: 'range', title: 'Ascending scale', mode: 'singing', instruction: 'Sing “mah” on each note. Let the voice change registers naturally.', script: 'Sing: mah on every reference note', semitones: [0, 2, 4, 5, 7, 9, 11, 12] },
  { id: 'range-2', sectionId: 'range', title: 'Descending scale', mode: 'singing', instruction: 'Sing “no” on each note with an even tone all the way down.', script: 'Sing: no on every reference note', semitones: [12, 11, 9, 7, 5, 4, 2, 0] },
  { id: 'range-3', sectionId: 'range', title: 'Register bridge', mode: 'singing', instruction: 'Use “gee.” Do not force the top note; allow mix/head voice if that is how you naturally sing it.', script: 'Sing: gee — gee — gee — gee — gee', semitones: [0, 4, 7, 12, 7, 4, 0] },
  { id: 'range-4', sectionId: 'range', title: 'Low-to-high lyric', mode: 'singing', instruction: 'Start easy and let the last words rise without pushing.', script: 'Sing: I started low but now I rise', semitones: [0, 0, 2, 4, 5, 7, 9, 12] },

  { id: 'upper-1', sectionId: 'upper', title: 'Upper sustained ah', mode: 'singing', instruction: 'This should be a clean upper note, not a shout. Stop if it feels strained.', script: 'Sing: ah — sustain the final high note', semitones: [4, 7, 9, 12, 12], baseShift: 2 },
  { id: 'upper-2', sectionId: 'upper', title: 'Upper vowel colors', mode: 'singing', instruction: 'Keep the high notes controlled. Capture your real mix/head quality.', script: 'Sing: ah — eh — ee — oh — oo', semitones: [7, 9, 12, 9, 7], baseShift: 2 },
  { id: 'upper-3', sectionId: 'upper', title: 'High lyric phrase', mode: 'singing', instruction: 'Sing musically at a medium volume. Do not try to make the voice bigger than it naturally is.', script: 'Sing: Higher than I thought that I could go', semitones: [4, 5, 7, 9, 12, 12, 9, 7, 5], baseShift: 2 },
  { id: 'upper-4', sectionId: 'upper', title: 'Upper register release', mode: 'singing', instruction: 'Move up and back down smoothly. The transition is as important as the top note.', script: 'Sing: nay on each reference note', semitones: [4, 7, 9, 12, 14, 12, 9, 7, 4], baseShift: 1 },

  { id: 'exp-1', sectionId: 'expression', title: 'Soft singing', mode: 'singing', instruction: 'Sing gently without becoming whispery or breath-only.', script: 'Sing softly: Stay with me through the quiet night', semitones: [0, 2, 4, 5, 4, 2, 0] },
  { id: 'exp-2', sectionId: 'expression', title: 'Powerful singing', mode: 'singing', instruction: 'Use strong supported tone without yelling.', script: 'Sing strong: I will stand and I will not back down', semitones: [0, 2, 4, 5, 7, 9, 7, 5, 4, 2, 0] },
  { id: 'exp-3', sectionId: 'expression', title: 'Straight then vibrato', mode: 'singing', instruction: 'Hold the first note straight. Add your natural vibrato only at the end of the second.', script: 'Sing: love — love', semitones: [4, 7] },
  { id: 'exp-4', sectionId: 'expression', title: 'Rhythmic phrase', mode: 'singing', instruction: 'Keep the words crisp and rhythmic while staying on pitch.', script: 'Sing: Step by step I keep moving on', semitones: [0, 0, 4, 4, 5, 5, 7, 4, 2, 0] },
  { id: 'exp-5', sectionId: 'expression', title: 'Emotional finish', mode: 'singing', instruction: 'Sing with emotion, but keep the recording dry and technically clean.', script: 'Sing: I know who I am when the lights fade away', semitones: [0, 2, 4, 5, 7, 9, 7, 5, 4, 2, 0] },
];

function midiFrequency(midi: number) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function midiName(midi: number) {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const rounded = Math.round(midi);
  return `${names[((rounded % 12) + 12) % 12]}${Math.floor(rounded / 12) - 1}`;
}

function percentile(values: number[], q: number) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.round((sorted.length - 1) * q)));
  return sorted[index];
}

function estimatePitchRange(decoded: AudioBuffer) {
  const targetRate = 8000;
  const ratio = decoded.sampleRate / targetRate;
  const length = Math.max(1, Math.floor(decoded.length / ratio));
  const mono = new Float32Array(length);
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, channel) => decoded.getChannelData(channel));

  for (let i = 0; i < length; i++) {
    const sourceIndex = Math.min(decoded.length - 1, Math.floor(i * ratio));
    let sample = 0;
    for (const channel of channels) sample += channel[sourceIndex] || 0;
    mono[i] = sample / Math.max(1, channels.length);
  }

  const frameSize = 320;
  const hop = 800;
  const minLag = Math.floor(targetRate / 700);
  const maxLag = Math.floor(targetRate / 65);
  const pitches: number[] = [];
  let silentFrames = 0;
  let totalFrames = 0;

  for (let start = 0; start + frameSize + maxLag < mono.length; start += hop) {
    totalFrames++;
    let energy = 0;
    for (let i = 0; i < frameSize; i++) energy += mono[start + i] * mono[start + i];
    const frameRms = Math.sqrt(energy / frameSize);
    if (frameRms < 0.008) {
      silentFrames++;
      continue;
    }

    let bestLag = 0;
    let bestCorrelation = 0;
    for (let lag = minLag; lag <= maxLag; lag++) {
      let dot = 0;
      let aEnergy = 0;
      let bEnergy = 0;
      for (let i = 0; i < frameSize; i++) {
        const a = mono[start + i];
        const b = mono[start + i + lag];
        dot += a * b;
        aEnergy += a * a;
        bEnergy += b * b;
      }
      const denominator = Math.sqrt(aEnergy * bEnergy);
      const correlation = denominator > 0.000001 ? dot / denominator : 0;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }

    if (bestLag && bestCorrelation > 0.58) {
      const hz = targetRate / bestLag;
      const midi = 69 + 12 * Math.log2(hz / 440);
      if (Number.isFinite(midi) && midi >= 32 && midi <= 88) pitches.push(midi);
    }
  }

  return {
    pitchLow: percentile(pitches, 0.08),
    pitchHigh: percentile(pitches, 0.92),
    silencePct: totalFrames ? (silentFrames / totalFrames) * 100 : 100,
  };
}

async function inspectAudio(blob: Blob) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot inspect audio.');
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    let peak = 0;
    let sum = 0;
    let count = 0;
    let clipped = 0;
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      const data = decoded.getChannelData(c);
      const stride = Math.max(1, Math.floor(data.length / 160000));
      for (let i = 0; i < data.length; i += stride) {
        const value = Math.abs(data[i] || 0);
        peak = Math.max(peak, value);
        sum += value * value;
        if (value >= 0.985) clipped++;
        count++;
      }
    }
    const rms = Math.sqrt(sum / Math.max(1, count));
    const clippingPct = count ? (clipped / count) * 100 : 0;
    const pitch = estimatePitchRange(decoded);
    const quality: Quality = rms < 0.012
      ? 'Too quiet'
      : peak > 0.995 || clippingPct > 0.15 || pitch.silencePct > 82
        ? 'Check'
        : 'Good';
    return { duration: decoded.duration, peak, rms, clippingPct, ...pitch, quality };
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
    const sampleRate = 44100;
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * sampleRate)), sampleRate);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);

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

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export default function TrainVoiceWorkspace() {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordingPromptRef = useRef<TrainingPrompt | undefined>(undefined);
  const [recording, setRecording] = useState(false);
  const [takes, setTakes] = useState<TrainingTake[]>([]);
  const [status, setStatus] = useState('Start the guided session. AI Songs will walk you through speaking, comfortable singing, range work, high notes, and expression.');
  const [processing, setProcessing] = useState(false);
  const [voiceRange, setVoiceRange] = useState<VoiceRange>('Baritone');
  const [sectionId, setSectionId] = useState('identity');
  const [promptIndex, setPromptIndex] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const sectionPrompts = useMemo(() => PROMPTS.filter((prompt) => prompt.sectionId === sectionId), [sectionId]);
  const currentPrompt = sectionPrompts[Math.min(promptIndex, Math.max(0, sectionPrompts.length - 1))];
  const currentSection = SECTIONS.find((section) => section.id === sectionId) || SECTIONS[0];
  const rootMidi = RANGE_ROOT_MIDI[voiceRange];
  const currentSequence = currentPrompt?.semitones?.map((semitone) => rootMidi + (currentPrompt.baseShift || 0) + semitone) || [];

  const totalSeconds = takes.reduce((sum, take) => sum + take.duration, 0);
  const selectedTakes = takes.filter((take) => take.included);
  const selectedSeconds = selectedTakes.reduce((sum, take) => sum + take.duration, 0);
  const recommendedReady = selectedSeconds >= 30 * 60;
  const minimumReady = selectedSeconds >= 10 * 60;
  const recordedPitchLows = selectedTakes.map((take) => take.pitchLow).filter((value): value is number => value !== undefined);
  const recordedPitchHighs = selectedTakes.map((take) => take.pitchHigh).filter((value): value is number => value !== undefined);
  const overallLow = recordedPitchLows.length ? Math.min(...recordedPitchLows) : undefined;
  const overallHigh = recordedPitchHighs.length ? Math.max(...recordedPitchHighs) : undefined;

  const sectionSeconds = Object.fromEntries(SECTIONS.map((section) => [
    section.id,
    selectedTakes.filter((take) => take.sectionId === section.id).reduce((sum, take) => sum + take.duration, 0),
  ])) as Record<string, number>;

  async function addBlob(blob: Blob, name: string, prompt?: TrainingPrompt) {
    setProcessing(true);
    try {
      const info = await inspectAudio(blob);
      const take: TrainingTake = {
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        name,
        blob,
        url: URL.createObjectURL(blob),
        included: info.quality === 'Good',
        sectionId: prompt?.sectionId,
        promptId: prompt?.id,
        promptTitle: prompt?.title,
        mode: prompt?.mode,
        ...info,
      };
      setTakes((current) => [...current, take]);
      if (info.quality === 'Good') {
        setStatus(`✓ Good take${info.pitchLow && info.pitchHigh ? ` · detected ${midiName(info.pitchLow)}–${midiName(info.pitchHigh)}` : ''}. It is included in the Drob training set.`);
        if (prompt && prompt.id === currentPrompt?.id) setPromptIndex((index) => Math.min(sectionPrompts.length - 1, index + 1));
      } else if (info.quality === 'Too quiet') {
        setStatus('Take saved but excluded: the voice is too quiet. Move a little closer to the phone and record it again.');
      } else {
        setStatus(`Take saved but needs review${info.clippingPct > 0.15 ? ' because clipping was detected' : info.silencePct > 82 ? ' because most of the recording is silence' : ''}. Listen before including it.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not inspect this recording.');
    } finally {
      setProcessing(false);
    }
  }

  async function startRecording(prompt?: TrainingPrompt) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
      streamRef.current = stream;
      chunksRef.current = [];
      recordingPromptRef.current = prompt;
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const activePrompt = recordingPromptRef.current;
        recordingPromptRef.current = undefined;
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const baseName = activePrompt ? `${activePrompt.sectionId}-${activePrompt.id}-${takes.length + 1}` : `voice-take-${takes.length + 1}`;
        await addBlob(blob, `${baseName}.webm`, activePrompt);
      };
      recorder.start(250);
      setRecording(true);
      setStatus(prompt ? `Recording “${prompt.title}”… stop after the complete prompt. Keep the phone at the same distance.` : 'Recording manual training take… keep the performance dry and solo.');
    } catch {
      setStatus('Microphone access is required to record voice training takes.');
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
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

  function chooseSection(nextSectionId: string) {
    setSectionId(nextSectionId);
    setPromptIndex(0);
  }

  async function playReference() {
    if (!currentSequence.length) return;
    const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) {
      setStatus('This browser cannot play reference notes.');
      return;
    }
    const context = new AudioContextCtor();
    const noteLength = 0.52;
    const gap = 0.08;
    const start = context.currentTime + 0.08;
    currentSequence.forEach((midi, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = midiFrequency(midi);
      const noteStart = start + index * (noteLength + gap);
      const noteEnd = noteStart + noteLength;
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.16, noteStart + 0.025);
      gain.gain.setValueAtTime(0.16, Math.max(noteStart + 0.03, noteEnd - 0.08));
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
    const total = currentSequence.length * (noteLength + gap) + 0.5;
    setStatus(`Reference: ${currentSequence.map(midiName).join(' · ')}. Listen once, then record it in your natural voice.`);
    window.setTimeout(() => context.close().catch(() => undefined), total * 1000);
  }

  async function prepareForKits() {
    if (!selectedTakes.length) return;
    setProcessing(true);
    setStatus('Converting selected takes to 44.1 kHz mono WAV files for Drob training…');
    try {
      const files: Record<string, Uint8Array> = {};
      for (let i = 0; i < selectedTakes.length; i++) {
        const take = selectedTakes[i];
        setStatus(`Preparing training WAV ${i + 1} of ${selectedTakes.length}…`);
        const wav = await toMonoWav(take.blob);
        const folder = take.sectionId ? `Drob-Guided-Training/${take.sectionId}` : 'Drob-Guided-Training/manual';
        files[`${folder}/${String(i + 1).padStart(3, '0')}-${safeName(take.name.replace(/\.[^.]+$/, ''))}.wav`] = wav;
      }

      const progress = Object.fromEntries(SECTIONS.map((section) => [section.id, {
        title: section.title,
        targetMinutes: section.targetMinutes,
        selectedMinutes: (sectionSeconds[section.id] || 0) / 60,
      }]));
      const manifest = {
        createdAt: new Date().toISOString(),
        voiceName: 'Drob',
        selectedRange: voiceRange,
        selectedSeconds,
        selectedMinutes: selectedSeconds / 60,
        selectedTakeCount: selectedTakes.length,
        detectedRange: overallLow !== undefined && overallHigh !== undefined ? `${midiName(overallLow)}-${midiName(overallHigh)}` : null,
        target: 'Kits Professional Voice Cloning',
        trainingStyle: 'AI Songs guided speaking + singing curriculum',
        progress,
        guidance: 'Use only clean, dry, monophonic recordings. The upper-register section is intentionally overrepresented to improve high-note behavior.',
        takes: selectedTakes.map((take) => ({
          name: take.name,
          sectionId: take.sectionId,
          promptId: take.promptId,
          promptTitle: take.promptTitle,
          mode: take.mode,
          duration: take.duration,
          quality: take.quality,
          peak: take.peak,
          rms: take.rms,
          clippingPct: take.clippingPct,
          silencePct: take.silencePct,
          pitchLow: take.pitchLow !== undefined ? midiName(take.pitchLow) : null,
          pitchHigh: take.pitchHigh !== undefined ? midiName(take.pitchHigh) : null,
        })),
      };
      files['README-DROB.txt'] = strToU8([
        'AI Songs — Drob Guided Training Package',
        '',
        'These files are 44.1 kHz mono PCM WAV files prepared from the guided speaking + singing session.',
        'Listen through every included take before training. Remove anything with music, effects, doubles, another voice, clipping, heavy room noise, strain, or a bad high note.',
        'The folders preserve the training categories: speaking identity, core singing, range, upper register, and expression.',
        'For the strongest Drob identity, do not replace weak high-note recordings with another singer. Re-record them in your real upper voice at a comfortable volume.',
        '',
        'Final step: open Kits Professional Voice Cloning, upload the WAV files, and submit training.',
      ].join('\n'));
      files['training-manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));

      const zipped = zipSync(files, { level: 4 });
      const bytes = zipped.buffer.slice(zipped.byteOffset, zipped.byteOffset + zipped.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'AI-Songs-Drob-Guided-Training.zip';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setStatus('Drob guided training package created. Extract it, review the WAV files, then upload the clean takes to Kits Professional Voice Cloning.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not prepare the Drob training package.');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Voice Lab</p>
      <h1>Guided Drob Training</h1>
      <p className="sub">Train Drob with both reading and singing. The session builds identity first, then deliberately captures your comfortable range, register transitions, upper notes, and musical expression.</p>

      <div className="playerCard">
        <strong>1. Choose your natural singing range</strong>
        <small>This changes the piano references only. Never force a note that feels strained.</small>
        <div className="chips">
          {(['Bass', 'Baritone', 'Tenor', 'Alto', 'Soprano'] as VoiceRange[]).map((range) => (
            <button key={range} className={voiceRange === range ? 'chip activeChip' : 'chip'} onClick={() => setVoiceRange(range)} disabled={recording}>{range}</button>
          ))}
        </div>
        <div className="statusBox">Reference root: {midiName(rootMidi)} · {overallLow !== undefined && overallHigh !== undefined ? `Recorded pitch coverage: ${midiName(overallLow)}–${midiName(overallHigh)}` : 'Pitch coverage will appear after singing takes.'}</div>
      </div>

      <div className="playerCard">
        <strong>2. Guided training plan · 30-minute target</strong>
        <small>Repeat prompts as needed. A clean second or third take is more useful than one strained take.</small>
        {SECTIONS.map((section) => {
          const seconds = sectionSeconds[section.id] || 0;
          const progress = Math.min(100, (seconds / (section.targetMinutes * 60)) * 100);
          return (
            <button key={section.id} type="button" className={sectionId === section.id ? 'modeCard active' : 'modeCard'} onClick={() => chooseSection(section.id)} disabled={recording} style={{ width: '100%', marginTop: 10, textAlign: 'left' }}>
              <span className="icon">{section.icon}</span>
              <strong>{section.title} · {formatTime(seconds)} / {section.targetMinutes}m</strong>
              <small>{section.description}</small>
              <span style={{ display: 'block', height: 6, borderRadius: 999, background: 'rgba(255,255,255,.1)', marginTop: 8, overflow: 'hidden' }}><span style={{ display: 'block', width: `${progress}%`, height: '100%', background: 'currentColor', opacity: .75 }} /></span>
            </button>
          );
        })}
      </div>

      {currentPrompt && (
        <div className="playerCard">
          <strong>3. {currentSection.icon} {currentSection.title} · Prompt {promptIndex + 1}/{sectionPrompts.length}</strong>
          <h2 style={{ marginBottom: 6 }}>{currentPrompt.title}</h2>
          <small>{currentPrompt.instruction}</small>
          <div className="result" style={{ marginTop: 12 }}><strong style={{ fontSize: 18 }}>{currentPrompt.script}</strong></div>

          {currentSequence.length > 0 && (
            <>
              <div className="statusBox">Notes: {currentSequence.map(midiName).join(' · ')}</div>
              <button className="secondary" onClick={playReference} disabled={recording}>🎹 Play Reference Notes</button>
            </>
          )}

          <div className="mixButtons">
            <button className="secondary" onClick={() => setPromptIndex((index) => Math.max(0, index - 1))} disabled={recording || promptIndex === 0}>← Previous</button>
            <button className="secondary" onClick={() => setPromptIndex((index) => Math.min(sectionPrompts.length - 1, index + 1))} disabled={recording || promptIndex >= sectionPrompts.length - 1}>Next →</button>
          </div>

          {!recording
            ? <button className="primary" onClick={() => startRecording(currentPrompt)} disabled={processing}>🎤 Record This Prompt</button>
            : <button className="primary" onClick={stopRecording}>■ Stop & Check Take</button>}
          <small>Phone recording: echo cancellation OFF · noise suppression OFF · automatic gain OFF · mono requested.</small>
        </div>
      )}

      <div className="playerCard">
        <strong>Training progress</strong>
        <div className="statusBox">Selected clean audio: {formatTime(selectedSeconds)} · Total captured: {formatTime(totalSeconds)} · {selectedTakes.length}/{takes.length} takes included</div>
        <div className="statusBox">{recommendedReady ? '✓ Recommended 30-minute target reached.' : minimumReady ? '✓ 10-minute minimum reached. Keep going toward 30 minutes, especially clean upper-register takes.' : `Need about ${Math.ceil((10 * 60 - selectedSeconds) / 60)} more minute(s) to reach 10 minutes.`}</div>
      </div>

      {takes.length > 0 && (
        <details className="playerCard" open>
          <summary><strong>Review recorded takes ({takes.length})</strong></summary>
          {takes.slice().reverse().map((take, reverseIndex) => {
            const index = takes.length - reverseIndex;
            return (
              <div className="playerCard" key={take.id} style={{ marginTop: 10 }}>
                <strong>Take {index} · {take.quality}{take.promptTitle ? ` · ${take.promptTitle}` : ''}</strong>
                <small>{take.duration.toFixed(1)} sec · clipping {take.clippingPct.toFixed(2)}% · silence {Math.round(take.silencePct)}%{take.pitchLow !== undefined && take.pitchHigh !== undefined ? ` · ${midiName(take.pitchLow)}–${midiName(take.pitchHigh)}` : ''}</small>
                <audio controls src={take.url} />
                <label className="toggleRow">
                  <input type="checkbox" checked={take.included} onChange={() => toggleTake(take.id)} />
                  <span><strong>Include in Drob training set</strong><small>{take.quality === 'Good' ? 'Automatic level/clipping check passed. Still listen for strain, wrong notes, room noise, or distortion.' : 'Excluded automatically. Include only after you listen and decide it is truly clean.'}</small></span>
                </label>
                <button className="secondary" onClick={() => removeTake(take.id)}>Remove Take</button>
              </div>
            );
          })}
        </details>
      )}

      <div className="playerCard">
        <strong>4. Prepare the new Drob model</strong>
        <small>AI Songs converts the selected recordings to 44.1 kHz mono WAV, separates them into guided training folders, and includes a quality/range manifest.</small>
        <button className="primary" onClick={prepareForKits} disabled={!selectedTakes.length || processing}>{processing ? 'Preparing Drob Files…' : 'Prepare Drob Training Package'}</button>
        <a className="secondary" href="https://app.kits.ai/voices/train" target="_blank" rel="noreferrer">Open Kits Voice Training</a>
        <small>Kits still requires the final upload/train confirmation on its site because new custom-voice training is not exposed through its public API.</small>
      </div>

      <details className="playerCard" open={advancedOpen} onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary><strong>Advanced · add existing dry recordings</strong></summary>
        <small>Use this only for clean solo voice files. Guided recordings are preferred because we know what range and purpose each take covers.</small>
        <div className="mixButtons" style={{ marginTop: 10 }}>
          {!recording ? <button className="secondary" onClick={() => startRecording()} disabled={processing}>🎤 Manual Take</button> : <button className="secondary" onClick={stopRecording}>■ Stop</button>}
          <label className="secondary">Upload Vocal Takes<input type="file" accept="audio/*" multiple style={{ display: 'none' }} onChange={async (event) => { const files = Array.from(event.target.files || []); for (const file of files) await addBlob(file, file.name); event.currentTarget.value = ''; }} /></label>
        </div>
      </details>

      {status && <div className="statusBox">{status}</div>}
    </section>
  );
}
