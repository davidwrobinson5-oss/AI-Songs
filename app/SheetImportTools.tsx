'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { stagePieFile } from './stagedUpload';
import SavedSheetsStemsLibrary from './SavedSheetsStemsLibrary';
import { saveVersion } from './songStore';
import PlaybackRecorderCard from './PlaybackRecorderCard';

type ScoreNote = { midi:number; startBeat:number; durationBeats:number; velocity:number };
type ScorePart = { name:string; instrument:string; isVocal:boolean; choirRole?:string; lyrics?:string; notes:ScoreNote[] };
type Score = { title:string; composer?:string; tempo:number; key?:string; timeSignature?:string; style?:string; lyrics?:string; parts:ScorePart[]; noteCount:number };
type RenderedPart = { key:string; label:string; blob:Blob; url:string; extension:string };
type ConfirmedRenderSettings = { key:string; bpm:number; timeSignature:string; vocalRange:string; renderMode:string };

const STEMS = [
  ['vocals','🎤','Vocals'],
  ['drums','🥁','Drums'],
  ['bass','🎸','Instrument Bass'],
  ['guitar','🎸','Guitar'],
  ['piano','🎹','Keys / Piano'],
  ['other','🎻','Other Instruments'],
] as const;

const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

async function readApiResponse(response:Response){
  const raw=await response.text();
  let data:any={};
  if(raw){
    try{data=JSON.parse(raw);}catch{}
  }
  if(!response.ok){
    if(response.status===504) throw new Error('Score analysis took too long. Please try again; larger scores can take a few minutes.');
    throw new Error(data?.error||raw||('Request failed ('+response.status+').'));
  }
  if(!raw) return {};
  if(!data||typeof data!=='object'||Array.isArray(data)) throw new Error('Pie received an invalid response from the analysis service. Please try again.');
  return data;
}

function partLabel(part: ScorePart) {
  const role = String(part.choirRole || '').toLowerCase();
  if (role === 'soprano') return 'Soprano';
  if (role === 'alto') return 'Alto';
  if (role === 'tenor') return 'Tenor';
  if (role === 'bass') return 'Choir Bass';
  return part.name || part.instrument || 'Part';
}

function midiName(midi:number){
  const n=Math.max(0,Math.min(127,Math.round(midi)));
  return `${NOTE_NAMES[n%12]}${Math.floor(n/12)-1}`;
}

function notationGuide(parts:ScorePart[], maxChars=2200){
  const events:Array<{start:number;text:string}>=[];
  for(const part of parts){
    for(const note of part.notes){
      events.push({start:note.startBeat,text:`${partLabel(part)}@${Number(note.startBeat.toFixed(2))}:${midiName(note.midi)}/${Number(note.durationBeats.toFixed(2))}b`});
    }
  }
  events.sort((a,b)=>a.start-b.start);
  let result='';
  for(const event of events){
    const next=(result?'; ':'')+event.text;
    if((result+next).length>maxChars)break;
    result+=next;
  }
  return result;
}

function durationFor(score:Score,parts:ScorePart[]){
  let maxBeat=0;
  for(const part of parts)for(const note of part.notes)maxBeat=Math.max(maxBeat,note.startBeat+note.durationBeats);
  const bpm=Math.max(35,Math.min(240,Number(score.tempo)||100));
  return Math.max(3000,Math.min(600000,Math.ceil((maxBeat*60/bpm+1)*1000)));
}

function singerDescription(part:ScorePart){
  const role=String(part.choirRole||'').toLowerCase();
  if(role==='soprano')return 'one natural adult soprano singer';
  if(role==='alto')return 'one natural adult alto singer';
  if(role==='tenor')return 'one natural adult tenor singer';
  if(role==='bass')return 'one natural adult bass singer';
  return 'one natural human lead singer';
}

