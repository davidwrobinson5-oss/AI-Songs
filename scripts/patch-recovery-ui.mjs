import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

// The compact Songs patch puts a circular New Song button in the same top-right
// area as the global account control. Remove that overlap and make recovery
// obvious directly on the Songs screen.
page = page.replace(
  '<button className="songsNewButton" aria-label="Create new song" onClick={newSong}>＋</button>',
  ''
);

const recoveryNeedle = '          <p className="sub">Tap a cover to play. Tap a song to edit it. Use ••• for downloads, sharing, and older versions.</p>';
const recoveryButton = `${recoveryNeedle}\n          <a className="songsRecoveryButton" href="/recover-origins">Recover Missing Songs</a>`;
if (page.includes(recoveryNeedle) && !page.includes('songsRecoveryButton')) {
  page = page.replace(recoveryNeedle, recoveryButton);
}

fs.writeFileSync(pagePath, page);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* PIE SONG RECOVERY UI */';
if (!css.includes(marker)) {
  css += `\n${marker}\n.songsNewButton{display:none!important}.songsRecoveryButton{display:inline-flex;align-items:center;justify-content:center;margin-top:14px;min-height:44px;padding:10px 15px;border-radius:13px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.055);color:#eeeef5;text-decoration:none;font-size:13px;font-weight:850;letter-spacing:-.01em}.songsRecoveryButton:active{background:rgba(255,255,255,.1)}@media(max-width:430px){.songsHeroTop{padding-right:48px}.songsRecoveryButton{width:100%}}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log('Added visible missing-song recovery action and removed Songs/account overlap.');
