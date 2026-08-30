import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = '/* PIE LIBRARY SYNC REFRESH */';
if (!source.includes(marker)) {
  const needle = `  useEffect(() => {\n    if (screen === 'songs') refreshLibrary();\n  }, [screen]);`;
  if (!source.includes(needle)) throw new Error('Songs refresh effect not found after build patches.');
  const replacement = `${needle}\n\n  ${marker}\n  useEffect(() => {\n    const onSynced = () => {\n      if (screen === 'songs') void refreshLibrary();\n    };\n    window.addEventListener('pie-library-synced', onSynced);\n    return () => window.removeEventListener('pie-library-synced', onSynced);\n  }, [screen]);`;
  source = source.replace(needle, replacement);
  fs.writeFileSync(path, source);
}

const uiFiles = [
  'app/page.tsx',
  'app/MelodyWorkspace.tsx',
  'app/MixWorkspace.tsx',
  'app/SheetsWorkspace.tsx',
  'app/TrainVoiceWorkspace.tsx',
  'app/VoiceWorkspace.tsx',
  'app/DrobMixPlayer.tsx',
  'app/CloudSongSync.tsx',
];

const processingPattern = /(['"`])((?:Generating|Writing|Improving|Creating|Finding|Converting|Saving|Sending|Analyzing|Preparing|Processing|Loading|Syncing|Uploading|Mixing|Mastering|Rendering|Exporting|Building|Separating|Transcribing|Detecting|Applying|Polishing)[^'"`\n]{0,120}(?:…|\.\.\.))\1/g;

for (const file of uiFiles) {
  if (!fs.existsSync(file)) continue;
  const before = fs.readFileSync(file, 'utf8');
  let after = before
    .replaceAll('ElevenLabs Music v2', 'Music Generator')
    .replaceAll('ElevenLabs', 'Music Engine')
    .replace(processingPattern, (_match, quote) => `${quote}Turning up the heat…${quote}`);

  if (after !== before) fs.writeFileSync(file, after);
}

console.log('Enabled immediate Songs refresh and applied Pie processing copy.');
