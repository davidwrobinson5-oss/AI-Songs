'use client';

import { useEffect, useMemo, useState } from 'react';

type Jobs=Record<string,string>;
type Outputs={stems?:boolean;fullSheet?:boolean;partSheets?:boolean;chords?:boolean};
type Statuses=Record<string,string>;
type Asset={path:string;name:string;type:string;size:number};
type CaptureRecord={
  id:string;
  captureId:string;
  title:string;
  createdAt:string;
  stagedPath:string;
  jobs:Jobs;
  outputs:Outputs;
  statuses?:Statuses;
  state?:'processing'|'ready'|'failed';
  assets?:Record<string,Asset>;
};

const STORAGE_KEY='pie-captured-songs-v1';
const STEMS=['vocals','drums','bass','guitar','piano','other'];

function readRecords():CaptureRecord[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    if(!Array.isArray(parsed))return [];
    return parsed.filter(item=>item&&typeof item.id==='string'&&item.jobs&&typeof item.jobs==='object');
  }catch{return []}
}

function saveRecords(records:CaptureRecord[]){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(records.slice(0,40)));
  window.dispatchEvent(new Event('pie-captured-songs-changed'));
}

function failed(statuses:Statuses){
  return Object.values(statuses).some(value=>['FAILED','ERROR','CANCELLED'].includes(String(value).toUpperCase()));
}

function complete(statuses:Statuses,jobs:Jobs){
  const keys=Object.keys(jobs);
  return keys.length>0&&keys.every(key=>statuses[key]==='COMPLETED');
}

function selectedOutputCount(item:CaptureRecord){
  return Number(Boolean(item.outputs.fullSheet))+Number(Boolean(item.outputs.chords))+Number(Boolean(item.outputs.stems||item.outputs.partSheets));
}

function assetSummary(item:CaptureRecord){
  const parts=['WAV'];
  if(item.outputs.fullSheet)parts.push('PDF');
  if(item.outputs.chords)parts.push('Chords');
  if(item.outputs.stems||item.outputs.partSheets)parts.push('Stems');
  return parts.join(' · ');
}

function savedUrl(asset:Asset,download=false){
  return `/api/sheets/library-file?path=${encodeURIComponent(asset.path)}&name=${encodeURIComponent(asset.name)}${download?'&download=1':''}`;
}

