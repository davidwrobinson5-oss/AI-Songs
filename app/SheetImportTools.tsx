'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type ScoreNote = { midi:number; startBeat:number; durationBeats:number; velocity:number };
type ScorePart = { name:string; instrument:string; isVocal:boolean; choirRole?:string; lyrics?:string; notes:ScoreNote[] };
type Score = { title:string; composer?:string; tempo:number; key?:string; timeSignature?:string; style?:string; lyrics?:string; parts:ScorePart[]; noteCount:number };
type RenderedPart = { key:string; label:string; blob:Blob; url:string };

const STEMS = [
  ['vocals','🎤','Vocals'],
  ['drums','🥁','Drums'],
  ['bass','🎸','Instrument Bass'],
  ['guitar','🎸','Guitar'],
  ['piano','🎹','Keys / Piano'],
  ['other','🎻','Other Instruments'],
] as const;

function partLabel(part: ScorePart) {
  const role = String(part.choirRole || '').toLowerCase();
  if (role === 'soprano') return 'Soprano';
  if (role === 'alto') return 'Alto';
  if (role === 'tenor') return 'Tenor';
  if (role === 'bass') return 'Choir Bass';
  return part.name || part.instrument || 'Part';
}

function renderTone(osc: OscillatorNode, part: ScorePart) {
  const text = `${part.instrument} ${part.name} ${part.choirRole || ''}`.toLowerCase();
  if (part.isVocal || part.choirRole) osc.type = 'sine';
  else if (text.includes('bass')) osc.type = 'square';
  else if (text.includes('guitar')) osc.type = 'triangle';
  else if (text.includes('drum') || text.includes('percussion')) osc.type = 'square';
  else osc.type = 'triangle';
}

function wavFromAudioBuffer(buffer: AudioBuffer) {
  const samples = buffer.getChannelData(0);
  const out = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(out);
  const write = (offset:number, text:string) => { for (let i=0;i<text.length;i++) view.setUint8(offset+i,text.charCodeAt(i)); };
  write(0,'RIFF'); view.setUint32(4,36+samples.length*2,true); write(8,'WAVE'); write(12,'fmt ');
  view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,buffer.sampleRate,true);
  view.setUint32(28,buffer.sampleRate*2,true); view.setUint16(32,2,true); view.setUint16(34,16,true); write(36,'data'); view.setUint32(40,samples.length*2,true);
  let offset=44;
  for (let i=0;i<samples.length;i++,offset+=2) {
    const s=Math.max(-1,Math.min(1,samples[i]));
    view.setInt16(offset,s<0?s*0x8000:s*0x7fff,true);
  }
  return new Blob([out],{type:'audio/wav'});
}

async function synthesize(score:Score, parts:ScorePart[]) {
  const bpm=Math.max(35,Math.min(240,Number(score.tempo)||100));
  const beatSeconds=60/bpm;
  let maxBeat=0;
  for(const part of parts) for(const note of part.notes) maxBeat=Math.max(maxBeat,note.startBeat+note.durationBeats);
  const duration=Math.min(600,Math.max(1,maxBeat*beatSeconds+1));
  const sampleRate=22050;
  const ctx=new OfflineAudioContext(1,Math.ceil(duration*sampleRate),sampleRate);
  const master=ctx.createGain(); master.gain.value=Math.min(.65,Math.max(.12,.55/Math.sqrt(Math.max(1,parts.length)))); master.connect(ctx.destination);
  for(const part of parts){
    for(const note of part.notes){
      const start=note.startBeat*beatSeconds;
      if(start>=duration) continue;
      const stop=Math.min(duration,start+Math.max(.04,note.durationBeats*beatSeconds*.96));
      const osc=ctx.createOscillator(); renderTone(osc,part); osc.frequency.value=440*Math.pow(2,(note.midi-69)/12);
      const gain=ctx.createGain(); const amp=Math.min(.22,Math.max(.025,(note.velocity||.7)*.12));
      gain.gain.setValueAtTime(0,start); gain.gain.linearRampToValueAtTime(amp,Math.min(stop,start+.018)); gain.gain.setValueAtTime(amp,Math.max(start+.018,stop-.035)); gain.gain.linearRampToValueAtTime(0,stop);
      osc.connect(gain); gain.connect(master); osc.start(start); osc.stop(stop+.01);
    }
  }
  return wavFromAudioBuffer(await ctx.startRendering());
}