function pieLeadVoiceLock(vocalRange:string,parts:ScorePart[]){
  const target=String(vocalRange||'Baritone').trim();
  const hasLead=parts.some(part=>part.isVocal&&!part.choirRole);
  if(!hasLead)return '';
  const profiles:Record<string,{voice:string;exclude:string}>={
    Bass:{voice:'adult male bass lead singer with a true low bass register',exclude:'female, alto, soprano, tenor, or high male lead'},
    Baritone:{voice:'adult male baritone lead singer with a warm low-to-mid male register',exclude:'female, alto, soprano, tenor, falsetto, or high male lead'},
    Tenor:{voice:'adult male tenor lead singer with a true tenor register',exclude:'female, alto, soprano, baritone, or bass lead'},
    Alto:{voice:'adult female alto lead singer with a true low female alto register',exclude:'male, tenor, baritone, bass, or soprano lead'},
    Soprano:{voice:'adult female soprano lead singer with a true soprano register',exclude:'male, tenor, baritone, bass, or alto lead'},
  };
  const profile=profiles[target]||profiles.Baritone;
  return 'LEAD VOCAL LOCK: The lead vocalist MUST be an '+profile.voice+'. Do not substitute a '+profile.exclude+'. Keep the lead melody inside the selected '+target+' range. If choir parts are included, choir singers may keep their written SATB roles, but they must not replace or change the lead vocalist.';
}

function pieMandatorySettings(score:Score,parts:ScorePart[],analysisPlan:string,vocalRange:string){
  const names=parts.map(partLabel).join(', ')||'Full Arrangement';
  const plan=analysisPlan.trim();
  let text='MANDATORY PIE RENDER SETTINGS — DO NOT OVERRIDE OR SUBSTITUTE THEM. Selected lead vocal range: '+vocalRange+'. Selected/rendered parts: '+names+'. The selected Pie settings for key, transposition, BPM, time signature, render mode, parts, and vocal target take priority over conflicting defaults or creative choices. Preserve the written song identity, note contour, harmony, timing, and structure.';
  const voiceLock=pieLeadVoiceLock(vocalRange,parts);
  if(voiceLock)text+=' '+voiceLock;
  if(plan)text+='\nPIE ANALYSIS SETTINGS (MANDATORY):\n'+plan;
  return text;
}
function productionPrompt(score:Score,parts:ScorePart[],full:boolean){
  const bpm=Math.max(35,Math.min(240,Number(score.tempo)||100));
  const names=parts.map(partLabel).join(', ');
  const instruments=parts.filter(p=>!p.isVocal&&!p.choirRole).map(p=>p.instrument||p.name).join(', ');
  const vocals=parts.filter(p=>p.isVocal||p.choirRole);
  const lyrics=(vocals.map(v=>v.lyrics||'').filter(Boolean).join('\n')||score.lyrics||'').trim().slice(0,1400);
  const notes=notationGuide(parts,full?1500:2300);
  const common=`Title: ${score.title}. Key: ${score.key||'unknown'}. Tempo: ${bpm} BPM. Time signature: ${score.timeSignature||'4/4'}. Follow the written rhythm, rests, melodic contour, register, and note sequence as closely as possible. Do not improvise a new melody. Written note guide uses startBeat:pitch/duration: ${notes}.`;

  if(full){
    const choir=vocals.filter(v=>v.choirRole).map(partLabel).join(', ');
    return `Create a polished studio performance of this written score. ${common} Use realistic acoustic/electric instrument performances${instruments?` including ${instruments}`:''}. ${choir?`Use distinct natural human choir singers for ${choir}.`:''} ${vocals.length&&!choir?'Use a natural human lead singer.':''} Preserve separation and clarity between parts. ${lyrics?`Sing these exact supplied lyrics where written:\n${lyrics}`:'If no lyrics are provided, keep vocal parts on neutral sustained syllables such as ah or oo.'} No audience, no spoken introduction.`.slice(0,4100);
  }

  const part=parts[0];
  if(part.isVocal||part.choirRole){
    return `Create an isolated studio-quality vocal performance of ONLY ${partLabel(part)}. ${singerDescription(part)}, believable and expressive with natural breath, diction, phrasing and restrained vibrato. NO instruments, NO backing track, NO extra singers, NO harmonies unless they are explicitly written into this one part. ${common} ${lyrics?`Sing these exact supplied lyrics:\n${lyrics}`:'Use a neutral sustained vowel such as ah when no lyric is written.'} Keep the vocal dry and clean for later mixing.`.slice(0,4100);
  }

  return `Create an isolated studio-quality performance of ONLY this instrument part: ${part.instrument||part.name}. Use a convincing real-instrument sound and natural articulation appropriate to the instrument. NO vocals and NO other instruments. ${common} Keep the track clean and dry enough to use as an individual stem in a mix.`.slice(0,4100);
}

