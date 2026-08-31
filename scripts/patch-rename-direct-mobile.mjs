import fs from 'node:fs';

const pagePath = 'app/page.tsx';
let source = fs.readFileSync(pagePath, 'utf8');

if (!source.includes('async function renameSavedSongDirect(')) {
  const needle = '  function beginSongRename(song: SavedSong) {';
  if (!source.includes(needle)) throw new Error('Rename helper insertion point not found.');
  const helper = `  async function renameSavedSongDirect(song: SavedSong) {\n    setSongMenuId(null);\n    const nextTitle = window.prompt('Rename song', song.title);\n    if (nextTitle === null) return;\n    const cleanTitle = nextTitle.trim();\n    if (!cleanTitle || cleanTitle === song.title) return;\n    try {\n      const cloudRes = await fetch('/api/song-library', {\n        method: 'POST',\n        credentials: 'same-origin',\n        headers: { 'Content-Type': 'application/json' },\n        body: JSON.stringify({ action: 'renameSong', songId: song.id, title: cleanTitle }),\n        cache: 'no-store',\n      });\n      const cloudData = await cloudRes.json().catch(() => ({}));\n      if (!cloudRes.ok) throw new Error(typeof cloudData?.error === 'string' ? cloudData.error : 'Could not rename song in cloud.');\n      const updated = await renameSong(song.id, cleanTitle);\n      if (currentSongId === updated.id) setSongTitle(updated.title);\n      await refreshLibrary();\n      window.dispatchEvent(new Event('pie-local-library-changed'));\n      setSaveStatus('Song renamed.');\n    } catch (error) {\n      setSaveStatus(error instanceof Error ? error.message : 'Could not rename song.');\n    }\n  }\n\n`;
  source = source.replace(needle, helper + needle);
}

const candidates = [
  '<button type="button" role="menuitem" onClick={() => beginSongRename(song)}>✎ Rename</button>',
  '<button role="menuitem" onClick={() => beginSongRename(song)}>✎ Rename</button>',
];
let replaced = false;
for (const oldButton of candidates) {
  if (source.includes(oldButton)) {
    source = source.replace(oldButton, '<button type="button" role="menuitem" onClick={() => void renameSavedSongDirect(song)}>✎ Rename</button>');
    replaced = true;
    break;
  }
}
if (!replaced && !source.includes('onClick={() => void renameSavedSongDirect(song)}')) {
  throw new Error('Rename menu button not found for direct mobile patch.');
}

fs.writeFileSync(pagePath, source);
console.log('Switched song Rename to a direct native mobile prompt with cloud-first persistence.');
