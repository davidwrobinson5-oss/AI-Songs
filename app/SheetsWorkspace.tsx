'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MelodyAnalysis } from './MelodyWorkspace';
import { exportAudioBlob } from './audioExport';
import SheetImportTools from './SheetImportTools';

type SheetType = 'full' | 'chords' | 'lead' | 'drums' | 'bass' | 'guitar' | 'keys';
type JobMap = Partial<Record<'full'|'chords'|'separation'|'lead'|'drums'|'bass'|'guitar'|'keys', string>>;
type StatusMap = Record<string, string>;

type Props = { songTitle:string; lyrics:string; melodyAnalysis?:MelodyAnalysis|null; prompt?:string; musicUrl?:string; vocalUrl?:string; masterUrl?:string; };

const SHEETS = [
  ['full','🎼','Full Score'],['chords','🎹','Chords + Lyrics'],['lead','🎤','Lead + Lyrics'],['drums','🥁','Drums'],['bass','🎸','Bass'],['guitar','🎸','Guitar'],['keys','🎹','Keys']
] as const;

function fmt(v:number){const m=Math.floor(v/60);const s=Math.max(0,v-m*60);return `${m}:${s.toFixed(1).padStart(4,'0')}`}

export default function SheetsWorkspace({songTitle,lyrics,melodyAnalysis,prompt='',musicUrl='',vocalUrl='',masterUrl=''}:Props){
  const [sheet,setSheet]=useState<SheetType>('full');
  const [jobs,setJobs]=useState<JobMap>({});
  const [statuses,setStatuses]=useState<StatusMap>({});
  const [chords,setChords]=useState<Array<[number,number,string]>>([]);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [stemStarted,setStemStarted]=useState(false);
  const sourceUrl=masterUrl||musicUrl;
  const hasMusic=Boolean(sourceUrl), hasVocal=Boolean(vocalUrl||melodyAnalysis), hasLyrics=Boolean(lyrics.trim());

  async function compactForTranscription(blob:Blob){
    setStatus('Preparing a temporary transcription copy…');
    const compact=await exportAudioBlob(blob,'mp3',{bitrate:80,force:true});
    if(compact.size>4_000_000) throw new Error('This song is too long for the current direct transcription upload.');
    return compact;
  }

  async function startFile(mode:string, blob:Blob){
    const fd=new FormData(); fd.append('mode',mode); fd.append('title',songTitle||'Untitled Song'); fd.append('file',blob,'song-analysis.mp3');
    const r=await fetch('/api/sheets/transcribe',{method:'POST',body:fd}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not start transcription.'); return String(d.jobId);
  }
  async function startStem(stem:string,separationJobId:string){
    const r=await fetch('/api/sheets/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'stem',stem,separationJobId})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not transcribe stem.'); return String(d.jobId);
  }

  async function generate(){
    if(!hasMusic&&!vocalUrl){setStatus('Create or load a finished song first.');return}
    setBusy(true); setStatus('Preparing finished song for transcription…'); setJobs({}); setStatuses({}); setChords([]); setStemStarted(false);
    try{
      const musicSource=sourceUrl?await fetch(sourceUrl).then(r=>{if(!r.ok)throw new Error('Could not read the finished song.');return r.blob()}):null;
      const vocalSource=vocalUrl?await fetch(vocalUrl).then(r=>{if(!r.ok)throw new Error('Could not read the lead vocal.');return r.blob()}):null;
      const musicBlob=musicSource?await compactForTranscription(musicSource):null;
      const vocalBlob=vocalSource?await compactForTranscription(vocalSource):null;
      const next:JobMap={};
      setStatus('Uploading securely and starting notation analysis…');
      if(musicBlob){
        const [full,chord,separation]=await Promise.all([startFile('full',musicBlob),startFile('chords',musicBlob),startFile('separate',musicBlob)]);
        next.full=full; next.chords=chord; next.separation=separation;
      }
      if(vocalBlob) next.lead=await startFile('lead',vocalBlob);
      setJobs(next); setStatus('Analyzing music, detecting chords, and separating instruments…');
    }catch(e){setStatus(e instanceof Error?e.message:'Could not start transcription.')}finally{setBusy(false)}
  }

  useEffect(()=>{
    const ids=Object.values(jobs).filter(Boolean); if(!ids.length) return;
    let dead=false;
    const poll=async()=>{
      try{
        const r=await fetch('/api/sheets/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs})});
        const d=await r.json(); if(!r.ok) throw new Error(d.error||'Status check failed.'); if(dead)return;
        setStatuses(d.statuses||{}); if(Array.isArray(d.chords))setChords(d.chords);
        if(d.statuses?.separation==='COMPLETED'&&!stemStarted&&jobs.separation){
          setStemStarted(true); setStatus('Instrument stems found. Creating lead, drum, bass, guitar, and keys notation…');
          const stemNames=jobs.lead?['drums','bass','guitar','piano']:['vocals','drums','bass','guitar','piano'];
          const stemJobs=await Promise.all(stemNames.map(s=>startStem(s,jobs.separation!)));
          if(!dead){
            const addition:JobMap={};
            let offset=0;
            if(!jobs.lead){addition.lead=stemJobs[0];offset=1}
            addition.drums=stemJobs[offset]; addition.bass=stemJobs[offset+1]; addition.guitar=stemJobs[offset+2]; addition.keys=stemJobs[offset+3];
            setJobs(prev=>({...prev,...addition}));
          }
        } else {
          const wanted=['full','lead','drums','bass','guitar','keys'].filter(k=>jobs[k as keyof JobMap]);
          if(wanted.length>=6&&wanted.every(k=>d.statuses?.[k]==='COMPLETED')&&d.statuses?.chords==='COMPLETED') setStatus('Sheet music is ready to download.');
        }
      }catch(e){if(!dead)setStatus(e instanceof Error?e.message:'Status check failed.')}
    };
    poll(); const t=setInterval(poll,4000); return()=>{dead=true;clearInterval(t)};
  },[jobs,stemStarted]);

  const selectedJob=sheet==='chords'?undefined:jobs[sheet];
  const selectedReady=selectedJob&&statuses[sheet]==='COMPLETED';
  const leadRows=useMemo(()=>melodyAnalysis?.phrases?.map((p,i)=>({p,lyric:lyrics.split(/\r?\n/).filter(Boolean)[i]||''}))||[],[melodyAnalysis,lyrics]);

  return <section className="panel sheetsWorkspace exportSheetsWorkspace">
    <SheetImportTools />
    <div className="sheetSourceCard noPrint">
      <p className="eyebrow">Song → Sheets</p><h2>{songTitle||'Untitled Song'}</h2>
      <p className="sub">Pie transcribes the finished audio itself. The temporary analysis copy does not change your saved song or master.</p>
      <div className="assetStatusGrid"><div className={hasMusic?'assetReady':'assetMissing'}>{hasMusic?'✓':'—'}<small>Music / Master</small></div><div className={hasVocal?'assetReady':'assetMissing'}>{hasVocal?'✓':'—'}<small>Lead Vocal</small></div><div className={hasLyrics?'assetReady':'assetMissing'}>{hasLyrics?'✓':'—'}<small>Lyrics</small></div></div>
      <button className="primary" onClick={generate} disabled={busy}>{busy?'Preparing…':'🎼 Generate Sheet Music From Song'}</button>
      {status&&<div className="statusBox">{status}</div>}
    </div>
    <div className="sheetExportGrid noPrint">{SHEETS.map(([k,icon,label])=><button key={k} className={sheet===k?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setSheet(k)}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><small>{statuses[k]|| (k==='chords'&&chords.length?'COMPLETED':'Not generated yet')}</small></span><b>›</b></button>)}</div>
    <div className="sheetActions noPrint">
      {sheet==='chords'&&chords.length?<button className="primary" onClick={()=>window.print()}>⬇ Save Chords + Lyrics PDF</button>:selectedReady?<><a className="primary" href={`/api/sheets/download/${selectedJob}/pdf`}>PDF</a><a className="primary" href={`/api/sheets/download/${selectedJob}/xml`}>MusicXML</a><a className="primary" href={`/api/sheets/download/${selectedJob}/midi_quant`}>MIDI</a></>:<button className="primary" disabled>Downloads appear when ready</button>}
    </div>
    <article className="sheetPaper">
      <header className="sheetHeader"><div><p className="sheetBrand">PIE</p><h1>{songTitle||'Untitled Song'}</h1><h2>{SHEETS.find(x=>x[0]===sheet)?.[2]}</h2></div><div className="sheetVersion">Transcribed From Finished Song</div></header>
      {prompt&&<p className="sheetPrompt">Original song brief: {prompt}</p>}
      {sheet==='chords'&&chords.length?<section className="sheetSection"><h3>Detected Chords</h3>{chords.map((c,i)=><p key={i}><b>{fmt(c[0])}</b> — {c[2]}</p>)}{hasLyrics&&<><h3>Lyrics</h3>{lyrics.split(/\r?\n/).filter(Boolean).map((l,i)=><p className="lyricLine" key={i}>{l}</p>)}</>}</section>:sheet==='lead'&&leadRows.length&&!selectedReady?<>{leadRows.map(({p,lyric},i)=><section className="sheetSection" key={p.index}><h3>Phrase {i+1} · {fmt(p.start)} - {fmt(p.end)}</h3><div className="noteRun">{p.notes.join(' · ')}</div><p className="lyricLine">{lyric}</p></section>)}</>:<div className="sheetEmptyState">{selectedReady?'Your transcribed notation is ready. Use PDF, MusicXML, or MIDI above.':'Generate the sheet package and this page will track the real transcription from the finished audio.'}</div>}
    </article>
  </section>
}