async function responseJson(response:Response, fallback:string){
  const raw=await response.text();
  if(!raw)return {};
  try{return JSON.parse(raw)}catch{
    if(response.status===504)return {error:'That analysis took too long. Please try again; larger scores can take several minutes.'};
    return {error:raw.slice(0,350)||fallback};
  }
}

async function productionRender(score:Score,parts:ScorePart[],full:boolean,analysisPlan='',vocalRange='Baritone'){
  const basePrompt=productionPrompt(score,parts,full);
  const requiredSettings=pieMandatorySettings(score,parts,analysisPlan,vocalRange);
  const prompt=requiredSettings+'\n\n'+basePrompt;
  const vocal=parts.some(part=>part.isVocal||part.choirRole);
  const response=await fetch('/api/elevenlabs/generate',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      prompt,
      music_length_ms:durationFor(score,parts),
      force_instrumental:!vocal,
    }),
  });
  if(!response.ok){
    const data=await responseJson(response,'Production render failed.');
    throw new Error(data?.error||'Production render failed.');
  }
  const blob=await response.blob();
  if(!blob.size)throw new Error('Production renderer returned an empty audio file.');
  const type=(blob.type||'audio/mpeg').toLowerCase();
  return {blob,extension:type.includes('wav')?'wav':'mp3'};
}

