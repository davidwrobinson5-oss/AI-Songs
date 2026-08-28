import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

const projectPanel = `      <section className="panel">
        <h2>Song project</h2>
        <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
        {currentVersionNumber && <div className="statusBox">Working from Version {currentVersionNumber}</div>}
      </section>

`;

if (source.includes(projectPanel)) {
  source = source.replace(projectPanel, '');
}

const describeStart = `      <section className="panel">
        <h2>Describe the song</h2>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />`;

const combined = `      <section className="panel songProjectPanel">
        <div className="songProjectBlock">
          <h2>Song project</h2>
          <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
          {currentVersionNumber && <div className="statusBox">Working from Version {currentVersionNumber}</div>}
        </div>
        <div className="songDescriptionBlock">
          <h2>Describe the song</h2>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />
        </div>`;

if (!source.includes('className="panel songProjectPanel"')) {
  if (!source.includes(describeStart)) throw new Error('Describe-song panel not found.');
  source = source.replace(describeStart, combined);
}

fs.writeFileSync(path, source);
console.log('Combined Song Project and Describe the Song into one card.');
