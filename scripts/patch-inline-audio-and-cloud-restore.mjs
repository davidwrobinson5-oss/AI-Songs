import fs from 'node:fs';

const storePath='app/songStore.ts';
let store=fs.readFileSync(storePath,'utf8');
const oldImport=`    for (const version of versions) {
      const existing = await requestToPromise(versionStore.get(version.id) as IDBRequest<SavedVersion | undefined>);
      if (!existing) versionStore.put(version);
    }`;
const newImport=`    for (const version of versions) {
      const existing = await requestToPromise(versionStore.get(version.id) as IDBRequest<SavedVersion | undefined>);
      versionStore.put(existing ? { ...existing, ...version } : version);
    }`;
if(!store.includes(newImport)){if(!store.includes(oldImport))throw new Error('Cloud library version import block not found.');store=store.replace(oldImport,newImport);fs.writeFileSync(storePath,store);}

const syncPath='app/CloudSongSync.tsx';
let sync=fs.readFileSync(syncPath,'utf8');
const oldRestore=`  const refreshedLocal = await exportLocalLibrary();
  const localVersionIds = new Set(refreshedLocal.versions.map((version) => version.id));
  const missingCloudVersions = cloud.versions.filter((version) => !localVersionIds.has(version.id));
  const downloaded: SavedVersion[] = [];
  for (const version of missingCloudVersions) {
    try {
      downloaded.push(await cloudVersionToLocal(version));
    } catch (error) {
      console.error('Pie cloud version restore skipped:', error);
    }
  }
  if (downloaded.length) await importCloudLibrary([], downloaded);`;
const newRestore=`  const refreshedLocal = await exportLocalLibrary();
  const localVersionById = new Map(refreshedLocal.versions.map((version) => [version.id, version]));
  const cloudVersionsNeedingAudio = cloud.versions.filter((version) => {
    const localVersion = localVersionById.get(version.id);
    if (!localVersion) return true;
    return blobFields.some((field) => {
      if (!version.files?.[field]?.url) return false;
      const blob = localVersion[field];
      return !(blob instanceof Blob) || blob.size === 0;
    });
  });
  const downloaded: SavedVersion[] = [];
  for (const version of cloudVersionsNeedingAudio) {
    try { downloaded.push(await cloudVersionToLocal(version)); }
    catch (error) { console.error('Pie cloud version restore skipped:', error); }
  }
  if (downloaded.length) await importCloudLibrary([], downloaded);`;
if(!sync.includes(newRestore)){if(!sync.includes(oldRestore))throw new Error('Cloud audio restore block not found.');sync=sync.replace(oldRestore,newRestore);fs.writeFileSync(syncPath,sync);}

