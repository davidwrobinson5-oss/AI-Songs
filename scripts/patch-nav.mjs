import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

const canonicalNav = `<nav className="bottomNav">
          <span className={screen === 'create' ? 'navActive' : ''} onClick={() => setScreen('create')}>🏠<small>Home</small></span>
          <span className={screen === 'songs' ? 'navActive' : ''} onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
          <span className={screen === 'train' ? 'navActive' : ''} onClick={() => setScreen('train')}>🎤<small>Voice</small></span>
          <span>🎚️<small>Mix</small></span>
          <span>📄<small>Sheets</small></span>
        </nav>`;

source = source.replace(/<nav className="bottomNav">[\s\S]*?<\/nav>/g, canonicalNav);

fs.writeFileSync(path, source);
console.log('Forced one canonical five-icon bottom navigation across all screens.');
