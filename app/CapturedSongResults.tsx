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

export default function CapturedSongResults(){
  const [records,setRecords]=useState<CaptureRecord[]>([]);

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
  if(!sorted.length)return null;

  function remove(id:string){
    const next=readRecords().filter(item=>item.id!==id);
    saveRecords(next);
    setRecords(next);
  }

  return <section style={{margin:'0 0 14px',padding:'0 2px'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,padding:'10px 2px 8px'}}>
      <strong>Captured songs</strong><span style={{fontSize:12,opacity:.6}}>{sorted.length}</span>
    </div>
    <div style={{display:'grid',gap:10}}>{sorted.map(item=>{
      const statuses=item.statuses||{};
      const state=item.state||'processing';
      const fullReady=Boolean(item.jobs.full&&statuses.full==='COMPLETED');
      const stemsReady=Boolean(item.jobs.separation&&statuses.separation==='COMPLETED');
      const chordsReady=Boolean(item.jobs.chords&&statuses.chords==='COMPLETED');
      return <article key={item.id} className="statusBox" style={{display:'grid',gap:10,padding:14,borderRadius:16}}>
        <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'start'}}>
          <div style={{minWidth:0}}><strong style={{display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{item.title||'Captured recording'}</strong><small style={{display:'block',marginTop:3,opacity:.65}}>{new Date(item.createdAt).toLocaleString()}</small></div>
          <span style={{fontSize:11,fontWeight:800,opacity:.8}}>{state==='ready'?'READY':state==='failed'?'NEEDS ATTENTION':'PROCESSING'}</span>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <a className="secondary" href={`/api/sheets/source?path=${encodeURIComponent(item.stagedPath)}`} download style={{textDecoration:'none'}}>↓ Recording WAV</a>
          {fullReady&&<a className="secondary" href={`/api/sheets/download/${encodeURIComponent(item.jobs.full)}/pdf`} style={{textDecoration:'none'}}>↓ Sheet PDF</a>}
          {chordsReady&&<a className="secondary" href={`/api/sheets/download/${encodeURIComponent(item.jobs.chords)}/json`} style={{textDecoration:'none'}}>↓ Chords</a>}
        </div>
        {stemsReady&&<div style={{display:'flex',gap:7,flexWrap:'wrap'}}>{STEMS.map(stem=><a key={stem} className="secondary" href={`/api/sheets/stem/${encodeURIComponent(item.jobs.separation)}/${stem}`} style={{textDecoration:'none',fontSize:12}}>↓ {stem} WAV</a>)}</div>}
        {state==='failed'&&<small style={{opacity:.72}}>The recording is still saved. A selected analysis job failed, so you can retry processing without recording the song again.</small>}
        <button className="secondary" type="button" onClick={()=>remove(item.id)} style={{justifySelf:'start'}}>Remove from list</button>
      </article>;
    })}</div>
  </section>;
}