const capturedPath='app/CapturedSongResults.tsx';
let captured=fs.readFileSync(capturedPath,'utf8');
const stateNeedle=`  const [fileStatus,setFileStatus]=useState('');`;
if(!captured.includes('const [playingFileKey,setPlayingFileKey]')){if(!captured.includes(stateNeedle))throw new Error('Captured file state block not found.');captured=captured.replace(stateNeedle,stateNeedle+`\n  const [playingFileKey,setPlayingFileKey]=useState('');`);}
const rowStart=captured.indexOf('  function fileVisual(key:string){');
const selectedStart=captured.indexOf('\n  if(selected){',rowStart);
if(rowStart<0||selectedStart<0)throw new Error('Styled captured file row block not found.');
const inlineRows=String.raw`  function fileVisual(key:string){
    if(key==='sheet')return {icon:'▤',tone:0,kind:'PDF'};
    if(key==='chords')return {icon:'♬',tone:2,kind:'CHORDS'};
    if(key==='recording')return {icon:'♫',tone:1,kind:'WAV'};
    const stem=key.replace('stem:','');
    const icons:Record<string,string>={vocals:'🎤',drums:'🥁',bass:'🎸',guitar:'🎸',piano:'🎹',other:'🎻'};
    return {icon:icons[stem]||'♪',tone:3,kind:'WAV'};
  }

  function stopInlineFileAudio(){
    const audio=document.querySelector<HTMLAudioElement>('audio[data-pie-inline-file-player]');
    if(audio)audio.pause();else setPlayingFileKey('');
  }

  async function toggleInlineFileAudio(key:string,url:string){
    if(playingFileKey===key){stopInlineFileAudio();return;}
    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));
    document.querySelectorAll('audio[data-pie-inline-file-player]').forEach(node=>node.remove());
    setFileStatus('Loading full audio…');
    try{
      const blob=await fetchFile(url);const objectUrl=URL.createObjectURL(blob);const audio=document.createElement('audio');
      audio.dataset.pieInlineFilePlayer=key;audio.src=objectUrl;audio.preload='auto';audio.style.display='none';document.body.appendChild(audio);
      let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;URL.revokeObjectURL(objectUrl);audio.remove();setPlayingFileKey(current=>current===key?'':current);};
      audio.addEventListener('ended',cleanup,{once:true});audio.addEventListener('error',cleanup,{once:true});audio.addEventListener('pause',cleanup,{once:true});
      setPlayingFileKey(key);setFileStatus('Playing full audio.');await audio.play();
    }catch(error){setPlayingFileKey('');setFileStatus(error instanceof Error?error.message:'Audio could not be played.');}
  }

  function fileRow(key:string,label:string,url:string,name:string,saved:boolean){
    const visual=fileVisual(key);const playable=key==='recording'||key.startsWith('stem:');const isPlaying=playable&&playingFileKey===key;
    const activate=()=>playable?void toggleInlineFileAudio(key,url):void openFile(url);
    return <article className="songListRow capturedFileRow">
      <button type="button" className={'songCoverButton songCoverTone'+visual.tone+' fileThumb'} onClick={activate} aria-label={(isPlaying?'Stop ':'Play ')+label}><span>{playable?(isPlaying?'■':'▶'):visual.icon}</span></button>
      <button type="button" className="songRowInfo" onClick={activate}>
        <div className="songTitleLine"><strong>{label.replace(/^[^A-Za-z0-9]+\s*/, '').replace(/\s*·\s*(PDF|WAV)$/i,'')}</strong><span>{visual.kind}</span></div>
        <small className="songDescription">{playable?(isPlaying?'Playing full audio · tap to stop':'Tap to play full audio'):(saved?'Saved in Pie · tap to open':'Ready · saving into Pie…')}</small>
        <div className="songMeta"><span>{visual.kind}</span><span>{playable?'Full length':'Pie file'}</span></div>
      </button>
      <div className="songMenuWrap"><button type="button" className="songMenuButton" aria-label={'Options for '+label} aria-haspopup="menu" aria-expanded={menuKey===key} onClick={()=>setMenuKey(current=>current===key?'':key)}>•••</button>
        {menuKey===key&&<><button type="button" className="songMenuDismiss" aria-label="Close file menu" onClick={()=>setMenuKey('')} /><div className="songActionMenu" role="menu">
          <div className="songActionMenuTitle"><strong>{label}</strong><small>{saved?'Saved in Pie':'Ready'}</small></div>
          {playable&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');void toggleInlineFileAudio(key,url)}}>{isPlaying?'■ Stop':'▶ Play'}</button>}
          {!playable&&<button role="menuitem" type="button" onClick={()=>void openFile(url)}>Open</button>}
          <button role="menuitem" type="button" onClick={()=>void downloadFile(url,name)}>↓ Download</button><button role="menuitem" type="button" onClick={()=>void shareFile(url,name)}>↗ Share</button>
        </div></>}
      </div>
    </article>;
  }
`;
captured=captured.slice(0,rowStart)+inlineRows+captured.slice(selectedStart);fs.writeFileSync(capturedPath,captured);
console.log('Fixed cloud song audio restoration and added full inline recording/stem playback.');
