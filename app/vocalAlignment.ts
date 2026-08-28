export type VocalAlignmentSegment = {
  sourceStart: number;
  duration: number;
  outputStart: number;
  offsetSeconds: number;
};

export type VocalAlignmentPlan = {
  offsetSeconds: number;
  confidence: number;
  driftMs: number;
  segments: VocalAlignmentSegment[];
  method: 'tight-sync' | 'onset-fallback';
};

type EnvelopeData = {
  level: Float32Array;
  signature: Float32Array;
  hopSeconds: number;
};

const HOP_SECONDS = 0.02;
const MAX_OFFSET_SECONDS = 2.5;
const LOCAL_SEARCH_SECONDS = 0.24;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: Float32Array, q: number) {
  if (!values.length) return 0;
  const copy = Array.from(values).sort((a, b) => a - b);
  const index = clamp((copy.length - 1) * q, 0, copy.length - 1);
  const lower = Math.floor(index);
  const upper = Math.min(copy.length - 1, lower + 1);
  const mix = index - lower;
  return copy[lower] * (1 - mix) + copy[upper] * mix;
}

function makeEnvelope(buffer: AudioBuffer): EnvelopeData {
  const hopSamples = Math.max(128, Math.floor(buffer.sampleRate * HOP_SECONDS));
  const bins = Math.max(1, Math.ceil(buffer.length / hopSamples));
  const rms = new Float32Array(bins);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, channel) => buffer.getChannelData(channel));
  const sampleStride = Math.max(1, Math.floor(buffer.sampleRate / 16000));

  for (let bin = 0; bin < bins; bin++) {
    const start = bin * hopSamples;
    const end = Math.min(buffer.length, start + hopSamples);
    let sum = 0;
    let count = 0;
    for (let i = start; i < end; i += sampleStride) {
      let mono = 0;
      for (const channel of channels) mono += channel[i] || 0;
      mono /= channels.length || 1;
      sum += mono * mono;
      count++;
    }
    rms[bin] = Math.sqrt(sum / Math.max(1, count));
  }

  const noise = percentile(rms, 0.2);
  const high = percentile(rms, 0.94);
  const span = Math.max(0.000001, high - noise);
  const normalized = new Float32Array(bins);
  for (let i = 0; i < bins; i++) normalized[i] = clamp((rms[i] - noise) / span, 0, 1);

  const level = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    const left = normalized[Math.max(0, i - 1)];
    const center = normalized[i];
    const right = normalized[Math.min(bins - 1, i + 1)];
    level[i] = (left + center * 2 + right) / 4;
  }

  const rawSignature = new Float32Array(bins);
  let signatureMean = 0;
  for (let i = 0; i < bins; i++) {
    const onset = Math.max(0, level[i] - (i ? level[i - 1] : 0));
    const onsetWeight = Math.min(1, onset * 5);
    const value = level[i] * 0.35 + onsetWeight * 0.65;
    rawSignature[i] = value;
    signatureMean += value;
  }
  signatureMean /= Math.max(1, bins);

  const signature = new Float32Array(bins);
  for (let i = 0; i < bins; i++) signature[i] = rawSignature[i] - signatureMean;

  return { level, signature, hopSeconds: HOP_SECONDS };
}

function correlationAtOffset(guide: Float32Array, drob: Float32Array, offsetBins: number) {
  const start = Math.max(0, offsetBins);
  const end = Math.min(guide.length, drob.length + offsetBins);
  if (end - start < 24) return -1;

  let dot = 0;
  let guideEnergy = 0;
  let drobEnergy = 0;
  for (let guideIndex = start; guideIndex < end; guideIndex++) {
    const drobIndex = guideIndex - offsetBins;
    const g = guide[guideIndex];
    const d = drob[drobIndex];
    dot += g * d;
    guideEnergy += g * g;
    drobEnergy += d * d;
  }
  const denominator = Math.sqrt(guideEnergy * drobEnergy);
  if (denominator < 0.0000001) return -1;
  return dot / denominator;
}

