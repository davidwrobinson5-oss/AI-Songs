import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');
const marker = '/* LYRICS_HANDOFF_AFTER_VOCAL */';

if (!source.includes(marker)) {
  const voiceAnchor = /(<VoiceWorkspace[\s\S]*?\/>)(\s*<nav className="bottomNav(?: noPrint)?">)/;
  if (!voiceAnchor.test(source)) {
    throw new Error('Lyrics handoff patch could not find the Voice workspace.');
  }

  source = source.replace(
    voiceAnchor,
    `$1\n        {drobVocalUrl && (\n          <section className="panel">\n            ${marker}\n            <p className="eyebrow">Next Step</p>\n            <h2>Work on the lyrics.</h2>\n            <p className="sub">Your finished vocal stays attached to this song. Open Lyrics to review, rewrite, or replace the words without losing the music or vocal.</p>\n            {lyrics.trim() && <div className="statusBox">Current lyrics loaded · {lyrics.split('\\n').filter(Boolean).length} line(s)</div>}\n            <button\n              className="primary"\n              onClick={() => {\n                setMode('lyrics');\n                setLyricsStatus(lyrics.trim() ? 'Loaded the current song lyrics for editing.' : 'Lyrics editor ready. Add or generate lyrics for this song.');\n                setScreen('create');\n              }}\n            >\n              ✍️ Next: Work on Lyrics →\n            </button>\n          </section>\n        )}$2`,
  );

  const musicAnchor = `            {generatedBlob && (\n              <div className="playerCard">`;
  if (!source.includes(musicAnchor)) {
    throw new Error('Lyrics handoff patch could not find the Music First save step.');
  }

  source = source.replace(
    musicAnchor,
    `            {drobVocalUrl && (\n              <div className="playerCard">\n                <strong>Next step · Lyrics</strong>\n                <small>Your music and finished vocal are ready. Open the Lyrics editor to make changes while keeping this song loaded.</small>\n                {lyrics.trim() && <small>Existing lyrics will load automatically.</small>}\n                <button\n                  className="primary"\n                  onClick={() => {\n                    setMode('lyrics');\n                    setLyricsStatus(lyrics.trim() ? 'Loaded the current song lyrics for editing.' : 'Lyrics editor ready. Add or generate lyrics for this song.');\n                  }}\n                >\n                  ✍️ Work on Lyrics →\n                </button>\n              </div>\n            )}\n\n${musicAnchor}`,
  );

  fs.writeFileSync(path, source);
}

console.log('Added Lyrics handoff after finished vocal/Drob step.');
