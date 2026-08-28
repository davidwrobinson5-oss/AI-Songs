import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Sheets patch source block not found: ${from.slice(0, 100)}`);
  source = source.replace(from, to);
}

replaceOnce(
  "import MixWorkspace from './MixWorkspace';",
  "import MixWorkspace from './MixWorkspace';\nimport SheetsWorkspace from './SheetsWorkspace';",
);

replaceOnce(
  "type Screen = 'create' | 'songs' | 'train' | 'mix';",
  "type Screen = 'create' | 'songs' | 'train' | 'mix' | 'sheets';",
);

replaceOnce(
`  if (screen === 'mix') {`,
`  if (screen === 'sheets') {
    return (
      <main>
        <section className="hero noPrint">
          <div className="brand">AI SONGS</div>
          <p className="eyebrow">Sheets</p>
          <h1>Export the song to sheet music.</h1>
          <p className="sub">Use the finished music, vocal, lyrics, and melody already created in this song to generate downloadable notation.</p>
        </section>
        <SheetsWorkspace
          songTitle={songTitle}
          lyrics={lyrics}
          melodyAnalysis={melodyAnalysis}
          prompt={prompt}
          musicUrl={backingUrl || audioUrl}
          vocalUrl={drobVocalUrl || guideVocalUrl}
          masterUrl={masterBlob ? URL.createObjectURL(masterBlob) : ''}
        />
        <nav className="bottomNav noPrint">
          <span onClick={() => setScreen('create')}>🏠<small>Home</small></span>
          <span onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
          <span onClick={() => setScreen('train')}>🎤<small>Voice</small></span>
          <span onClick={() => setScreen('mix')}>🎚️<small>Mix</small></span>
          <span className="navActive">📄<small>Sheets</small></span>
        </nav>
      </main>
    );
  }

  if (screen === 'mix') {`,
);

fs.writeFileSync(path, source);
console.log('Wired the Sheets export workspace into finished song audio.');
