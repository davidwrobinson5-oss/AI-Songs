'use client';

import { useEffect, useRef, useState } from 'react';
import { unzipSync } from 'fflate';

export type MelodyNote = {
  midi: number;
  note: string;
  start: number;
  end: number;
  duration: number;
  frequency: number;
};

export type MelodyPhrase = {
  index: number;
  start: number;
  end: number;
  duration: number;
  noteCount: number;
  suggestedSyllables: number;
  notes: string[];
};

export type MelodyAnalysis = {
  duration: number;
  lowestNote: string;
  highestNote: string;
  lowestMidi: number;
  highestMidi: number;
  notes: MelodyNote[];
  phrases: MelodyPhrase[];
};

type Props = {
  prompt: string;
  vocalRange: string;
  lyrics: string;
  initialBlob?: Blob | null;
  initialAnalysis?: MelodyAnalysis | null;
  initialPrecisionGuide?: Blob | null;
  onLyricsFitted: (lyrics: string) => void;
  onMelodyChanged: (blob: Blob, analysis: MelodyAnalysis) => void;
  onPrecisionGuide: (vocalBlob: Blob, backingBlob?: Blob) => void;
  onReset?: () => void;
  onAnalysisReset?: () => void;
  onGuideReset?: () => void;
};

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function audioMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mpeg';
}