function segmentCorrelation(
  guide: Float32Array,
  drob: Float32Array,
  drobStart: number,
  drobEnd: number,
  offsetBins: number,
) {
  let dot = 0;
  let guideEnergy = 0;
  let drobEnergy = 0;
  let count = 0;
  for (let drobIndex = drobStart; drobIndex < drobEnd; drobIndex++) {
    const guideIndex = drobIndex + offsetBins;
    if (guideIndex < 0 || guideIndex >= guide.length) continue;
    const g = guide[guideIndex];
    const d = drob[drobIndex];
    dot += g * d;
    guideEnergy += g * g;
    drobEnergy += d * d;
    count++;
  }
  if (count < 16) return -1;
  const denominator = Math.sqrt(guideEnergy * drobEnergy);
  if (denominator < 0.0000001) return -1;
  return dot / denominator;
}

function firstActivitySeconds(level: Float32Array, hopSeconds: number) {
  let run = 0;
  for (let i = 0; i < level.length; i++) {
    if (level[i] >= 0.09) {
      run++;
      if (run >= 3) return Math.max(0, (i - 2) * hopSeconds);
    } else {
      run = 0;
    }
  }
  return 0;
}

function findGlobalOffset(guide: EnvelopeData, drob: EnvelopeData) {
  const maxBinsByTime = Math.round(MAX_OFFSET_SECONDS / guide.hopSeconds);
  const maxBinsByLength = Math.max(1, Math.floor(Math.min(guide.signature.length, drob.signature.length) / 3));
  const maxBins = Math.min(maxBinsByTime, maxBinsByLength);

  let bestOffsetBins = 0;
  let bestScore = -1;
  const scoreCache = new Map<number, number>();
  const score = (offset: number) => {
    if (!scoreCache.has(offset)) scoreCache.set(offset, correlationAtOffset(guide.signature, drob.signature, offset));
    return scoreCache.get(offset) ?? -1;
  };

  for (let offset = -maxBins; offset <= maxBins; offset++) {
    const candidate = score(offset);
    if (candidate > bestScore) {
      bestScore = candidate;
      bestOffsetBins = offset;
    }
  }

  let fractional = 0;
  if (bestOffsetBins > -maxBins && bestOffsetBins < maxBins) {
    const left = score(bestOffsetBins - 1);
    const center = score(bestOffsetBins);
    const right = score(bestOffsetBins + 1);
    const denominator = left - 2 * center + right;
    if (Math.abs(denominator) > 0.000001) fractional = clamp(0.5 * (left - right) / denominator, -0.5, 0.5);
  }

  return {
    offsetBins: bestOffsetBins,
    offsetSeconds: (bestOffsetBins + fractional) * guide.hopSeconds,
    confidence: clamp(bestScore, 0, 1),
  };
}

