export type PieAudioAnalysis = {
  version: 'pie-audio-v1';
  durationSeconds: number;
  analyzedSeconds: number;
  sampleRate: number;
  channels: number;
  fileHash: string;
  chromaprint: string;
  rawFingerprintSample: number[];
  spectralHash: string;
  melody: {
    score: number;
    voicedFrames: number;
    intervalDiversity: number;
    repetition: number;
    contour: string;
    detail: string;
  };
  harmony: {
    score: number;
    key: string;
    chordDiversity: number;
    changeRate: number;
    commonProgressionSimilarity: number;
    sequence: string;
    profile: number[];
    detail: string;
  };
  localLibrary: {
    compared: number;
    maxSimilarity: number;
    closestTitle: string;
    fingerprintSimilarity: number;
    melodySimilarity: number;
    harmonySimilarity: number;
  };
};

type StoredSignature = {
  songId: string;
  title: string;
  rawFingerprintSample: number[];
  melodyContour: string;
  harmonySequence: string;
  scannedAt: number;
};

const INDEX_KEY = 'pie-originality-audio-index-v1';
const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];

function clamp(value: number) { return Math.max(0, Math.min(100, Math.round(value))); }
function popcount32(value: number) {
  let x = value >>> 0;
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function sampleArray(values: Uint32Array, target = 128) {
  if (!values.length) return [];
  if (values.length <= target) return Array.from(values, (value) => value >>> 0);
  const result: number[] = [];
  for (let i = 0; i < target; i++) {
    const index = Math.min(values.length - 1, Math.floor((i / Math.max(1, target - 1)) * (values.length - 1)));
    result.push(values[index] >>> 0);
  }
  return result;
}

function fingerprintSimilarity(a: number[], b: number[]) {
  if (!a.length || !b.length) return 0;
  const size = Math.min(a.length, b.length);
  let total = 0;
  for (let i = 0; i < size; i++) total += 1 - popcount32((a[i] ^ b[i]) >>> 0) / 32;
  return total / size;
}

function ngrams(sequence: string, size = 3) {
  const parts = sequence.split(',').filter(Boolean);
  const set = new Set<string>();
  for (let i = 0; i <= parts.length - size; i++) set.add(parts.slice(i, i + size).join('|'));
  if (!set.size && parts.length) set.add(parts.join('|'));
  return set;
}

function setSimilarity(a: Set<string>, b: Set<string>) {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / Math.max(1, new Set([...a, ...b]).size);
}

function readIndex(): StoredSignature[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 200) : [];
  } catch { return []; }
}

function compareLocal(songId: string, raw: number[], melody: string, harmony: string) {
  const entries = readIndex().filter((entry) => entry.songId !== songId);
  let best = { maxSimilarity: 0, closestTitle: '', fingerprintSimilarity: 0, melodySimilarity: 0, harmonySimilarity: 0 };
  const melodySet = ngrams(melody, 4);
  const harmonySet = ngrams(harmony, 3);
  for (const entry of entries) {
    const fp = fingerprintSimilarity(raw, entry.rawFingerprintSample || []);
    const mel = setSimilarity(melodySet, ngrams(entry.melodyContour || '', 4));
    const harm = setSimilarity(harmonySet, ngrams(entry.harmonySequence || '', 3));
    const combined = fp * 0.55 + mel * 0.25 + harm * 0.20;
    if (combined > best.maxSimilarity) best = { maxSimilarity: combined, closestTitle: entry.title || 'Another Pie song', fingerprintSimilarity: fp, melodySimilarity: mel, harmonySimilarity: harm };
  }
  return { compared: entries.length, ...best };
}

export function saveAudioOriginalitySignature(songId: string, title: string, analysis: PieAudioAnalysis) {
  if (!songId || typeof window === 'undefined') return;
  const entries = readIndex().filter((entry) => entry.songId !== songId);
  entries.unshift({
    songId,
    title,
    rawFingerprintSample: analysis.rawFingerprintSample,
    melodyContour: analysis.melody.contour,
    harmonySequence: analysis.harmony.sequence,
    scannedAt: Date.now(),
  });
  try { localStorage.setItem(INDEX_KEY, JSON.stringify(entries.slice(0, 200))); } catch {}
}

