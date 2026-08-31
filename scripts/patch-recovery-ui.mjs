import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

// The compact Songs patch can put a circular New Song button in the same
// top-right area as the global account control. Remove that overlap.
page = page.replace(
  '<button className="songsNewButton" aria-label="Create new song" onClick={newSong}>＋</button>',
  ''
);

// Keep one obvious recovery action on My Songs. Older builds pointed this to
// cross-origin recovery; phone-file import is now the reliable recovery path.
page = page
  .replace(/<a className="songsRecoveryButton" href="\/recover-origins">[^<]*<\/a>/g,
    '<a className="songsRecoveryButton" href="/recover-songs">Import Audio Files</a>')
  .replace(/<a className="songsRecoveryButton" href="\/recover-songs">[^<]*<\/a>/g,
    '<a className="songsRecoveryButton" href="/recover-songs">Import Audio Files</a>');

const recoveryNeedles = [
  '          <p className="sub">Tap a cover to play. Tap a song to edit it. Use ••• for downloads, sharing, and older versions.</p>',
  '          <p className="sub">Tap a cover to play. Tap a song to edit it. Use ⋯ for downloads, sharing, and older versions.</p>',
];

if (!page.includes('songsRecoveryButton')) {
  for (const needle of recoveryNeedles) {
    if (!page.includes(needle)) continue;
    page = page.replace(
      needle,
      `${needle}\n          <a className="songsRecoveryButton" href="/recover-songs">Import Audio Files</a>`
    );
    break;
  }
}

fs.writeFileSync(pagePath, page);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* PIE SONG RECOVERY UI */';
if (!css.includes(marker)) {
  css += `\n${marker}\n.songsNewButton{display:none!important}.songsRecoveryButton{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;min-height:46px;padding:11px 16px;border-radius:13px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#f4f4fb;text-decoration:none;font-size:14px;font-weight:900;letter-spacing:-.01em}.songsRecoveryButton:active{background:rgba(255,255,255,.12)}@media(max-width:430px){.songsHeroTop{padding-right:48px}.songsRecoveryButton{width:100%}}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log('Added direct phone audio import action and removed Songs/account overlap.');
