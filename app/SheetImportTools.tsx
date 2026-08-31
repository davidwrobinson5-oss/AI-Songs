'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { stagePieFile } from './stagedUpload';

type ScoreNote = { midi:number; startBeat:number; durationBeats:number; velocity:number };
type ScorePart = { name:string; instrument:string; isVocal:boolean; choirRole?:string; lyrics?:string; notes:ScoreNote[] };
type Score = { title:string; composer?:string; tempo:number; key?:string; timeSignature?:string; style?:string; lyrics?:string; parts:ScorePart[]; noteCount:number };
type RenderedPart = { key:string; label:string; blob:Blob; url:string; extension:string };

const STEMS = [
  ['vocals','🎤','Vocals'],
  ['drums','🥁','Drums'],
  ['bass','🎸','Instrument Bass'],
  ['guitar','🎸','Guitar'],
  ['piano','🎹','Keys / Piano'],
  ['other','🎻','Other Instruments'],
] as const;

const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];

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

async function productionRender(score:Score,parts:ScorePart[],full:boolean){
  const prompt=productionPrompt(score,parts,full);
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

export default function SheetImportTools(){
  const scoreInput=useRef<HTMLInputElement>(null);
  const mediaInput=useRef<HTMLInputElement>(null);
  const chooserRef=useRef<HTMLDivElement>(null);
  const [score,setScore]=useState<Score|null>(null);
  const [scoreStatus,setScoreStatus]=useState('');
  const [scoreBusy,setScoreBusy]=useState(false);
  const [selected,setSelected]=useState<Record<number,boolean>>({});
  const [fullArrangement,setFullArrangement]=useState(false);
  const [renders,setRenders]=useState<RenderedPart[]>([]);
  const [renderBusy,setRenderBusy]=useState(false);
  const [link,setLink]=useState('');
  const [linkStatus,setLinkStatus]=useState('');
  const [linkBusy,setLinkBusy]=useState(false);
  const [stemJob,setStemJob]=useState('');
  const [stemReady,setStemReady]=useState(false);

  const choirParts=useMemo(()=>score?.parts.map((part,index)=>({part,index})).filter(({part})=>Boolean(part.choirRole))||[],[score]);
  const vocalParts=useMemo(()=>score?.parts.map((part,index)=>({part,index})).filter(({part})=>part.isVocal&&!part.choirRole)||[],[score]);
  const instrumentParts=useMemo(()=>score?.parts.map((part,index)=>({part,index})).filter(({part})=>!part.isVocal&&!part.choirRole)||[],[score]);

  useEffect(()=>()=>{for(const item of renders)URL.revokeObjectURL(item.url)},[renders]);

  async function analyzeScore(file:File){
    setScoreBusy(true); setScoreStatus('Preparing music sheets for secure upload…'); setScore(null); setRenders([]); setSelected({}); setFullArrangement(false);
    try{
      if(file.size>20*1024*1024) throw new Error('Music-sheet files must be 20 MB or smaller.');
      const stagedPath=await stagePieFile(file,percent=>setScoreStatus('Uploading music sheets… '+percent+'%'));
      setScoreStatus('Reading notes, lyrics, instruments, and choir parts…');
      const r=await fetch('/api/sheets/import-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'application/pdf'})});
      const d=await responseJson(r,'Could not read music sheets.');
      if(!r.ok) throw new Error(d.error||'Could not read music sheets.');
      setScore(d.score as Score); setScoreStatus('Score analyzed. Choose the parts you want, then render them with realistic instruments and singers.');
      setTimeout(()=>chooserRef.current?.scrollIntoView({behavior:'smooth',block:'start'}),120);
    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not read music sheets.')}finally{setScoreBusy(false)}
  }

  function toggle(index:number){setSelected(prev=>({...prev,[index]:!prev[index]}));}

  async function renderSelected(){
    if(!score)return;
    const indexes=Object.keys(selected).map(Number).filter(i=>selected[i]);
    if(!fullArrangement&&!indexes.length){setScoreStatus('Choose at least one part or Full Arrangement.');return}
    setRenderBusy(true);
    try{
      for(const item of renders)URL.revokeObjectURL(item.url);
      const next:RenderedPart[]=[];
      let completed=0;
      const total=indexes.length+(fullArrangement?1:0);

      for(const index of indexes){
        const part=score.parts[index]; if(!part)continue;
        setScoreStatus(`Creating realistic ${partLabel(part)} performance… ${completed+1} of ${total}`);
        const result=await productionRender(score,[part],false);
        next.push({key:`part-${index}`,label:partLabel(part),blob:result.blob,url:URL.createObjectURL(result.blob),extension:result.extension});
        completed+=1;
        setRenders([...next]);
      }

      if(fullArrangement){
        const parts=indexes.length?indexes.map(i=>score.parts[i]).filter(Boolean):score.parts;
        setScoreStatus(`Creating full studio arrangement… ${completed+1} of ${total}`);
        const result=await productionRender(score,parts,true);
        next.unshift({key:'full',label:'Full Arrangement',blob:result.blob,url:URL.createObjectURL(result.blob),extension:result.extension});
        setRenders([...next]);
      }

      setScoreStatus('Production render complete. These are realistic performance renders of the written parts.');
    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not render selected parts.')}finally{setRenderBusy(false)}
  }

  async function beginStemAnalysis(body:BodyInit,headers?:HeadersInit){
    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkStatus('Starting six-part stem analysis…');
    try{
      const r=await fetch('/api/sheets/link-stems',{method:'POST',headers,body}); const d=await responseJson(r,'Could not analyze this music source.');
      if(!r.ok) throw new Error(d.error||'Could not analyze this music source.');
      setStemJob(String(d.jobId)); setLinkStatus('Separating vocals, drums, bass, guitar, keys, and other instruments…');
    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}
  }

  async function analyzeLink(){
    if(!link.trim()){setLinkStatus('Paste a music link first.');return}
    await beginStemAnalysis(JSON.stringify({url:link.trim()}),{'Content-Type':'application/json'});
  }

  async function analyzeMedia(file:File){
    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkStatus('Preparing media for secure upload…');
    try{
      if(file.size>45*1024*1024) throw new Error('Audio/video files must be 45 MB or smaller.');
      const stagedPath=await stagePieFile(file,percent=>setLinkStatus('Uploading media… '+percent+'%'));
      setLinkStatus('Starting six-part stem analysis…');
      const r=await fetch('/api/sheets/link-stems',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'application/octet-stream'})});
      const d=await responseJson(r,'Could not analyze this music source.');
      if(!r.ok) throw new Error(d.error||'Could not analyze this music source.');
      setStemJob(String(d.jobId)); setLinkStatus('Separating vocals, drums, bass, guitar, keys, and other instruments…');
    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}
  }

  useEffect(()=>{
    if(!stemJob||stemReady)return;
    let dead=false;
    const poll=async()=>{
      try{
        const r=await fetch('/api/sheets/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs:{separation:stemJob}})}); const d=await responseJson(r,'Could not check stem status.');
        if(!r.ok)throw new Error(d.error||'Could not check stem status.');
        const state=String(d.statuses?.separation||'');
        if(state==='COMPLETED'){if(!dead){setStemReady(true);setLinkStatus('Stem separation complete.');}}
        else if(state==='FAILED'){if(!dead)setLinkStatus('Stem separation failed. Try another source.');}
        else if(!dead)setLinkStatus('Separating vocals, drums, bass, guitar, keys, and other instruments…');
      }catch(e){if(!dead)setLinkStatus(e instanceof Error?e.message:'Could not check stem status.')}
    };
    void poll(); const t=setInterval(poll,4000); return()=>{dead=true;clearInterval(t)};
  },[stemJob,stemReady]);

  const chooser=(items:Array<{part:ScorePart;index:number}>)=>items.map(({part,index})=><button type="button" key={index} className={selected[index]?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>toggle(index)} style={{minHeight:72}}><span className="sheetExportIcon">{part.choirRole?'🎶':part.isVocal?'🎤':'🎼'}</span><span><strong>{partLabel(part)}</strong><small>{part.instrument}{part.lyrics?' · lyrics detected':''}</small></span><b>{selected[index]?'✓':'+'}</b></button>);

  return <div className="sheetImportTools noPrint" style={{paddingBottom:150}}>
    <div className="sheetSourceCard">
      <p className="eyebrow">Sheet → Song</p><h2>Upload Music Sheets</h2>
      <p className="sub">Upload a PDF, photo, MusicXML, or XML score. Pie reads the written parts first, then asks what you want rendered before creating any audio.</p>
      <input ref={scoreInput} type="file" hidden accept=".pdf,.xml,.musicxml,image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void analyzeScore(f);e.currentTarget.value='';}} />
      <button type="button" className="primary" disabled={scoreBusy} onClick={()=>scoreInput.current?.click()}>{scoreBusy?'Reading score…':'⬆ Upload Music Sheets'}</button>
      {scoreStatus&&<div className="statusBox">{scoreStatus}</div>}
      {score&&<div className="scorePartChooser" ref={chooserRef} style={{paddingBottom:120,scrollMarginTop:18}}>
        <div className="sheetHeader"><div><p className="sheetBrand">DETECTED SCORE</p><h3>{score.title}</h3><small>{score.key||'Key unknown'} · {score.tempo} BPM · {score.timeSignature||'4/4'}</small></div></div>
        <h3>What parts do you want to render?</h3>
        {choirParts.length>0&&<><p className="eyebrow">Choir</p><div className="sheetExportGrid">{chooser(choirParts)}</div></>}
        {vocalParts.length>0&&<><p className="eyebrow">Vocals</p><div className="sheetExportGrid">{chooser(vocalParts)}</div></>}
        {instrumentParts.length>0&&<><p className="eyebrow">Instruments</p><div className="sheetExportGrid">{chooser(instrumentParts)}</div></>}
        <p className="eyebrow">Mix</p>
        <button type="button" className={fullArrangement?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setFullArrangement(v=>!v)} style={{minHeight:76}}><span className="sheetExportIcon">🎧</span><span><strong>Full Arrangement</strong><small>Combine the selected parts into a realistic studio performance. If no individual parts are selected, use the whole score.</small></span><b>{fullArrangement?'✓':'+'}</b></button>
        <button type="button" className="primary" disabled={renderBusy} onClick={()=>void renderSelected()} style={{marginTop:16}}>{renderBusy?'Creating Real Performances…':'▶ Render Real Instruments & Singers'}</button>
      </div>}
      {renders.length>0&&<div className="renderedPartList">{renders.map(item=><div className="sheetSourceCard" key={item.key}><strong>{item.label}</strong><small>Production render</small><audio controls preload="metadata" src={item.url}/><a className="primary" href={item.url} download={`${(score?.title||'song').replace(/[^a-z0-9]+/gi,'-')}-${item.label.replace(/[^a-z0-9]+/gi,'-')}.${item.extension}`}>Download {item.extension.toUpperCase()}</a></div>)}</div>}
    </div>

    <div className="sheetSourceCard">
      <p className="eyebrow">Link → Stems</p><h2>Analyze Music Link</h2>
      <p className="sub">Paste a direct music/media link or upload an audio/video file. Pie separates the performance into six individual stems.</p>
      <div className="referenceUrlRow"><input value={link} onChange={e=>setLink(e.target.value)} placeholder="Paste music or YouTube link…" inputMode="url"/><button type="button" className="primary" disabled={linkBusy} onClick={()=>void analyzeLink()}>{linkBusy?'Analyzing…':'Analyze Link'}</button></div>
      <input ref={mediaInput} type="file" hidden accept="audio/*,video/*" onChange={e=>{const f=e.target.files?.[0];if(f)void analyzeMedia(f);e.currentTarget.value='';}}/>
      <button type="button" onClick={()=>mediaInput.current?.click()}>⬆ Upload Audio / Video Instead</button>
      {linkStatus&&<div className="statusBox">{linkStatus}</div>}
      {stemReady&&stemJob&&<div className="sheetExportGrid">{STEMS.map(([key,icon,label])=><div className="sheetExportCard" key={key}><span className="sheetExportIcon">{icon}</span><span><strong>{label}</strong><audio controls preload="none" src={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`}/><a href={`/api/sheets/stem/${encodeURIComponent(stemJob)}/${key}`} download={`${key}.wav`}>Download WAV</a></span></div>)}</div>}
    </div>
  </div>;
}
