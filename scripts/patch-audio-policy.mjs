import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (source.includes(to)) return source;
  if (!source.includes(from)) throw new Error(`${label} patch source block not found: ${from.slice(0, 120)}`);
  return source.replace(from, to);
}

{
  const path = 'app/page.tsx';
  let source = fs.readFileSync(path, 'utf8');
  source = replaceOnce(
    source,
`  useEffect(() => {
    if (screen === 'songs') refreshLibrary();
  }, [screen]);`,
`  useEffect(() => {
    if (screen === 'songs') refreshLibrary();
  }, [screen]);

  useEffect(() => {
    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));
  }, [screen]);`,
    'screen audio policy',
  );
  fs.writeFileSync(path, source);
}

for (const path of ['app/MixWorkspace.tsx', 'app/DrobMixPlayer.tsx']) {
  let source = fs.readFileSync(path, 'utf8');
  source = source.replace(
    "import { useRef, useState } from 'react';",
    "import { useEffect, useRef, useState } from 'react';",
  );

  const stopBlock = `  function stop() {
    for (const source of sourcesRef.current) {
      try { source.stop(); } catch {}
    }
    sourcesRef.current = [];
    setStatus('Stopped');
  }`;
  const withListener = `${stopBlock}

  useEffect(() => {
    const stopWebAudio = () => stop();
    window.addEventListener('ai-songs-stop-webaudio', stopWebAudio);
    return () => window.removeEventListener('ai-songs-stop-webaudio', stopWebAudio);
  }, []);`;
  source = replaceOnce(source, stopBlock, withListener, `${path} global stop listener`);

  source = source.replace(
    '  async function playMix() {\n    stop();',
    "  async function playMix() {\n    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));\n    stop();",
  );
  source = source.replace(
    '  async function playAligned() {\n    stop();',
    "  async function playAligned() {\n    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));\n    stop();",
  );

  fs.writeFileSync(path, source);
}

console.log('Enforced exclusive playback and stop-on-screen-change audio policy.');