async function sha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function monoSamples(audio: AudioBuffer, maxSeconds = 120) {
  const length = Math.min(audio.length, Math.floor(audio.sampleRate * maxSeconds));
  const mono = new Float32Array(length);
  for (let channel = 0; channel < audio.numberOfChannels; channel++) {
    const data = audio.getChannelData(channel);
    for (let i = 0; i < length; i++) mono[i] += data[i] / audio.numberOfChannels;
  }
  return mono;
}

function interleavedI16(audio: AudioBuffer, maxSeconds = 120) {
  const frames = Math.min(audio.length, Math.floor(audio.sampleRate * maxSeconds));
  const samples = new Int16Array(frames * audio.numberOfChannels);
  for (let i = 0; i < frames; i++) {
    for (let channel = 0; channel < audio.numberOfChannels; channel++) {
      const value = Math.max(-1, Math.min(1, audio.getChannelData(channel)[i] || 0));
      samples[i * audio.numberOfChannels + channel] = value < 0 ? value * 32768 : value * 32767;
    }
  }
  return samples;
}

function rms(data: Float32Array, start: number, length: number) {
  let sum = 0;
  const end = Math.min(data.length, start + length);
  for (let i = start; i < end; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / Math.max(1, end - start));
}

function estimatePitch(frame: Float32Array, sampleRate: number) {
  let energy = 0;
  for (let i = 0; i < frame.length; i++) energy += frame[i] * frame[i];
  if (energy / frame.length < 0.00008) return { hz: 0, confidence: 0 };
  const minLag = Math.max(2, Math.floor(sampleRate / 1000));
  const maxLag = Math.min(frame.length - 2, Math.floor(sampleRate / 75));
  let bestLag = 0;
  let best = 0;
  for (let lag = minLag; lag <= maxLag; lag += 2) {
    let dot = 0, a = 0, b = 0;
    for (let i = 0; i < frame.length - lag; i += 2) {
      const x = frame[i];
      const y = frame[i + lag];
      dot += x * y; a += x * x; b += y * y;
    }
    const corr = dot / Math.sqrt(Math.max(1e-12, a * b));
    if (corr > best) { best = corr; bestLag = lag; }
  }
  if (!bestLag || best < 0.54) return { hz: 0, confidence: best };
  return { hz: sampleRate / bestLag, confidence: best };
}

function melodyAnalysis(mono: Float32Array, sampleRate: number) {
  const frameSize = Math.min(4096, Math.max(2048, 2 ** Math.floor(Math.log2(sampleRate * 0.09))));
  const hop = Math.max(frameSize, Math.floor(sampleRate * 0.22));
  const midi: number[] = [];
  for (let start = 0; start + frameSize < mono.length; start += hop) {
    const frame = mono.subarray(start, start + frameSize);
    const pitch = estimatePitch(frame, sampleRate);
    if (pitch.hz > 0) midi.push(Math.round(69 + 12 * Math.log2(pitch.hz / 440)));
    else midi.push(-1);
  }
  const voiced = midi.filter((value) => value >= 0);
  const intervals: number[] = [];
  let previous: number | null = null;
  for (const note of midi) {
    if (note < 0) continue;
    if (previous != null) intervals.push(Math.max(-12, Math.min(12, note - previous)));
    previous = note;
  }
  const nonZero = intervals.filter((value) => value !== 0);
  const unique = new Set(nonZero);
  const intervalDiversity = nonZero.length ? unique.size / nonZero.length : 0;
  const grams = new Map<string, number>();
  for (let i = 0; i <= intervals.length - 4; i++) {
    const key = intervals.slice(i, i + 4).join(':');
    grams.set(key, (grams.get(key) || 0) + 1);
  }
  const repeated = [...grams.values()].filter((value) => value > 1).reduce((sum, value) => sum + value - 1, 0);
  const repetition = grams.size ? Math.min(1, repeated / Math.max(1, grams.size)) : 0.5;
  const voicedRatio = midi.length ? voiced.length / midi.length : 0;
  const score = clamp(58 + intervalDiversity * 28 + Math.min(12, unique.size * 1.5) - repetition * 17 + Math.min(7, voicedRatio * 7));
  const contour = intervals.slice(0, 480).join(',');
  return {
    score,
    voicedFrames: voiced.length,
    intervalDiversity: Number(intervalDiversity.toFixed(3)),
    repetition: Number(repetition.toFixed(3)),
    contour,
    detail: voiced.length >= 8 ? `Detected ${voiced.length} voiced frames; interval diversity ${Math.round(intervalDiversity * 100)}% and motif repetition ${Math.round(repetition * 100)}%.` : 'The mix did not expose enough stable lead-pitch frames for a high-confidence melody contour.',
  };
}

