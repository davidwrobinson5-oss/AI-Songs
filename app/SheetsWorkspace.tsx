'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MelodyAnalysis } from './MelodyWorkspace';
import { exportAudioBlob } from './audioExport';
import SheetImportTools from './SheetImportTools';
import SongAnalysisWorkspace from './SongAnalysisWorkspace';

type SheetType = 'full' | 'chords' | 'lead' | 'drums' | 'bass' | 'guitar' | 'keys';
type JobMap = Partial<Record<'full'|'chords'|'separation'|'lead'|'drums'|'bass'|'guitar'|'keys', string>>;
type StatusMap = Record<string, string>;

type Props = { songTitle:string; lyrics:string; melodyAnalysis?:MelodyAnalysis|null; prompt?:string; musicUrl?:string; vocalUrl?:string; masterUrl?:string; };

const SHEETS = [
  ['full','🎼','Full Score'],['chords','🎹','Chords + Lyrics'],['lead','🎤','Lead + Lyrics'],['drums','🥁','Drums'],['bass','🎸','Bass'],['guitar','🎸','Guitar'],['keys','🎹','Keys']
] as const;

const AUDIO_STEMS = [
  ['vocals','🎤','Vocals'],['drums','🥁','Drums'],['bass','🎸','Bass'],['guitar','🎸','Guitar'],['piano','🎹','Piano / Keys'],['other','🎻','Other']
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
  const [sheetAnalysisPlan,setSheetAnalysisPlan]=useState('');
  const [analysisVocalRange,setAnalysisVocalRange]=useState('Baritone');
  const sourceUrl=masterUrl||musicUrl;
  const hasMusic=Boolean(sourceUrl), hasVocal=Boolean(vocalUrl||melodyAnalysis), hasLyrics=Boolean(lyrics.trim());

  async function compactForTranscription(blob:Blob){
    setStatus('Turning up the heat…');
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

  async function generateFromUploadedAudio(file:File){
    setBusy(true); setStatus('Turning up the heat…'); setJobs({}); setStatuses({}); setChords([]); setStemStarted(false);
    try{
      const musicBlob=await compactForTranscription(file);
      setStatus('Starting full score, chord analysis, and six-part stem separation…');
      const [full,chord,separation]=await Promise.all([startFile('full',musicBlob),startFile('chords',musicBlob),startFile('separate',musicBlob)]);
      setJobs({full,chords:chord,separation});
      setStatus('Turning up the heat…');
    }catch(e){
      setStatus(e instanceof Error?e.message:'Could not process uploaded audio into sheets and stems.');
    }finally{setBusy(false)}
  }

  useEffect(()=>{
    const onAudio=(event:Event)=>{
      const detail=(event as CustomEvent<{file?:File}>).detail;
      const file=detail?.file;
      if(file instanceof File)void generateFromUploadedAudio(file);
    };
    window.addEventListener('pie-audio-upload-ready',onAudio);
    return()=>window.removeEventListener('pie-audio-upload-ready',onAudio);
  },[]);

  async function generate(){
    if(!hasMusic&&!vocalUrl){setStatus('Create or load a finished song first.');return}
    setBusy(true); setStatus('Turning up the heat…'); setJobs({}); setStatuses({}); setChords([]); setStemStarted(false);
    try{
      const musicSource=sourceUrl?await fetch(sourceUrl).then(r=>{if(!r.ok)throw new Error('Could not read the finished song.');return r.blob()}):null;
      const vocalSource=vocalUrl?await fetch(vocalUrl).then(r=>{if(!r.ok)throw new Error('Could not read the lead vocal.');return r.blob()}):null;
      const musicBlob=musicSource?await compactForTranscription(musicSource):null;
      const vocalBlob=vocalSource?await compactForTranscription(vocalSource):null;
      const next:JobMap={};
      setStatus('Turning up the heat…');
      if(musicBlob){
        const [full,chord,separation]=await Promise.all([startFile('full',musicBlob),startFile('chords',musicBlob),startFile('separate',musicBlob)]);
        next.full=full; next.chords=chord; next.separation=separation;
      }
      if(vocalBlob) next.lead=await startFile('lead',vocalBlob);
      setJobs(next); setStatus('Turning up the heat…');
    }catch(e){setStatus(e instanceof Error?e.message:'Could not start transcription.')}finally{setBusy(false)}
  }

  useEffect(()=>{
    const applyJobs=(incoming:JobMap)=>{
      if(!incoming||!Object.keys(incoming).length)return;
      setJobs(incoming);setStatuses({});setChords([]);setStemStarted(false);
      setStatus('Sheet music and stem processing started. Tracking progress now…');
    };
    try{
      const saved=sessionStorage.getItem('pie-audio-processing-jobs');
      if(saved)applyJobs(JSON.parse(saved) as JobMap);
    }catch{}
    const onStarted=(event:Event)=>applyJobs(((event as CustomEvent<{jobs?:JobMap}>).detail?.jobs||{}) as JobMap);
    window.addEventListener('pie-audio-processing-started',onStarted);
    return()=>window.removeEventListener('pie-audio-processing-started',onStarted);
  },[]);

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
    <SongAnalysisWorkspace
      vocalRange={analysisVocalRange}
      onVocalRangeChange={setAnalysisVocalRange}
      onApply={(plan,range)=>{setAnalysisVocalRange(range);setSheetAnalysisPlan(plan)}}
    />
    <SheetImportTools analysisPlan={sheetAnalysisPlan} vocalRange={analysisVocalRange} />
  </section>
}
