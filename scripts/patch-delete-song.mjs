import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

if (!/import\s*\{[^}]*\bdeleteSong\b[^}]*\}\s*from\s*['"]\.\/songStore['"]/.test(page)) {
  const useClient = "'use client';";
  if (!page.includes(useClient)) throw new Error('Client module header not found for deleteSong import.');
  page = page.replace(useClient, `${useClient}\n\nimport { deleteSong } from './songStore';`);
}

if (!page.includes('async function deleteSavedSong(')) {
  const needle = '  function newSong() {';
  if (!page.includes(needle)) throw new Error('newSong helper not found for delete insertion.');
  const handler = `  async function deleteSavedSong(song: SavedSong) {\n    const confirmed = window.confirm(\`Delete “\${song.title}” and all of its saved versions? This cannot be undone.\`);\n    if (!confirmed) return;\n    setSongMenuId(null);\n    const cloudRes = await fetch('/api/song-library', {\n      method: 'POST',\n      credentials: 'same-origin',\n      headers: { 'Content-Type': 'application/json' },\n      body: JSON.stringify({ action: 'deleteSong', songId: song.id }),\n      cache: 'no-store',\n    });\n    const cloudData = await cloudRes.json().catch(() => ({}));\n    if (!cloudRes.ok) {\n      setSaveStatus(typeof cloudData?.error === 'string' ? \`Could not delete from cloud: \${cloudData.error}\` : 'Could not delete from cloud.');\n      return;\n    }\n    await deleteSong(song.id);\n    await refreshLibrary();\n    if (currentSongId === song.id) {\n      setCurrentSongId(undefined);\n      setCurrentVersionNumber(undefined);\n    }\n  }\n\n`;
  page = page.replace(needle, handler + needle);
}

if (!page.includes('className="songDeleteAction"')) {
  const versionNeedle = '                          {versions.length > 1 && <div className="songVersionMenu"><small>OLDER VERSIONS</small><div>{versions.slice(1).map((version) => <button key={version.id} onClick={() => { setSongMenuId(null); loadSavedVersion(song, version); }}>Version {version.versionNumber}<span>{new Date(version.createdAt).toLocaleDateString()}</span></button>)}</div></div>}';
  if (!page.includes(versionNeedle)) throw new Error('Song menu insertion point not found.');
  page = page.replace(
    versionNeedle,
    `${versionNeedle}\n                          <button className="songDeleteAction" role="menuitem" onClick={() => void deleteSavedSong(song)}>🗑 Delete Song</button>`
  );
}

fs.writeFileSync(pagePath, page);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* PIE DELETE SONG */';
if (!css.includes(marker)) {
  css += `\n${marker}\n.songActionMenu .songDeleteAction{margin-top:6px!important;border-top:1px solid rgba(255,255,255,.08)!important;border-radius:0 0 10px 10px!important;color:#ff6b77!important}.songActionMenu .songDeleteAction:active{background:rgba(255,70,85,.10)!important}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log('Added cloud-first confirmed Delete Song action to the Songs 3-dot menu.');
