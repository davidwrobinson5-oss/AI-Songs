'use client';

import { useMemo, useState } from 'react';
import { stagePieFile } from './stagedUpload';

type Props = {
  vocalRange: string;
  onVocalRangeChange: (range: string) => void;
  onApply: (plan: string, range: string) => void;
};

type Analysis = {
  sourceName: string;
  sourceKind: 'audio' | 'midi' | 'score' | 'chords';
  key: string;
  keyConfidence: number;
  bpm: number | null;
  bpmConfidence: number;
  timeSignature: string;
  timeConfidence: number;
  lowMidi: number | null;
  highMidi: number | null;
  rangeConfidence: number;
  chords: string[];
  sections: string[];
  parts: string[];
  durationSec: number | null;
  noteCount?: number;
};

type MidiEvent = { tick: number; midi: number };

const NOTE_NAMES = ['C','Db','D','Eb','E','F','Gb','G','Ab','A','Bb','B'];
const KEY_OPTIONS = NOTE_NAMES.flatMap((n) => [`${n} Major`, `${n} Minor`]);
const MAJOR_PROFILE = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const MINOR_PROFILE = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
const RANGE_TARGETS: Record<string, [number, number]> = {
  Bass: [40,64],
  Baritone: [43,67],
  Tenor: [48,72],
  Alto: [53,77],
  Soprano: [60,84],
};
const RANGES = ['Bass','Baritone','Tenor','Alto','Soprano'];
const RENDER_MODES = ['Real Performance','Note-Perfect','Hybrid'] as const;
const DEFAULT_PARTS = ['Lead Vocal','Soprano','Alto','Tenor','Choir Bass','Keys / Piano','Guitar','Instrument Bass','Drums','Full Arrangement'];