function goertzel(data: Float32Array, start: number, size: number, sampleRate: number, frequency: number) {
  const k = Math.round((size * frequency) / sampleRate);
  const omega = (2 * Math.PI * k) / size;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0, s1 = 0, s2 = 0;
  const end = Math.min(data.length, start + size);
  for (let i = start; i < end; i += 2) {
    const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i - start)) / Math.max(1, size - 1));
    s0 = data[i] * window + coeff * s1 - s2;
    s2 = s1; s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2);
}

function bestKey(profile: number[]) {
  let best = { score: -Infinity, key: 'Unknown' };
  const normalized = profile.map((value) => value / Math.max(1e-9, profile.reduce((a, b) => a + b, 0)));
  for (let root = 0; root < 12; root++) {
    for (const [scale, template] of [['major', MAJOR_PROFILE] as const, ['minor', MINOR_PROFILE] as const]) {
      let score = 0;
      for (let pc = 0; pc < 12; pc++) score += normalized[(root + pc) % 12] * template[pc];
      if (score > best.score) best = { score, key: `${NOTE_NAMES[root]} ${scale}` };
    }
  }
  return best.key;
}

function triadName(chroma: number[]) {
  let bestScore = -Infinity;
  let best = 'N';
  for (let root = 0; root < 12; root++) {
    const major = chroma[root] + chroma[(root + 4) % 12] + chroma[(root + 7) % 12];
    const minor = chroma[root] + chroma[(root + 3) % 12] + chroma[(root + 7) % 12];
    if (major > bestScore) { bestScore = major; best = NOTE_NAMES[root]; }
    if (minor > bestScore) { bestScore = minor; best = `${NOTE_NAMES[root]}m`; }
  }
  return bestScore > 0.18 ? best : 'N';
}

function normalizeProgression(sequence: string[], key: string) {
  const rootName = key.split(' ')[0];
  const root = NOTE_NAMES.indexOf(rootName);
  if (root < 0) return sequence;
  return sequence.map((chord) => {
    if (chord === 'N') return 'N';
    const minor = chord.endsWith('m');
    const name = minor ? chord.slice(0, -1) : chord;
    const pc = NOTE_NAMES.indexOf(name);
    if (pc < 0) return 'N';
    return `${(pc - root + 12) % 12}${minor ? 'm' : ''}`;
  });
}

function progressionSimilarity(sequence: string[]) {
  const common = [
    ['0','7','9m','5'], ['0','9m','5','7'], ['9m','5','0','7'], ['0','5','9m','7'], ['0','7','5','7'], ['0','5','7','0'], ['0','10','5','0'], ['9m','5','0','7'],
  ];
  if (sequence.length < 4) return 0;
  let best = 0;
  for (let i = 0; i <= sequence.length - 4; i++) {
    const window = sequence.slice(i, i + 4);
    for (const pattern of common) {
      let matches = 0;
      for (let j = 0; j < 4; j++) if (window[j] === pattern[j]) matches += 1;
      best = Math.max(best, matches / 4);
    }
  }
  return best;
}

