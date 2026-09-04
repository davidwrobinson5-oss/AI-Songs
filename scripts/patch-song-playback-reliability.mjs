import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

// A song's newest version can be lyrics/project metadata only while an older
// version contains the actual audio. The library thumbnail should always use
// the newest version that really has playable audio instead of silently doing
// nothing because versions[0] has no Blob.
source=source.replace(
  `              const versions = versionsBySong[song.id] || [];\n              const latest = versions[0];\n              return (`,
  `              const versions = versionsBySong[song.id] || [];\n              const latest = versions[0];\n              const playable = versions.find((version) => {\n                const blob = bestSavedAudio(version);\n                return blob instanceof Blob && blob.size > 0;\n              });\n              return (`
);

source=source.replace(
  `onClick={() => latest && toggleSavedVersion(song.id, latest)} disabled={!latest || !bestSavedAudio(latest)}`,
  `onClick={() => playable && toggleSavedVersion(song.id, playable)} disabled={!playable}`
);
source=source.replace(
  `onClick={() => { setSongMenuId(null); toggleSavedVersion(song.id, latest); }} disabled={!bestSavedAudio(latest)}`,
  `onClick={() => { setSongMenuId(null); if (playable) toggleSavedVersion(song.id, playable); }} disabled={!playable}`
);

const start=source.indexOf('  function toggleSavedVersion(songId: string, version: SavedVersion) {');
const end=source.indexOf('\n  function downloadSavedVersion(',start);
if(start<0||end<0)throw new Error('Songs playback toggle helper not found.');

const replacement=`  function toggleSavedVersion(songId: string, version: SavedVersion) {\n    const blob = bestSavedAudio(version);\n    if (!(blob instanceof Blob) || blob.size === 0) {\n      setSaveStatus('This song audio is still restoring. Try Play again in a moment.');\n      window.dispatchEvent(new CustomEvent('pie-local-library-changed'));\n      return;\n    }\n\n    if (playingSongId === songId) {\n      stopSavedVersionPlayback();\n      return;\n    }\n\n    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));\n    document.querySelectorAll<HTMLAudioElement>('audio[data-ai-songs-library-preview]').forEach((node) => {\n      try { node.pause(); } catch {}\n      node.remove();\n    });\n\n    const url = URL.createObjectURL(blob);\n    const audio = document.createElement('audio');\n    audio.dataset.aiSongsLibraryPreview = songId;\n    audio.src = url;\n    audio.preload = 'auto';\n    audio.setAttribute('playsinline','');\n    audio.style.position = 'fixed';\n    audio.style.width = '1px';\n    audio.style.height = '1px';\n    audio.style.opacity = '0';\n    audio.style.pointerEvents = 'none';\n    document.body.appendChild(audio);\n\n    let cleaned = false;\n    const cleanup = () => {\n      if (cleaned) return;\n      cleaned = true;\n      URL.revokeObjectURL(url);\n      audio.remove();\n      setPlayingSongId((current) => current === songId ? null : current);\n    };\n\n    audio.addEventListener('ended', cleanup, { once: true });\n    audio.addEventListener('error', () => {\n      setSaveStatus('Pie could not play this saved audio. It will restore the cloud copy and you can tap Play again.');\n      window.dispatchEvent(new CustomEvent('pie-local-library-changed'));\n      cleanup();\n    }, { once: true });\n    audio.addEventListener('pause', cleanup, { once: true });\n    setPlayingSongId(songId);\n    void audio.play().catch((error) => {\n      console.error('Pie song playback failed', error);\n      setSaveStatus('Could not start playback. Tap Play once more after the audio finishes restoring.');\n      window.dispatchEvent(new CustomEvent('pie-local-library-changed'));\n      cleanup();\n    });\n  }\n`;
source=source.slice(0,start)+replacement+source.slice(end);

if(!source.includes('const playable = versions.find'))throw new Error('Playable-version selection was not added.');
fs.writeFileSync(path,source);
console.log('Songs thumbnails now select the newest actual audio Blob and use reliable inline playback.');