function clamp(n:number, lo:number, hi:number){ return Math.min(hi, Math.max(lo, n)); }
function midiName(midi:number | null){
  if (midi == null || !Number.isFinite(midi)) return '—';
  const n = clamp(Math.round(midi),0,127);
  return `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}
function rootPc(name:string){
  const root = name.trim().match(/^([A-G](?:#|b)?)/)?.[1];
  if (!root) return -1;
  const normalized: Record<string,string> = { 'C#':'Db','D#':'Eb','F#':'Gb','G#':'Ab','A#':'Bb','Cb':'B','Fb':'E','E#':'F','B#':'C' };
  return NOTE_NAMES.indexOf(normalized[root] || root);
}
function normalizeKey(value:string){
  if (!value || /unknown/i.test(value)) return 'Unknown';
  const pc = rootPc(value);
  if (pc < 0) return 'Unknown';
  const minor = /minor|\bm\b/i.test(value) && !/major/i.test(value);
  return `${NOTE_NAMES[pc]} ${minor ? 'Minor' : 'Major'}`;
}
function relativeKey(key:string){
  if (key === 'Unknown') return 'Unknown';
  const pc = rootPc(key); const minor = key.endsWith('Minor');
  if (pc < 0) return 'Unknown';
  return minor ? `${NOTE_NAMES[(pc + 3) % 12]} Major` : `${NOTE_NAMES[(pc + 9) % 12]} Minor`;
}
function transposeKey(key:string, semitones:number){
  if (key === 'Unknown') return key;
  const pc = rootPc(key); if (pc < 0) return key;
  return `${NOTE_NAMES[(pc + semitones + 120) % 12]} ${key.endsWith('Minor') ? 'Minor' : 'Major'}`;
}
function cosineScore(chroma:number[], profile:number[], root:number){
  let dot=0,a=0,b=0;
  for(let i=0;i<12;i++){
    const x=chroma[(i+root)%12]||0,y=profile[i];
    dot+=x*y;a+=x*x;b+=y*y;
  }
  return dot/(Math.sqrt(a*b)||1);
}
function detectKey(chroma:number[]){
  const scores:Array<{key:string;score:number}>=[];
  for(let root=0;root<12;root++){
    scores.push({key:`${NOTE_NAMES[root]} Major`,score:cosineScore(chroma,MAJOR_PROFILE,root)});
    scores.push({key:`${NOTE_NAMES[root]} Minor`,score:cosineScore(chroma,MINOR_PROFILE,root)});
  }
  scores.sort((a,b)=>b.score-a.score);
  const best=scores[0],second=scores[1];
  const confidence=Math.round(clamp(58+(best.score-second.score)*240+(best.score-.75)*70,52,97));
  return { key:best.key, confidence };
}
function triadName(chroma:number[]){
  let best={score:-Infinity,label:'C Major'};
  const total=chroma.reduce((a,b)=>a+b,0)||1;
  for(let root=0;root<12;root++){
    for(const minor of [false,true]){
      const third=(root+(minor?3:4))%12,fifth=(root+7)%12;
      const inside=(chroma[root]||0)+(chroma[third]||0)+(chroma[fifth]||0);
      const score=inside/total + (chroma[root]||0)/total*.35;
      if(score>best.score)best={score,label:`${NOTE_NAMES[root]}${minor?'m':''}`};
    }
  }
  return best.label;
}
function dominantKeyFromNotes(notes:number[]){
  const chroma=Array(12).fill(0);
  for(const note of notes) chroma[((Math.round(note)%12)+12)%12]+=1;
  return detectKey(chroma);
}
function fitShift(low:number|null, high:number|null, target:string){
  const bounds=RANGE_TARGETS[target];
  if(low==null||high==null||!bounds)return 0;
  let best={shift:0,score:-Infinity};
  const sourceCenter=(low+high)/2,targetCenter=(bounds[0]+bounds[1])/2;
  for(let shift=-12;shift<=12;shift++){
    const l=low+shift,h=high+shift;
    const inside=Math.max(0,Math.min(h,bounds[1])-Math.max(l,bounds[0]));
    const span=Math.max(1,h-l);
    const outside=Math.max(0,bounds[0]-l)+Math.max(0,h-bounds[1]);
    const centerPenalty=Math.abs((sourceCenter+shift)-targetCenter)*.08;
    const score=inside/span-outside*.12-centerPenalty-Math.abs(shift)*.015;
    if(score>best.score)best={shift,score};
  }
  return best.shift;
}
function recommendationShifts(low:number|null, high:number|null, target:string){
  const comfort=fitShift(low,high,target);
  const power=clamp(comfort+2,-12,12);
  const original=Math.abs(comfort)<=2?comfort:Math.sign(comfort)*2;
  return {comfort,power,original};
}
function formatShift(n:number){ return n===0?'Original':`${n>0?'+':''}${n} semitone${Math.abs(n)===1?'':'s'}`; }

function readVar(bytes:Uint8Array,start:number){
  let value=0,pos=start,b=0;
  do { b=bytes[pos++]||0; value=(value<<7)|(b&0x7f); } while((b&0x80)&&pos<bytes.length);
  return {value,pos};
}
function parseMidi(bytes:Uint8Array, name:string):Analysis{
  const text=(a:number,b:number)=>String.fromCharCode(...Array.from(bytes.slice(a,b)));
  if(text(0,4)!=='MThd')throw new Error('That does not look like a valid MIDI file.');
  const headerLen=(bytes[4]<<24)|(bytes[5]<<16)|(bytes[6]<<8)|bytes[7];
  const tracks=(bytes[10]<<8)|bytes[11];
  const division=(bytes[12]<<8)|bytes[13];
  const ppq=(division&0x8000)?480:Math.max(1,division);
  let pos=8+headerLen,tempoUs=500000,timeSig='4/4',key='Unknown',maxTick=0;
  const events:MidiEvent[]=[]; const trackNames:string[]=[];
  for(let t=0;t<tracks&&pos+8<=bytes.length;t++){
    if(text(pos,pos+4)!=='MTrk')break;
    const len=(bytes[pos+4]<<24)|(bytes[pos+5]<<16)|(bytes[pos+6]<<8)|bytes[pos+7];
    pos+=8; const end=Math.min(bytes.length,pos+len); let tick=0,running=0,trackName='';
    while(pos<end){
      const delta=readVar(bytes,pos); tick+=delta.value; pos=delta.pos; maxTick=Math.max(maxTick,tick);
      let status=bytes[pos]||0;
      if(status<0x80){ if(!running)break; status=running; } else { pos++; if(status<0xf0)running=status; }
      if(status===0xff){
        const type=bytes[pos++]||0; const vr=readVar(bytes,pos); const mlen=vr.value; pos=vr.pos; const mEnd=Math.min(end,pos+mlen);
        if(type===0x51&&mlen>=3)tempoUs=(bytes[pos]<<16)|(bytes[pos+1]<<8)|bytes[pos+2];
        if(type===0x58&&mlen>=2)timeSig=`${bytes[pos]}/${Math.pow(2,bytes[pos+1])}`;
        if(type===0x59&&mlen>=2){
          const sf=(bytes[pos]<<24)>>24,minor=bytes[pos+1]===1;
          const major=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','Gb','Db'];
          const minorKeys=['Ab','Eb','Bb','F','C','G','D','A','E','B','Gb','Db','Ab','Eb','Bb'];
          const idx=clamp(sf+7,0,14); key=`${minor?minorKeys[idx]:major[idx]} ${minor?'Minor':'Major'}`;
          key=normalizeKey(key);
        }
        if(type===0x03&&mlen>0)trackName=new TextDecoder().decode(bytes.slice(pos,mEnd)).slice(0,80);
        pos=mEnd; continue;
      }
      if(status===0xf0||status===0xf7){ const vr=readVar(bytes,pos); pos=Math.min(end,vr.pos+vr.value); continue; }
      const kind=status&0xf0;
      if(kind===0x80||kind===0x90||kind===0xa0||kind===0xb0||kind===0xe0){
        const d1=bytes[pos++]||0,d2=bytes[pos++]||0;
        if(kind===0x90&&d2>0)events.push({tick,midi:d1});
      } else if(kind===0xc0||kind===0xd0){ pos+=1; }
      else break;
    }
    if(trackName)trackNames.push(trackName);
    pos=end;
  }
  const notes=events.map(e=>e.midi);
  if(!notes.length)throw new Error('Pie could not find note events in that MIDI file.');
  if(key==='Unknown')key=dominantKeyFromNotes(notes).key;
  const bpm=Math.round(60000000/Math.max(1,tempoUs));
  const low=Math.min(...notes),high=Math.max(...notes);
  const buckets=Array.from({length:Math.min(8,Math.max(1,Math.ceil(maxTick/(ppq*4))))},()=>Array(12).fill(0));
  for(const e of events){ const i=Math.min(buckets.length-1,Math.floor((e.tick/Math.max(1,maxTick))*buckets.length)); buckets[i][e.midi%12]+=1; }
  const chords=buckets.map(triadName).filter((c,i,a)=>i===0||c!==a[i-1]);
  return {
    sourceName:name,sourceKind:'midi',key,keyConfidence:96,bpm,bpmConfidence:99,timeSignature:timeSig,timeConfidence:99,
    lowMidi:low,highMidi:high,rangeConfidence:98,chords,sections:['MIDI arrangement'],parts:trackNames.length?trackNames:[`${tracks} MIDI track${tracks===1?'':'s'}`],
    durationSec:maxTick/ppq*60/bpm,noteCount:notes.length,
  };
}

function audioSample(buffer:AudioBuffer,index:number){
  let sum=0;
  for(let c=0;c<buffer.numberOfChannels;c++)sum+=buffer.getChannelData(c)[index]||0;
  return sum/Math.max(1,buffer.numberOfChannels);
}
function goertzel(buffer:AudioBuffer,start:number,size:number,freq:number){
  const sr=buffer.sampleRate,w=2*Math.PI*freq/sr,coeff=2*Math.cos(w); let s1=0,s2=0;
  for(let i=0;i<size;i++){
    const sample=audioSample(buffer,start+i)*(0.5-0.5*Math.cos(2*Math.PI*i/(size-1)));
    const s0=sample+coeff*s1-s2;s2=s1;s1=s0;
  }
  return Math.max(0,s1*s1+s2*s2-coeff*s1*s2);
}
function spectralFrame(buffer:AudioBuffer,start:number,size:number){
  const chroma=Array(12).fill(0),powers:Array<{midi:number,power:number}>=[];
  for(let midi=36;midi<=84;midi++){
    const freq=440*Math.pow(2,(midi-69)/12); const power=goertzel(buffer,start,size,freq);
    chroma[midi%12]+=power; powers.push({midi,power});
  }
  powers.sort((a,b)=>b.power-a.power);
  return {chroma,dominant:powers[0]?.midi??60,total:chroma.reduce((a,b)=>a+b,0)};
}
function tempoEnvelope(buffer:AudioBuffer){
  const seconds=Math.min(180,buffer.duration),rate=100,hop=Math.max(32,Math.floor(buffer.sampleRate/rate)),length=Math.floor(seconds*buffer.sampleRate/hop);
  const env=new Float32Array(length);
  for(let i=0;i<length;i++){
    const start=i*hop,end=Math.min(buffer.length,start+hop); let sum=0,count=0;
    for(let p=start;p<end;p+=4){const x=audioSample(buffer,p);sum+=x*x;count++;}
    env[i]=Math.sqrt(sum/Math.max(1,count));
  }
  const onset=new Float32Array(length); let avg=0;
  for(let i=0;i<length;i++){avg=avg*.96+env[i]*.04;onset[i]=Math.max(0,env[i]-avg);}
  let bestLag=0,best=-1,second=-1;
  const minLag=Math.floor(rate*60/200),maxLag=Math.ceil(rate*60/55);
  for(let lag=minLag;lag<=maxLag;lag++){
    let score=0;for(let i=lag;i<length;i++)score+=onset[i]*onset[i-lag];
    if(score>best){second=best;best=score;bestLag=lag;} else if(score>second)second=score;
  }
  let bpm=bestLag?60*rate/bestLag:100;
  while(bpm<70)bpm*=2; while(bpm>190)bpm/=2;
  const confidence=Math.round(clamp(55+(best>0?(best-second)/best:0)*150,50,94));
  return {bpm:Math.round(bpm),confidence,onset,rate};
}
function timeFromOnsets(onset:Float32Array,rate:number,bpm:number){
  const beat=Math.max(1,rate*60/bpm); const strengths:number[]=[];
  for(let p=0;p<onset.length;p+=beat){
    const center=Math.round(p);let v=0;for(let d=-2;d<=2;d++){const i=center+d;if(i>=0&&i<onset.length)v=Math.max(v,onset[i]);}strengths.push(v);
  }
  const corr=(lag:number)=>{let s=0,n=0;for(let i=lag;i<strengths.length;i++){s+=strengths[i]*strengths[i-lag];n++;}return n?s/n:0;};
  const c3=corr(3),c4=corr(4),c6=corr(6);
  if(c3>c4*1.13&&c3>c6*.9)return {sig:'3/4',confidence:68};
  if(c6>c4*1.18)return {sig:'6/8',confidence:62};
  return {sig:'4/4',confidence:66};
}
async function analyzeAudio(file:File):Promise<Analysis>{
  const ctx=new AudioContext();
  try{
    const buffer=await ctx.decodeAudioData(await file.arrayBuffer());
    if(buffer.duration<1)throw new Error('That audio clip is too short to analyze.');
    const size=4096,frames=Math.min(28,Math.max(8,Math.floor(buffer.duration/4))),maxStart=Math.max(0,buffer.length-size-1);
    const global=Array(12).fill(0),frameChromas:number[][]=[],dominants:number[]=[];
    for(let i=0;i<frames;i++){
      const start=Math.floor(maxStart*((i+.5)/frames)); const spec=spectralFrame(buffer,start,size);
      if(spec.total<=0)continue; frameChromas.push(spec.chroma);dominants.push(spec.dominant);for(let p=0;p<12;p++)global[p]+=spec.chroma[p];
      await new Promise(r=>setTimeout(r,0));
    }
    const kd=detectKey(global),tempo=tempoEnvelope(buffer),ts=timeFromOnsets(tempo.onset,tempo.rate,tempo.bpm);
    const sorted=[...dominants].sort((a,b)=>a-b); const low=sorted[Math.floor(sorted.length*.12)]??null,high=sorted[Math.floor(sorted.length*.88)]??null;
    const chords=frameChromas.map(triadName).filter((c,i,a)=>i===0||c!==a[i-1]).slice(0,10);
    const sectionCount=buffer.duration<75?3:buffer.duration<180?5:6;
    const labels=['Intro / A','Section A','Section B','Section C','Bridge / C','Outro'];
    return {sourceName:file.name,sourceKind:'audio',key:kd.key,keyConfidence:kd.confidence,bpm:tempo.bpm,bpmConfidence:tempo.confidence,timeSignature:ts.sig,timeConfidence:ts.confidence,lowMidi:low,highMidi:high,rangeConfidence:62,chords,sections:labels.slice(0,sectionCount),parts:['Lead Vocal','Drums','Instrument Bass','Guitar','Keys / Piano','Other Instruments'],durationSec:buffer.duration};
  } finally { void ctx.close(); }
}

function analyzeChords(text:string):Analysis{
  const chordPattern=/(?:^|\s|\|)([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add)?(?:2|4|5|6|7|9|11|13)?(?:\/[A-G](?:#|b)?)?)(?=\s|\||$)/gi;
  const matches=[...text.matchAll(chordPattern)].map(m=>m[1]).filter(Boolean);
  if(!matches.length)throw new Error('I could not find chord symbols. Try lines such as: Bb | Gm | Eb | F.');
  const chroma=Array(12).fill(0);for(const chord of matches){const pc=rootPc(chord);if(pc>=0)chroma[pc]+=1;}
  const kd=detectKey(chroma),unique=matches.filter((c,i,a)=>i===0||c!==a[i-1]).slice(0,12);
  return {sourceName:'Pasted lyrics + chords',sourceKind:'chords',key:kd.key,keyConfidence:Math.min(90,kd.confidence),bpm:null,bpmConfidence:0,timeSignature:'4/4',timeConfidence:35,lowMidi:null,highMidi:null,rangeConfidence:0,chords:unique,sections:['Lyrics / chord chart'],parts:['Lead Vocal','Full Arrangement'],durationSec:null};
}

function partLabel(part:any){
  const role=String(part?.choirRole||'').toLowerCase();
  if(role==='soprano')return 'Soprano';if(role==='alto')return 'Alto';if(role==='tenor')return 'Tenor';if(role==='bass')return 'Choir Bass';
  return String(part?.name||part?.instrument||'Part');
}
async function analyzeScore(file:File,setStatus:(s:string)=>void):Promise<Analysis>{
  if(file.size>20*1024*1024)throw new Error('Music-sheet files must be 20 MB or smaller.');
  const stagedPath=await stagePieFile(file,(p)=>setStatus(`Uploading score… ${p}%`));
  setStatus('Reading key, tempo, time signature, notes, and parts…');
  const r=await fetch('/api/sheets/import-score',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'application/pdf'})});
  const raw=await r.text();let d:any={};try{d=JSON.parse(raw)}catch{d={error:raw}}
  if(!r.ok)throw new Error(d?.error||'Could not analyze that score.');
  const score=d.score||{};
  try{
    sessionStorage.setItem('pie-last-analyzed-score',JSON.stringify(score));
    window.dispatchEvent(new CustomEvent('pie-score-analyzed',{detail:score}));
  }catch{}
  const notes=(score.parts||[]).flatMap((p:any)=>p.notes||[]).map((n:any)=>Number(n.midi)).filter(Number.isFinite);
  const vocalNotes=(score.parts||[]).filter((p:any)=>p.isVocal||p.choirRole).flatMap((p:any)=>p.notes||[]).map((n:any)=>Number(n.midi)).filter(Number.isFinite);
  const rangeNotes=vocalNotes.length?vocalNotes:notes;
  const low=rangeNotes.length?Math.min(...rangeNotes):null,high=rangeNotes.length?Math.max(...rangeNotes):null;
  const parts=(score.parts||[]).map(partLabel).filter(Boolean);
  return {sourceName:file.name,sourceKind:'score',key:normalizeKey(score.key||'Unknown'),keyConfidence:score.key&&score.key!=='Unknown'?97:45,bpm:Number(score.tempo)||null,bpmConfidence:Number(score.tempo)?96:0,timeSignature:String(score.timeSignature||'4/4'),timeConfidence:94,lowMidi:low,highMidi:high,rangeConfidence:vocalNotes.length?98:72,chords:[],sections:['Written score'],parts:parts.length?parts:['Full Arrangement'],durationSec:null,noteCount:Number(score.noteCount)||notes.length};
}

export default function SongAnalysisWorkspace({vocalRange,onVocalRangeChange,onApply}:Props){
  const [analysis,setAnalysis]=useState<Analysis|null>(null);
  const [status,setStatus]=useState('');
  const [busy,setBusy]=useState(false);
  const [chordText,setChordText]=useState('');
  const [showChordPaste,setShowChordPaste]=useState(false);
  const [key,setKey]=useState('Unknown');
  const [bpm,setBpm]=useState<number|null>(null);
  const [timeSignature,setTimeSignature]=useState('4/4');
  const [targetRange,setTargetRange]=useState(RANGES.includes(vocalRange)?vocalRange:'Baritone');
  const [shift,setShift]=useState(0);
  const [renderMode,setRenderMode]=useState<(typeof RENDER_MODES)[number]>('Hybrid');
  const [selectedParts,setSelectedParts]=useState<Set<string>>(new Set(['Full Arrangement']));
  const [applied,setApplied]=useState('');

  const recommendations=useMemo(()=>analysis?recommendationShifts(analysis.lowMidi,analysis.highMidi,targetRange):{comfort:0,power:0,original:0},[analysis,targetRange]);
  const currentKey=useMemo(()=>transposeKey(key,shift),[key,shift]);
  const availableParts=useMemo(()=>{
    if(!analysis)return DEFAULT_PARTS;
    const merged=[...analysis.parts];
    if(!merged.some(p=>/full arrangement/i.test(p)))merged.push('Full Arrangement');
    return merged.filter((p,i,a)=>a.indexOf(p)===i);
  },[analysis]);

  function acceptAnalysis(next:Analysis){
    setAnalysis(next);setKey(next.key);setBpm(next.bpm);setTimeSignature(next.timeSignature||'4/4');setShift(0);setApplied('');
    const defaultSet=new Set<string>();if(next.parts.length===1)defaultSet.add(next.parts[0]);else defaultSet.add('Full Arrangement');setSelectedParts(defaultSet);
    setStatus('Analysis ready. Review the results, fit the key to the singer, then choose your render.');
  }
  async function analyzeFile(file:File){
    setBusy(true);setStatus('Turning up the heat…');setApplied('');
    try{
      const lower=file.name.toLowerCase();let result:Analysis;
      const isAudio=file.type.startsWith('audio/')||/\.(wav|mp3|m4a|aac|ogg|flac)$/i.test(lower);
      if(lower.endsWith('.mid')||lower.endsWith('.midi'))result=parseMidi(new Uint8Array(await file.arrayBuffer()),file.name);
      else if(isAudio)result=await analyzeAudio(file);
      else result=await analyzeScore(file,setStatus);
      acceptAnalysis(result);
      if(isAudio){
        setStatus('Analysis ready. Uploading once more to start sheet music and stem processing…');
        const stagedPath=await stagePieFile(file,(p)=>setStatus(`Starting sheet/stem processing… ${p}%`));
        const processResponse=await fetch('/api/sheets/process-upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({stagedPath,name:file.name,type:file.type||'audio/mpeg'})});
        const processRaw=await processResponse.text();let processData:any={};try{processData=JSON.parse(processRaw)}catch{processData={error:processRaw}}
        if(!processResponse.ok)throw new Error(processData?.error||'Could not start sheet music and stem processing.');
        try{
          sessionStorage.setItem('pie-audio-processing-jobs',JSON.stringify(processData.jobs||{}));
          window.dispatchEvent(new CustomEvent('pie-audio-processing-started',{detail:{jobs:processData.jobs||{},name:file.name}}));
        }catch{}
        setStatus('Analysis ready. Sheet music and individual stem processing have started below.');
      }
    }catch(e){setStatus(e instanceof Error?e.message:'Could not analyze that song.');}
    finally{setBusy(false);}
  }
  function analyzePasted(){
    try{acceptAnalysis(analyzeChords(chordText));setShowChordPaste(false);}catch(e){setStatus(e instanceof Error?e.message:'Could not analyze those chords.');}
  }
  function togglePart(part:string){setSelectedParts(prev=>{const next=new Set(prev);next.has(part)?next.delete(part):next.add(part);return next;});}
  function chooseFit(kind:'comfort'|'power'|'original'){
    const next=recommendations[kind];setShift(next);onVocalRangeChange(targetRange);
  }
  function buildPlan(){
    if(!analysis)return '';
    const parts=[...selectedParts];
    const range=analysis.lowMidi!=null&&analysis.highMidi!=null?`${midiName(analysis.lowMidi+shift)}–${midiName(analysis.highMidi+shift)}`:'not detected';
    const sourceLine=`Source analysis: ${analysis.key}${analysis.bpm?`, ${bpm||analysis.bpm} BPM`:''}, ${timeSignature}, detected range ${range}.`;
    const keyLine=currentKey!=='Unknown'?`Use ${currentKey}. ${shift===0?'Keep the original key.':`Transpose the source ${formatShift(shift)}.`}`:'Key is not confirmed; preserve the supplied harmony.';
    const chordLine=analysis.chords.length?`Detected harmonic path: ${analysis.chords.join(' → ')}.`:'';
    const renderLine=`Render mode: ${renderMode}. Render these parts: ${parts.length?parts.join(', '):'Full Arrangement'}.`;
    const modeLine=renderMode==='Note-Perfect'?'Prioritize exact notes, rhythm, rests, phrasing, and written structure over stylistic improvisation.':renderMode==='Real Performance'?'Prioritize a believable human studio performance while preserving the song identity, harmony, tempo, and structure.':'Keep the notes, harmony, timing, and structure tight while using realistic human phrasing and production.';
    const voiceLine=`Lead vocal target: ${targetRange}. Keep the lead comfortably inside that range and preserve the melodic identity.`;
    return [sourceLine,keyLine,chordLine,renderLine,modeLine,voiceLine].filter(Boolean).join('\n');
  }
  function apply(){
    if(!analysis)return;const plan=buildPlan();onVocalRangeChange(targetRange);onApply(plan,targetRange);setApplied('Analysis settings applied to Sheets. Your analyzed score is ready below.');
  }

  return <section className="panel songAnalysisWorkspace">
    <p className="eyebrow">Auto Analyze</p>
    <h2>Upload → Detect → Fit → Render</h2>
    <p className="sub">Give Pie MIDI, music sheets, or a lyric/chord chart. Pie detects the musical setup first, then lets you correct anything before generation.</p>

    <div className="mixButtons" style={{flexWrap:'wrap'}}>
      <label className="primary" style={{cursor:'pointer'}}>{busy?'Turning up the heat…':'⬆ Upload Song / Score'}<input hidden type="file" accept="audio/*,.mid,.midi,application/pdf,image/*,.musicxml,.xml,application/xml,text/xml" disabled={busy} onChange={e=>{const f=e.target.files?.[0];if(f)void analyzeFile(f);e.currentTarget.value='';}}/></label>
      <button type="button" className="secondary" disabled={busy} onClick={()=>setShowChordPaste(v=>!v)}>Paste Lyrics + Chords</button>
    </div>

    {showChordPaste&&<div style={{marginTop:14}}>
      <textarea value={chordText} onChange={e=>setChordText(e.target.value)} placeholder={'Verse\nBb   Gm\nAmazing grace...\nEb   F   Bb'} style={{minHeight:120}}/>
      <button type="button" className="primary" onClick={analyzePasted} disabled={!chordText.trim()}>Analyze Chords</button>
    </div>}

    {status&&<div className="statusBox" style={{marginTop:14}}>{status}</div>}

    {analysis&&<>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10,marginTop:16}}>
        <div className="statusBox"><small>Detected Key · {analysis.keyConfidence}%</small><strong style={{display:'block',fontSize:18,marginTop:4}}>{analysis.key}</strong><small>Relative: {relativeKey(analysis.key)}</small></div>
        <div className="statusBox"><small>Tempo · {analysis.bpmConfidence?`${analysis.bpmConfidence}%`:'set manually'}</small><strong style={{display:'block',fontSize:18,marginTop:4}}>{analysis.bpm?`${analysis.bpm} BPM`:'Unknown'}</strong><small>{analysis.durationSec?`${Math.round(analysis.durationSec)} sec source`:analysis.noteCount?`${analysis.noteCount} notes read`:analysis.sourceName}</small></div>
        <div className="statusBox"><small>Time Signature · {analysis.timeConfidence}%</small><strong style={{display:'block',fontSize:18,marginTop:4}}>{analysis.timeSignature}</strong><small>Review before render</small></div>
        <div className="statusBox"><small>{analysis.sourceKind==='audio'?'Estimated Lead Range':'Detected Range'} · {analysis.rangeConfidence?`${analysis.rangeConfidence}%`:'—'}</small><strong style={{display:'block',fontSize:18,marginTop:4}}>{analysis.lowMidi!=null?`${midiName(analysis.lowMidi)}–${midiName(analysis.highMidi)}`:'Unknown'}</strong><small>{analysis.sourceKind==='audio'?'Audio estimate; score/MIDI is more exact.':'From written/MIDI notes.'}</small></div>
      </div>

      {analysis.chords.length>0&&<div style={{marginTop:16}}><div className="controlLabel">Detected chord path</div><div className="chips">{analysis.chords.map((c,i)=><span className="chip activeChip" key={`${c}-${i}`}>{c}</span>)}</div></div>}
      {analysis.sections.length>0&&<div style={{marginTop:12}}><div className="controlLabel">Structure</div><div className="chips">{analysis.sections.map(s=><span className="chip" key={s}>{s}</span>)}</div></div>}

      <div style={{borderTop:'1px solid rgba(255,255,255,.09)',marginTop:18,paddingTop:18}}>
        <h3 style={{marginTop:0}}>Review</h3>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          <label><div className="controlLabel">Key</div><select value={key} onChange={e=>{setKey(e.target.value);setShift(0)}}><option>Unknown</option>{KEY_OPTIONS.map(k=><option key={k}>{k}</option>)}</select></label>
          <label><div className="controlLabel">BPM</div><input type="number" min={35} max={240} value={bpm??''} placeholder="Set BPM" onChange={e=>setBpm(e.target.value?clamp(Number(e.target.value),35,240):null)}/></label>
          <label><div className="controlLabel">Time</div><select value={timeSignature} onChange={e=>setTimeSignature(e.target.value)}>{['4/4','3/4','6/8','2/4','12/8'].map(t=><option key={t}>{t}</option>)}</select></label>
          <div><div className="controlLabel">Current output key</div><div className="statusBox"><strong>{currentKey}</strong></div></div>
        </div>
        <div className="chips" style={{marginTop:12}}>{[-2,-1,0,1,2].map(n=><button type="button" key={n} className={`chip ${shift===n?'activeChip':''}`} disabled={key==='Unknown'} onClick={()=>setShift(n)}>{n===0?'Original':n>0?`+${n}`:n}</button>)}</div>
      </div>

      <div style={{borderTop:'1px solid rgba(255,255,255,.09)',marginTop:18,paddingTop:18}}>
        <h3 style={{marginTop:0}}>Fit to Voice</h3>
        <div className="chips">{RANGES.map(r=><button type="button" key={r} className={`chip ${targetRange===r?'activeChip':''}`} onClick={()=>setTargetRange(r)}>{r}</button>)}</div>
        {analysis.lowMidi!=null&&analysis.highMidi!=null?<div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginTop:12}}>
          <button type="button" className="secondary" onClick={()=>chooseFit('comfort')}><small>Comfort</small><br/><strong>{transposeKey(key,recommendations.comfort)}</strong><br/><small>{formatShift(recommendations.comfort)}</small></button>
          <button type="button" className="secondary" onClick={()=>chooseFit('power')}><small>Power</small><br/><strong>{transposeKey(key,recommendations.power)}</strong><br/><small>{formatShift(recommendations.power)}</small></button>
          <button type="button" className="secondary" onClick={()=>chooseFit('original')}><small>Original feel</small><br/><strong>{transposeKey(key,recommendations.original)}</strong><br/><small>{formatShift(recommendations.original)}</small></button>
        </div>:<div className="statusBox" style={{marginTop:12}}>No melody range was available from this source. Choose the singer range and key manually.</div>}
      </div>

      <div style={{borderTop:'1px solid rgba(255,255,255,.09)',marginTop:18,paddingTop:18}}>
        <h3 style={{marginTop:0}}>Render Mode</h3>
        <div className="chips">{RENDER_MODES.map(m=><button type="button" key={m} className={`chip ${renderMode===m?'activeChip':''}`} onClick={()=>setRenderMode(m)}>{m}</button>)}</div>
        <div className="controlLabel" style={{marginTop:14}}>Parts to render</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8}}>{availableParts.map(part=><button type="button" key={part} className={`secondary ${selectedParts.has(part)?'activeChip':''}`} onClick={()=>togglePart(part)} style={{textAlign:'left',minHeight:48}}>{selectedParts.has(part)?'✓ ':'＋ '}{part}</button>)}</div>
      </div>

      <div className="statusBox" style={{marginTop:16}}>
        <strong>Ready to use</strong><small style={{display:'block',marginTop:4}}>{currentKey} · {bpm?`${bpm} BPM · `:''}{timeSignature} · {targetRange} · {renderMode}</small><small style={{display:'block',marginTop:3}}>{[...selectedParts].join(', ')||'Full Arrangement'}</small>
      </div>
      <button type="button" className="primary" style={{marginTop:12,width:'100%'}} onClick={apply}>Use These Settings in Sheets</button>
      {applied&&<div className="statusBox" style={{marginTop:10}}>{applied}</div>}
    </>}
  </section>;
}