function harmonyAnalysis(mono: Float32Array, sampleRate: number) {
  const frameSize = Math.min(4096, Math.max(2048, 2 ** Math.floor(Math.log2(sampleRate * 0.10))));
  const hop = Math.max(frameSize, Math.floor(sampleRate * 0.75));
  const aggregate = new Array(12).fill(0) as number[];
  const chords: string[] = [];
  for (let start = 0; start + frameSize < mono.length; start += hop) {
    if (rms(mono, start, frameSize) < 0.007) { chords.push('N'); continue; }
    const chroma = new Array(12).fill(0) as number[];
    for (let pc = 0; pc < 12; pc++) {
      for (let octave = 2; octave <= 5; octave++) {
        const midi = 12 * (octave + 1) + pc;
        const frequency = 440 * 2 ** ((midi - 69) / 12);
        if (frequency < sampleRate / 3.2) chroma[pc] += Math.sqrt(goertzel(mono, start, frameSize, sampleRate, frequency));
      }
    }
    const total = chroma.reduce((a, b) => a + b, 0) || 1;
    for (let pc = 0; pc < 12; pc++) { chroma[pc] /= total; aggregate[pc] += chroma[pc]; }
    chords.push(triadName(chroma));
  }
  const collapsed = chords.filter((chord, index) => chord !== 'N' && chord !== chords[index - 1]);
  const unique = new Set(collapsed);
  let changes = 0;
  for (let i = 1; i < collapsed.length; i++) if (collapsed[i] !== collapsed[i - 1]) changes += 1;
  const changeRate = collapsed.length > 1 ? changes / (collapsed.length - 1) : 0;
  const chordDiversity = collapsed.length ? unique.size / collapsed.length : 0;
  const key = bestKey(aggregate);
  const normalized = normalizeProgression(collapsed, key);
  const commonProgressionSimilarity = progressionSimilarity(normalized);
  const score = clamp(65 + Math.min(20, unique.size * 3) + Math.min(8, changeRate * 8) - commonProgressionSimilarity * 10);
  const totalAgg = aggregate.reduce((a, b) => a + b, 0) || 1;
  const profile = aggregate.map((value) => Number((value / totalAgg).toFixed(4)));
  return {
    score,
    key,
    chordDiversity: Number(chordDiversity.toFixed(3)),
    changeRate: Number(changeRate.toFixed(3)),
    commonProgressionSimilarity: Number(commonProgressionSimilarity.toFixed(3)),
    sequence: collapsed.slice(0, 180).join(','),
    profile,
    detail: collapsed.length ? `Estimated ${key}; ${unique.size} distinct chord centers with ${Math.round(commonProgressionSimilarity * 100)}% similarity to the closest common four-chord template.` : 'The mix did not expose enough stable harmonic frames for reliable chord-shape analysis.',
  };
}

async function compactSpectralHash(mono: Float32Array, sampleRate: number) {
  const points: number[] = [];
  const block = Math.max(256, Math.floor(sampleRate * 0.5));
  for (let start = 0; start < mono.length; start += block) points.push(Math.round(rms(mono, start, block) * 10000));
  const bytes = new TextEncoder().encode(points.slice(0, 240).join(','));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest).slice(0, 12)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function analyzeSongAudio(arrayBuffer: ArrayBuffer, songId = '', title = 'Song'): Promise<PieAudioAnalysis> {
  const hashPromise = sha256Hex(arrayBuffer.slice(0));
  const context = new AudioContext();
  let audio: AudioBuffer;
  try { audio = await context.decodeAudioData(arrayBuffer.slice(0)); }
  finally { await context.close().catch(() => undefined); }

  const mono = monoSamples(audio, 120);
  const [fileHash, spectralHash] = await Promise.all([hashPromise, compactSpectralHash(mono, audio.sampleRate)]);
  const melody = melodyAnalysis(mono, audio.sampleRate);
  const harmony = harmonyAnalysis(mono, audio.sampleRate);

  let chromaprint = '';
  let rawFingerprintSample: number[] = [];
  try {
    const module = await import('rusty-chromaprint-wasm');
    const pcm = interleavedI16(audio, 120);
    const output = module.fingerprintFromSamples(audio.sampleRate, audio.numberOfChannels, pcm);
    chromaprint = String(output.compressed || '');
    rawFingerprintSample = sampleArray(output.raw || new Uint32Array(), 128);
  } catch {
    chromaprint = '';
    rawFingerprintSample = [];
  }

  const localLibrary = compareLocal(songId, rawFingerprintSample, melody.contour, harmony.sequence);
  return {
    version: 'pie-audio-v1',
    durationSeconds: Number(audio.duration.toFixed(3)),
    analyzedSeconds: Number(Math.min(audio.duration, 120).toFixed(3)),
    sampleRate: audio.sampleRate,
    channels: audio.numberOfChannels,
    fileHash,
    chromaprint,
    rawFingerprintSample,
    spectralHash,
    melody,
    harmony,
    localLibrary,
  };
}
