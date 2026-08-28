import fs from 'node:fs';

const path = 'app/MixWorkspace.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Master quality patch source block not found: ${from.slice(0, 140)}`);
  source = source.replace(from, to);
}

replaceOnce(
`type MasterMetrics = {`,
`type ExportQualityKey = 'lossless' | 'studio' | 'hires';

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

type MasterMetrics = {`,
);

replaceOnce(
`function audioBufferToWav(buffer: AudioBuffer) {
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
}`,
`function audioBufferToWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 16) {
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
}`,
);

replaceOnce(
`  const [masterMetrics, setMasterMetrics] = useState<MasterMetrics | null>(null);
  const effectiveMusicUrl = remixUrl || musicUrl;`,
`  const [masterMetrics, setMasterMetrics] = useState<MasterMetrics | null>(null);
  const [exportQuality, setExportQuality] = useState<ExportQualityKey>('studio');
  const effectiveMusicUrl = remixUrl || musicUrl;`,
);

replaceOnce(
`    const profile = MASTER_PROFILES[profileKey];
    setSelectedMasterProfile(profileKey);`,
`    const profile = MASTER_PROFILES[profileKey];
    const quality = EXPORT_QUALITIES[exportQuality];
    setSelectedMasterProfile(profileKey);`,
);

replaceOnce(
`      const sampleRate = 44100;`,
`      const sampleRate = quality.sampleRate;`,
);

replaceOnce(
`      const blob = audioBufferToWav(normalizedMaster.buffer);`,
`      const blob = audioBufferToWav(normalizedMaster.buffer, quality.bitDepth);`,
);

replaceOnce(
`      setStatus(\`\${profile.label} master saved · \${metrics.integratedLufs.toFixed(1)} LUFS est. · \${metrics.truePeakDb.toFixed(1)} dBTP est.\${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}\`);`,
`      setStatus(\`\${profile.label} · \${quality.label} \${quality.bitDepth}-bit/\${Math.round(quality.sampleRate / 1000)} kHz · \${metrics.integratedLufs.toFixed(1)} LUFS est. · \${metrics.truePeakDb.toFixed(1)} dBTP est.\${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}\`);`,
);

replaceOnce(
`          <div className="mixFx">
            <h3>Master fine-tune</h3>`,
`          <div className="playerCard qualityCard">
            <strong>Export quality</strong>
            <small>Choose the actual WAV render format. Hi-Res creates real 24-bit/96 kHz PCM, but it cannot restore detail already lost in a compressed AI source.</small>
            <div className="modeGrid" style={{ marginTop: 10 }}>
              {(Object.entries(EXPORT_QUALITIES) as Array<[ExportQualityKey, ExportQuality]>).map(([key, quality]) => (
                <button key={key} className={exportQuality === key ? 'modeCard active' : 'modeCard'} onClick={() => setExportQuality(key)}>
                  <strong>{quality.label}</strong><small>{quality.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="mixFx">
            <h3>Master fine-tune</h3>`,
);

fs.writeFileSync(path, source);
console.log('Added lossless, studio, and hi-res WAV mastering options.');