export default function CapturedSongResults(){
  const [records,setRecords]=useState<CaptureRecord[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [renameValue,setRenameValue]=useState('');
  const [menuKey,setMenuKey]=useState('');
  const [archiveBusy,setArchiveBusy]=useState(false);
  const [fileStatus,setFileStatus]=useState('');
  const [playingFileKey,setPlayingFileKey]=useState('');
  const [inlineSheetUrl,setInlineSheetUrl]=useState('');
  const [inlineSheetTitle,setInlineSheetTitle]=useState('');
  const [chordSheet,setChordSheet]=useState<any>(null);
  const [chordBusy,setChordBusy]=useState(false);

  const refresh=()=>setRecords(readRecords());

  useEffect(()=>{
    refresh();
    const onChange=()=>refresh();
    window.addEventListener('pie-captured-songs-changed',onChange);
    window.addEventListener('storage',onChange);
    return()=>{
      window.removeEventListener('pie-captured-songs-changed',onChange);
      window.removeEventListener('storage',onChange);
    };
  },[]);

  useEffect(()=>{
    if(!records.some(item=>(item.state||'processing')==='processing'))return;
    let dead=false;
    let timer:number|undefined;
    const poll=async()=>{
      const current=readRecords();
      let changed=false;
      const next=await Promise.all(current.map(async item=>{
        if((item.state||'processing')!=='processing'||!Object.keys(item.jobs).length)return item;
        try{
          const response=await fetch('/api/sheets/status',{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs:item.jobs}),credentials:'same-origin',cache:'no-store',
          });
          const data=await response.json().catch(()=>({}));
          if(!response.ok)return item;
          const statuses=(data.statuses||{}) as Statuses;
          const state=failed(statuses)?'failed':complete(statuses,item.jobs)?'ready':'processing';
          if(JSON.stringify(statuses)!==JSON.stringify(item.statuses||{})||state!==item.state)changed=true;
          return {...item,statuses,state} as CaptureRecord;
        }catch{return item;}
      }));
      if(dead)return;
      if(changed){localStorage.setItem(STORAGE_KEY,JSON.stringify(next.slice(0,40)));setRecords(next);}
      if(next.some(item=>(item.state||'processing')==='processing'))timer=window.setTimeout(()=>{void poll();},3500);
    };
    void poll();
    return()=>{dead=true;if(timer!==undefined)window.clearTimeout(timer);};
  },[records]);

  const sorted=useMemo(()=>[...records].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[records]);
  const selected=sorted.find(item=>item.id===selectedId)||null;

  useEffect(()=>{if(selected)setRenameValue(selected.title||'Captured recording');},[selectedId,selected?.title]);

  async function archiveOne(item:CaptureRecord,key:string,body:Record<string,string>){
    const response=await fetch('/api/sheets/archive-file',{
      method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',
      body:JSON.stringify({captureId:item.captureId,...body}),
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data?.path)throw new Error(data?.error||`Could not save ${key}.`);
    const asset:Asset={path:String(data.path),name:String(data.name||key),type:String(data.type||'application/octet-stream'),size:Number(data.size||0)};
    const current=readRecords();
    const next=current.map(record=>record.id===item.id?{...record,assets:{...(record.assets||{}),[key]:asset}}:record);
    saveRecords(next);
    setRecords(next);
  }

  async function ensureArchived(item:CaptureRecord){
    if(archiveBusy)return;
    const statuses=item.statuses||{};
    const missing:Array<[string,Record<string,string>]> = [];
    if(!item.assets?.recording)missing.push(['recording',{kind:'recording',stagedPath:item.stagedPath}]);
    if(item.jobs.full&&statuses.full==='COMPLETED'&&!item.assets?.sheet)missing.push(['sheet',{kind:'sheet',jobId:item.jobs.full}]);
    if(item.jobs.chords&&statuses.chords==='COMPLETED'&&!item.assets?.chords)missing.push(['chords',{kind:'chords',jobId:item.jobs.chords}]);
    if(item.jobs.separation&&statuses.separation==='COMPLETED'){
      for(const stem of STEMS)if(!item.assets?.[`stem:${stem}`])missing.push([`stem:${stem}`,{kind:'stem',jobId:item.jobs.separation,stem}]);
    }
    if(!missing.length)return;
    setArchiveBusy(true);
    setFileStatus('Turning up the heat…');
    let saved=0;
    try{
      for(const [key,body] of missing){
        try{await archiveOne(item,key,body);saved+=1;}catch(error){console.error('Pie file archive skipped',key,error);}
      }
      setFileStatus(saved===missing.length?'Files saved and verified in Pie.':`Saved ${saved} of ${missing.length} files. Any missing item can be retried.`);
    }finally{setArchiveBusy(false);}
  }

  useEffect(()=>{
    if(!selected)return;
    const statuses=selected.statuses||{};
    const hasReady=statuses.full==='COMPLETED'||statuses.chords==='COMPLETED'||statuses.separation==='COMPLETED';
    if(hasReady||selected.state==='ready'||selected.state==='failed')void ensureArchived(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[selectedId,selected?.state,JSON.stringify(selected?.statuses||{}),Object.keys(selected?.assets||{}).length]);

  if(!sorted.length)return null;

  function remove(id:string){
    const next=readRecords().filter(item=>item.id!==id);saveRecords(next);setRecords(next);if(selectedId===id)setSelectedId('');
  }

  function renameSelected(){
    if(!selected)return;
    const title=renameValue.trim().slice(0,120)||'Captured recording';
    const next=readRecords().map(item=>item.id===selected.id?{...item,title}:item);saveRecords(next);setRecords(next);
  }

  async function fetchFile(url:string){
    const response=await fetch(url,{credentials:'same-origin',cache:'no-store'});
    if(!response.ok)throw new Error(`File could not be opened (${response.status}).`);
    return response.blob();
  }

  async function openFile(url:string){
    setMenuKey('');setFileStatus('Opening file…');
    try{
      const blob=await fetchFile(url);const objectUrl=URL.createObjectURL(blob);window.open(objectUrl,'_blank','noopener,noreferrer');
      setTimeout(()=>URL.revokeObjectURL(objectUrl),60_000);setFileStatus('File opened.');
    }catch(error){setFileStatus(error instanceof Error?error.message:'File could not be opened.');}
  }

  async function downloadFile(url:string,name:string){
    setMenuKey('');setFileStatus('Turning up the heat…');
    try{
      const blob=await fetchFile(url);const objectUrl=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),3000);setFileStatus('Download ready.');
    }catch(error){setFileStatus(error instanceof Error?error.message:'File could not be downloaded.');}
  }

  async function shareFile(url:string,name:string){
    setMenuKey('');setFileStatus('Turning up the heat…');
    try{
      const blob=await fetchFile(url);const file=new File([blob],name,{type:blob.type||'application/octet-stream'});
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:name,files:[file]});setFileStatus('Share sheet opened.');return;}
      await downloadFile(url,name);
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError'){setFileStatus('');return;}setFileStatus(error instanceof Error?error.message:'File could not be shared.');}
  }

  async function generateChordLyricSheet(){
    if(!selected?.jobs?.chords||!selected.stagedPath||chordBusy)return;
    setChordBusy(true);setFileStatus('Turning up the heat…');setInlineSheetUrl('');
    try{
      const response=await fetch('/api/sheets/chord-sheet',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'generate',chordJobId:selected.jobs.chords,stagedPath:selected.stagedPath,title:selected.title||'Untitled Song'})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.chart)throw new Error(data?.error||'Could not build chord + lyric sheet.');
      setChordSheet(data.chart);setFileStatus('Chord + lyric sheet ready.');
    }catch(error){setFileStatus(error instanceof Error?error.message:'Could not build chord + lyric sheet.');}
    finally{setChordBusy(false);}
  }

  async function downloadChordLyricPdf(){
    if(!chordSheet)return;
    setFileStatus('Turning up the heat…');
    try{
      const response=await fetch('/api/sheets/chord-sheet',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',cache:'no-store',body:JSON.stringify({action:'pdf',chart:chordSheet})});
      if(!response.ok)throw new Error('Could not create chord + lyric PDF.');
      const blob=await response.blob();const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download='pie-chord-lyrics.pdf';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),3000);setFileStatus('Chord + lyric PDF ready.');
    }catch(error){setFileStatus(error instanceof Error?error.message:'Could not create chord + lyric PDF.');}
  }

  function showInlineSheet(url:string,label:string){
    setChordSheet(null);setInlineSheetTitle(label);
    setInlineSheetUrl(url.includes('/api/sheets/download/')?url+(url.includes('?')?'&':'?')+'inline=1':url);
    setFileStatus('Sheet opened in Pie.');
  }

  function fileVisual(key:string){
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
    setFileStatus('Turning up the heat…');
    try{
      const blob=await fetchFile(url);const objectUrl=URL.createObjectURL(blob);const audio=document.createElement('audio');
      audio.dataset.pieInlineFilePlayer=key;audio.src=objectUrl;audio.preload='auto';audio.style.display='none';document.body.appendChild(audio);
      let cleaned=false;const cleanup=()=>{if(cleaned)return;cleaned=true;URL.revokeObjectURL(objectUrl);audio.remove();setPlayingFileKey(current=>current===key?'':current);};
      audio.addEventListener('ended',cleanup,{once:true});audio.addEventListener('error',cleanup,{once:true});audio.addEventListener('pause',cleanup,{once:true});
      setPlayingFileKey(key);setFileStatus('Playing full audio.');await audio.play();
    }catch(error){setPlayingFileKey('');setFileStatus(error instanceof Error?error.message:'Audio could not be played.');}
  }

  function fileRow(key:string,label:string,url:string,name:string,saved:boolean){
    const visual=fileVisual(key);
    const playable=key==='recording'||key.startsWith('stem:');
    const isPlaying=playable&&playingFileKey===key;
    const isSheet=key==='sheet';
    const isChords=key==='chords';
    const activate=()=>playable?void toggleInlineFileAudio(key,url):isSheet?showInlineSheet(url,label):isChords?void generateChordLyricSheet():void openFile(url);
    return <article className="songListRow capturedFileRow">
      <button type="button" className={'songCoverButton songCoverTone'+visual.tone+' fileThumb'} onClick={activate} aria-label={(isPlaying?'Stop ':playable?'Play ':'Open ')+label}><span>{playable?(isPlaying?'■':'▶'):visual.icon}</span></button>
      <button type="button" className="songRowInfo" onClick={activate}>
        <div className="songTitleLine"><strong>{label.replace(/^[^A-Za-z0-9]+\s*/, '').replace(/\s*·\s*(PDF|WAV)$/i,'')}</strong><span>{visual.kind}</span></div>
        <small className="songDescription">{playable?(isPlaying?'Playing full audio · tap to stop':'Tap to play full audio'):isSheet?'Tap to preview sheet in Pie':isChords?(chordBusy?'Building chord + lyric sheet…':'Tap for chords + lyrics'):(saved?'Saved in Pie · tap to open':'Ready · saving into Pie…')}</small>
        <div className="songMeta"><span>{visual.kind}</span><span>{playable?'Full length':isChords?'Lyrics aligned':'Inline preview'}</span></div>
      </button>
      <div className="songMenuWrap"><button type="button" className="songMenuButton" aria-label={'Options for '+label} aria-haspopup="menu" aria-expanded={menuKey===key} onClick={()=>setMenuKey(current=>current===key?'':key)}>•••</button>
        {menuKey===key&&<><button type="button" className="songMenuDismiss" aria-label="Close file menu" onClick={()=>setMenuKey('')} /><div className="songActionMenu" role="menu">
          <div className="songActionMenuTitle"><strong>{label}</strong><small>{saved?'Saved in Pie':'Ready'}</small></div>
          {playable&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');void toggleInlineFileAudio(key,url)}}>{isPlaying?'■ Stop':'▶ Play'}</button>}
          {isSheet&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');showInlineSheet(url,label)}}>▤ Preview in Pie</button>}
          {isChords&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');void generateChordLyricSheet()}}>♬ Chords + Lyrics</button>}
          {!playable&&!isSheet&&!isChords&&<button role="menuitem" type="button" onClick={()=>void openFile(url)}>Open</button>}
          {!isChords&&<button role="menuitem" type="button" onClick={()=>void downloadFile(url,name)}>↓ Download</button>}
          {isChords&&chordSheet&&<button role="menuitem" type="button" onClick={()=>{setMenuKey('');void downloadChordLyricPdf()}}>↓ Download PDF</button>}
          {!isChords&&<button role="menuitem" type="button" onClick={()=>void shareFile(url,name)}>↗ Share</button>}
        </div></>}
      </div>
    </article>;
  }

  if(selected){
    const statuses=selected.statuses||{};const state=selected.state||'processing';const assets=selected.assets||{};
    const fullReady=Boolean(selected.jobs.full&&statuses.full==='COMPLETED');
    const stemsReady=Boolean(selected.jobs.separation&&statuses.separation==='COMPLETED');
    const chordsReady=Boolean(selected.jobs.chords&&statuses.chords==='COMPLETED');
    const recordingAsset=assets.recording;
    const recordingUrl=recordingAsset?savedUrl(recordingAsset):`/api/sheets/source?path=${encodeURIComponent(selected.stagedPath)}`;

    return <section id="captured" style={{margin:'0 0 18px',padding:'0 2px'}}>
      <button type="button" className="secondary" onClick={()=>setSelectedId('')} style={{margin:'4px 0 12px'}}>← All files</button>
      <article className="capturedOpenView">
        <div className="songListRow capturedOpenHeader">
          <div className="songCoverButton songCoverTone0 fileThumb" aria-hidden="true"><span>▤</span></div>
          <div className="songRowInfo capturedOpenInfo">
            <div className="songTitleLine"><strong>{selected.title||'Captured recording'}</strong><span>{state==='ready'?'READY':state==='failed'?'ATTENTION':'WORKING'}</span></div>
            <small className="songDescription">{assetSummary(selected)}</small>
            <div className="songMeta"><span>{new Date(selected.createdAt).toLocaleDateString()}</span><span>{selectedOutputCount(selected)} outputs</span></div>
          </div>
          <div className="songMenuWrap" aria-hidden="true"></div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8}}><input value={renameValue} onChange={event=>setRenameValue(event.target.value)} maxLength={120} aria-label="Song name" style={{minWidth:0}} /><button type="button" className="secondary" onClick={renameSelected}>Rename</button></div>
        <div className="songsSectionHead capturedFilesHead"><strong>Files</strong><span>{state==='ready'?'READY':state==='failed'?'NEEDS ATTENTION':'PROCESSING'}</span></div>
        {fileStatus&&<div className="statusBox" style={{padding:10,fontSize:12}}>{fileStatus}</div>}

        {inlineSheetUrl&&<div className="pieInlineSheetPreview">
          <div className="pieInlineSheetHead"><strong>{inlineSheetTitle||'Sheet music'}</strong><button type="button" className="secondary" onClick={()=>setInlineSheetUrl('')}>Close</button></div>
          <iframe src={inlineSheetUrl} title={inlineSheetTitle||'Sheet music preview'} />
        </div>}
        {chordSheet&&<div className="pieChordSheetPreview">
          <div className="pieInlineSheetHead"><div><strong>{chordSheet.title||'Chord + Lyric Sheet'}</strong>{chordSheet.likelyKey&&<small>Likely key: {chordSheet.likelyKey}</small>}</div><div style={{display:'flex',gap:8}}><button type="button" className="secondary" onClick={()=>void downloadChordLyricPdf()}>PDF</button><button type="button" className="secondary" onClick={()=>setChordSheet(null)}>Close</button></div></div>
          <div className="pieChordSheetPaper">{(chordSheet.lines||[]).map((line:any,index:number)=><div className="pieChordLine" key={index}>{line.section&&<h4>{line.section}</h4>}<pre>{line.chords||' '}</pre><p>{line.lyrics}</p></div>)}</div>
        </div>}

        {fileRow('recording','♪ Original recording · WAV',recordingUrl,'recording.wav',Boolean(recordingAsset))}

        {selected.outputs.fullSheet&&(fullReady
          ? fileRow('sheet','▤ Full sheet music · PDF',assets.sheet?savedUrl(assets.sheet):`/api/sheets/download/${encodeURIComponent(selected.jobs.full)}/pdf`,'sheet.pdf',Boolean(assets.sheet))
          : <div className="statusBox" style={{padding:14}}>▤ Full sheet music · {statuses.full==='FAILED'?'Failed':'Turning up the heat…'}</div>)}

        {selected.outputs.chords&&(chordsReady
          ? fileRow('chords','♬ Chords',assets.chords?savedUrl(assets.chords):`/api/sheets/download/${encodeURIComponent(selected.jobs.chords)}/json`,'chords.json',Boolean(assets.chords))
          : <div className="statusBox" style={{padding:14}}>♬ Chords · {statuses.chords==='FAILED'?'Failed':'Turning up the heat…'}</div>)}

        {(selected.outputs.stems||selected.outputs.partSheets)&&<div style={{display:'grid',gap:8}}><strong style={{fontSize:14}}>Stems</strong>{stemsReady
          ? <div style={{display:'grid',gap:8}}>{STEMS.map(stem=>{const asset=assets[`stem:${stem}`];const url=asset?savedUrl(asset):`/api/sheets/stem/${encodeURIComponent(selected.jobs.separation)}/${stem}`;return <div key={stem}>{fileRow(`stem:${stem}`,`♪ ${stem} · WAV`,url,`${stem}.wav`,Boolean(asset))}</div>;})}</div>
          : <div className="statusBox" style={{padding:14}}>Stem separation · {statuses.separation==='FAILED'?'Failed':'Turning up the heat…'}</div>}</div>}

        {archiveBusy&&<small style={{opacity:.72}}>Saving completed outputs so they stay attached to this song.</small>}
        {state==='failed'&&<small style={{opacity:.72}}>Your original recording is still saved. Only the failed analysis output needs to be retried.</small>}
        <button className="secondary" type="button" onClick={()=>remove(selected.id)} style={{justifySelf:'start'}}>Remove song</button>
      </article>
    </section>;
  }

  return <section id="captured" className="songsLibraryPanel capturedLibraryPanel">
    <div className="songsSectionHead"><strong>Captured files</strong><span>{sorted.length}</span></div>
    <div className="songsList">{sorted.map((item,index)=>{const state=item.state||'processing';return <article className="songListRow" key={item.id}>
      <button type="button" className={`songCoverButton songCoverTone${index%4} fileThumb`} onClick={()=>setSelectedId(item.id)} aria-label={`Open ${item.title||'Captured recording'}`}><span>▤</span></button>
      <button type="button" className="songRowInfo" onClick={()=>setSelectedId(item.id)}>
        <div className="songTitleLine"><strong>{item.title||'Captured recording'}</strong><span>{state==='ready'?'READY':state==='failed'?'ATTN':'WORKING'}</span></div>
        <small className="songDescription">{assetSummary(item)}</small>
        <div className="songMeta"><span>{new Date(item.createdAt).toLocaleDateString()}</span><span>{selectedOutputCount(item)} outputs</span></div>
      </button>
      <div className="songMenuWrap"><button type="button" className="songMenuButton" aria-label={`Open ${item.title||'Captured recording'}`} onClick={()=>setSelectedId(item.id)}>•••</button></div>
    </article>;})}</div>
  </section>;
}
