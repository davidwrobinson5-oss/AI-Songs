'use client';

import { useEffect, useMemo, useState } from 'react';
import { stagePieFile } from './stagedUpload';
import PlaybackRecorderCard from './PlaybackRecorderCard';

type Jobs = Partial<Record<'full'|'chords'|'separation'|'lead'|'drums'|'bass'|'guitar'|'keys', string>>;
type Statuses = Record<string,string>;
type SavedSession = {
  id:string;
  sourceName:string;
  createdAt:number;
  updatedAt:number;
  jobs:Jobs;
  statuses:Statuses;
  chords:Array<[number,number,string]>;
  status:string;
  stemStarted:boolean;
};

const STORAGE_KEY='pie-sheets-stems-library-v1';
const ACTIVE_KEY='pie-sheets-stems-active-v1';

const STEMS = [
  ['vocals','Vocals'],
  ['drums','Drums'],
  ['bass','Bass'],
  ['guitar','Guitar'],
  ['piano','Piano / Keys'],
  ['other','Other'],
] as const;

const SHEETS = [
  ['full','Full Score'],
  ['lead','Lead Vocal'],
  ['drums','Drums'],
  ['bass','Bass'],
  ['guitar','Guitar'],
  ['keys','Keys / Piano'],
] as const;

function readLibrary():SavedSession[]{
  try{
    const parsed=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
    return Array.isArray(parsed)?parsed.filter(item=>item&&typeof item.id==='string'&&typeof item.sourceName==='string'):[];
  }catch{return []}
}

