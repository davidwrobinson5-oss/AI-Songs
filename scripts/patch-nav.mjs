import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

function nav(active) {
  const cls = (name) => name === active ? ' className="navActive"' : '';
  return `<nav className="bottomNav noPrint">
          <span${cls('create')} onClick={() => setScreen('create')}>🎶<small>Music</small></span>
          <span${cls('train')} onClick={() => setScreen('train')}>🎤<small>Voice</small></span>
          <span${cls('songs')} onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
          <span${cls('mix')} onClick={() => setScreen('mix')}>🎚️<small>Mix</small></span>
          <span${cls('sheets')} onClick={() => setScreen('sheets')}>📄<small>Sheets</small></span>
        </nav>`;
}

source = source.replace(/<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/g, (full) => {
  if (/className="navActive"[^>]*>🎵/.test(full)) return nav('songs');
  if (/className="navActive"[^>]*>🎤/.test(full)) return nav('train');
  if (/className="navActive"[^>]*>🎚️/.test(full)) return nav('mix');
  if (/className="navActive"[^>]*>📄/.test(full)) return nav('sheets');
  return nav('create');
});

source = source.replace(/(<VoiceWorkspace[\s\S]*?<\/VoiceWorkspace>|<VoiceWorkspace[\s\S]*?\/>)?([\s\S]*?)<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/, (match, voice, between) => {
  if (!voice) return match;
  return `${voice}${between}${nav('train')}`;
});

source = source.replace(/(if \(screen === 'songs'\) \{[\s\S]*?)<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/, `$1${nav('songs')}`);
source = source.replace(/(if \(screen === 'mix'\) \{[\s\S]*?)<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/, `$1${nav('mix')}`);
source = source.replace(/(if \(screen === 'sheets'\) \{[\s\S]*?)<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/, `$1${nav('sheets')}`);

const navMatches = [...source.matchAll(/<nav className="bottomNav(?: noPrint)?">[\s\S]*?<\/nav>/g)];
if (navMatches.length) {
  const last = navMatches[navMatches.length - 1];
  source = source.slice(0, last.index) + nav('create') + source.slice((last.index || 0) + last[0].length);
}

fs.writeFileSync(path, source);
console.log('Forced navigation order: Music, Voice, Songs, Mix, Sheets.');
