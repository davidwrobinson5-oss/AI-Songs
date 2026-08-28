'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import type { MelodyAnalysis } from './MelodyWorkspace';
import { exportAudioBlob } from './audioExport';
import { getSongVersions, listSongs, type SavedSong, type SavedVersion } from './songStore';

type SheetType = 'full' | 'chords' | 'lead' | 'drums' | 'bass' | 'guitar' | 'keys';
type JobMap = Partial<Record<'full'|'chords'|'separation'|'lead'|'drums'|'bass'|'guitar'|'keys', string>>;
type StatusMap = Record<string, string>;
type LibraryChoice = { song: SavedSong; version: SavedVersion | null; versionsCount: number };

type Props = { songTitle:string; lyrics:string; melodyAnalysis?:MelodyAnalysis|null; prompt?:string; musicUrl?:string; vocalUrl?:string; masterUrl?:string; };

const SHEETS = [
  ['full','🎼','Full Score'],['chords','🎹','Chords + Lyrics'],['lead','🎤','Lead + Lyrics'],['drums','🥁','Drums'],['bass','🎸','Bass'],['guitar','🎸','Guitar'],['keys','🎹','Keys']
] as const;

function fmt(v:number){const m=Math.floor(v/60);const s=Math.max(0,v-m*60);return `${m}:${s.toFixed(1).padStart(4,'0')}`}
function fmtDuration(ms:number){const total=Math.max(0,Math.round(ms/1000));return `${Math.floor(total/60)}:${String(total%60).padStart(2,'0')}`}
function musicBlob(version?:SavedVersion|null){return version?.masterBlob||version?.generatedBlob||version?.backingBlob||null}
function vocalBlob(version?:SavedVersion|null){return version?.drobVocalBlob||version?.guideVocalBlob||null}

