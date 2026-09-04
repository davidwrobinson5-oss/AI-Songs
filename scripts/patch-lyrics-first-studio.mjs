import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import LyricsFirstStudio from './LyricsFirstStudio';")){
  source=source.replace("import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';","import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';\nimport LyricsFirstStudio from './LyricsFirstStudio';");
}

const newBlock=`      {mode === 'lyrics' && (\n        <LyricsFirstStudio\n          prompt={prompt}\n          vocalRange={vocalRange}\n          lyrics={lyrics}\n          onLyricsChange={setLyrics}\n        />\n      )}`;

if(!source.includes(newBlock)){
  const start=source.indexOf("      {mode === 'lyrics' && (");
  const end=source.indexOf("      {mode === 'melody' && (", start);
  if(start<0||end<0)throw new Error('Lyrics First section boundaries not found.');
  source=source.slice(0,start)+newBlock+'\n\n'+source.slice(end);
}

if(!source.includes("<LyricsFirstStudio"))throw new Error('Lyrics First studio missing after patch.');

fs.writeFileSync(path,source);
console.log('Replaced Lyrics First section with the structured songwriting studio.');
