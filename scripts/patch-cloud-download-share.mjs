import fs from 'node:fs';

const path = 'app/page.tsx';
let source = fs.readFileSync(path, 'utf8');

if (!source.includes('async function resolveSavedVersionAudio(')) {
  const anchor = '  function downloadSavedVersion(';
  const index = source.indexOf(anchor);
  if (index < 0) throw new Error('Download helper anchor not found.');

  const helpers = `  async function resolveSavedVersionAudio(songId: string, version: SavedVersion) {\n    const local = bestSavedAudio(version);\n    if (local instanceof Blob && local.size > 0) return version;\n\n    const response = await fetch(\`/api/song-library?songId=\${encodeURIComponent(songId)}\`, { cache: 'no-store' });\n    if (!response.ok) {\n      let message = 'No downloadable audio is available for this song yet.';\n      try {\n        const data = await response.json();\n        if (typeof data?.error === 'string' && data.error) message = data.error;\n      } catch {}\n      throw new Error(message);\n    }\n\n    const cloudBlob = await response.blob();\n    if (!(cloudBlob instanceof Blob) || cloudBlob.size === 0) throw new Error('The cloud audio file was empty.');\n    return { ...version, masterBlob: cloudBlob } as SavedVersion;\n  }\n\n  async function downloadSavedVersionResolved(song: SavedSong, version: SavedVersion) {\n    try {\n      setSaveStatus('Preparing download…');\n      const resolved = await resolveSavedVersionAudio(song.id, version);\n      downloadSavedVersion(song, resolved);\n      setSaveStatus('Download ready.');\n    } catch (error) {\n      setSaveStatus(error instanceof Error ? error.message : 'Could not prepare this download.');\n    }\n  }\n\n  async function shareSavedVersionResolved(song: SavedSong, version: SavedVersion, format: 'mp3' | 'wav') {\n    try {\n      setSaveStatus(\`Preparing \${format.toUpperCase()} share…\`);\n      const resolved = await resolveSavedVersionAudio(song.id, version);\n      await shareSavedVersion(song, resolved, format);\n      setSaveStatus(\`\${format.toUpperCase()} ready to share.\`);\n    } catch (error) {\n      setSaveStatus(error instanceof Error ? error.message : 'Could not prepare this share.');\n    }\n  }\n\n`;

  source = source.slice(0, index) + helpers + source.slice(index);
}

const replacements = [
  [
    "onClick={() => { setSongMenuId(null); downloadSavedVersion(song, latest); }} disabled={!bestSavedAudio(latest)}",
    "onClick={() => { setSongMenuId(null); void downloadSavedVersionResolved(song, latest); }} disabled={!latest}",
  ],
  [
    "onClick={() => { setSongMenuId(null); void shareSavedVersion(song, latest, 'mp3'); }} disabled={!bestSavedAudio(latest)}",
    "onClick={() => { setSongMenuId(null); void shareSavedVersionResolved(song, latest, 'mp3'); }} disabled={!latest}",
  ],
  [
    "onClick={() => { setSongMenuId(null); void shareSavedVersion(song, latest, 'wav'); }} disabled={!bestSavedAudio(latest)}",
    "onClick={() => { setSongMenuId(null); void shareSavedVersionResolved(song, latest, 'wav'); }} disabled={!latest}",
  ],
];

for (const [before, after] of replacements) {
  if (source.includes(before)) source = source.replace(before, after);
}

if (!source.includes('downloadSavedVersionResolved(song, latest)')) throw new Error('Cloud download menu action was not wired.');
if (!source.includes("shareSavedVersionResolved(song, latest, 'mp3')")) throw new Error('Cloud MP3 share menu action was not wired.');
if (!source.includes("shareSavedVersionResolved(song, latest, 'wav')")) throw new Error('Cloud WAV share menu action was not wired.');

fs.writeFileSync(path, source);
console.log('Enabled Songs download and MP3/WAV sharing even when audio currently lives only in Pie cloud.');