export default function SheetsWorkspace({songTitle,lyrics,melodyAnalysis,prompt='',musicUrl='',vocalUrl='',masterUrl=''}:Props){
  const [sheet,setSheet]=useState<SheetType>('full');
  const [jobs,setJobs]=useState<JobMap>({});
  const [statuses,setStatuses]=useState<StatusMap>({});
  const [chords,setChords]=useState<Array<[number,number,string]>>([]);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [stemStarted,setStemStarted]=useState(false);
  const [pickerOpen,setPickerOpen]=useState(false);
  const [pickerBusy,setPickerBusy]=useState(false);
  const [pickerError,setPickerError]=useState('');
  const [songChoices,setSongChoices]=useState<LibraryChoice[]>([]);
  const [selectedLibrary,setSelectedLibrary]=useState<LibraryChoice|null>(null);

  const selectedVersion=selectedLibrary?.version||null;
  const activeTitle=selectedLibrary?.song.title||songTitle||'Untitled Song';
  const activeLyrics=selectedVersion?.lyrics??lyrics;
  const activeMelodyAnalysis=selectedVersion?.melodyAnalysis??melodyAnalysis;
  const activePrompt=selectedVersion?.prompt??prompt;
  const sourceUrl=selectedLibrary?'':(masterUrl||musicUrl);
  const selectedMusicBlob=musicBlob(selectedVersion);
  const selectedVocalBlob=vocalBlob(selectedVersion);
  const hasMusic=Boolean(selectedMusicBlob||sourceUrl);
  const hasVocal=Boolean(selectedVocalBlob||vocalUrl||activeMelodyAnalysis);
  const hasLyrics=Boolean(activeLyrics.trim());

  async function compactForTranscription(blob:Blob){
    setStatus('Preparing a temporary transcription copy…');
    const compact=await exportAudioBlob(blob,'mp3',{bitrate:80,force:true});
    if(compact.size>4_000_000) throw new Error('This song is too long for the current direct transcription upload.');
    return compact;
  }

  async function startFile(mode:string, blob:Blob, title:string){
    const fd=new FormData(); fd.append('mode',mode); fd.append('title',title||'Untitled Song'); fd.append('file',blob,'song-analysis.mp3');
    const r=await fetch('/api/sheets/transcribe',{method:'POST',body:fd}); const d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not start transcription.'); return String(d.jobId);
  }
  async function startStem(stem:string,separationJobId:string){
    const r=await fetch('/api/sheets/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'stem',stem,separationJobId})});
    const d=await r.json(); if(!r.ok) throw new Error(d.error||'Could not transcribe stem.'); return String(d.jobId);
  }

  async function openSongPicker(){
    setPickerOpen(true); setPickerBusy(true); setPickerError('');
    try{
      const allSongs=await listSongs();
      const rows=await Promise.all(allSongs.map(async song=>{
        const versions=await getSongVersions(song.id);
        const usable=versions.find(version=>Boolean(musicBlob(version)))||null;
        return {song,version:usable,versionsCount:versions.length} satisfies LibraryChoice;
      }));
      setSongChoices(rows);
    }catch(e){setPickerError(e instanceof Error?e.message:'Could not load the Songs library.')}finally{setPickerBusy(false)}
  }

  async function chooseLibrarySong(choice:LibraryChoice){
    if(!choice.version||!musicBlob(choice.version)) return;
    setSelectedLibrary(choice);
    setPickerOpen(false);
    setStatus(`Selected ${choice.song.title} · Version ${choice.version.versionNumber}. Preparing sheet music…`);
    await generate(choice);
  }

  async function generate(choice:LibraryChoice|null=selectedLibrary){
    const chosenVersion=choice?.version||null;
    const chosenTitle=choice?.song.title||songTitle||'Untitled Song';
    const chosenMusic=musicBlob(chosenVersion);
    const chosenVocal=vocalBlob(chosenVersion);
    const fallbackSource=choice?'':(masterUrl||musicUrl);
    const fallbackVocal=choice?'':vocalUrl;

    if(!chosenMusic&&!fallbackSource&&!chosenVocal&&!fallbackVocal){setStatus('Choose a finished song from Songs first.');return}
    setBusy(true); setStatus('Preparing finished song for transcription…'); setJobs({}); setStatuses({}); setChords([]); setStemStarted(false);
    try{
      const musicSource=chosenMusic||(fallbackSource?await fetch(fallbackSource).then(r=>{if(!r.ok)throw new Error('Could not read the finished song.');return r.blob()}):null);
      const vocalSource=chosenVocal||(fallbackVocal?await fetch(fallbackVocal).then(r=>{if(!r.ok)throw new Error('Could not read the lead vocal.');return r.blob()}):null);
      const musicReady=musicSource?await compactForTranscription(musicSource):null;
      const vocalReady=vocalSource?await compactForTranscription(vocalSource):null;
      const next:JobMap={};
      setStatus('Uploading securely and starting notation analysis…');
      if(musicReady){
        const [full,chord,separation]=await Promise.all([startFile('full',musicReady,chosenTitle),startFile('chords',musicReady,chosenTitle),startFile('separate',musicReady,chosenTitle)]);
        next.full=full; next.chords=chord; next.separation=separation;
      }
      if(vocalReady) next.lead=await startFile('lead',vocalReady,chosenTitle);
      setJobs(next); setStatus(`Analyzing ${chosenTitle}, detecting chords, and separating instruments…`);
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
  const leadRows=useMemo(()=>activeMelodyAnalysis?.phrases?.map((p,i)=>({p,lyric:activeLyrics.split(/\r?\n/).filter(Boolean)[i]||''}))||[],[activeMelodyAnalysis,activeLyrics]);

  return <section className="panel sheetsWorkspace exportSheetsWorkspace">
    <div className="sheetSourceCard noPrint">
      <p className="eyebrow">Source song</p><h2>{activeTitle}</h2>
      <p className="sub">Choose a song from your Songs library. AI Songs will use its newest finished audio version for transcription.</p>
      {selectedLibrary&&selectedVersion&&<div className="statusBox">Selected from Songs · Version {selectedVersion.versionNumber} · {fmtDuration(selectedVersion.durationMs)}</div>}
      <div className="assetStatusGrid"><div className={hasMusic?'assetReady':'assetMissing'}>{hasMusic?'✓':'—'}<small>Music / Master</small></div><div className={hasVocal?'assetReady':'assetMissing'}>{hasVocal?'✓':'—'}<small>Lead Vocal</small></div><div className={hasLyrics?'assetReady':'assetMissing'}>{hasLyrics?'✓':'—'}<small>Lyrics</small></div></div>
      <button className="primary" onClick={openSongPicker} disabled={busy}>{busy?'Preparing…':'🎼 Generate Sheet Music From Song'}</button>
      {status&&<div className="statusBox">{status}</div>}
    </div>

    {pickerOpen&&<div role="presentation" style={pickerBackdropStyle} onClick={()=>!pickerBusy&&setPickerOpen(false)}>
      <section role="dialog" aria-modal="true" aria-label="Choose a song for sheet music" style={pickerSheetStyle} onClick={event=>event.stopPropagation()}>
        <div style={pickerHeaderStyle}>
          <div><p style={pickerEyebrowStyle}>SONGS LIBRARY</p><h3 style={pickerTitleStyle}>Choose a song</h3><p style={pickerSubStyle}>Scroll through your songs and tap one to generate sheet music.</p></div>
          <button type="button" aria-label="Close song picker" onClick={()=>setPickerOpen(false)} style={pickerCloseStyle}>×</button>
        </div>
        <div style={pickerListStyle}>
          {pickerBusy&&<div style={pickerEmptyStyle}>Loading your songs…</div>}
          {!pickerBusy&&pickerError&&<div className="errorBox">{pickerError}</div>}
          {!pickerBusy&&!pickerError&&songChoices.length===0&&<div style={pickerEmptyStyle}>No saved songs yet. Create a song first, then return to Sheets.</div>}
          {!pickerBusy&&!pickerError&&songChoices.map((choice,index)=>{
            const version=choice.version;
            const ready=Boolean(version&&musicBlob(version));
            return <button key={choice.song.id} type="button" disabled={!ready} onClick={()=>void chooseLibrarySong(choice)} style={{...pickerRowStyle,...(!ready?pickerRowDisabledStyle:{})}}>
              <span aria-hidden="true" style={{...pickerCoverStyle,background:pickerGradients[index%pickerGradients.length]}}>♫</span>
              <span style={pickerInfoStyle}>
                <span style={pickerNameLineStyle}><strong style={pickerNameStyle}>{choice.song.title}</strong>{version&&<small style={pickerVersionBadgeStyle}>v{version.versionNumber}</small>}</span>
                <small style={pickerDescriptionStyle}>{version?.prompt||'AI Songs project'}</small>
                <span style={pickerMetaStyle}>
                  {version&&<small>{fmtDuration(version.durationMs)}</small>}
                  {version?.masterBlob&&<small>Master</small>}
                  {choice.versionsCount>1&&<small>{choice.versionsCount} versions</small>}
                  {!ready&&<small>No finished audio</small>}
                </span>
              </span>
              <b aria-hidden="true" style={pickerChevronStyle}>›</b>
            </button>;
          })}
        </div>
      </section>
    </div>}

    <div className="sheetExportGrid noPrint">{SHEETS.map(([k,icon,label])=><button key={k} className={sheet===k?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setSheet(k)}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><small>{statuses[k]|| (k==='chords'&&chords.length?'COMPLETED':'Not generated yet')}</small></span><b>›</b></button>)}</div>
    <div className="sheetActions noPrint">
      {sheet==='chords'&&chords.length?<button className="primary" onClick={()=>window.print()}>⬇ Save Chords + Lyrics PDF</button>:selectedReady?<><a className="primary" href={`/api/sheets/download/${selectedJob}/pdf`}>PDF</a><a className="primary" href={`/api/sheets/download/${selectedJob}/xml`}>MusicXML</a><a className="primary" href={`/api/sheets/download/${selectedJob}/midi_quant`}>MIDI</a></>:<button className="primary" disabled>Downloads appear when ready</button>}
    </div>
    <article className="sheetPaper">
      <header className="sheetHeader"><div><p className="sheetBrand">AI SONGS</p><h1>{activeTitle}</h1><h2>{SHEETS.find(x=>x[0]===sheet)?.[2]}</h2></div><div className="sheetVersion">Transcribed From Finished Song</div></header>
      {activePrompt&&<p className="sheetPrompt">Original song brief: {activePrompt}</p>}
      {sheet==='chords'&&chords.length?<section className="sheetSection"><h3>Detected Chords</h3>{chords.map((c,i)=><p key={i}><b>{fmt(c[0])}</b> — {c[2]}</p>)}{hasLyrics&&<><h3>Lyrics</h3>{activeLyrics.split(/\r?\n/).filter(Boolean).map((l,i)=><p className="lyricLine" key={i}>{l}</p>)}</>}</section>:sheet==='lead'&&leadRows.length&&!selectedReady?<>{leadRows.map(({p,lyric},i)=><section className="sheetSection" key={p.index}><h3>Phrase {i+1} · {fmt(p.start)} - {fmt(p.end)}</h3><div className="noteRun">{p.notes.join(' · ')}</div><p className="lyricLine">{lyric}</p></section>)}</>:<div className="sheetEmptyState">{selectedReady?'Your transcribed notation is ready. Use PDF, MusicXML, or MIDI above.':'Choose a song above. AI Songs will track the real transcription from its finished audio.'}</div>}
    </article>
  </section>
}

const pickerBackdropStyle:CSSProperties={position:'fixed',inset:0,zIndex:12500,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'14px',background:'rgba(0,0,0,.68)',backdropFilter:'blur(8px)'};
const pickerSheetStyle:CSSProperties={width:'min(520px,100%)',maxHeight:'82vh',display:'grid',gridTemplateRows:'auto minmax(0,1fr)',overflow:'hidden',borderRadius:'26px',background:'linear-gradient(165deg,rgba(29,27,39,.99),rgba(10,10,16,.995))',border:'1px solid rgba(255,255,255,.13)',boxShadow:'0 30px 90px rgba(0,0,0,.68)',color:'#fff'};
const pickerHeaderStyle:CSSProperties={display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'14px',padding:'18px 18px 12px'};
const pickerEyebrowStyle:CSSProperties={margin:0,fontSize:'9px',letterSpacing:'.15em',fontWeight:900,color:'#8f8f9d'};
const pickerTitleStyle:CSSProperties={margin:'4px 0 4px',fontSize:'24px',letterSpacing:'-.035em'};
const pickerSubStyle:CSSProperties={margin:0,color:'#9999a6',fontSize:'12px',lineHeight:1.45};
const pickerCloseStyle:CSSProperties={width:'42px',height:'42px',flex:'0 0 42px',border:0,borderRadius:'50%',background:'rgba(255,255,255,.07)',color:'#c9c9d2',fontSize:'25px'};
const pickerListStyle:CSSProperties={overflowY:'auto',overscrollBehavior:'contain',padding:'4px 12px 16px'};
const pickerEmptyStyle:CSSProperties={padding:'34px 16px',textAlign:'center',color:'#9a9aa7',fontSize:'13px',lineHeight:1.5};
const pickerRowStyle:CSSProperties={width:'100%',display:'grid',gridTemplateColumns:'58px minmax(0,1fr) 24px',gap:'11px',alignItems:'center',padding:'10px 6px',border:0,borderBottom:'1px solid rgba(255,255,255,.07)',background:'transparent',color:'#fff',textAlign:'left'};
const pickerRowDisabledStyle:CSSProperties={opacity:.42};
const pickerCoverStyle:CSSProperties={width:'58px',height:'58px',display:'grid',placeItems:'end start',padding:'8px',borderRadius:'14px',color:'#fff',fontSize:'18px',fontWeight:900,boxShadow:'inset 0 1px 0 rgba(255,255,255,.2)'};
const pickerInfoStyle:CSSProperties={minWidth:0,display:'grid',gap:'4px'};
const pickerNameLineStyle:CSSProperties={display:'flex',alignItems:'center',gap:'7px',minWidth:0};
const pickerNameStyle:CSSProperties={fontSize:'15px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'};
const pickerVersionBadgeStyle:CSSProperties={flex:'0 0 auto',padding:'2px 6px',borderRadius:'999px',border:'1px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.065)',color:'#a7a7b2',fontSize:'9px'};
const pickerDescriptionStyle:CSSProperties={display:'block',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'#8e8e9a',fontSize:'11px'};
const pickerMetaStyle:CSSProperties={display:'flex',gap:'5px',flexWrap:'wrap',color:'#777783',fontSize:'9px'};
const pickerChevronStyle:CSSProperties={color:'#767681',fontSize:'24px',fontWeight:500};
const pickerGradients=['linear-gradient(145deg,#ff3d81,#ff8d3d 42%,#7c5cff 75%,#38d9ff)','linear-gradient(145deg,#40d9ff,#416dff 45%,#a74cff 78%,#ff4c9a)','linear-gradient(145deg,#ffd44c,#ff7b46 45%,#ff315f 72%,#8b5cff)','linear-gradient(145deg,#4ee6a4,#28a3ff 48%,#7c56ff 78%,#ee4cff)'];
