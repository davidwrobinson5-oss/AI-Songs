import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

if(!source.includes("import LyricsFirstStudio from './LyricsFirstStudio';")){
  source=source.replace("import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';","import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';\nimport LyricsFirstStudio from './LyricsFirstStudio';");
}

const oldBlock=`      {mode === 'lyrics' && (\n        <section className="panel">\n          <h2>Lyrics</h2>\n          <textarea\n            value={lyrics}\n            onChange={(e) => setLyrics(e.target.value)}\n            placeholder="Start writing here, or generate full lyrics from your song description..."\n          />\n          <div className="mixButtons">\n            <button className="primary" onClick={() => runLyrics('generate')} disabled={lyricsLoading || !prompt.trim()}>\n              {lyricsLoading ? 'Writing…' : 'Generate Full Lyrics'}\n            </button>\n            <button className="secondary" onClick={() => runLyrics('rewrite')} disabled={lyricsLoading || !lyrics.trim()}>\n              Rewrite\n            </button>\n          </div>\n          {lyricsStatus && <div className="statusBox">{lyricsStatus}</div>}\n        </section>\n      )}`;

const newBlock=`      {mode === 'lyrics' && (\n        <LyricsFirstStudio\n          prompt={prompt}\n          vocalRange={vocalRange}\n          lyrics={lyrics}\n          onLyricsChange={setLyrics}\n        />\n      )}`;

if(!source.includes(newBlock)){
  if(!source.includes(oldBlock))throw new Error('Legacy Lyrics First block not found.');
  source=source.replace(oldBlock,newBlock);
}

fs.writeFileSync(path,source);
console.log('Replaced basic Lyrics First editor with the structured songwriting studio.');
