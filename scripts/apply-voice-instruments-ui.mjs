import fs from 'node:fs';

function update(path, transform) {
  const before = fs.readFileSync(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`No changes made to ${path}`);
  fs.writeFileSync(path, after);
  console.log(`updated ${path}`);
}

update('app/VoiceWorkspace.tsx', (input) => {
  let source = input;
  if (!source.includes("import VoiceInstrumentWorkspace from './VoiceInstrumentWorkspace';")) {
    source = source.replace("import TrainVoiceWorkspace from './TrainVoiceWorkspace';", "import TrainVoiceWorkspace from './TrainVoiceWorkspace';\nimport VoiceInstrumentWorkspace from './VoiceInstrumentWorkspace';");
  }
  source = source.replace("  onUseVocal: (blob: Blob) => void;\n};", "  onUseVocal: (blob: Blob) => void;\n  onUseMusic: (blob: Blob) => void;\n};");
  source = source.replace("export default function VoiceWorkspace({ backingUrl, lyrics, songTitle, onUseVocal }: Props) {", "export default function VoiceWorkspace({ backingUrl, lyrics, songTitle, onUseVocal, onUseMusic }: Props) {");
  source = source.replace("const [choice, setChoice] = useState<'record' | 'train' | null>(null);", "const [choice, setChoice] = useState<'record' | 'train' | 'instruments' | null>(null);");
  const trainCard = `          <button className="modeCard" onClick={() => setChoice('train')}>\n            <span className="icon">🧬</span><strong>Train Voice</strong><small>Train your voice for more efficient production using Pie’s built-in AI tools. Create a custom singing voice you can reuse for recording, layering, and production.</small>\n          </button>`;
  if (!source.includes("setChoice('instruments')")) {
    source = source.replace(trainCard, `${trainCard}\n          <button className="modeCard" onClick={() => setChoice('instruments')}>\n            <span className="icon">🎸</span><strong>Voice → Instruments</strong><small>Perform bass, drums, guitar, keys, and other parts with your mouth. Pie turns each idea into an instrument layer, then builds the song from your arrangement.</small>\n          </button>`);
  }
  const trainReturn = `  if (choice === 'train') {\n    return (\n      <>\n        <section className="panel"><button className="secondary" onClick={() => setChoice(null)}>← Voice Choices</button></section>\n        <TrainVoiceWorkspace />\n      </>\n    );\n  }`;
  if (!source.includes("choice === 'instruments'")) {
    source = source.replace(trainReturn, `${trainReturn}\n\n  if (choice === 'instruments') {\n    return (\n      <>\n        <section className="panel"><button className="secondary" onClick={() => setChoice(null)}>← Voice Choices</button></section>\n        <VoiceInstrumentWorkspace songTitle={songTitle} onUseMusic={onUseMusic} />\n      </>\n    );\n  }`);
  return source;
});

update('app/page.tsx', (input) => {
  let source = input;
  const anchor = `          onUseVocal={(blob) => {\n            if (drobVocalUrl) URL.revokeObjectURL(drobVocalUrl);\n            setDrobVocalUrl(URL.createObjectURL(blob));\n            setMasterBlob(null);\n            setDrobStatus('Live vocal loaded into the song.');\n          }}\n        />`;
  const replacement = `          onUseVocal={(blob) => {\n            if (drobVocalUrl) URL.revokeObjectURL(drobVocalUrl);\n            setDrobVocalUrl(URL.createObjectURL(blob));\n            setMasterBlob(null);\n            setDrobStatus('Live vocal loaded into the song.');\n          }}\n          onUseMusic={(blob) => {\n            if (audioUrl && audioUrl.startsWith('blob:')) { try { URL.revokeObjectURL(audioUrl); } catch {} }\n            if (backingUrl && backingUrl.startsWith('blob:')) { try { URL.revokeObjectURL(backingUrl); } catch {} }\n            const url = URL.createObjectURL(blob);\n            const backing = URL.createObjectURL(blob);\n            setGeneratedBlob(blob);\n            setAudioUrl(url);\n            setBackingUrl(backing);\n            setMasterBlob(null);\n            setCurrentVersionNumber(undefined);\n            setSaveStatus('Voice-built instrumental loaded into the current song. Save a Song Version when you are ready.');\n          }}\n        />`;
  if (!source.includes(anchor)) throw new Error('VoiceWorkspace page anchor not found');
  source = source.replace(anchor, replacement);
  return source;
});

console.log('Voice-to-Instruments UI migration complete.');
