'use client';

import { useMemo, useRef, useState } from 'react';

type InstrumentId = 'bass' | 'drums' | 'guitar' | 'keys' | 'strings' | 'synth' | 'percussion';
type Layer = { id:string; instrument:InstrumentId; label:string; sketch:Blob; sketchUrl:string; rendered?:Blob; renderedUrl?:string };

type Props = { onUseSong?: (blob: Blob) => void };

const INSTRUMENTS: Array<{id:InstrumentId; icon:string; label:string; hint:string}> = [
  {id:'bass',icon:'🎸',label:'Bass',hint:'Hum or mouth the bass riff: boom, dum, bah, etc.'},
  {id:'drums',icon:'🥁',label:'Drums',hint:'Beatbox the kick, snare, hats, fills, and groove.'},
  {id:'guitar',icon:'🎸',label:'Guitar',hint:'Sing or mouth the riff, chops, strums, or lead line.'},
  {id:'keys',icon:'🎹',label:'Keys',hint:'Hum the chord rhythm, piano pattern, or hook.'},
  {id:'strings',icon:'🎻',label:'Strings',hint:'Sing the long notes, swells, or rhythmic string figure.'},
  {id:'synth',icon:'🎛️',label:'Synth',hint:'Voice the synth hook, bass pulse, or texture.'},
  {id:'percussion',icon:'🪘',label:'Percussion',hint:'Mouth claps, shakers, toms, congas, or auxiliary rhythm.'},
];

function safeDuration(blob:Blob){
  return new Promise<number>((resolve)=>{
    const url=URL.createObjectURL(blob); const audio=new Audio(url);
    audio.onloadedmetadata=()=>{const ms=Math.max(3000,Math.min(30000,Math.round((audio.duration||3)*1000)));URL.revokeObjectURL(url);resolve(ms)};
    audio.onerror=()=>{URL.revokeObjectURL(url);resolve(30000)};
  });
}

async function decodeBlob(context:AudioContext,blob:Blob){ return context.decodeAudioData((await blob.arrayBuffer()).slice(0)); }

function audioBufferToWav(buffer:AudioBuffer){
  const channels=Math.min(2,Math.max(1,buffer.numberOfChannels)); const sampleRate=buffer.sampleRate; const dataLength=buffer.length*channels*2;
  const ab=new ArrayBuffer(44+dataLength); const view=new DataView(ab); const write=(o:number,s:string)=>{for(let i=0;i<s.length;i++)view.setUint8(o+i,s.charCodeAt(i));};
  write(0,'RIFF');view.setUint32(4,36+dataLength,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,dataLength,true);
  const data=Array.from({length:channels},(_,i)=>buffer.getChannelData(Math.min(i,buffer.numberOfChannels-1))); let offset=44;
  for(let i=0;i<buffer.length;i++)for(let c=0;c<channels;c++){const s=Math.max(-1,Math.min(1,data[c][i]||0));view.setInt16(offset,s<0?s*0x8000:s*0x7fff,true);offset+=2;}
  return new Blob([ab],{type:'audio/wav'});
}

