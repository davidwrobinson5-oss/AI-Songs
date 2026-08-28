import fs from 'node:fs';

const path = 'app/MixWorkspace.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Master meter patch source block not found: ${from.slice(0, 140)}`);
  source = source.replace(from, to);
}

replaceOnce(
`const MASTER_PROFILES: Record<MasterProfileKey, { label: string; description: string; masterLevel: number; glue: number }> = {
  streaming: { label: 'Streaming', description: 'Balanced level and controlled dynamics for general music streaming.', masterLevel: 0.9, glue: 0.54 },
  video: { label: 'YouTube / Video', description: 'Clear, present master with a little extra headroom for video platforms.', masterLevel: 0.9, glue: 0.48 },
  loud: { label: 'Loud / Car / Club', description: 'Denser, more aggressive presentation for high-energy playback.', masterLevel: 0.99, glue: 0.76 },
  dynamic: { label: 'Dynamic / Hi-Fi', description: 'More transient impact and breathing room for critical listening.', masterLevel: 0.86, glue: 0.3 },
  archive: { label: 'WAV / Archive', description: 'Conservative full-resolution master for storage or later mastering.', masterLevel: 0.84, glue: 0.24 },
};`,
`type MasterMetrics = {
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
};`,
);

replaceOnce(
`  const [selectedMasterProfile, setSelectedMasterProfile] = useState<MasterProfileKey>('streaming');
  const effectiveMusicUrl = remixUrl || musicUrl;`,
`  const [selectedMasterProfile, setSelectedMasterProfile] = useState<MasterProfileKey>('streaming');
  const [masterMetrics, setMasterMetrics] = useState<MasterMetrics | null>(null);
  const effectiveMusicUrl = remixUrl || musicUrl;`,
);

replaceOnce(
`async function fetchAudioBytes(url: string) {`,
`type BiquadCoefficients = { b0: number; b1: number; b2: number; a1: number; a2: number };

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

async function fetchAudioBytes(url: string) {`,
);

replaceOnce(
`      const rendered = await offline.startRendering();
      const blob = audioBufferToWav(rendered);`,
`      const rendered = await offline.startRendering();
      const normalizedMaster = await normalizeMasterForProfile(rendered, profile);
      const metrics = normalizedMaster.metrics;
      const blob = audioBufferToWav(normalizedMaster.buffer);
      setMasterMetrics(metrics);`,
);

replaceOnce(
`      setStatus(\`${profile.label} master rendered and saved as a new Songs version.\`);`,
`      setStatus(\`${profile.label} master saved · ${metrics.integratedLufs.toFixed(1)} LUFS est. · ${metrics.truePeakDb.toFixed(1)} dBTP est.${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}\`);`,
);

replaceOnce(
`            <small>These are practical tonal/dynamics profiles, not certified LUFS or true-peak measurements. A future meter can make these targets exact.</small>`,
`            <small>Each profile now measures gated K-weighted integrated loudness and a mobile-safe 4× intersample peak estimate, then adjusts final level without crossing the selected peak ceiling. Measurements are production estimates, not a certified broadcast meter.</small>
            {masterMetrics && (
              <div className="statusBox">
                Measured master: {masterMetrics.integratedLufs.toFixed(1)} LUFS est. · {masterMetrics.truePeakDb.toFixed(1)} dBTP est. · sample peak {masterMetrics.samplePeakDb.toFixed(1)} dBFS · gain {masterMetrics.appliedGainDb >= 0 ? '+' : ''}{masterMetrics.appliedGainDb.toFixed(1)} dB{masterMetrics.targetLimited ? ' · peak-limited before loudness target' : ''}
              </div>
            )}`,
);

fs.writeFileSync(path, source);
console.log('Added measured mastering loudness and intersample peak estimates.');