function findPhraseBoundaries(level: Float32Array, hopSeconds: number) {
  const threshold = 0.075;
  const minimumGapBins = Math.max(5, Math.ceil(0.28 / hopSeconds));
  const minimumChunkBins = Math.max(10, Math.ceil(0.9 / hopSeconds));
  const maxBoundaries = 23;

  const activeAfter = new Uint8Array(level.length + 1);
  let hasActivity = false;
  for (let i = level.length - 1; i >= 0; i--) {
    if (level[i] >= threshold) hasActivity = true;
    activeAfter[i] = hasActivity ? 1 : 0;
  }

  const boundaries = [0];
  let sawActivity = false;
  let lowStart = -1;
  let lastBoundary = 0;

  for (let i = 0; i < level.length && boundaries.length < maxBoundaries; i++) {
    if (level[i] >= threshold) {
      sawActivity = true;
      lowStart = -1;
      continue;
    }
    if (!sawActivity) continue;
    if (lowStart < 0) lowStart = i;
    const gapLength = i - lowStart + 1;
    if (gapLength < minimumGapBins) continue;

    const center = Math.floor((lowStart + i) / 2);
    const enoughBefore = center - lastBoundary >= minimumChunkBins;
    const enoughAfter = level.length - center >= minimumChunkBins;
    if (enoughBefore && enoughAfter && activeAfter[i + 1]) {
      boundaries.push(center);
      lastBoundary = center;
      sawActivity = false;
      lowStart = -1;
    }
  }

  boundaries.push(level.length);
  return boundaries;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function buildTightSegments(
  guide: EnvelopeData,
  drob: EnvelopeData,
  drobDuration: number,
  globalOffsetBins: number,
  globalOffsetSeconds: number,
  confidence: number,
) {
  if (confidence < 0.12) {
    return [{ sourceStart: 0, duration: drobDuration, outputStart: globalOffsetSeconds, offsetSeconds: globalOffsetSeconds }];
  }

  const boundaries = findPhraseBoundaries(drob.level, drob.hopSeconds);
  if (boundaries.length <= 2) {
    return [{ sourceStart: 0, duration: drobDuration, outputStart: globalOffsetSeconds, offsetSeconds: globalOffsetSeconds }];
  }

  const localRangeBins = Math.max(2, Math.round(LOCAL_SEARCH_SECONDS / drob.hopSeconds));
  const fractionalRemainder = globalOffsetSeconds - globalOffsetBins * drob.hopSeconds;
  const rawOffsets: number[] = [];

  for (let segmentIndex = 0; segmentIndex < boundaries.length - 1; segmentIndex++) {
    const start = boundaries[segmentIndex];
    const end = boundaries[segmentIndex + 1];
    let bestOffset = globalOffsetBins;
    let bestScore = segmentCorrelation(guide.signature, drob.signature, start, end, globalOffsetBins);

    for (let offset = globalOffsetBins - localRangeBins; offset <= globalOffsetBins + localRangeBins; offset++) {
      const candidate = segmentCorrelation(guide.signature, drob.signature, start, end, offset);
      if (candidate > bestScore) {
        bestScore = candidate;
        bestOffset = offset;
      }
    }

    if (bestScore < 0.06) bestOffset = globalOffsetBins;
    rawOffsets.push(bestOffset * drob.hopSeconds + fractionalRemainder);
  }

  const smoothed = rawOffsets.map((value, index) => median([
    rawOffsets[Math.max(0, index - 1)],
    value,
    rawOffsets[Math.min(rawOffsets.length - 1, index + 1)],
  ]));

  for (let i = 1; i < smoothed.length; i++) {
    const change = smoothed[i] - smoothed[i - 1];
    if (Math.abs(change) > 0.12) smoothed[i] = smoothed[i - 1] + Math.sign(change) * 0.12;
  }

  return boundaries.slice(0, -1).map((startBin, index) => {
    const endBin = boundaries[index + 1];
    const sourceStart = startBin * drob.hopSeconds;
    const sourceEnd = Math.min(drobDuration, endBin * drob.hopSeconds);
    const duration = Math.max(0, sourceEnd - sourceStart);
    const offsetSeconds = smoothed[index] ?? globalOffsetSeconds;
    return {
      sourceStart,
      duration,
      outputStart: sourceStart + offsetSeconds,
      offsetSeconds,
    };
  }).filter((segment) => segment.duration > 0.02);
}

export function analyzeVocalAlignment(guideBuffer: AudioBuffer, drobBuffer: AudioBuffer): VocalAlignmentPlan {
  const guide = makeEnvelope(guideBuffer);
  const drob = makeEnvelope(drobBuffer);
  const global = findGlobalOffset(guide, drob);

  let offsetSeconds = global.offsetSeconds;
  let confidence = global.confidence;
  let method: VocalAlignmentPlan['method'] = 'tight-sync';

  if (confidence < 0.08) {
    offsetSeconds = firstActivitySeconds(guide.level, guide.hopSeconds) - firstActivitySeconds(drob.level, drob.hopSeconds);
    offsetSeconds = clamp(offsetSeconds, -MAX_OFFSET_SECONDS, MAX_OFFSET_SECONDS);
    method = 'onset-fallback';
    confidence = Math.max(0, confidence);
  }

  const globalOffsetBins = Math.round(offsetSeconds / drob.hopSeconds);
  const segments = buildTightSegments(
    guide,
    drob,
    drobBuffer.duration,
    globalOffsetBins,
    offsetSeconds,
    confidence,
  );
  const firstOffset = segments[0]?.offsetSeconds ?? offsetSeconds;
  const lastOffset = segments[segments.length - 1]?.offsetSeconds ?? offsetSeconds;
  const driftMs = Math.round((lastOffset - firstOffset) * 1000);

  return {
    offsetSeconds,
    confidence,
    driftMs,
    segments,
    method,
  };
}
