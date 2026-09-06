'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type LayerMode = 'double' | 'harmony' | 'choir';
type VoiceRole = 'Female Soprano' | 'Female Alto' | 'Male Tenor' | 'Male Baritone' | 'Male Bass';
type VoiceModel = { id:string; title:string; tags:string[]; demoUrl?:string };
type Candidate = { id:string; mode:LayerMode; role:VoiceRole; modelName:string; pitchShift:number; blob:Blob; url:string; include:boolean };

const ROLES: Array<{role:VoiceRole; hint:string; pitch:number; keywords:string[]}> = [
  { role:'Female Soprano', hint:'High harmony / lift above the lead', pitch:7, keywords:['female','soprano','high'] },
  { role:'Female Alto', hint:'Warm upper harmony, often a 3rd above', pitch:3, keywords:['female','alto'] },
  { role:'Male Tenor', hint:'Inner harmony around or just under the lead', pitch:-3, keywords:['male','tenor'] },
  { role:'Male Baritone', hint:'Body and lower harmony support', pitch:-7, keywords:['male','baritone'] },
  { role:'Male Bass', hint:'Bottom/root support or octave below', pitch:-12, keywords:['male','bass','low'] },
];

function extractJobId(value:unknown):string {
  if (!value || typeof value !== 'object') return '';
  const object=value as Record<string,unknown>;
  for(const key of ['id','jobId','conversionId','voiceConversionId']){const item=object[key];if(typeof item==='string'||typeof item==='number')return String(item)}
  for(const child of Object.values(object)){const found=extractJobId(child);if(found)return found}
  return '';
}

function sleep(ms:number){return new Promise(resolve=>setTimeout(resolve,ms))}
function writeString(view:DataView,offset:number,value:string){for(let i=0;i<value.length;i++)view.setUint8(offset+i,value.charCodeAt(i))}
function audioBufferToWav(buffer:AudioBuffer){
  const channels=Math.min(2,Math.max(1,buffer.numberOfChannels));const blockAlign=channels*2;const dataLength=buffer.length*blockAlign;const ab=new ArrayBuffer(44+dataLength);const view=new DataView(ab);
  writeString(view,0,'RIFF');view.setUint32(4,36+dataLength,true);writeString(view,8,'WAVE');writeString(view,12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*blockAlign,true);view.setUint16(32,blockAlign,true);view.setUint16(34,16,true);writeString(view,36,'data');view.setUint32(40,dataLength,true);
  const data=Array.from({length:channels},(_,i)=>buffer.getChannelData(Math.min(i,buffer.numberOfChannels-1)));let offset=44;
  for(let i=0;i<buffer.length;i++)for(let channel=0;channel<channels;channel++){const sample=Math.max(-1,Math.min(1,data[channel][i]||0));view.setInt16(offset,sample<0?sample*0x8000:sample*0x7fff,true);offset+=2}
  return new Blob([ab],{type:'audio/wav'});
}

async function mixChoir(blobs:Blob[]){
  const AudioContextCtor=window.AudioContext||(window as typeof window&{webkitAudioContext?:typeof AudioContext}).webkitAudioContext;if(!AudioContextCtor)throw new Error('This browser cannot build the choir stack.');
  const decode=new AudioContextCtor();const buffers=await Promise.all(blobs.map(async blob=>decode.decodeAudioData((await blob.arrayBuffer()).slice(0))));await decode.close().catch(()=>undefined);
  const sampleRate=48000;const duration=Math.max(...buffers.map(buffer=>buffer.duration));const offline=new OfflineAudioContext(2,Math.ceil((duration+0.25)*sampleRate),sampleRate);const gainValue=Math.min(0.8,1/Math.sqrt(Math.max(1,buffers.length)));
  buffers.forEach((buffer,index)=>{const source=offline.createBufferSource();const gain=offline.createGain();const pan=offline.createStereoPanner();source.buffer=buffer;gain.gain.value=gainValue;pan.pan.value=buffers.length===1?0:-0.65+(1.3*index/Math.max(1,buffers.length-1));source.connect(gain).connect(pan).connect(offline.destination);source.start(0)});
  return audioBufferToWav(await offline.startRendering());
}

function injectIntoMixer(kind:'double'|'harmony',blob:Blob){
  const inputs=Array.from(document.querySelectorAll<HTMLInputElement>('.mixUploads input[type="file"]'));
  const input=kind==='double'?inputs[0]:inputs[1];if(!input)throw new Error(`Pie could not find the ${kind} track input.`);
  const file=new File([blob],`pie-ai-${kind}.wav`,{type:blob.type||'audio/wav'});const transfer=new DataTransfer();transfer.items.add(file);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));
}

