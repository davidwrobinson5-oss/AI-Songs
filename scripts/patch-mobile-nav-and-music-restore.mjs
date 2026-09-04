import fs from 'node:fs';

const pagePath='app/page.tsx';
let page=fs.readFileSync(pagePath,'utf8');

const refreshBlock=`  async function refreshLibrary() {
    try {
      const allSongs = await listSongs();
      setSongs(allSongs);
      const pairs = await Promise.all(allSongs.map(async (song) => [song.id, await getSongVersions(song.id)] as const));
      setVersionsBySong(Object.fromEntries(pairs));
    } catch {
      setSongs([]);
    }
  }`;

const restoreBlock=`  async function refreshLibrary() {
    try {
      const allSongs = await listSongs();
      setSongs(allSongs);
      const pairs = await Promise.all(allSongs.map(async (song) => [song.id, await getSongVersions(song.id)] as const));
      setVersionsBySong(Object.fromEntries(pairs));
    } catch {
      setSongs([]);
    }
  }

  async function restoreLatestPlayableMusic() {
    if (audioUrl || generatedBlob) return;
    try {
      const allSongs = await listSongs();
      for (const song of allSongs) {
        const versions = await getSongVersions(song.id);
        for (const version of versions) {
          const playable = version.masterBlob || version.generatedBlob || version.backingBlob;
          if (!(playable instanceof Blob) || playable.size === 0) continue;
          const url = URL.createObjectURL(playable);
          setCurrentSongId(song.id);
          setCurrentVersionNumber(version.versionNumber);
          setSongTitle(song.title);
          setGeneratedBlob(version.generatedBlob || playable);
          setMasterBlob(version.masterBlob || null);
          setAudioUrl(url);
          if (version.backingBlob || version.instrumental) setBackingUrl(URL.createObjectURL(version.backingBlob || playable));
          setSaveStatus('Loaded your latest playable track.');
          return;
        }
      }
    } catch {}
  }`;

if(!page.includes('async function restoreLatestPlayableMusic()')){
  if(!page.includes(refreshBlock))throw new Error('Music restore anchor not found.');
  page=page.replace(refreshBlock,restoreBlock);
}

const screenEffect=`  useEffect(() => {
    if (screen === 'songs') refreshLibrary();
  }, [screen]);`;
const screenEffectNew=`  useEffect(() => {
    if (screen === 'songs') refreshLibrary();
    if (screen === 'create') void restoreLatestPlayableMusic();
  }, [screen]);`;
if(!page.includes(screenEffectNew)){
  if(!page.includes(screenEffect))throw new Error('Screen effect anchor not found.');
  page=page.replace(screenEffect,screenEffectNew);
}

fs.writeFileSync(pagePath,page);

const cssPath='app/globals.css';
let css=fs.readFileSync(cssPath,'utf8');
const marker='/* PIE MOBILE NAV OCCLUSION FIX */';
if(!css.includes(marker)){
  css+=`\n${marker}\n.bottomNav{z-index:20000!important;background:rgba(12,12,18,.985)!important;isolation:isolate;overflow:hidden;box-shadow:0 18px 48px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.08)!important}.bottomNav span{position:relative;z-index:2;pointer-events:auto}.songMenuWrap,.songActionMenu,.songMenuDismiss,.songMenuButton{z-index:12000}.capturedFileRow{position:relative;z-index:1}main{padding-bottom:150px!important}\n`;
  fs.writeFileSync(cssPath,css);
}

console.log('Fixed bottom navigation occlusion and restored latest playable Music track.');