export default function SheetImportTools({analysisPlan='',vocalRange='Baritone'}:{analysisPlan?:string;vocalRange?:string}){
  const scoreInput=useRef<HTMLInputElement>(null);
  const mediaInput=useRef<HTMLInputElement>(null);
  const chooserRef=useRef<HTMLDivElement>(null);
  const renderResultsRef=useRef<HTMLDivElement>(null);
  const [score,setScore]=useState<Score|null>(null);
  const [scoreStatus,setScoreStatus]=useState('');
  const [scoreBusy,setScoreBusy]=useState(false);
  const [selected,setSelected]=useState<Record<number,boolean>>({});
  const [fullArrangement,setFullArrangement]=useState(false);
  const [renders,setRenders]=useState<RenderedPart[]>([]);
  const [renderBusy,setRenderBusy]=useState(false);
  const [showRenderConfirm,setShowRenderConfirm]=useState(false);
  const [confirmKey,setConfirmKey]=useState('');
  const [confirmBpm,setConfirmBpm]=useState(100);
  const [confirmTimeSignature,setConfirmTimeSignature]=useState('4/4');
  const [confirmVocalRange,setConfirmVocalRange]=useState(vocalRange||'Baritone');
  const [confirmRenderMode,setConfirmRenderMode]=useState('Hybrid');
  const [savedSongId,setSavedSongId]=useState('');
  const [link,setLink]=useState('');
  const [linkStatus,setLinkStatus]=useState('');
  const [linkBusy,setLinkBusy]=useState(false);
  const [stemJob,setStemJob]=useState('');
  const [stemReady,setStemReady]=useState(false);
  const [linkJobs,setLinkJobs]=useState<Record<string,string>>({});
  const [linkStatuses,setLinkStatuses]=useState<Record<string,string>>({});
  const [linkChords,setLinkChords]=useState<Array<[number,number,string]>>([]);
  const [linkStemStarted,setLinkStemStarted]=useState(false);
  const [linkSourceName,setLinkSourceName]=useState('');
  const [linkSessionId,setLinkSessionId]=useState('');
  const [linkOutputs,setLinkOutputs]=useState({stems:true,fullSheet:true,partSheets:false,chords:true});

  const choirParts=useMemo(()=>score?.parts.map((part,index)=>({part,index})).filter(({part})=>Boolean(part.choirRole))||[],[score]);
  const vocalParts=useMemo(()=>score?.parts.map((part,index)=>({part,index})).filter(({part})=>part.isVocal&&!part.choirRole)||[],[score]);
  const instrumentParts=useMemo(()=>score?.parts.map((part,index)=>({part,index})).filter(({part})=>!part.isVocal&&!part.choirRole)||[],[score]);

  useEffect(()=>()=>{for(const item of renders)URL.revokeObjectURL(item.url)},[renders]);

  useEffect(()=>{
    const useAnalyzedScore=(next:Score|null)=>{
      if(!next||!Array.isArray(next.parts)||!next.parts.length)return;
      setScore(next); setRenders([]); setSelected({}); setFullArrangement(false); setSavedSongId('');
      setScoreStatus('Score already analyzed. Choose the parts you want to render — no second upload needed.');
      setTimeout(()=>chooserRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),140);
    };
    try{
      const saved=sessionStorage.getItem('pie-last-analyzed-score');
      if(saved)useAnalyzedScore(JSON.parse(saved) as Score);
    }catch{}
    const onAnalyzed=(event:Event)=>useAnalyzedScore((event as CustomEvent<Score>).detail||null);
    window.addEventListener('pie-score-analyzed',onAnalyzed);
    return()=>window.removeEventListener('pie-score-analyzed',onAnalyzed);
  },[]);

  async function analyzeScore(file:File){
    setScoreBusy(true); setScoreStatus('Preparing music sheets for secure upload…'); setScore(null); setRenders([]); setSelected({}); setFullArrangement(false);
    try{
      if(file.size>20*1024*1024) throw new Error('Music-sheet files must be 20 MB or smaller.');
      const stagedPath=await stagePieFile(file,percent=>setScoreStatus('Uploading music sheets… '+percent+'%'));
      setScoreStatus('Reading notes, lyrics, instruments, and choir parts…');
      const r=await fetch('/api/sheets/import-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'application/pdf'})}); const d=await readApiResponse(r);
      setScore(d.score as Score); setScoreStatus('Score analyzed. What parts do you want to render?');
    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not read music sheets.')}finally{setScoreBusy(false)}
  }

  function toggle(index:number){setSelected(prev=>({...prev,[index]:!prev[index]}));}

  function openRenderConfirmation(){
    if(!score)return;
    const modeMatch=analysisPlan.match(/Render mode:\s*(Real Performance|Note-Perfect|Hybrid)/i);
    setConfirmKey(score.key||'C Major');
    setConfirmBpm(Math.max(35,Math.min(240,Math.round(Number(score.tempo)||100))));
    setConfirmTimeSignature(score.timeSignature||'4/4');
    setConfirmVocalRange(vocalRange||'Baritone');
    setConfirmRenderMode(modeMatch?.[1]||'Hybrid');
    setShowRenderConfirm(true);
    setScoreStatus('Review the final settings below. Nothing will render until you confirm them.');
  }

  async function renderSelected(confirmed?:ConfirmedRenderSettings){
    if(!score)return;
    const renderScore:Score={...score,key:confirmed?.key||score.key,tempo:confirmed?.bpm||score.tempo,timeSignature:confirmed?.timeSignature||score.timeSignature};
    const renderVocalRange=confirmed?.vocalRange||vocalRange;
    const renderPlan=`${analysisPlan}${confirmed?.renderMode?`\nFINAL CONFIRMED RENDER MODE: ${confirmed.renderMode}`:''}`;
    const indexes=Object.keys(selected).map(Number).filter(i=>selected[i]);
    if(!fullArrangement&&!indexes.length){setScoreStatus('Choose at least one part or Full Arrangement.');return}
    setRenderBusy(true);
    let librarySaveNote='';
    try{
      for(const item of renders)URL.revokeObjectURL(item.url);
      const next:RenderedPart[]=[];
      let completed=0;
      const total=indexes.length+(fullArrangement?1:0);

      for(const index of indexes){
        const part=renderScore.parts[index]; if(!part)continue;
        setScoreStatus(`Creating realistic ${partLabel(part)} performance… ${completed+1} of ${total}`);
        const result=await productionRender(renderScore,[part],false,renderPlan,renderVocalRange);
        next.push({key:`part-${index}`,label:partLabel(part),blob:result.blob,url:URL.createObjectURL(result.blob),extension:result.extension});
        completed+=1;
        setRenders([...next]);
      }

      if(fullArrangement){
        const parts=indexes.length?indexes.map(i=>renderScore.parts[i]).filter(Boolean):renderScore.parts;
        setScoreStatus(`Creating full studio arrangement… ${completed+1} of ${total}`);
        const result=await productionRender(renderScore,parts,true,renderPlan,renderVocalRange);
        next.unshift({key:'full',label:'Full Arrangement',blob:result.blob,url:URL.createObjectURL(result.blob),extension:result.extension});
        setRenders([...next]);
        try{
          const vocal=parts.some(part=>part.isVocal||part.choirRole);
          const lyrics=(parts.filter(part=>part.isVocal||part.choirRole).map(part=>part.lyrics||'').filter(Boolean).join('\n')||renderScore.lyrics||'').trim();
          const saved=await saveVersion({
            songId:savedSongId||undefined,
            title:renderScore.title||'Untitled Song',
            prompt:renderPlan.trim()||'Rendered automatically from imported music sheets.',
            mode:'music',
            vocalRange:renderVocalRange,
            durationMs:durationFor(renderScore,parts),
            instrumental:!vocal,
            lyrics:lyrics||undefined,
            generatedBlob:result.blob,
            masterBlob:result.blob,
          });
          setSavedSongId(saved.song.id);
          librarySaveNote=' Saved automatically to Songs.';
        }catch{
          librarySaveNote=' The render finished, but Pie could not save the copy to Songs.';
        }
      }

      setScoreStatus(`Production render complete.${librarySaveNote}`);
      setTimeout(()=>renderResultsRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),180);
    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not render selected parts.')}finally{setRenderBusy(false)}
  }

  async function beginLinkProcessing(payload:Record<string,unknown>){
    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkJobs({}); setLinkStatuses({}); setLinkChords([]); setLinkStemStarted(false); setLinkStatus('Starting selected analysis…');
    try{
      const r=await fetch('/api/sheets/link-process',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      const d=await responseJson(r,'Could not analyze this music source.');
      if(!r.ok) throw new Error(d.error||'Could not analyze this music source.');
      const next=(d.jobs||{}) as Record<string,string>;
      const id=crypto.randomUUID();
      setLinkSessionId(id); setLinkSourceName(String(d.sourceLabel||payload.name||'Music link')); setLinkJobs(next); setStemJob(String(next.separation||''));
      setLinkStatus('Turning up the heat…');
    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}
  }

  async function analyzeLink(){
    if(!link.trim()){setLinkStatus('Paste a music link first.');return}
    if(!linkOutputs.stems&&!linkOutputs.fullSheet&&!linkOutputs.partSheets&&!linkOutputs.chords){setLinkStatus('Choose at least one output first.');return}
    await beginLinkProcessing({url:link.trim(),outputs:linkOutputs});
  }

  async function analyzeMedia(file:File){
    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkStatus('Preparing media for secure upload…');
    try{
      if(file.size>45*1024*1024) throw new Error('Audio/video files must be 45 MB or smaller.');
      const stagedPath=await stagePieFile(file,percent=>setLinkStatus('Uploading media… '+percent+'%'));
      setLinkStatus('Starting six-part stem analysis…');
      const r=await fetch('/api/sheets/link-stems',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'application/octet-stream'})}); const d=await readApiResponse(r);
      setStemJob(String(d.jobId)); setLinkStatus('Separating vocals, drums, bass, guitar, keys, and other instruments…');
    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}
  }

  useEffect(()=>{
    if(!Object.keys(linkJobs).length)return;
    let dead=false;
    const startStem=async(stem:string)=>{
      const r=await fetch('/api/sheets/transcribe',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'stem',stem,separationJobId:linkJobs.separation})});
      const d=await responseJson(r,'Could not start stem notation.');
      if(!r.ok)throw new Error(d.error||'Could not start stem notation.');
      return String(d.jobId||'');
    };
    const poll=async()=>{
      try{
        const r=await fetch('/api/sheets/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs:linkJobs})});
        const d=await responseJson(r,'Could not check transcription status.');
        if(!r.ok)throw new Error(d.error||'Could not check transcription status.');
        if(dead)return;
        const nextStatuses=(d.statuses||{}) as Record<string,string>;
        setLinkStatuses(nextStatuses);
        if(Array.isArray(d.chords))setLinkChords(d.chords);
        if(nextStatuses.separation==='COMPLETED')setStemReady(true);

        if(linkOutputs.partSheets&&nextStatuses.separation==='COMPLETED'&&!linkStemStarted&&linkJobs.separation){
          setLinkStemStarted(true); setLinkStatus('Turning up the heat…');
          const mapping:[string,string][]=[['vocals','lead'],['drums','drums'],['bass','bass'],['guitar','guitar'],['piano','keys']];
          const results=await Promise.allSettled(mapping.map(([stem])=>startStem(stem)));
          if(dead)return;
          const additions:Record<string,string>={};
          results.forEach((result,index)=>{if(result.status==='fulfilled'&&result.value)additions[mapping[index][1]]=result.value;});
          setLinkJobs(prev=>({...prev,...additions}));
          setLinkStatus('Individual part notation is processing…');
          return;
        }

        const relevant=Object.keys(linkJobs).filter(key=>key!=='separation'||linkOutputs.stems||linkOutputs.partSheets);
        const allReady=relevant.length>0&&relevant.every(key=>nextStatuses[key]==='COMPLETED');
        if(allReady&&!linkOutputs.partSheets)setLinkStatus('Done — your selected analysis is ready below.');
      }catch(e){if(!dead)setLinkStatus(e instanceof Error?e.message:'Could not check transcription status.')}
    };
    void poll(); const t=setInterval(()=>void poll(),4000); return()=>{dead=true;clearInterval(t)};
  },[linkJobs,linkStemStarted,linkOutputs.partSheets,linkOutputs.stems]);

  useEffect(()=>{
    if(!linkSessionId||!linkSourceName||!Object.keys(linkJobs).length)return;
    try{
      const key='pie-sheets-stems-library-v1';
      const now=Date.now();
      const existing=JSON.parse(localStorage.getItem(key)||'[]');
      const list=Array.isArray(existing)?existing:[];
      const old=list.find((item:any)=>item?.id===linkSessionId);
      const entry={id:linkSessionId,sourceName:linkSourceName,createdAt:old?.createdAt||now,updatedAt:now,jobs:linkJobs,statuses:linkStatuses,chords:linkChords,status:linkStatus,stemStarted:linkStemStarted,outputs:linkOutputs};
      const next=[entry,...list.filter((item:any)=>item?.id!==linkSessionId)].slice(0,20);
      localStorage.setItem(key,JSON.stringify(next));
      localStorage.setItem('pie-sheets-stems-active-v1',linkSessionId);
      window.dispatchEvent(new Event('pie-sheets-stems-library-changed'));
    }catch{}
  },[linkSessionId,linkSourceName,linkJobs,linkStatuses,linkChords,linkStatus,linkStemStarted,linkOutputs]);

  function resetSheetChoices() {
    if (scoreBusy || renderBusy || linkBusy) return;
    for (const item of renders) URL.revokeObjectURL(item.url);
    setSelected({});
    setFullArrangement(false);
    setRenders([]);
    setShowRenderConfirm(false);
    setConfirmKey(score?.key || '');
    setConfirmBpm(Math.max(35, Math.min(240, Math.round(Number(score?.tempo) || 100))));
    setConfirmTimeSignature(score?.timeSignature || '4/4');
    setConfirmVocalRange(vocalRange || 'Baritone');
    setConfirmRenderMode('Hybrid');
    setSavedSongId('');
    setLinkOutputs({stems:true,fullSheet:true,partSheets:false,chords:true});
    setScoreStatus('Sheet render choices reset. The analyzed score, active processing jobs, and saved Songs were kept.');
  }

  const chooser=(items:Array<{part:ScorePart;index:number}>)=>items.map(({part,index})=><button type="button" key={index} className={selected[index]?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>toggle(index)} style={{minHeight:72}}><span className="sheetExportIcon">{part.choirRole?'🎶':part.isVocal?'🎤':'🎼'}</span><span><strong>{partLabel(part)}</strong><small>{part.instrument}{part.lyrics?' · lyrics detected':''}</small></span><b>{selected[index]?'✓':'+'}</b></button>);

  return <div className="sheetImportTools noPrint" style={{paddingBottom:150}}>
    <div className="sheetSourceCard" style={{display:'none'}} aria-hidden="true">
      <p className="eyebrow">Sheet → Song</p><h2>{score?'Analyzed Score Ready':'Upload Music Sheets'}</h2>
      <p className="sub">{score?'Pie already has this analyzed score. Choose the parts below and render — you do not need to upload it again.':'Upload a PDF, photo, MusicXML, or XML score. Pie reads the written parts first, then asks what you want rendered before creating any audio.'}</p>
      <input ref={scoreInput} type="file" hidden accept=".pdf,.xml,.musicxml,image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void analyzeScore(f);e.currentTarget.value='';}} />
      <button type="button" className="primary" disabled={scoreBusy} onClick={()=>scoreInput.current?.click()}>{scoreBusy?'Reading score…':score?'Analyze a Different Score':'⬆ Upload Music Sheets'}</button>
      {scoreStatus&&<div className="statusBox">{scoreStatus}</div>}
      {score&&<div className="scorePartChooser" ref={chooserRef} style={{paddingBottom:120,scrollMarginTop:18}}>
        <div className="sheetHeader"><div><p className="sheetBrand">DETECTED SCORE</p><h3>{score.title}</h3><small>{score.key||'Key unknown'} · {score.tempo} BPM · {score.timeSignature||'4/4'}</small></div></div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><h3>What parts do you want to render?</h3><button type="button" className="secondary" onClick={resetSheetChoices} disabled={scoreBusy||renderBusy||linkBusy}>↺ Reset choices</button></div>
        {choirParts.length>0&&<><p className="eyebrow">Choir</p><div className="sheetExportGrid">{chooser(choirParts)}</div></>}
        {vocalParts.length>0&&<><p className="eyebrow">Vocals</p><div className="sheetExportGrid">{chooser(vocalParts)}</div></>}
        {instrumentParts.length>0&&<><p className="eyebrow">Instruments</p><div className="sheetExportGrid">{chooser(instrumentParts)}</div></>}
        <p className="eyebrow">Mix</p>
        <button type="button" className={fullArrangement?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setFullArrangement(v=>!v)} style={{minHeight:76}}><span className="sheetExportIcon">🎧</span><span><strong>Full Arrangement</strong><small>Combine the selected parts into a realistic studio performance. If no individual parts are selected, use the whole score.</small></span><b>{fullArrangement?'✓':'+'}</b></button>
        <button type="button" className="primary" disabled={renderBusy} onClick={openRenderConfirmation} style={{marginTop:16}}>{renderBusy?'⏳ Rendering…':'Review & Render'}</button>
        {showRenderConfirm&&score&&<div className="sheetSourceCard" style={{marginTop:14,border:'1px solid rgba(255,255,255,.18)'}}>
          <p className="eyebrow">Final Render Confirmation</p>
          <h3 style={{marginTop:4}}>Confirm exactly what Pie will render</h3>
          <p className="sub">Change anything you want here. These final values override the analyzed defaults.</p>
          <div style={{display:'grid',gap:12,gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))'}}>
            <label><small>Key</small><input value={confirmKey} onChange={e=>setConfirmKey(e.target.value)} placeholder="G Major"/></label>
            <label><small>BPM</small><div style={{display:'flex',gap:6,alignItems:'center'}}><button type="button" onClick={()=>setConfirmBpm(v=>Math.max(35,v-5))}>−5</button><input type="number" min={35} max={240} value={confirmBpm} onChange={e=>setConfirmBpm(Math.max(35,Math.min(240,Number(e.target.value)||35)))} style={{minWidth:72}}/><button type="button" onClick={()=>setConfirmBpm(v=>Math.min(240,v+5))}>+5</button></div></label>
            <label><small>Time Signature</small><select value={confirmTimeSignature} onChange={e=>setConfirmTimeSignature(e.target.value)}><option>4/4</option><option>3/4</option><option>6/8</option><option>12/8</option><option>2/4</option><option>5/4</option><option>7/8</option></select></label>
            <label><small>Lead Vocal Range</small><select value={confirmVocalRange} onChange={e=>setConfirmVocalRange(e.target.value)}><option>Bass</option><option>Baritone</option><option>Tenor</option><option>Alto</option><option>Soprano</option></select></label>
            <label><small>Render Mode</small><select value={confirmRenderMode} onChange={e=>setConfirmRenderMode(e.target.value)}><option>Real Performance</option><option>Note-Perfect</option><option>Hybrid</option></select></label>
          </div>
          <div style={{marginTop:14}}>
            <small>Parts to Render</small>
            <div style={{display:'grid',gap:8,marginTop:7}}>{score.parts.map((part,index)=><button type="button" key={'confirm-'+index} className={selected[index]?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>toggle(index)} style={{minHeight:54}}><span><strong>{partLabel(part)}</strong><small>{part.instrument||'Vocal'}</small></span><b>{selected[index]?'✓':'+'}</b></button>)}</div>
          </div>
          <button type="button" className={fullArrangement?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setFullArrangement(v=>!v)} style={{minHeight:62,marginTop:12}}><span><strong>Full Arrangement</strong><small>{fullArrangement?'Included in final render':'Tap to include the complete mix'}</small></span><b>{fullArrangement?'✓':'+'}</b></button>
          <div className="statusBox" style={{marginTop:12}}><strong>Final settings</strong><small style={{display:'block',marginTop:4}}>{confirmKey} · {confirmBpm} BPM · {confirmTimeSignature} · {confirmVocalRange} · {confirmRenderMode}</small></div>
          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
            <button type="button" onClick={()=>setShowRenderConfirm(false)}>Back</button>
            <button type="button" className="primary" disabled={renderBusy||(!fullArrangement&&!Object.keys(selected).some(i=>selected[Number(i)]))} onClick={()=>{setShowRenderConfirm(false);void renderSelected({key:confirmKey.trim()||score.key||'C Major',bpm:confirmBpm,timeSignature:confirmTimeSignature,vocalRange:confirmVocalRange,renderMode:confirmRenderMode})}}>Confirm & Render</button>
          </div>
        </div>}
        {renderBusy&&<div className="statusBox" style={{marginTop:10}}><strong>Rendering your selected score now…</strong><small style={{display:'block',marginTop:4}}>{scoreStatus||'Pie is creating the performance. Keep this page open.'}</small></div>}
      </div>}
      {renders.length>0&&<div ref={renderResultsRef} className="renderedPartList" style={{scrollMarginTop:24}}>{renders.map(item=><div className="sheetSourceCard" key={item.key}><strong>{item.label}</strong><small>Production render</small><audio controls preload="metadata" src={item.url}/><a className="primary" href={item.url} download={`${(score?.title||'song').replace(/[^a-z0-9]+/gi,'-')}-${item.label.replace(/[^a-z0-9]+/gi,'-')}.${item.extension}`}>Download {item.extension.toUpperCase()}</a></div>)}</div>}
    </div>

    <PlaybackRecorderCard />

    <SavedSheetsStemsLibrary />

  </div>;
}
