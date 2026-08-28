import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

const stateNeedle = `  const [renameSongBusy, setRenameSongBusy] = useState(false);`;
if (!source.includes('const [playingSongId, setPlayingSongId]')) {
  if (!source.includes(stateNeedle)) throw new Error('Rename state block not found before playback-toggle patch.');
  source = source.replace(stateNeedle, `${stateNeedle}\n  const [playingSongId, setPlayingSongId] = useState<string | null>(null);`);
}

const playStart = source.indexOf('  function playSavedVersion(version: SavedVersion) {');
const downloadStart = source.indexOf('  function downloadSavedVersion(', playStart);
if (playStart < 0 || downloadStart < 0) throw new Error('Compact saved-song playback helper not found.');

const togglePlayback = `  function stopSavedVersionPlayback() {\n    const audio = document.querySelector<HTMLAudioElement>('audio[data-ai-songs-library-preview]');\n    if (audio) audio.pause();\n    else setPlayingSongId(null);\n  }\n\n  function toggleSavedVersion(songId: string, version: SavedVersion) {\n    const blob = bestSavedAudio(version);\n    if (!blob) return;\n\n    if (playingSongId === songId) {\n      stopSavedVersionPlayback();\n      return;\n    }\n\n    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));\n    document.querySelectorAll('audio[data-ai-songs-library-preview]').forEach((node) => node.remove());\n\n    const url = URL.createObjectURL(blob);\n    const audio = document.createElement('audio');\n    audio.dataset.aiSongsLibraryPreview = songId;\n    audio.src = url;\n    audio.style.display = 'none';\n    document.body.appendChild(audio);\n\n    let cleaned = false;\n    const cleanup = () => {\n      if (cleaned) return;\n      cleaned = true;\n      URL.revokeObjectURL(url);\n      audio.remove();\n      setPlayingSongId((current) => current === songId ? null : current);\n    };\n\n    audio.addEventListener('ended', cleanup, { once: true });\n    audio.addEventListener('error', cleanup, { once: true });\n    audio.addEventListener('pause', cleanup, { once: true });\n    setPlayingSongId(songId);\n    void audio.play().catch(cleanup);\n  }\n\n`;

source = source.slice(0, playStart) + togglePlayback + source.slice(downloadStart);

const oldCoverButton = `<button className={\`songCoverButton songCoverTone\${songIndex % 4}\`} aria-label={\`Play \${song.title}\`} onClick={() => latest && playSavedVersion(latest)} disabled={!latest || !bestSavedAudio(latest)}>\n                    <span>♫</span>\n                  </button>`;
const newCoverButton = `<button className={\`songCoverButton songCoverTone\${songIndex % 4}\`} aria-label={\`\${playingSongId === song.id ? 'Stop' : 'Play'} \${song.title}\`} onClick={() => latest && toggleSavedVersion(song.id, latest)} disabled={!latest || !bestSavedAudio(latest)}>\n                    <span>{playingSongId === song.id ? '■' : '▶'}</span>\n                  </button>`;
if (!source.includes(newCoverButton)) {
  if (!source.includes(oldCoverButton)) throw new Error('Compact song cover play button not found.');
  source = source.replace(oldCoverButton, newCoverButton);
}

const oldMenuButton = `<button role="menuitem" onClick={() => { setSongMenuId(null); playSavedVersion(latest); }} disabled={!bestSavedAudio(latest)}>▶ Play</button>`;
const newMenuButton = `<button role="menuitem" onClick={() => { setSongMenuId(null); toggleSavedVersion(song.id, latest); }} disabled={!bestSavedAudio(latest)}>{playingSongId === song.id ? '■ Stop' : '▶ Play'}</button>`;
if (!source.includes(newMenuButton)) {
  if (!source.includes(oldMenuButton)) throw new Error('Compact Songs action-menu Play button not found.');
  source = source.replace(oldMenuButton, newMenuButton);
}

if (source.includes('playSavedVersion(latest)')) {
  throw new Error('A compact Songs play action was not converted to the Play/Stop toggle.');
}

fs.writeFileSync(path, source);

const cssPath = 'app/globals.css';
let css = fs.readFileSync(cssPath, 'utf8');
const marker = '/* AI SONGS PLAY STOP TOGGLE */';
if (!css.includes(marker)) {
  css += `\n${marker}\n.songCoverButton span{font-size:16px!important;font-weight:900}.songCoverButton:not(:disabled):active{transform:scale(.96)}\n`;
  fs.writeFileSync(cssPath, css);
}

console.log('Added responsive Play/Stop toggles to Songs library playback.');