export default function VoiceToInstrumentsWorkspace({onUseSong}:Props){
  const [instrument,setInstrument]=useState<InstrumentId>('bass');
  const [layers,setLayers]=useState<Layer[]>([]);
  const [recording,setRecording]=useState(false);
  const [busyId,setBusyId]=useState('');
  const [building,setBuilding]=useState(false);
  const [direction,setDirection]=useState('');
  const [status,setStatus]=useState('Pick an instrument, then make the part with your voice.');
  const [songUrl,setSongUrl]=useState('');
  const [songBlob,setSongBlob]=useState<Blob|null>(null);
  const recorderRef=useRef<MediaRecorder|null>(null); const streamRef=useRef<MediaStream|null>(null); const chunksRef=useRef<Blob[]>([]);
  const selected=useMemo(()=>INSTRUMENTS.find(item=>item.id===instrument)!,[instrument]);

  function addSketch(blob:Blob){
    const id=crypto.randomUUID?crypto.randomUUID():`${Date.now()}-${Math.random()}`; const url=URL.createObjectURL(blob);
    setLayers(current=>[...current,{id,instrument,label:selected.label,sketch:blob,sketchUrl:url}]);
    setStatus(`${selected.label} sketch captured. Render it into an instrument, or add another part.`);
  }

  async function startRecording(){
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}}); streamRef.current=stream; chunksRef.current=[];
      const recorder=new MediaRecorder(stream); recorderRef.current=recorder; recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data)};
      recorder.onstop=()=>{const blob=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});stream.getTracks().forEach(t=>t.stop());streamRef.current=null;setRecording(false);addSketch(blob)};
      recorder.start(250); setRecording(true); setStatus(`Recording ${selected.label}. Perform the part exactly how you hear it.`);
    }catch{setStatus('Microphone permission is required to record an instrument sketch.');}
  }
  function stopRecording(){ if(recorderRef.current?.state==='recording')recorderRef.current.stop(); recorderRef.current=null; }

  async function renderLayer(layer:Layer){
    setBusyId(layer.id); setStatus(`Turning your ${layer.label} mouth sketch into a real ${layer.label} part…`);
    try{
      const duration=await safeDuration(layer.sketch); const form=new FormData(); form.append('file',layer.sketch,`voice-${layer.instrument}.webm`);form.append('mode','instrument');form.append('instrument',layer.instrument);form.append('direction',direction);form.append('music_length_ms',String(duration));form.append('reference_duration_ms',String(duration));
      const response=await fetch('/api/elevenlabs/voice-instrument',{method:'POST',body:form}); if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d?.error||'Could not render this instrument.');}
      const blob=await response.blob(); const url=URL.createObjectURL(blob);
      setLayers(current=>current.map(item=>item.id===layer.id?{...item,rendered:blob,renderedUrl:url}:item)); setStatus(`${layer.label} rendered. Add another instrument or build the song.`);
    }catch(error){setStatus(error instanceof Error?error.message:'Could not render this instrument.');}finally{setBusyId('');}
  }

  async function mixRenderedLayers(){
    const rendered=layers.filter(layer=>layer.rendered); if(!rendered.length)throw new Error('Render at least one instrument first.');
    const AudioContextCtor=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext; if(!AudioContextCtor)throw new Error('This browser cannot build the rough arrangement.');
    const context=new AudioContextCtor(); try{
      const buffers=await Promise.all(rendered.map(layer=>decodeBlob(context,layer.rendered!))); const duration=Math.max(...buffers.map(b=>b.duration)); const sampleRate=44100; const offline=new OfflineAudioContext(2,Math.ceil((duration+0.5)*sampleRate),sampleRate);
      buffers.forEach(buffer=>{const source=offline.createBufferSource();source.buffer=buffer;const gain=offline.createGain();gain.gain.value=0.72/Math.sqrt(buffers.length);source.connect(gain).connect(offline.destination);source.start(0)});
      return audioBufferToWav(await offline.startRendering());
    }finally{await context.close().catch(()=>undefined)}
  }

  async function buildSong(){
    setBuilding(true); setStatus('Mixing your instrument parts into a rough arrangement…');
    try{
      const rough=await mixRenderedLayers(); const duration=await safeDuration(rough); setStatus('Pie is building a finished song around your performed parts…');
      const form=new FormData();form.append('file',rough,'voice-built-arrangement.wav');form.append('mode','song');form.append('instrument','bass');form.append('direction',direction);form.append('music_length_ms',String(Math.max(30000,duration)));form.append('reference_duration_ms',String(Math.min(30000,duration)));
      const response=await fetch('/api/elevenlabs/voice-instrument',{method:'POST',body:form}); if(!response.ok){const d=await response.json().catch(()=>({}));throw new Error(d?.error||'Could not build the song.');}
      const blob=await response.blob(); if(songUrl)URL.revokeObjectURL(songUrl); const url=URL.createObjectURL(blob); setSongBlob(blob);setSongUrl(url);setStatus('Song built from your vocal-performed instrument parts.');
    }catch(error){setStatus(error instanceof Error?error.message:'Could not build the song.');}finally{setBuilding(false)}
  }

  function removeLayer(id:string){ setLayers(current=>{const target=current.find(l=>l.id===id);if(target){URL.revokeObjectURL(target.sketchUrl);if(target.renderedUrl)URL.revokeObjectURL(target.renderedUrl);}return current.filter(l=>l.id!==id)}); }
  function clearAll(){if(recording||building||busyId)return;layers.forEach(l=>{URL.revokeObjectURL(l.sketchUrl);if(l.renderedUrl)URL.revokeObjectURL(l.renderedUrl)});if(songUrl)URL.revokeObjectURL(songUrl);setLayers([]);setSongUrl('');setSongBlob(null);setDirection('');setStatus('Voice-to-Instruments reset. Saved Songs were not changed.');}

  return <section className="panel">
    <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><div><p className="eyebrow">Voice → Instruments</p><h2>Build the band with your mouth.</h2></div><button className="secondary" type="button" onClick={clearAll} disabled={recording||building||Boolean(busyId)||(!layers.length&&!songUrl)}>↺ Reset</button></div>
    <p className="sub">Perform each part with your voice. Pie uses your timing, riff shape, groove, and phrasing as the reference, renders the chosen instrument, then can build a full song from the layers.</p>
    <div className="modeGrid">{INSTRUMENTS.map(item=><button type="button" key={item.id} className={instrument===item.id?'modeCard active':'modeCard'} onClick={()=>setInstrument(item.id)} disabled={recording}><span className="icon">{item.icon}</span><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div>
    <div className="playerCard">
      <strong>{selected.icon} Perform the {selected.label} part</strong><small>{selected.hint} You do not have to sound like the instrument — focus on the riff, rhythm, rests, and feel.</small>
      <div className="mixButtons">{!recording?<button className="primary" type="button" onClick={startRecording}>🎙️ Record {selected.label}</button>:<button className="primary" type="button" onClick={stopRecording}>■ Stop {selected.label}</button>}<label className="secondary">Upload Sketch<input type="file" accept="audio/*" hidden onChange={e=>{const f=e.target.files?.[0];if(f)addSketch(f);e.currentTarget.value='';}}/></label></div>
    </div>
    <label className="controlLabel">Production direction (optional)</label><textarea value={direction} onChange={e=>setDirection(e.target.value)} maxLength={1200} placeholder="Example: warm live gospel band, deep pocket drums, round bass, clean electric guitar, 92 BPM feel…" />
    {layers.length>0&&<div className="playerCard"><strong>Your instrument layers</strong>{layers.map((layer,index)=><div className="statusBox" key={layer.id} style={{display:'grid',gap:8}}><div style={{display:'flex',justifyContent:'space-between',gap:8}}><strong>{index+1}. {layer.label}</strong><button type="button" className="secondary" onClick={()=>removeLayer(layer.id)} disabled={busyId===layer.id||building}>Remove</button></div><small>Voice sketch</small><audio controls src={layer.sketchUrl}/>{layer.renderedUrl?<><small>AI-rendered {layer.label}</small><audio controls src={layer.renderedUrl}/></>:<button className="primary" type="button" onClick={()=>void renderLayer(layer)} disabled={Boolean(busyId)||building}>{busyId===layer.id?'Turning up the heat…':`Turn Voice into ${layer.label}`}</button>}</div>)}</div>}
    {layers.some(layer=>layer.rendered)&&<button className="primary" type="button" onClick={()=>void buildSong()} disabled={building||Boolean(busyId)}>{building?'Building Song…':'🎶 Build Song from My Parts'}</button>}
    {songUrl&&<div className="playerCard"><strong>Voice-built song</strong><audio controls src={songUrl}/>{songBlob&&onUseSong&&<button className="primary" type="button" onClick={()=>onUseSong(songBlob)}>✓ Use This Song in Pie</button>}</div>}
    {status&&<div className="statusBox">{status}</div>}
  </section>;
}