function midiToNote(midi: number) {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[((rounded % 12) + 12) % 12]}${octave}`;
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function detectFrequency(samples: Float32Array, sampleRate: number) {
  let rms = 0;
  for (let i = 0; i < samples.length; i++) rms += samples[i] * samples[i];
  rms = Math.sqrt(rms / samples.length);
  if (rms < 0.012) return 0;

  const minLag = Math.max(2, Math.floor(sampleRate / 900));
  const maxLag = Math.min(samples.length - 2, Math.floor(sampleRate / 60));
  let bestLag = 0;
  let bestCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let cross = 0;
    let energyA = 0;
    let energyB = 0;
    const limit = samples.length - lag;
    for (let i = 0; i < limit; i++) {
      const a = samples[i];
      const b = samples[i + lag];
      cross += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const corr = cross / (Math.sqrt(energyA * energyB) || 1);
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestCorr < 0.58 || !bestLag) return 0;
  return sampleRate / bestLag;
}

async function analyzeMelody(blob: Blob): Promise<MelodyAnalysis> {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot analyze audio.');

  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const source = decoded.getChannelData(0);
    const targetRate = 8000;
    const stride = Math.max(1, Math.round(decoded.sampleRate / targetRate));
    const down = new Float32Array(Math.floor(source.length / stride));
    for (let i = 0; i < down.length; i++) {
      let sum = 0;
      let count = 0;
      const start = i * stride;
      for (let j = 0; j < stride && start + j < source.length; j++) {
        sum += source[start + j];
        count++;
      }
      down[i] = sum / Math.max(1, count);
    }

    const frameSize = Math.floor(targetRate * 0.05);
    const hopSize = Math.floor(targetRate * 0.04);
    const frames: Array<{ time: number; midi: number; frequency: number }> = [];
    for (let start = 0; start + frameSize < down.length; start += hopSize) {
      const frequency = detectFrequency(down.subarray(start, start + frameSize), targetRate);
      if (frequency >= 60 && frequency <= 900) {
        frames.push({ time: start / targetRate, midi: 69 + 12 * Math.log2(frequency / 440), frequency });
      }
    }

    if (frames.length < 3) throw new Error('I could not detect a stable melody. Try humming one clear note at a time with less background noise.');

    const smoothed = frames.map((frame, i) => ({
      ...frame,
      midi: median(frames.slice(Math.max(0, i - 1), Math.min(frames.length, i + 2)).map((f) => f.midi)),
    }));

    const rawNotes: MelodyNote[] = [];
    let current: MelodyNote | null = null;
    for (const frame of smoothed) {
      const roundedMidi = Math.round(frame.midi);
      const noteStart = frame.time;
      const noteEnd = frame.time + hopSize / targetRate;
      if (!current) {
        current = { midi: roundedMidi, note: midiToNote(roundedMidi), start: noteStart, end: noteEnd, duration: noteEnd - noteStart, frequency: frame.frequency };
        continue;
      }
      const gap = noteStart - current.end;
      if (Math.abs(roundedMidi - current.midi) <= 1 && gap <= 0.09) {
        current.end = noteEnd;
        current.duration = current.end - current.start;
        current.frequency = (current.frequency + frame.frequency) / 2;
      } else {
        if (current.duration >= 0.08) rawNotes.push(current);
        current = { midi: roundedMidi, note: midiToNote(roundedMidi), start: noteStart, end: noteEnd, duration: noteEnd - noteStart, frequency: frame.frequency };
      }
    }
    if (current && current.duration >= 0.08) rawNotes.push(current);
    if (!rawNotes.length) throw new Error('I detected pitch, but not enough stable notes. Try holding each melody note a little longer.');

    const phrases: MelodyPhrase[] = [];
    let phraseNotes: MelodyNote[] = [];
    const closePhrase = () => {
      if (!phraseNotes.length) return;
      const start = phraseNotes[0].start;
      const end = phraseNotes[phraseNotes.length - 1].end;
      const noteDuration = phraseNotes.reduce((sum, n) => sum + n.duration, 0);
      phrases.push({
        index: phrases.length + 1,
        start,
        end,
        duration: end - start,
        noteCount: phraseNotes.length,
        suggestedSyllables: Math.max(2, Math.round(noteDuration / 0.28)),
        notes: phraseNotes.map((n) => n.note),
      });
      phraseNotes = [];
    };

    rawNotes.forEach((note, index) => {
      if (index > 0 && note.start - rawNotes[index - 1].end > 0.48) closePhrase();
      phraseNotes.push(note);
    });
    closePhrase();

    const midis = rawNotes.map((n) => n.midi);
    const lowestMidi = Math.min(...midis);
    const highestMidi = Math.max(...midis);
    return {
      duration: decoded.duration,
      lowestNote: midiToNote(lowestMidi),
      highestNote: midiToNote(highestMidi),
      lowestMidi,
      highestMidi,
      notes: rawNotes,
      phrases,
    };
  } finally {
    await context.close().catch(() => undefined);
  }
}

async function blobToMp3(blob: Blob) {
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot prepare melody audio.');
  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const source = decoded.getChannelData(0);
    const samples = new Int16Array(source.length);
    for (let i = 0; i < source.length; i++) samples[i] = Math.max(-32768, Math.min(32767, Math.round(source[i] * 32767)));
    const { Mp3Encoder } = await import('@breezystack/lamejs');
    const encoder = new Mp3Encoder(1, decoded.sampleRate, 128);
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < samples.length; offset += 1152) {
      const encoded = encoder.encodeBuffer(samples.subarray(offset, Math.min(samples.length, offset + 1152)));
      if (encoded.length) chunks.push(new Uint8Array(encoded));
    }
    const finalChunk = encoder.flush();
    if (finalChunk.length) chunks.push(new Uint8Array(finalChunk));
    const blobParts: BlobPart[] = chunks.map((chunk) => chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength) as ArrayBuffer);
    return new Blob(blobParts, { type: 'audio/mpeg' });
  } finally {
    await context.close().catch(() => undefined);
  }
}

export default function MelodyWorkspace({ prompt, vocalRange, lyrics, initialBlob, initialAnalysis, initialPrecisionGuide, onLyricsFitted, onMelodyChanged, onPrecisionGuide, onReset, onAnalysisReset, onGuideReset }: Props) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);
  const [melodyBlob, setMelodyBlob] = useState<Blob | null>(initialBlob || null);
  const [audioUrl, setAudioUrl] = useState(initialBlob ? URL.createObjectURL(initialBlob) : '');
  const [analysis, setAnalysis] = useState<MelodyAnalysis | null>(initialAnalysis || null);
  const [status, setStatus] = useState(initialAnalysis ? 'Saved melody analysis loaded.' : '');
  const [analyzing, setAnalyzing] = useState(false);
  const [fitting, setFitting] = useState(false);
  const [fitScore, setFitScore] = useState<number | null>(null);
  const [fitNotes, setFitNotes] = useState('');
  const [guideLoading, setGuideLoading] = useState(false);
  const [precisionGuideUrl, setPrecisionGuideUrl] = useState(initialPrecisionGuide ? URL.createObjectURL(initialPrecisionGuide) : '');
  const studioRecorderRef = useRef<MediaRecorder | null>(null);
  const studioStreamRef = useRef<MediaStream | null>(null);
  const studioChunksRef = useRef<Blob[]>([]);
  const metronomeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metronomeContextRef = useRef<AudioContext | null>(null);
  const [studioRecording,setStudioRecording]=useState(false);
  const [studioDevices,setStudioDevices]=useState<MediaDeviceInfo[]>([]);
  const [studioInputId,setStudioInputId]=useState('');
  const [studioStatus,setStudioStatus]=useState('Plug in a USB-C audio interface or adapter, then choose the input.');
  const [metronomeOn,setMetronomeOn]=useState(false);
  const [metronomeBpm,setMetronomeBpm]=useState(92);

  function setBlob(blob: Blob) {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setMelodyBlob(blob);
    setAudioUrl(URL.createObjectURL(blob));
    setAnalysis(null);
    setFitScore(null);
    setStatus('Melody loaded. Tap Analyze Melody.');
  }

  function clearPrecisionGuide() {
    if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);
    setPrecisionGuideUrl('');
    onGuideReset?.();
    setStatus('Precision guide cleared. Melody recording and saved Songs were kept.');
  }

  function clearMelodyAnalysis() {
    if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);
    setAnalysis(null);
    setFitScore(null);
    setFitNotes('');
    setPrecisionGuideUrl('');
    onAnalysisReset?.();
    setStatus('Melody analysis, fit result, and precision guide cleared. Your melody recording and lyric text were kept.');
  }

  function resetMelodyTake() {
    if (recording || studioRecording || analyzing || fitting || guideLoading) return;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);
    setMelodyBlob(null);
    setAudioUrl('');
    setAnalysis(null);
    setFitScore(null);
    setFitNotes('');
    setPrecisionGuideUrl('');
    onReset?.();
    setStatus('Melody take reset. Song description, lyric text, existing song audio, and saved Songs were kept.');
  }

  async function refreshStudioInputs() {
    try {
      const permissionStream=await navigator.mediaDevices.getUserMedia({audio:true});
      permissionStream.getTracks().forEach(track=>track.stop());
      const devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audioinput');
      setStudioDevices(devices);
      const preferred=devices.find(device=>/usb|interface|audio|headset|mic/i.test(device.label))||devices[0];
      if(preferred&&!studioInputId)setStudioInputId(preferred.deviceId);
      setStudioStatus(devices.length ? String(devices.length)+' audio input'+(devices.length===1?'':'s')+' found. Choose your USB/interface input below.' : 'No audio input was found. Check the USB-C connection and try again.');
    } catch {
      setStudioStatus('Microphone/audio permission is required before Pie can see a USB-C input.');
    }
  }

  function stopMetronome() {
    if(metronomeTimerRef.current){clearInterval(metronomeTimerRef.current);metronomeTimerRef.current=null;}
    const context=metronomeContextRef.current;
    metronomeContextRef.current=null;
    if(context)void context.close().catch(()=>undefined);
  }

  function startMetronome() {
    stopMetronome();
    if(!metronomeOn)return;
    const AudioContextCtor=window.AudioContext||(window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;
    if(!AudioContextCtor)return;
    const context=new AudioContextCtor();
    metronomeContextRef.current=context;
    const tick=()=>{
      const osc=context.createOscillator();
      const gain=context.createGain();
      osc.frequency.value=1100;
      gain.gain.setValueAtTime(0.0001,context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12,context.currentTime+0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.055);
      osc.connect(gain);gain.connect(context.destination);
      osc.start();osc.stop(context.currentTime+0.06);
    };
    tick();
    metronomeTimerRef.current=setInterval(tick,Math.max(250,Math.round(60000/metronomeBpm)));
  }

  async function startStudioRecording() {
    try {
      const audio:MediaTrackConstraints={deviceId:studioInputId?{exact:studioInputId}:undefined,channelCount:{ideal:1},echoCancellation:false,noiseSuppression:false,autoGainControl:false};
      const stream=await navigator.mediaDevices.getUserMedia({audio});
      studioStreamRef.current=stream;
      studioChunksRef.current=[];
      const recorder=new MediaRecorder(stream);
      studioRecorderRef.current=recorder;
      recorder.ondataavailable=event=>{if(event.data.size)studioChunksRef.current.push(event.data);};
      recorder.onstop=()=>{
        const blob=new Blob(studioChunksRef.current,{type:recorder.mimeType||'audio/webm'});
        setBlob(blob);
        stream.getTracks().forEach(track=>track.stop());
        studioStreamRef.current=null;
        stopMetronome();
        setStudioRecording(false);
        setStudioStatus('Live take captured. It is loaded above as your current melody/audio take.');
      };
      recorder.start(250);
      setStudioRecording(true);
      startMetronome();
      const label=stream.getAudioTracks()[0]?.label||'selected input';
      setStudioStatus('Recording from '+label+'. Keep earbuds/headphones connected if you want to hear other Pie parts while recording the selected input.');
    } catch(error) {
      stopMetronome();
      setStudioRecording(false);
      setStudioStatus(error instanceof Error?error.message:'Could not start the USB-C/audio input.');
    }
  }

  function stopStudioRecording() {
    const recorder=studioRecorderRef.current;
    studioRecorderRef.current=null;
    if(recorder&&recorder.state!=='inactive')recorder.stop();
    else {
      studioStreamRef.current?.getTracks().forEach(track=>track.stop());
      studioStreamRef.current=null;
      stopMetronome();
      setStudioRecording(false);
    }
  }

  useEffect(()=>()=>{
    studioStreamRef.current?.getTracks().forEach(track=>track.stop());
    if(metronomeTimerRef.current)clearInterval(metronomeTimerRef.current);
    const context=metronomeContextRef.current;
    if(context)void context.close().catch(()=>undefined);
  },[]);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setBlob(blob);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };
      recorder.start();
      setRecording(true);
      setStatus('Recording melody… hum or sing clearly, then tap Stop.');
    } catch {
      setStatus('Microphone permission is required to record a melody. You can also upload an audio file.');
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }

  async function analyze() {
    if (!melodyBlob) return;
    setAnalyzing(true);
    setStatus('Turning up the heat…');
    try {
      const result = await analyzeMelody(melodyBlob);
      setAnalysis(result);
      onMelodyChanged(melodyBlob, result);
      setStatus(`Detected ${result.notes.length} notes across ${result.phrases.length} phrase${result.phrases.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not analyze this melody.');
    } finally {
      setAnalyzing(false);
    }
  }

  async function fitLyrics() {
    if (!analysis) return;
    setFitting(true);
    setStatus('Fitting lyrics to melody phrases…');
    try {
      const response = await fetch('/api/melody-fit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, vocalRange, lyrics, analysis }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || 'Could not fit lyrics to the melody.');
      if (data.lyrics) onLyricsFitted(data.lyrics);
      setFitScore(typeof data.score === 'number' ? data.score : null);
      setFitNotes(data.notes || '');
      setStatus('Melody-fit lyrics are ready.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not fit lyrics to the melody.');
    } finally {
      setFitting(false);
    }
  }

  async function generatePrecisionGuide() {
    if (!analysis || !lyrics.trim() || !melodyBlob) return;
    setGuideLoading(true);
    setStatus('Turning up the heat…');
    const requestId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
      const melodyMp3 = await blobToMp3(melodyBlob);
      const form = new FormData();
      form.append('melody', melodyMp3, 'ai-songs-melody.mp3');
      form.append('lyrics', lyrics);
      form.append('requestId', requestId);

      const startRes = await fetch('/api/precision-guide', { method: 'POST', body: form });
      const start = await startRes.json();
      if (!startRes.ok) throw new Error(start?.error || start?.message || 'Could not start Mureka melody generation.');

      let stage = String(start.stage || 'song');
      let taskId = String(start.taskId || '');
      let taskToken = String(start.taskToken || '');
      if (!taskId) throw new Error('Mureka did not return a task ID.');
      if (!taskToken) throw new Error('Pie could not secure the Mureka task.');

      for (let attempt = 0; attempt < 120; attempt++) {
        setStatus('Mureka is singing your fitted lyrics to your recorded melody…');
        await sleep(3000);
        const pollRes = await fetch(`/api/precision-guide/status?stage=${encodeURIComponent(stage)}&taskId=${encodeURIComponent(taskId)}&requestId=${encodeURIComponent(requestId)}`, {
          cache: 'no-store',
          headers: { 'X-Pie-Task-Token': taskToken },
        });
        const poll = await pollRes.json();
        if (!pollRes.ok) throw new Error(poll?.error || 'Mureka precision vocal generation failed.');

        if (poll.stage === 'complete' && poll.vocalFileId) {
          setStatus('Turning up the heat…');
          const stemsRes = await fetch(`/api/soundverse/file?fileId=${encodeURIComponent(String(poll.vocalFileId))}&archive=1`, {
            cache: 'no-store',
            headers: { 'X-Pie-Task-Token': taskToken },
          });
          if (!stemsRes.ok) throw new Error('Could not separate the Mureka vocal and instrumental.');

          const archive = unzipSync(new Uint8Array(await stemsRes.arrayBuffer()));
          const entries = Object.entries(archive).filter(([name]) => /\.(mp3|wav|m4a)$/i.test(name));
          const vocalEntry = entries.find(([name]) => /vocal/i.test(name) && !/instrumental|accompaniment|backing|music/i.test(name));
          const backingEntry = entries.find(([name]) => /(instrumental|accompaniment|backing|music)/i.test(name) && !/vocal/i.test(name))
            || entries.find(([name]) => name !== vocalEntry?.[0]);
          if (!vocalEntry || !backingEntry) throw new Error('Could not identify both Mureka stems.');

          const vocalBlob = new Blob([vocalEntry[1]], { type: audioMime(vocalEntry[0]) });
          const backingBlob = new Blob([backingEntry[1]], { type: audioMime(backingEntry[0]) });
          if (precisionGuideUrl) URL.revokeObjectURL(precisionGuideUrl);
          const url = URL.createObjectURL(vocalBlob);
          setPrecisionGuideUrl(url);
          onPrecisionGuide(vocalBlob, backingBlob);
          setStatus('Precision guide + matching Mureka instrumental ready for Drob.');
          return;
        }

        if (poll.stage && poll.taskId) {
          stage = String(poll.stage);
          taskId = String(poll.taskId);
          taskToken = String(poll.taskToken || taskToken);
        }
      }
      throw new Error('Mureka generation timed out. Try again.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not generate the precision guide vocal.');
    } finally {
      setGuideLoading(false);
    }
  }

  return (
    <div className="musicControls">
      <div className="playerCard">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>1. Record or upload your melody</strong><button type="button" className="secondary" onClick={resetMelodyTake} disabled={recording||studioRecording||analyzing||fitting||guideLoading||(!melodyBlob&&!analysis&&!precisionGuideUrl)}>Clear melody</button></div>
        <small>Hum, sing, or whistle one clear lead melody. A dry recording with little background noise works best.</small>
        <div className="mixButtons">
          {!recording ? <button className="primary" onClick={startRecording}>🎤 Record Melody</button> : <button className="primary" onClick={stopRecording}>■ Stop Recording</button>}
          <label className="secondary">Upload Audio<input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (file) setBlob(file); }} /></label>
        </div>
        <div className="playerCard" style={{marginTop:16}}>
          <strong>2. Plug In & Record Live</strong>
          <small>Connect a microphone, guitar, bass, keyboard, or other instrument through a USB-C audio interface/adapter using XLR, TRS, or TS. Start building your song live on the phone.</small>
          <button type="button" className="secondary" onClick={()=>void refreshStudioInputs()} disabled={studioRecording}>🔌 Detect USB / Audio Input</button>
          {studioDevices.length>0&&<label style={{display:'grid',gap:6}}><span className="controlLabel">Recording input</span><select value={studioInputId} onChange={event=>setStudioInputId(event.target.value)} disabled={studioRecording}>{studioDevices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label||('Audio input '+(index+1))}</option>)}</select></label>}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,padding:'10px 12px',border:'1px solid rgba(255,255,255,.12)',borderRadius:14}}>
            <div style={{display:'grid',gap:2}}><strong style={{fontSize:16}}>Metronome</strong><small>Optional click in earbuds/headphones</small></div>
            <input type="checkbox" aria-label="Metronome" checked={metronomeOn} onChange={event=>setMetronomeOn(event.target.checked)} disabled={studioRecording}/>
          </div>
          {metronomeOn&&<label style={{display:'grid',gap:6}}><span className="controlLabel">{metronomeBpm} BPM</span><input type="range" min="40" max="220" step="1" value={metronomeBpm} onChange={event=>setMetronomeBpm(Number(event.target.value))} disabled={studioRecording}/></label>}
          <div style={{display:'grid',gap:4,padding:'2px 2px 4px'}}><strong style={{fontSize:15}}>Monitoring</strong><small>Hear other Pie parts through earbuds/headphones while Pie records only the selected input.</small></div>
          <div className="mixButtons">{!studioRecording?<button type="button" className="primary" onClick={()=>void startStudioRecording()}>⏺ Start Live Take</button>:<button type="button" className="primary" onClick={stopStudioRecording}>■ Stop Live Take</button>}</div>
          <div className="statusBox"><small>{studioStatus}</small></div>
          <small>Best setup: USB-C audio interface/adapter plus wired earbuds/headphones. Pie records the selected input while monitoring and the metronome stay on the output side.</small>
        </div>
        {audioUrl && <audio controls src={audioUrl} />}
      </div>

      {melodyBlob && <button className="primary" onClick={analyze} disabled={analyzing}>{analyzing ? 'Turning up the heat…' : '2. Analyze Melody'}</button>}

      {analysis && (
        <div className="playerCard">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>Melody map</strong><button type="button" className="secondary" onClick={clearMelodyAnalysis} disabled={analyzing||fitting||guideLoading}>Clear analysis</button></div>
          <small>Range: {analysis.lowestNote} – {analysis.highestNote} · {analysis.notes.length} notes · {analysis.phrases.length} phrases</small>
          {analysis.phrases.map((phrase) => <div className="statusBox" key={phrase.index}>Phrase {phrase.index}: {phrase.notes.join(' ')} · about {phrase.suggestedSyllables} syllables</div>)}
          <button className="primary" onClick={fitLyrics} disabled={fitting}>{fitting ? 'Fitting Lyrics…' : '3. Fit Lyrics to This Melody'}</button>
        </div>
      )}

      {fitScore !== null && <div className="statusBox">Melody fit score: {fitScore}/100{fitNotes ? ` · ${fitNotes}` : ''}</div>}

      {analysis && lyrics.trim() && (
        <div className="playerCard">
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}><strong>Precision Vocal Engine — Mureka</strong>{precisionGuideUrl&&<button type="button" className="secondary" onClick={clearPrecisionGuide} disabled={guideLoading}>Clear guide</button>}</div>
          <small>AI-Songs sends your recorded melody directly to Mureka with the fitted lyrics, then isolates the vocal for Drob conversion.</small>
          <button className="primary" onClick={generatePrecisionGuide} disabled={guideLoading}>{guideLoading ? 'Turning up the heat…' : '4. Generate Precision Guide Vocal'}</button>
          {precisionGuideUrl && <><small>Isolated melody-following guide vocal</small><audio controls src={precisionGuideUrl} /></>}
        </div>
      )}

      {status && <div className="statusBox">{status}</div>}
    </div>
  );
}
