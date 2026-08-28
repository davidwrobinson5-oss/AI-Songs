import fs from 'node:fs';

const path = 'app/MixWorkspace.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Sample-rate patch source block not found: ${from.slice(0, 140)}`);
  source = source.replace(from, to);
}

replaceOnce(
`type ExportQualityKey = 'lossless' | 'studio' | 'hires';`,
`type ExportQualityKey = 'lossless' | 'studio' | 'hires';
type MasterSampleRate = 44100 | 48000 | 96000;

const MASTER_SAMPLE_RATES: Array<{ value: MasterSampleRate; label: string; use: string }> = [
  { value: 44100, label: '44.1 kHz', use: 'Music' },
  { value: 48000, label: '48 kHz', use: 'Studio / Video' },
  { value: 96000, label: '96 kHz', use: 'Hi-Res' },
];`,
);

replaceOnce(
`  const [exportQuality, setExportQuality] = useState<ExportQualityKey>('studio');
  const effectiveMusicUrl = remixUrl || musicUrl;`,
`  const [exportQuality, setExportQuality] = useState<ExportQualityKey>('studio');
  const [masterSampleRate, setMasterSampleRate] = useState<MasterSampleRate>(48000);
  const effectiveMusicUrl = remixUrl || musicUrl;`,
);

replaceOnce(
`      const sampleRate = quality.sampleRate;`,
`      const sampleRate = masterSampleRate;`,
);

replaceOnce(
`      setStatus(\`\${profile.label} · \${quality.label} \${quality.bitDepth}-bit/\${Math.round(quality.sampleRate / 1000)} kHz · \${metrics.integratedLufs.toFixed(1)} LUFS est. · \${metrics.truePeakDb.toFixed(1)} dBTP est.\${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}\`);`,
`      setStatus(\`\${profile.label} · \${quality.label} \${quality.bitDepth}-bit/\${masterSampleRate === 44100 ? '44.1' : Math.round(masterSampleRate / 1000)} kHz · \${metrics.integratedLufs.toFixed(1)} LUFS est. · \${metrics.truePeakDb.toFixed(1)} dBTP est.\${metrics.targetLimited ? ' · peak ceiling prevented a louder target' : ''}\`);`,
);

replaceOnce(
`            </div>
          </div>

          <div className="mixFx">
            <h3>Master fine-tune</h3>`,
`            </div>
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
            <h3>Master fine-tune</h3>`,
);

fs.writeFileSync(path, source);
console.log('Added 44.1, 48, and 96 kHz master sample-rate choices.');
