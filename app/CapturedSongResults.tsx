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
  },[records.length]);

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
    setFileStatus('Saving finished files into this song…');
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
    setMenuKey('');setFileStatus('Preparing download…');
    try{
      const blob=await fetchFile(url);const objectUrl=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=objectUrl;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(objectUrl),3000);setFileStatus('Download ready.');
    }catch(error){setFileStatus(error instanceof Error?error.message:'File could not be downloaded.');}
  }

  async function shareFile(url:string,name:string){
    setMenuKey('');setFileStatus('Preparing file to share…');
    try{
      const blob=await fetchFile(url);const file=new File([blob],name,{type:blob.type||'application/octet-stream'});
      if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({title:name,files:[file]});setFileStatus('Share sheet opened.');return;}
      await downloadFile(url,name);
    }catch(error){if(error instanceof DOMException&&error.name==='AbortError'){setFileStatus('');return;}setFileStatus(error instanceof Error?error.message:'File could not be shared.');}
  }

  function fileRow(key:string,label:string,url:string,name:string,saved:boolean){
    return <div className="statusBox" style={{position:'relative',display:'grid',gridTemplateColumns:'minmax(0,1fr) 46px',alignItems:'center',gap:8,padding:'5px 6px 5px 14px',borderRadius:14}}>
      <button type="button" onClick={()=>void openFile(url)} style={{border:0,background:'transparent',color:'inherit',textAlign:'left',padding:'10px 0',minWidth:0}}>
        <strong style={{display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{label}</strong>
        <small style={{display:'block',marginTop:3,opacity:.6}}>{saved?'Saved in Pie · tap to open':'Ready · saving into Pie…'}</small>
      </button>
      <button type="button" aria-label={`Options for ${label}`} onClick={()=>setMenuKey(current=>current===key?'':key)} style={{width:42,height:42,border:0,borderRadius:'50%',background:'transparent',color:'inherit',fontSize:20}}>•••</button>
      {menuKey===key&&<>
        <button type="button" aria-label="Close file menu" onClick={()=>setMenuKey('')} style={{position:'fixed',inset:0,zIndex:10040,border:0,background:'transparent'}} />
        <div style={{position:'absolute',right:7,top:48,zIndex:10050,width:180,padding:7,borderRadius:14,background:'rgba(16,16,23,.98)',border:'1px solid rgba(255,255,255,.12)',boxShadow:'0 18px 55px rgba(0,0,0,.5)'}}>
          <button className="secondary" type="button" onClick={()=>void openFile(url)} style={{width:'100%',marginBottom:5,textAlign:'left'}}>Open</button>
          <button className="secondary" type="button" onClick={()=>void downloadFile(url,name)} style={{width:'100%',marginBottom:5,textAlign:'left'}}>Download</button>
          <button className="secondary" type="button" onClick={()=>void shareFile(url,name)} style={{width:'100%',textAlign:'left'}}>Share</button>
        </div>
      </>}
    </div>;
  }

  if(selected){
    const statuses=selected.statuses||{};const state=selected.state||'processing';const assets=selected.assets||{};
    const fullReady=Boolean(selected.jobs.full&&statuses.full==='COMPLETED');
    const stemsReady=Boolean(selected.jobs.separation&&statuses.separation==='COMPLETED');
    const chordsReady=Boolean(selected.jobs.chords&&statuses.chords==='COMPLETED');
    const recordingAsset=assets.recording;
    const recordingUrl=recordingAsset?savedUrl(recordingAsset):`/api/sheets/source?path=${encodeURIComponent(selected.stagedPath)}`;

    return <section id="captured" style={{margin:'0 0 18px',padding:'0 2px'}}>
      <button type="button" className="secondary" onClick={()=>setSelectedId('')} style={{margin:'4px 0 12px'}}>← All songs</button>
      <article className="statusBox" style={{display:'grid',gap:14,padding:16,borderRadius:20}}>
        <div style={{display:'grid',gridTemplateColumns:'58px minmax(0,1fr)',gap:12,alignItems:'center'}}>
          <div style={{width:58,height:58,borderRadius:16,display:'grid',placeItems:'center',fontSize:26,background:'linear-gradient(145deg,rgba(168,85,247,.5),rgba(59,130,246,.35))',border:'1px solid rgba(255,255,255,.12)'}}>♫</div>
          <div style={{minWidth:0}}><strong style={{display:'block',fontSize:19,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{selected.title||'Captured recording'}</strong><small style={{display:'block',marginTop:3,opacity:.62}}>{new Date(selected.createdAt).toLocaleString()}</small><small style={{display:'block',marginTop:4,opacity:.7}}>{assetSummary(selected)}</small></div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8}}><input value={renameValue} onChange={event=>setRenameValue(event.target.value)} maxLength={120} aria-label="Song name" style={{minWidth:0}} /><button type="button" className="secondary" onClick={renameSelected}>Rename</button></div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}><strong>Files</strong><span style={{fontSize:11,fontWeight:850,opacity:.75}}>{state==='ready'?'READY':state==='failed'?'NEEDS ATTENTION':'PROCESSING'}</span></div>
        {fileStatus&&<div className="statusBox" style={{padding:10,fontSize:12}}>{fileStatus}</div>}

        {fileRow('recording','♪ Original recording · WAV',recordingUrl,'recording.wav',Boolean(recordingAsset))}

        {selected.outputs.fullSheet&&(fullReady
          ? fileRow('sheet','▤ Full sheet music · PDF',assets.sheet?savedUrl(assets.sheet):`/api/sheets/download/${encodeURIComponent(selected.jobs.full)}/pdf`,'sheet.pdf',Boolean(assets.sheet))
          : <div className="statusBox" style={{padding:14}}>▤ Full sheet music · {statuses.full==='FAILED'?'Failed':'Processing…'}</div>)}

        {selected.outputs.chords&&(chordsReady
          ? fileRow('chords','♬ Chords',assets.chords?savedUrl(assets.chords):`/api/sheets/download/${encodeURIComponent(selected.jobs.chords)}/json`,'chords.json',Boolean(assets.chords))
          : <div className="statusBox" style={{padding:14}}>♬ Chords · {statuses.chords==='FAILED'?'Failed':'Processing…'}</div>)}

        {(selected.outputs.stems||selected.outputs.partSheets)&&<div style={{display:'grid',gap:8}}><strong style={{fontSize:14}}>Stems</strong>{stemsReady
          ? <div style={{display:'grid',gap:8}}>{STEMS.map(stem=>{const asset=assets[`stem:${stem}`];const url=asset?savedUrl(asset):`/api/sheets/stem/${encodeURIComponent(selected.jobs.separation)}/${stem}`;return <div key={stem}>{fileRow(`stem:${stem}`,`♪ ${stem} · WAV`,url,`${stem}.wav`,Boolean(asset))}</div>;})}</div>
          : <div className="statusBox" style={{padding:14}}>Stem separation · {statuses.separation==='FAILED'?'Failed':'Processing…'}</div>}</div>}

        {archiveBusy&&<small style={{opacity:.72}}>Saving completed outputs so they stay attached to this song.</small>}
        {state==='failed'&&<small style={{opacity:.72}}>Your original recording is still saved. Only the failed analysis output needs to be retried.</small>}
        <button className="secondary" type="button" onClick={()=>remove(selected.id)} style={{justifySelf:'start'}}>Remove song</button>
      </article>
    </section>;
  }

  return <section id="captured" style={{margin:'0 0 18px',padding:'0 2px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'10px 2px 8px'}}><strong>Captured songs</strong><span style={{fontSize:12,opacity:.6}}>{sorted.length}</span></div>
    <div style={{display:'grid',gap:9}}>{sorted.map((item,index)=>{const state=item.state||'processing';return <button key={item.id} type="button" onClick={()=>setSelectedId(item.id)} className="statusBox" style={{width:'100%',display:'grid',gridTemplateColumns:'56px minmax(0,1fr) auto',gap:12,alignItems:'center',padding:10,borderRadius:17,textAlign:'left',color:'inherit'}}><span style={{width:56,height:56,borderRadius:14,display:'grid',placeItems:'center',fontSize:24,background:index%2===0?'linear-gradient(145deg,rgba(168,85,247,.5),rgba(59,130,246,.35))':'linear-gradient(145deg,rgba(236,72,153,.45),rgba(124,58,237,.35))',border:'1px solid rgba(255,255,255,.1)'}}>♫</span><span style={{minWidth:0}}><strong style={{display:'block',fontSize:16,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.title||'Captured recording'}</strong><small style={{display:'block',marginTop:3,opacity:.62}}>{new Date(item.createdAt).toLocaleString()}</small><small style={{display:'block',marginTop:4,opacity:.72,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{assetSummary(item)} · {selectedOutputCount(item)} selected output{selectedOutputCount(item)===1?'':'s'}</small></span><span style={{display:'grid',justifyItems:'end',gap:5}}><small style={{fontSize:10,fontWeight:850,opacity:.7}}>{state==='ready'?'READY':state==='failed'?'ATTENTION':'WORKING'}</small><span style={{fontSize:24,opacity:.55}}>›</span></span></button>;})}</div>
  </section>;
}
