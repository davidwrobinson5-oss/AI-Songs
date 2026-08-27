import fs from 'node:fs';

function patchFile(path, replacements) {
  let source = fs.readFileSync(path, 'utf8');
  for (const [from, to] of replacements) {
    if (source.includes(to)) continue;
    if (!source.includes(from)) throw new Error(`Expected source block not found in ${path}`);
    source = source.replace(from, to);
  }
  fs.writeFileSync(path, source);
}

patchFile('app/MelodyWorkspace.tsx', [
  [
    "import { useRef, useState } from 'react';",
    "import { useRef, useState } from 'react';\nimport { unzipSync } from 'fflate';",
  ],
  [
    "const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));",
    "const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));\n\nfunction audioMime(name: string) {\n  const lower = name.toLowerCase();\n  if (lower.endsWith('.wav')) return 'audio/wav';\n  if (lower.endsWith('.m4a')) return 'audio/mp4';\n  return 'audio/mpeg';\n}",
  ],
  [
    '  onPrecisionGuide: (blob: Blob) => void;',
    '  onPrecisionGuide: (vocalBlob: Blob, backingBlob?: Blob) => void;',
  ],
  [
`        if (poll.stage === 'complete' && poll.vocalFileId) {
          setStatus('Isolating the Mureka vocal with ElevenLabs…');
          const audioRes = await fetch(\`/api/soundverse/file?fileId=\${encodeURIComponent(String(poll.vocalFileId))}\`, { cache: 'no-store' });
          if (!audioRes.ok) throw new Error('Could not isolate the Mureka vocal.');
          const blob = await audioRes.blob();
          if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);
          const url = URL.createObjectURL(blob);
          setPrecisionGuideUrl(url);
          onPrecisionGuide(blob);
          setStatus('Precision guide vocal ready via Mureka — isolated and ready for Drob.');
          return;
        }`,
`        if (poll.stage === 'complete' && poll.vocalFileId) {
          setStatus('Separating the matching Mureka vocal and instrumental with ElevenLabs…');
          const stemsRes = await fetch(\`/api/soundverse/file?fileId=\${encodeURIComponent(String(poll.vocalFileId))}&archive=1\`, { cache: 'no-store' });
          if (!stemsRes.ok) throw new Error('Could not separate the Mureka vocal and instrumental.');

          const archive = unzipSync(new Uint8Array(await stemsRes.arrayBuffer()));
          const entries = Object.entries(archive).filter(([name]) => /\\.(mp3|wav|m4a)$/i.test(name));
          const vocalEntry = entries.find(([name]) => /vocal/i.test(name) && !/instrumental|accompaniment|backing|music/i.test(name));
          const backingEntry = entries.find(([name]) => /(instrumental|accompaniment|backing|music)/i.test(name) && !/vocal/i.test(name))
            || entries.find(([name]) => name !== vocalEntry?.[0]);
          if (!vocalEntry || !backingEntry) throw new Error('Could not identify both Mureka stems.');

          const vocalBlob = new Blob([vocalEntry[1]], { type: audioMime(vocalEntry[0]) });
          const backingBlob = new Blob([backingEntry[1]], { type: audioMime(backingEntry[0]) });
          if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);
          const url = URL.createObjectURL(vocalBlob);
          setPrecisionGuideUrl(url);
          onPrecisionGuide(vocalBlob, backingBlob);
          setStatus('Precision guide + matching Mureka instrumental ready for Drob.');
          return;
        }`,
  ],
]);

patchFile('app/page.tsx', [
  [
    "import DrobMixPlayer from './DrobMixPlayer';",
    "import DrobMixPlayer from './DrobMixPlayer';\nimport TrainVoiceWorkspace from './TrainVoiceWorkspace';",
  ],
  [
    "type Screen = 'create' | 'songs';",
    "type Screen = 'create' | 'songs' | 'train';",
  ],
  [
`              onPrecisionGuide={(blob) => {
                setPrecisionGuideBlob(blob);
                setGuideVocalUrl(URL.createObjectURL(blob));
                setDrobVocalUrl('');
              }}`,
`              onPrecisionGuide={(blob, matchingBacking) => {
                setPrecisionGuideBlob(blob);
                setGuideVocalUrl(URL.createObjectURL(blob));
                if (matchingBacking) setBackingUrl(URL.createObjectURL(matchingBacking));
                setDrobVocalUrl('');
              }}`,
  ],
  [
    '<small>This bypasses ElevenLabs vocal extraction. Kits receives the dry score-based guide directly.</small>',
    '<small>The Drob vocal now uses the instrumental separated from the exact same Mureka performance for tight alignment.</small>',
  ],
  [
`  if (screen === 'songs') {`,
`  if (screen === 'train') {
    return (
      <main>
        <section className="hero">
          <div className="brand">AI SONGS</div>
          <p className="eyebrow">Voice Lab</p>
          <h1>Build your own singing voice.</h1>
          <p className="sub">Record and prepare a clean voice-training dataset from your phone.</p>
        </section>
        <TrainVoiceWorkspace />
        <nav className="bottomNav">
          <span onClick={() => setScreen('create')}>🏠<small>Home</small></span>
          <span onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
          <span className="navActive">🎤<small>Voice</small></span>
          <span>🎚️<small>Mix</small></span>
          <span>📄<small>Sheets</small></span>
        </nav>
      </main>
    );
  }

  if (screen === 'songs') {`,
  ],
  [
`        <span>🎚️<small>Mix</small></span>
        <span>📄<small>Sheets</small></span>`,
`        <span onClick={() => setScreen('train')}>🎤<small>Voice</small></span>
        <span>🎚️<small>Mix</small></span>
        <span>📄<small>Sheets</small></span>`,
  ],
]);

{
  const path = 'app/page.tsx';
  let source = fs.readFileSync(path, 'utf8');
  source = source.replace(/\n\s*<span(?: className="navActive")? onClick=\{newSong\}>＋<small>Create<\/small><\/span>/g, '');
  source = source.replace(/<small>Train Voice<\/small>/g, '<small>Voice</small>');
  fs.writeFileSync(path, source);
}

console.log('Applied aligned Mureka backing, Voice Lab, Sheets navigation, Voice label, and removed duplicate Create nav icon.');