export default function AudioProcessorWorkspace(){
  const [jobs,setJobs]=useState<Jobs>({});
  const [statuses,setStatuses]=useState<Statuses>({});
  const [chords,setChords]=useState<Array<[number,number,string]>>([]);
  const [status,setStatus]=useState('Choose an audio file to create sheet music and stems.');
  const [busy,setBusy]=useState(false);
  const [stemStarted,setStemStarted]=useState(false);
  const [sourceName,setSourceName]=useState('');
  const [sessionId,setSessionId]=useState('');
  const [library,setLibrary]=useState<SavedSession[]>([]);
  const [hydrated,setHydrated]=useState(false);

  function restoreSession(item:SavedSession){
    setSessionId(item.id);
    setSourceName(item.sourceName);
    setJobs(item.jobs||{});
    setStatuses(item.statuses||{});
    setChords(Array.isArray(item.chords)?item.chords:[]);
    setStatus(item.status||'Saved transcription restored.');
    setStemStarted(Boolean(item.stemStarted));
    localStorage.setItem(ACTIVE_KEY,item.id);
  }

  useEffect(()=>{
    const saved=readLibrary();
    setLibrary(saved);
    const activeId=localStorage.getItem(ACTIVE_KEY)||'';
    const active=saved.find(item=>item.id===activeId)||saved[0];
    if(active)restoreSession(active);
    setHydrated(true);
  },[]);

  useEffect(()=>{
    if(!hydrated||!sessionId||!sourceName)return;
    const now=Date.now();
    setLibrary(prev=>{
      const existing=prev.find(item=>item.id===sessionId);
      const entry:SavedSession={id:sessionId,sourceName,createdAt:existing?.createdAt||now,updatedAt:now,jobs,statuses,chords,status,stemStarted};
      const next=[entry,...prev.filter(item=>item.id!==sessionId)].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,20);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      localStorage.setItem(ACTIVE_KEY,sessionId);
      return next;
    });
  },[hydrated,sessionId,sourceName,jobs,statuses,chords,status,stemStarted]);

  async function startStem(stem:string,separationJobId:string){
    const response=await fetch('/api/sheets/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'stem',stem,separationJobId}),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data?.error||`Could not create ${stem} notation.`);
    return String(data.jobId||'');
  }

  async function processFile(file:File){
    if(busy)return;
    const nextSessionId=crypto.randomUUID();setSessionId(nextSessionId);setBusy(true);setJobs({});setStatuses({});setChords([]);setStemStarted(false);setSourceName(file.name);setStatus('Uploading audio… 0%');
    try{
      const stagedPath=await stagePieFile(file,percent=>setStatus(`Uploading audio… ${percent}%`));
      setStatus('Upload complete. Starting sheet music, chords, and stem separation…');
      const response=await fetch('/api/sheets/process-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'audio/mpeg'}),cache:'no-store'});
      const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||'Could not start audio processing.');
      const next=(data.jobs||{}) as Jobs;if(!next.full||!next.chords||!next.separation)throw new Error('Pie did not receive all processing job IDs.');setJobs(next);setStatus('Processing started. Pie is transcribing the full score, detecting chords, and separating instruments…');
    }catch(error){setStatus(error instanceof Error?error.message:'Could not process that audio file.')}finally{setBusy(false)}
  }

  useEffect(()=>{
    if(!Object.keys(jobs).length)return;let cancelled=false;
    const poll=async()=>{try{
      const response=await fetch('/api/sheets/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs}),cache:'no-store'});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||'Could not check processing status.');if(cancelled)return;
      const nextStatuses=(data.statuses||{}) as Statuses;setStatuses(nextStatuses);if(Array.isArray(data.chords))setChords(data.chords);
      if(nextStatuses.separation==='COMPLETED'&&!stemStarted&&jobs.separation){setStemStarted(true);setStatus('Stems are ready. Creating notation for vocals, drums, bass, guitar, and keys…');const mapping:[string,keyof Jobs][]=[['vocals','lead'],['drums','drums'],['bass','bass'],['guitar','guitar'],['piano','keys']];const results=await Promise.allSettled(mapping.map(([stem])=>startStem(stem,jobs.separation!)));if(cancelled)return;const additions:Jobs={};results.forEach((result,index)=>{if(result.status==='fulfilled'&&result.value)additions[mapping[index][1]]=result.value});setJobs(prev=>({...prev,...additions}));setStatus(results.some(result=>result.status==='rejected')?'Audio stems are ready. Some individual notation jobs could not start, but available sheets will continue processing.':'Audio stems are ready. Individual instrument notation is processing now…');return;}
      const sheetKeys=['full','lead','drums','bass','guitar','keys'].filter(key=>jobs[key as keyof Jobs]);const sheetDone=sheetKeys.length>0&&sheetKeys.every(key=>nextStatuses[key]==='COMPLETED');const chordsDone=!jobs.chords||nextStatuses.chords==='COMPLETED';const separationDone=!jobs.separation||nextStatuses.separation==='COMPLETED';const failed=Object.values(nextStatuses).some(value=>/FAILED|ERROR|CANCEL/i.test(value));if(failed)setStatus('One processing job reported an error. Completed stems and sheets are still available below.');else if(sheetDone&&chordsDone&&separationDone)setStatus('Done — sheet music and individual stems are ready.');
    }catch(error){if(!cancelled)setStatus(error instanceof Error?error.message:'Could not check processing status.')}};
    void poll();const timer=setInterval(()=>void poll(),4000);return()=>{cancelled=true;clearInterval(timer)};
  },[jobs,stemStarted]);

  function deleteSession(id:string){setLibrary(prev=>{const next=prev.filter(item=>item.id!==id);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));if(id===sessionId){const replacement=next[0];if(replacement)restoreSession(replacement);else{localStorage.removeItem(ACTIVE_KEY);setSessionId('');setSourceName('');setJobs({});setStatuses({});setChords([]);setStemStarted(false);setStatus('Choose an audio file to create sheet music and stems.')}}return next})}

  const separationReady=Boolean(jobs.separation&&statuses.separation==='COMPLETED');
  const hasStarted=Object.keys(jobs).length>0;
  const progress=useMemo(()=>Object.entries(jobs).map(([key,id])=>({key,id,status:statuses[key]||'QUEUED'})),[jobs,statuses]);

  return <div style={{maxWidth:980,margin:'0 auto'}}>
    <PlaybackRecorderCard />
    <section className="panel" style={{padding:20}}>
      <p className="eyebrow">AUDIO IMPORT</p><h2 style={{marginTop:4}}>Audio → Sheets & Stems</h2><p className="sub">Upload the WAV or MP3 here. Progress, transcription, and downloads stay on this Sheets screen and the job is saved when you switch screens.</p>
      <label className="primary" style={{display:'inline-block',cursor:'pointer',marginTop:10}}>{busy?'Uploading…':'Upload Audio'}<input hidden type="file" accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac" disabled={busy} onChange={event=>{const file=event.target.files?.[0];if(file)void processFile(file);event.currentTarget.value='';}}/></label>
      <div className="statusBox" style={{marginTop:14}}>{status}</div>{sourceName&&<small style={{display:'block',marginTop:8}}>Source: {sourceName}</small>}
    </section>
    {library.length>0&&<section className="panel" style={{padding:20,marginTop:16}}><p className="eyebrow">SAVED SHEETS & STEMS</p><h2>Recent audio jobs</h2><p className="sub">Saved on this device so switching between Music, Songs, Mix, Voice, and Sheets does not erase the job.</p><div style={{display:'grid',gap:10}}>{library.map(item=><div className="statusBox" key={item.id} style={{display:'grid',gap:8}}><div><strong>{item.sourceName}</strong><small style={{display:'block',marginTop:4}}>{new Date(item.updatedAt).toLocaleString()}</small></div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}><button className="secondary" onClick={()=>restoreSession(item)} disabled={item.id===sessionId}>Open</button><button className="secondary" onClick={()=>deleteSession(item.id)}>Delete</button></div></div>)}</div></section>}
    {hasStarted&&<section className="panel" style={{padding:20,marginTop:16}}><p className="eyebrow">LIVE JOB STATUS</p><div style={{display:'grid',gap:8}}>{progress.map(item=><div className="statusBox" key={item.key} style={{display:'flex',justifyContent:'space-between',gap:12}}><strong>{item.key}</strong><span>{item.status}</span></div>)}</div></section>}
    {separationReady&&jobs.separation&&<section className="panel" style={{padding:20,marginTop:16}}><p className="eyebrow">INDIVIDUAL AUDIO STEMS</p><h2>Separated WAV stems</h2><div style={{display:'grid',gap:12}}>{STEMS.map(([stem,label])=><div className="statusBox" key={stem}><strong style={{display:'block',marginBottom:8}}>{label}</strong><audio controls preload="none" style={{width:'100%'}} src={`/api/sheets/stem/${encodeURIComponent(jobs.separation!)}/${stem}`}/><a className="secondary" style={{display:'inline-block',marginTop:8}} href={`/api/sheets/stem/${encodeURIComponent(jobs.separation!)}/${stem}`} download={`${stem}.wav`}>Download WAV</a></div>)}</div></section>}
    {hasStarted&&<section className="panel" style={{padding:20,marginTop:16}}><p className="eyebrow">SHEET MUSIC</p><h2>Notation downloads</h2><div style={{display:'grid',gap:10}}>{SHEETS.map(([key,label])=>{const jobId=jobs[key];const ready=Boolean(jobId&&statuses[key]==='COMPLETED');return <div className="statusBox" key={key}><strong>{label}</strong><span style={{marginLeft:8}}>{jobId?(statuses[key]||'QUEUED'):'Waiting for stem separation'}</span>{ready&&jobId&&<div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:8}}><a className="secondary" href={`/api/sheets/download/${encodeURIComponent(jobId)}/pdf`}>PDF</a><a className="secondary" href={`/api/sheets/download/${encodeURIComponent(jobId)}/xml`}>MusicXML</a><a className="secondary" href={`/api/sheets/download/${encodeURIComponent(jobId)}/midi_quant`}>MIDI</a></div>}</div>;})}</div>{chords.length>0&&<div style={{marginTop:18}}><h3>Detected chords</h3>{chords.map((chord,index)=><p key={`${chord[0]}-${index}`}>{chord[0].toFixed(1)}s — {chord[2]}</p>)}</div>}</section>}
  </div>;
}
