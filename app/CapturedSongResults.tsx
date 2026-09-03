'use client';

import { useEffect, useMemo, useState } from 'react';

type Jobs=Record<string,string>;
type Outputs={stems?:boolean;fullSheet?:boolean;partSheets?:boolean;chords?:boolean};
type Statuses=Record<string,string>;
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

export default function CapturedSongResults(){
  const [records,setRecords]=useState<CaptureRecord[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [renameValue,setRenameValue]=useState('');

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
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({jobs:item.jobs}),
            credentials:'same-origin',
            cache:'no-store',
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
      if(changed){
        localStorage.setItem(STORAGE_KEY,JSON.stringify(next.slice(0,40)));
        setRecords(next);
      }
      if(next.some(item=>(item.state||'processing')==='processing'))timer=window.setTimeout(()=>{void poll();},3500);
    };

    void poll();
    return()=>{dead=true;if(timer!==undefined)window.clearTimeout(timer);};
  },[records.length]);

  const sorted=useMemo(()=>[...records].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),[records]);
  const selected=sorted.find(item=>item.id===selectedId)||null;

  useEffect(()=>{
    if(selected)setRenameValue(selected.title||'Captured recording');
  },[selectedId,selected?.title]);

  if(!sorted.length)return null;

  function remove(id:string){
    const next=readRecords().filter(item=>item.id!==id);
    saveRecords(next);
    setRecords(next);
    if(selectedId===id)setSelectedId('');
  }

  function renameSelected(){
    if(!selected)return;
    const title=renameValue.trim().slice(0,120)||'Captured recording';
    const next=readRecords().map(item=>item.id===selected.id?{...item,title}:item);
    saveRecords(next);
    setRecords(next);
  }

  if(selected){
    const statuses=selected.statuses||{};
    const state=selected.state||'processing';
    const fullReady=Boolean(selected.jobs.full&&statuses.full==='COMPLETED');
    const stemsReady=Boolean(selected.jobs.separation&&statuses.separation==='COMPLETED');
    const chordsReady=Boolean(selected.jobs.chords&&statuses.chords==='COMPLETED');

    return <section id="captured" style={{margin:'0 0 18px',padding:'0 2px'}}>
      <button type="button" className="secondary" onClick={()=>setSelectedId('')} style={{margin:'4px 0 12px'}}>← All songs</button>
      <article className="statusBox" style={{display:'grid',gap:14,padding:16,borderRadius:20}}>
        <div style={{display:'grid',gridTemplateColumns:'58px minmax(0,1fr)',gap:12,alignItems:'center'}}>
          <div style={{width:58,height:58,borderRadius:16,display:'grid',placeItems:'center',fontSize:26,background:'linear-gradient(145deg,rgba(168,85,247,.5),rgba(59,130,246,.35))',border:'1px solid rgba(255,255,255,.12)'}}>♫</div>
          <div style={{minWidth:0}}>
            <strong style={{display:'block',fontSize:19,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{selected.title||'Captured recording'}</strong>
            <small style={{display:'block',marginTop:3,opacity:.62}}>{new Date(selected.createdAt).toLocaleString()}</small>
            <small style={{display:'block',marginTop:4,opacity:.7}}>{assetSummary(selected)}</small>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:8}}>
          <input value={renameValue} onChange={event=>setRenameValue(event.target.value)} maxLength={120} aria-label="Song name" style={{minWidth:0}} />
          <button type="button" className="secondary" onClick={renameSelected}>Rename</button>
        </div>

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10}}>
          <strong>Files</strong>
          <span style={{fontSize:11,fontWeight:850,opacity:.75}}>{state==='ready'?'READY':state==='failed'?'NEEDS ATTENTION':'PROCESSING'}</span>
        </div>

        <a className="secondary" href={`/api/sheets/source?path=${encodeURIComponent(selected.stagedPath)}`} download style={{textDecoration:'none',padding:14}}>♪ Original recording · WAV</a>

        {selected.outputs.fullSheet&&(
          fullReady
            ? <a className="secondary" href={`/api/sheets/download/${encodeURIComponent(selected.jobs.full)}/pdf`} style={{textDecoration:'none',padding:14}}>▤ Full sheet music · PDF</a>
            : <div className="statusBox" style={{padding:14}}>▤ Full sheet music · {statuses.full==='FAILED'?'Failed':'Processing…'}</div>
        )}

        {selected.outputs.chords&&(
          chordsReady
            ? <a className="secondary" href={`/api/sheets/download/${encodeURIComponent(selected.jobs.chords)}/json`} style={{textDecoration:'none',padding:14}}>♬ Chords</a>
            : <div className="statusBox" style={{padding:14}}>♬ Chords · {statuses.chords==='FAILED'?'Failed':'Processing…'}</div>
        )}

        {(selected.outputs.stems||selected.outputs.partSheets)&&<div style={{display:'grid',gap:8}}>
          <strong style={{fontSize:14}}>Stems</strong>
          {stemsReady
            ? <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>{STEMS.map(stem=><a key={stem} className="secondary" href={`/api/sheets/stem/${encodeURIComponent(selected.jobs.separation)}/${stem}`} style={{textDecoration:'none',padding:12,fontSize:13}}>♪ {stem} · WAV</a>)}</div>
            : <div className="statusBox" style={{padding:14}}>Stem separation · {statuses.separation==='FAILED'?'Failed':'Processing…'}</div>}
        </div>}

        {state==='failed'&&<small style={{opacity:.72}}>Your original recording is still saved. Only the failed analysis output needs to be retried.</small>}
        <button className="secondary" type="button" onClick={()=>remove(selected.id)} style={{justifySelf:'start'}}>Remove song</button>
      </article>
    </section>;
  }

  return <section id="captured" style={{margin:'0 0 18px',padding:'0 2px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'10px 2px 8px'}}>
      <strong>Captured songs</strong><span style={{fontSize:12,opacity:.6}}>{sorted.length}</span>
    </div>
    <div style={{display:'grid',gap:9}}>{sorted.map((item,index)=>{
      const state=item.state||'processing';
      return <button
        key={item.id}
        type="button"
        onClick={()=>setSelectedId(item.id)}
        className="statusBox"
        style={{width:'100%',display:'grid',gridTemplateColumns:'56px minmax(0,1fr) auto',gap:12,alignItems:'center',padding:10,borderRadius:17,textAlign:'left',color:'inherit'}}
      >
        <span style={{width:56,height:56,borderRadius:14,display:'grid',placeItems:'center',fontSize:24,background:index%2===0?'linear-gradient(145deg,rgba(168,85,247,.5),rgba(59,130,246,.35))':'linear-gradient(145deg,rgba(236,72,153,.45),rgba(124,58,237,.35))',border:'1px solid rgba(255,255,255,.1)'}}>♫</span>
        <span style={{minWidth:0}}>
          <strong style={{display:'block',fontSize:16,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.title||'Captured recording'}</strong>
          <small style={{display:'block',marginTop:3,opacity:.62}}>{new Date(item.createdAt).toLocaleString()}</small>
          <small style={{display:'block',marginTop:4,opacity:.72,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{assetSummary(item)} · {selectedOutputCount(item)} selected output{selectedOutputCount(item)===1?'':'s'}</small>
        </span>
        <span style={{display:'grid',justifyItems:'end',gap:5}}>
          <small style={{fontSize:10,fontWeight:850,opacity:.7}}>{state==='ready'?'READY':state==='failed'?'ATTENTION':'WORKING'}</small>
          <span style={{fontSize:24,opacity:.55}}>›</span>
        </span>
      </button>;
    })}</div>
  </section>;
}
