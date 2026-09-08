import fs from 'node:fs';

function replaceRequired(source, needle, replacement, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(needle)) throw new Error(`Missing ${label} anchor`);
  return source.replace(needle, replacement);
}

let voice = fs.readFileSync('app/VoiceWorkspace.tsx','utf8');
voice = replaceRequired(voice,
  `import TrainVoiceWorkspace from './TrainVoiceWorkspace';`,
  `import TrainVoiceWorkspace from './TrainVoiceWorkspace';\nimport VoiceToInstrumentsWorkspace from './VoiceToInstrumentsWorkspace';`,
  'Voice import');
voice = replaceRequired(voice,
  `  onUseVocal: (blob: Blob) => void;\n};`,
  `  onUseVocal: (blob: Blob) => void;\n  onUseSong?: (blob: Blob) => void;\n};`,
  'Voice props');
voice = replaceRequired(voice,
  `export default function VoiceWorkspace({ backingUrl, lyrics, songTitle, onUseVocal }: Props) {`,
  `export default function VoiceWorkspace({ backingUrl, lyrics, songTitle, onUseVocal, onUseSong }: Props) {`,
  'Voice signature');
voice = replaceRequired(voice,
  `  const [choice, setChoice] = useState<'record' | 'train' | null>(null);`,
  `  const [choice, setChoice] = useState<'record' | 'train' | 'instruments' | null>(null);`,
  'Voice choice union');
voice = replaceRequired(voice,
  `          <button className="modeCard" onClick={() => setChoice('train')}>\n            <span className="icon">🧬</span><strong>Train Voice</strong><small>Train your voice for more efficient production using Pie’s built-in AI tools. Create a custom singing voice you can reuse for recording, layering, and production.</small>\n          </button>`,
  `          <button className="modeCard" onClick={() => setChoice('train')}>\n            <span className="icon">🧬</span><strong>Train Voice</strong><small>Train your voice for more efficient production using Pie’s built-in AI tools. Create a custom singing voice you can reuse for recording, layering, and production.</small>\n          </button>\n          <button className="modeCard" onClick={() => setChoice('instruments')}>\n            <span className="icon">🎛️</span><strong>Voice → Instruments</strong><small>Perform bass, drums, guitar, keys, and other parts with your mouth. Pie turns each performance into an instrument and can build a song from your layers.</small>\n          </button>`,
  'Voice third option');
voice = replaceRequired(voice,
  `  if (choice === 'train') {\n    return (\n      <>\n        <section className="panel"><button className="secondary" onClick={() => setChoice(null)}>← Voice Choices</button></section>\n        <TrainVoiceWorkspace />\n      </>\n    );\n  }`,
  `  if (choice === 'train') {\n    return (\n      <>\n        <section className="panel"><button className="secondary" onClick={() => setChoice(null)}>← Voice Choices</button></section>\n        <TrainVoiceWorkspace />\n      </>\n    );\n  }\n\n  if (choice === 'instruments') {\n    return (\n      <>\n        <section className="panel"><button className="secondary" onClick={() => setChoice(null)}>← Voice Choices</button></section>\n        <VoiceToInstrumentsWorkspace onUseSong={onUseSong} />\n      </>\n    );\n  }`,
  'Voice instruments branch');
fs.writeFileSync('app/VoiceWorkspace.tsx',voice);

let page = fs.readFileSync('app/page.tsx','utf8');
page = replaceRequired(page,
  `          onUseVocal={(blob) => {\n            if (drobVocalUrl) URL.revokeObjectURL(drobVocalUrl);\n            setDrobVocalUrl(URL.createObjectURL(blob));\n            setMasterBlob(null);\n            setDrobStatus('Live vocal loaded into the song.');\n          }}\n        />`,
  `          onUseVocal={(blob) => {\n            if (drobVocalUrl) URL.revokeObjectURL(drobVocalUrl);\n            setDrobVocalUrl(URL.createObjectURL(blob));\n            setMasterBlob(null);\n            setDrobStatus('Live vocal loaded into the song.');\n          }}\n          onUseSong={(blob) => {\n            if (audioUrl && audioUrl.startsWith('blob:')) { try { URL.revokeObjectURL(audioUrl); } catch {} }\n            if (backingUrl && backingUrl.startsWith('blob:')) { try { URL.revokeObjectURL(backingUrl); } catch {} }\n            const url = URL.createObjectURL(blob);\n            setGeneratedBlob(blob);\n            setAudioUrl(url);\n            setBackingUrl(URL.createObjectURL(blob));\n            setInstrumental(true);\n            setMasterBlob(null);\n            setCurrentVersionNumber(undefined);\n            setSaveStatus('Voice-built song loaded into Pie. Save it when you want to keep this version.');\n            setDrobStatus('');\n          }}\n        />`,
  'Page Voice callback');
fs.writeFileSync('app/page.tsx',page);
console.log('Voice to Instruments integration applied.');
