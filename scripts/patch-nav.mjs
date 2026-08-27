import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(/<nav className="bottomNav">([\s\S]*?)<\/nav>/g, (_full, inner) => {
  let nav = inner
    .replace(/\s*<span(?: className="navActive")? onClick=\{newSong\}>＋<small>Create<\/small><\/span>/g, '')
    .replace(/<small>Train Voice<\/small>/g, '<small>Voice</small>');

  if (!/<small>Voice<\/small>/.test(nav)) {
    nav = nav.replace(
      /(\s*<span>🎚️<small>Mix<\/small><\/span>)/,
      '\n          <span onClick={() => setScreen(\'train\')}>🎤<small>Voice</small></span>$1',
    );
  }

  return `<nav className="bottomNav">${nav}</nav>`;
});

fs.writeFileSync(path, source);
console.log('Normalized bottom navigation across all screens.');