export default function SheetImportTools(){
  const scoreInput=useRef<HTMLInputElement>(null);
  const mediaInput=useRef<HTMLInputElement>(null);
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
    setScoreBusy(true); setScoreStatus('Reading notes, lyrics, instruments, and choir parts…'); setScore(null); setRenders([]); setSelected({}); setFullArrangement(false);
    try{
      const fd=new FormData(); fd.append('file',file);
      const r=await fetch('/api/sheets/import-score',{method:'POST',body:fd}); const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not read music sheets.');
      setScore(d.score as Score); setScoreStatus('Score analyzed. What parts do you want to render?');
    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not read music sheets.')}finally{setScoreBusy(false)}
  }

  function toggle(index:number){setSelected(prev=>({...prev,[index]:!prev[index]}));}

  async function renderSelected(){
    if(!score)return;
    const indexes=Object.keys(selected).map(Number).filter(i=>selected[i]);
    if(!fullArrangement&&!indexes.length){setScoreStatus('Choose at least one part or Full Arrangement.');return}
    setRenderBusy(true); setScoreStatus('Rendering the selected written parts…');
    try{
      for(const item of renders)URL.revokeObjectURL(item.url);
      const next:RenderedPart[]=[];
      for(const index of indexes){
        const part=score.parts[index]; if(!part)continue;
        const blob=await synthesize(score,[part]); next.push({key:`part-${index}`,label:partLabel(part),blob,url:URL.createObjectURL(blob)});
      }
      if(fullArrangement){
        const parts=indexes.length?indexes.map(i=>score.parts[i]).filter(Boolean):score.parts;
        const blob=await synthesize(score,parts); next.unshift({key:'full',label:'Full Arrangement',blob,url:URL.createObjectURL(blob)});
      }
      setRenders(next); setScoreStatus('Selected parts rendered. You can play or download each one below.');
    }catch(e){setScoreStatus(e instanceof Error?e.message:'Could not render selected parts.')}finally{setRenderBusy(false)}
  }

  async function beginStemAnalysis(body:BodyInit,headers?:HeadersInit){
    setLinkBusy(true); setStemReady(false); setStemJob(''); setLinkStatus('Starting six-part stem analysis…');
    try{
      const r=await fetch('/api/sheets/link-stems',{method:'POST',headers,body}); const d=await r.json();
      if(!r.ok) throw new Error(d.error||'Could not analyze this music source.');
      setStemJob(String(d.jobId)); setLinkStatus('Separating vocals, drums, bass, guitar, keys, and other instruments…');
    }catch(e){setLinkStatus(e instanceof Error?e.message:'Could not analyze this music source.')}finally{setLinkBusy(false)}
  }

  async function analyzeLink(){
    if(!link.trim()){setLinkStatus('Paste a music link first.');return}
    await beginStemAnalysis(JSON.stringify({url:link.trim()}),{'Content-Type':'application/json'});
  }

  async function analyzeMedia(file:File){
    const fd=new FormData(); fd.append('file',file); await beginStemAnalysis(fd);
  }

  useEffect(()=>{
    if(!stemJob||stemReady)return;
    let dead=false;
    const poll=async()=>{
      try{
        const r=await fetch('/api/sheets/status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jobs:{separation:stemJob}})}); const d=await r.json();
        if(!r.ok)throw new Error(d.error||'Could not check stem status.');
        const state=String(d.statuses?.separation||'');
        if(state==='COMPLETED'){if(!dead){setStemReady(true);setLinkStatus('Stem separation complete.');}}
        else if(state==='FAILED'){if(!dead)setLinkStatus('Stem separation failed. Try another source.');}
        else if(!dead)setLinkStatus('Separating vocals, drums, bass, guitar, keys, and other instruments…');
      }catch(e){if(!dead)setLinkStatus(e instanceof Error?e.message:'Could not check stem status.')}
    };
    void poll(); const t=setInterval(poll,4000); return()=>{dead=true;clearInterval(t)};
  },[stemJob,stemReady]);

  const chooser=(items:Array<{part:ScorePart;index:number}>)=>items.map(({part,index})=><button type="button" key={index} className={selected[index]?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>toggle(index)}><span className="sheetExportIcon">{part.choirRole?'🎶':part.isVocal?'🎤':'🎼'}</span><span><strong>{partLabel(part)}</strong><small>{part.instrument}{part.lyrics?' · lyrics detected':''}</small></span><b>{selected[index]?'✓':'+'}</b></button>);

  return <div className="sheetImportTools noPrint">
    <div className="sheetSourceCard">
      <p className="eyebrow">Sheet → Song</p><h2>Upload Music Sheets</h2>
      <p className="sub">Upload a PDF, photo, MusicXML, or XML score. Pie reads the written parts first, then asks what you want rendered before creating any audio.</p>
      <input ref={scoreInput} type="file" hidden accept=".pdf,.xml,.musicxml,image/*" onChange={e=>{const f=e.target.files?.[0];if(f)void analyzeScore(f);e.currentTarget.value='';}} />
      <button type="button" className="primary" disabled={scoreBusy} onClick={()=>scoreInput.current?.click()}>{scoreBusy?'Reading score…':'⬆ Upload Music Sheets'}</button>
      {scoreStatus&&<div className="statusBox">{scoreStatus}</div>}
      {score&&<div className="scorePartChooser">
        <div className="sheetHeader"><div><p className="sheetBrand">DETECTED SCORE</p><h3>{score.title}</h3><small>{score.key||'Key unknown'} · {score.tempo} BPM · {score.timeSignature||'4/4'}</small></div></div>
        <h3>What parts do you want to render?</h3>
        <button type="button" className={fullArrangement?'sheetExportCard activeSheetExportCard':'sheetExportCard'} onClick={()=>setFullArrangement(v=>!v)}><span className="sheetExportIcon">🎧</span><span><strong>Full Arrangement</strong><small>Render the chosen parts together; if no individual parts are checked, use the whole score.</small></span><b>{fullArrangement?'✓':'+'}</b></button>
        {choirParts.length>0&&<><p className="eyebrow">Choir</p><div className="sheetExportGrid">{chooser(choirParts)}</div></>}
        {vocalParts.length>0&&<><p className="eyebrow">Vocals</p><div className="sheetExportGrid">{chooser(vocalParts)}</div></>}
        {instrumentParts.length>0&&<><p className="eyebrow">Instruments</p><div className="sheetExportGrid">{chooser(instrumentParts)}</div></>}
        <button type="button" className="primary" disabled={renderBusy} onClick={()=>void renderSelected()}>{renderBusy?'Rendering…':'▶ Render Selected Parts'}</button>
      </div>}
      {renders.length>0&&<div className="renderedPartList">{renders.map(item=><div className="sheetSourceCard" key={item.key}><strong>{item.label}</strong><audio controls preload="metadata" src={item.url}/><a className="primary" href={item.url} download={`${(score?.title||'song').replace(/[^a-z0-9]+/gi,'-')}-${item.label.replace(/[^a-z0-9]+/gi,'-')}.wav`}>Download WAV</a></div>)}</div>}
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
