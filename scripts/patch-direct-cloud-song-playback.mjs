import fs from 'node:fs';

const path='app/page.tsx';
let source=fs.readFileSync(path,'utf8');

source=source.replace(
  `  function toggleSavedVersion(songId: string, version: SavedVersion) {\n    const blob = bestSavedAudio(version);\n    if (!(blob instanceof Blob) || blob.size === 0) {\n      setSaveStatus('This song audio is still restoring. Try Play again in a moment.');\n      window.dispatchEvent(new CustomEvent('pie-local-library-changed'));\n      return;\n    }`,
  `  function toggleSavedVersion(songId: string, version: SavedVersion) {\n    const blob = bestSavedAudio(version);\n    const cloudUrl = \`/api/song-library?songId=\${encodeURIComponent(songId)}\`;`
);

source=source.replace(
  `    const url = URL.createObjectURL(blob);\n    const audio = document.createElement('audio');`,
  `    const localUrl = blob instanceof Blob && blob.size > 0 ? URL.createObjectURL(blob) : '';\n    const url = localUrl || cloudUrl;\n    const audio = document.createElement('audio');`
);

source=source.replace(
  `      URL.revokeObjectURL(url);`,
  `      if (localUrl) URL.revokeObjectURL(localUrl);`
);

source=source.replace(
  `const playable = versions.find((version) => {\n                const blob = bestSavedAudio(version);\n                return blob instanceof Blob && blob.size > 0;\n              });`,
  `const playable = versions.find((version) => {\n                const blob = bestSavedAudio(version);\n                return blob instanceof Blob && blob.size > 0;\n              }) || latest;`
);

source=source.replace(
  `onClick={() => playable && toggleSavedVersion(song.id, playable)} disabled={!playable}`,
  `onClick={() => latest && toggleSavedVersion(song.id, playable || latest)} disabled={!latest}`
);
source=source.replace(
  `onClick={() => { setSongMenuId(null); if (playable) toggleSavedVersion(song.id, playable); }} disabled={!playable}`,
  `onClick={() => { setSongMenuId(null); if (latest) toggleSavedVersion(song.id, playable || latest); }} disabled={!latest}`
);

fs.writeFileSync(path,source);
console.log('Songs can now stream playable audio directly from Pie cloud when local Blobs are missing.');