export default function VocalLayerBuilder(){
  const [host,setHost]=useState<Element|null>(null);const [source,setSource]=useState<File|null>(null);const [mode,setMode]=useState<LayerMode>('double');const [models,setModels]=useState<VoiceModel[]>([]);const [modelsError,setModelsError]=useState('');const [role,setRole]=useState<VoiceRole>('Male Baritone');const [modelId,setModelId]=useState('');const [pitch,setPitch]=useState(0);const [busy,setBusy]=useState(false);const [status,setStatus]=useState('');const [candidates,setCandidates]=useState<Candidate[]>([]);const [choirRoles,setChoirRoles]=useState<VoiceRole[]>(['Female Soprano','Female Alto','Male Tenor','Male Baritone','Male Bass']);const [roleModels,setRoleModels]=useState<Record<string,string>>({});

  useEffect(()=>{const update=()=>setHost(document.querySelector('.mixConsole'));update();const observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true});return()=>observer.disconnect()},[]);
  useEffect(()=>{if(!host)return;let active=true;void fetch('/api/kits/models',{cache:'no-store'}).then(async response=>{const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||'AI voice choices are unavailable.');if(active){const next=Array.isArray(data.models)?data.models:[];setModels(next);setModelId(current=>current||next[0]?.id||'')}}).catch(error=>{if(active)setModelsError(error instanceof Error?error.message:'AI voice choices are unavailable.')});return()=>{active=false}},[host]);
  useEffect(()=>{setPitch(mode==='double'?0:(ROLES.find(item=>item.role===role)?.pitch||0))},[mode,role]);

  const modelsForRole=(target:VoiceRole)=>{const spec=ROLES.find(item=>item.role===target);if(!spec)return models;const filtered=models.filter(model=>{const text=`${model.title} ${(model.tags||[]).join(' ')}`.toLowerCase();return spec.keywords.some(keyword=>text.includes(keyword))});return filtered.length?filtered:models};
  const activeModels=useMemo(()=>modelsForRole(role),[models,role]);
  useEffect(()=>{if(activeModels.length&&!activeModels.some(model=>model.id===modelId))setModelId(activeModels[0].id)},[activeModels,modelId]);

  async function generateOne(targetMode:LayerMode,targetRole:VoiceRole,targetModelId:string,targetPitch:number){
    if(!source)throw new Error('Choose a clean lead vocal or guide vocal first.');if(!targetModelId)throw new Error('Choose an AI voice first.');
    const model=models.find(item=>item.id===targetModelId);const form=new FormData();form.append('file',source,source.name||'lead-vocal.wav');form.append('modelId',targetModelId);form.append('pitchShift',String(targetPitch));
    const response=await fetch('/api/kits/convert',{method:'POST',body:form});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||'AI voice generation failed.');const jobId=extractJobId(data);if(!jobId)throw new Error('The AI voice provider did not return a conversion job.');
    for(let attempt=0;attempt<45;attempt++){const download=await fetch(`/api/kits/conversion-status?id=${encodeURIComponent(jobId)}&download=1`,{cache:'no-store'});if(download.ok){const blob=await download.blob();const url=URL.createObjectURL(blob);const candidate:Candidate={id:crypto.randomUUID(),mode:targetMode,role:targetRole,modelName:model?.title||targetRole,pitchShift:targetPitch,blob,url,include:true};setCandidates(current=>[candidate,...current]);return candidate}if(download.status!==409){const error=await download.json().catch(()=>({}));throw new Error(error?.error||'AI vocal preview could not be retrieved.')}await sleep(2000)}throw new Error('AI vocal is still processing. Try generating that part again shortly.');
  }

  async function generateSingle(){setBusy(true);setStatus('Generating AI vocal option…');try{await generateOne(mode,role,modelId,pitch);setStatus('AI vocal option ready. Listen to it, then keep it or generate another.')}catch(error){setStatus(error instanceof Error?error.message:'AI vocal generation failed.')}finally{setBusy(false)}}
  async function generateChoir(){setBusy(true);setStatus('Building choir voice options…');try{for(const targetRole of choirRoles){const choices=modelsForRole(targetRole);const selected=roleModels[targetRole]||choices[0]?.id||'';if(!selected)continue;const suggested=ROLES.find(item=>item.role===targetRole)?.pitch||0;setStatus(`Generating ${targetRole}…`);await generateOne('choir',targetRole,selected,suggested)}setStatus('Choir parts ready. Audition each voice, turn off any part you do not want, then keep the choir stack.')}catch(error){setStatus(error instanceof Error?error.message:'Choir generation failed.')}finally{setBusy(false)}}
  async function keepChoir(){const chosen=candidates.filter(candidate=>candidate.mode==='choir'&&candidate.include);if(!chosen.length){setStatus('Select at least one choir part to keep.');return}setBusy(true);setStatus('Mixing selected choir voices…');try{const blob=await mixChoir(chosen.map(candidate=>candidate.blob));injectIntoMixer('harmony',blob);setStatus(`${chosen.length}-part AI choir loaded into the Harmony channel. Press Play Mix to hear it in the song.`)}catch(error){setStatus(error instanceof Error?error.message:'Could not build the choir stack.')}finally{setBusy(false)}}
  function keepCandidate(candidate:Candidate){try{injectIntoMixer(candidate.mode==='double'?'double':'harmony',candidate.blob);setStatus(`${candidate.role} ${candidate.mode==='double'?'double':'harmony'} loaded into Mix. Press Play Mix to hear it with the song.`)}catch(error){setStatus(error instanceof Error?error.message:'Could not load that AI vocal into Mix.')}}
  function removeCandidate(id:string){setCandidates(current=>{const target=current.find(item=>item.id===id);if(target)URL.revokeObjectURL(target.url);return current.filter(item=>item.id!==id)})}

  if(!host)return null;
  return createPortal(<div className="playerCard" style={{marginTop:14,display:'grid',gap:10}}>
    <div><strong>🧬 AI Vocal Layers</strong><small style={{display:'block',marginTop:4}}>Create doubles, harmonies, or a multi-voice choir. Every result is auditioned before it is kept in the mix.</small></div>
    <div className="chips"><button type="button" className={mode==='double'?'chip activeChip':'chip'} onClick={()=>setMode('double')}>Double</button><button type="button" className={mode==='harmony'?'chip activeChip':'chip'} onClick={()=>setMode('harmony')}>Harmony</button><button type="button" className={mode==='choir'?'chip activeChip':'chip'} onClick={()=>setMode('choir')}>Choir</button></div>
    <label className="secondary" style={{textAlign:'center'}}>Choose source lead / guide vocal<input type="file" accept="audio/*" hidden onChange={event=>setSource(event.target.files?.[0]||null)}/></label>{source&&<small>Source: {source.name}</small>}
    {modelsError&&<div className="errorBox">{modelsError}</div>}
    {mode!=='choir'?<>
      <div className="controlGrid"><label>Voice part<select value={role} onChange={event=>setRole(event.target.value as VoiceRole)}>{ROLES.map(item=><option key={item.role} value={item.role}>{item.role}</option>)}</select></label><label>AI voice<select value={modelId} onChange={event=>setModelId(event.target.value)}>{activeModels.map(model=><option key={model.id} value={model.id}>{model.title}</option>)}</select></label><label>Pitch shift <span>{pitch>0?'+':''}{pitch} semitones</span><input type="range" min="-12" max="12" step="1" value={pitch} onChange={event=>setPitch(Number(event.target.value))}/></label></div>
      <small>{ROLES.find(item=>item.role===role)?.hint}. The suggested interval is a starting point—adjust it to fit the song’s key and melody.</small>
      <button type="button" className="primary" disabled={busy||!source||!modelId} onClick={generateSingle}>{busy?'Turning up the heat…':`Generate AI ${mode==='double'?'Double':'Harmony'} Option`}</button>
    </>:<>
      <small>Choose any combination. Pie suggests a practical starting role for each range; you can use male-only, female-only, or mixed choir stacks.</small>
      <div style={{display:'grid',gap:8}}>{ROLES.map(item=>{const checked=choirRoles.includes(item.role);const choices=modelsForRole(item.role);const selected=roleModels[item.role]||choices[0]?.id||'';return <div className="statusBox" key={item.role} style={{display:'grid',gap:6}}><label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={checked} onChange={()=>setChoirRoles(current=>checked?current.filter(role=>role!==item.role):[...current,item.role])}/><strong>{item.role}</strong></label><small>{item.hint} · suggested {item.pitch>0?'+':''}{item.pitch} semitones</small>{checked&&<select value={selected} onChange={event=>setRoleModels(current=>({...current,[item.role]:event.target.value}))}>{choices.map(model=><option key={model.id} value={model.id}>{model.title}</option>)}</select>}</div>})}</div>
      <button type="button" className="primary" disabled={busy||!source||choirRoles.length===0} onClick={generateChoir}>{busy?'Turning up the heat…':'Generate Selected Choir Parts'}</button>
      <button type="button" className="secondary" disabled={busy||!candidates.some(candidate=>candidate.mode==='choir'&&candidate.include)} onClick={keepChoir}>✓ Keep Selected Choir Stack</button>
    </>}
    {candidates.length>0&&<div style={{display:'grid',gap:8}}><strong>Audition results</strong>{candidates.map(candidate=><div className="statusBox" key={candidate.id} style={{display:'grid',gap:6}}><div><strong>{candidate.role}</strong><small style={{display:'block'}}>{candidate.modelName} · {candidate.pitchShift>0?'+':''}{candidate.pitchShift} semitones · {candidate.mode}</small></div><audio controls src={candidate.url}/>{candidate.mode==='choir'&&<label style={{display:'flex',gap:8,alignItems:'center'}}><input type="checkbox" checked={candidate.include} onChange={()=>setCandidates(current=>current.map(item=>item.id===candidate.id?{...item,include:!item.include}:item))}/>Include in choir stack</label>}<div className="mixButtons"><button type="button" className="primary" onClick={()=>keepCandidate(candidate)}>✓ Keep This</button><button type="button" className="secondary" onClick={()=>removeCandidate(candidate.id)}>Discard</button></div></div>)}</div>}
    {status&&<div className="statusBox">{status}</div>}
  </div>,host);
}
