import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

function replaceOnce(from, to) {
  if (source.includes(to)) return;
  if (!source.includes(from)) throw new Error(`Mix patch source block not found: ${from.slice(0, 100)}`);
  source = source.replace(from, to);
}

replaceOnce(
  "import VoiceWorkspace from './VoiceWorkspace';",
  "import VoiceWorkspace from './VoiceWorkspace';\nimport MixWorkspace from './MixWorkspace';",
);

replaceOnce(
  "type Screen = 'create' | 'songs' | 'train';",
  "type Screen = 'create' | 'songs' | 'train' | 'mix';",
);

replaceOnce(
`  if (screen === 'train') {`,
`  if (screen === 'mix') {
    return (
      <main>
        <section className="hero">
          <div className="brand">AI SONGS</div>
          <p className="eyebrow">Mix</p>
          <h1>Finish the record.</h1>
          <p className="sub">Balance the music and vocals, polish the lead, add doubles or harmonies, then render a finished master.</p>
        </section>
        <MixWorkspace
          musicUrl={backingUrl || audioUrl}
          leadVocalUrl={drobVocalUrl || guideVocalUrl}
          guideVocalUrl={guideVocalUrl}
          songTitle={songTitle}
          onMasterRendered={async (blob) => {
            setMasterBlob(blob);
            try {
              const [savedBacking, savedGuide, savedDrob] = await Promise.all([
                urlToBlob(backingUrl || audioUrl),
                urlToBlob(guideVocalUrl),
                urlToBlob(drobVocalUrl),
              ]);
              const saved = await saveVersion({
                songId: currentSongId,
                title: songTitle.trim() || 'Untitled Song',
                prompt,
                mode,
                vocalRange,
                durationMs,
                instrumental,
                lyrics: lyrics || undefined,
                melodyBlob: melodyBlob || undefined,
                melodyAnalysis: melodyAnalysis || undefined,
                precisionGuideBlob: precisionGuideBlob || undefined,
                generatedBlob: generatedBlob || undefined,
                backingBlob: savedBacking,
                guideVocalBlob: savedGuide,
                drobVocalBlob: savedDrob,
                masterBlob: blob,
              });
              setCurrentSongId(saved.song.id);
              setCurrentVersionNumber(saved.version.versionNumber);
              setSaveStatus(\`Master saved to Songs · Version \${saved.version.versionNumber}\`);
            } catch (error) {
              setSaveStatus(error instanceof Error ? \`Master rendered, but library save failed: \${error.message}\` : 'Master rendered, but library save failed.');
            }
          }}
        />
        {saveStatus && <div className="statusBox">{saveStatus}</div>}
        <nav className="bottomNav">
          <span onClick={() => setScreen('create')}>🏠<small>Home</small></span>
          <span onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
          <span onClick={() => setScreen('train')}>🎤<small>Voice</small></span>
          <span className="navActive">🎚️<small>Mix</small></span>
          <span>📄<small>Sheets</small></span>
        </nav>
      </main>
    );
  }

  if (screen === 'train') {`,
);

fs.writeFileSync(path, source);
console.log('Wired the dedicated Mix tab and master version saving.');
