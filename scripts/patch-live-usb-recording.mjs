import fs from 'node:fs';

const path = 'app/MelodyWorkspace.tsx';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  "import { useRef, useState } from 'react';",
  "import { useEffect, useRef, useState } from 'react';",
);

const stateAnchor = "  const [precisionGuideUrl, setPrecisionGuideUrl] = useState(initialPrecisionGuide ? URL.createObjectURL(initialPrecisionGuide) : '');";
if (source.includes(stateAnchor) && !source.includes('studioRecorderRef')) {
  const stateLines = [
    stateAnchor,
    '  const studioRecorderRef = useRef<MediaRecorder | null>(null);',
    '  const studioStreamRef = useRef<MediaStream | null>(null);',
    '  const studioChunksRef = useRef<Blob[]>([]);',
    '  const metronomeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);',
    '  const metronomeContextRef = useRef<AudioContext | null>(null);',
    '  const [studioRecording,setStudioRecording]=useState(false);',
    '  const [studioDevices,setStudioDevices]=useState<MediaDeviceInfo[]>([]);',
    "  const [studioInputId,setStudioInputId]=useState('');",
    "  const [studioStatus,setStudioStatus]=useState('Plug in a USB-C audio interface or adapter, then choose the input.');",
    '  const [metronomeOn,setMetronomeOn]=useState(false);',
    '  const [metronomeBpm,setMetronomeBpm]=useState(92);',
    '  const [headphoneOverdub,setHeadphoneOverdub]=useState(true);',
  ].join('\n');
  source = source.replace(stateAnchor, stateLines);
}

const functionAnchor = '  async function startRecording() {';
if (source.includes(functionAnchor) && !source.includes('async function refreshStudioInputs()')) {
  const functions = [
    '  async function refreshStudioInputs() {',
    '    try {',
    '      const permissionStream=await navigator.mediaDevices.getUserMedia({audio:true});',
    '      permissionStream.getTracks().forEach(track=>track.stop());',
    "      const devices=(await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='audioinput');",
    '      setStudioDevices(devices);',
    "      const preferred=devices.find(device=>/usb|interface|audio|headset|mic/i.test(device.label))||devices[0];",
    '      if(preferred&&!studioInputId)setStudioInputId(preferred.deviceId);',
    "      setStudioStatus(devices.length ? String(devices.length)+' audio input'+(devices.length===1?'':'s')+' found. Choose your USB/interface input below.' : 'No audio input was found. Check the USB-C connection and try again.');",
    '    } catch {',
    "      setStudioStatus('Microphone/audio permission is required before Pie can see a USB-C input.');",
    '    }',
    '  }',
    '',
    '  function stopMetronome() {',
    '    if(metronomeTimerRef.current){clearInterval(metronomeTimerRef.current);metronomeTimerRef.current=null;}',
    '    const context=metronomeContextRef.current;',
    '    metronomeContextRef.current=null;',
    '    if(context)void context.close().catch(()=>undefined);',
    '  }',
    '',
    '  function startMetronome() {',
    '    stopMetronome();',
    '    if(!metronomeOn)return;',
    '    const AudioContextCtor=window.AudioContext||(window as typeof window & {webkitAudioContext?:typeof AudioContext}).webkitAudioContext;',
    '    if(!AudioContextCtor)return;',
    '    const context=new AudioContextCtor();',
    '    metronomeContextRef.current=context;',
    '    const tick=()=>{',
    '      const osc=context.createOscillator();',
    '      const gain=context.createGain();',
    '      osc.frequency.value=1100;',
    '      gain.gain.setValueAtTime(0.0001,context.currentTime);',
    '      gain.gain.exponentialRampToValueAtTime(0.12,context.currentTime+0.005);',
    '      gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.055);',
    '      osc.connect(gain);gain.connect(context.destination);',
    '      osc.start();osc.stop(context.currentTime+0.06);',
    '    };',
    '    tick();',
    '    metronomeTimerRef.current=setInterval(tick,Math.max(250,Math.round(60000/metronomeBpm)));',
    '  }',
    '',
    '  async function startStudioRecording() {',
    '    try {',
    '      const audio:MediaTrackConstraints={',
    '        deviceId:studioInputId?{exact:studioInputId}:undefined,',
    '        channelCount:{ideal:1},',
    '        echoCancellation:false,',
    '        noiseSuppression:false,',
    '        autoGainControl:false,',
    '      };',
    '      const stream=await navigator.mediaDevices.getUserMedia({audio});',
    '      studioStreamRef.current=stream;',
    '      studioChunksRef.current=[];',
    '      const recorder=new MediaRecorder(stream);',
    '      studioRecorderRef.current=recorder;',
    '      recorder.ondataavailable=event=>{if(event.data.size)studioChunksRef.current.push(event.data);};',
    '      recorder.onstop=()=>{',
    "        const blob=new Blob(studioChunksRef.current,{type:recorder.mimeType||'audio/webm'});",
    '        setBlob(blob);',
    '        stream.getTracks().forEach(track=>track.stop());',
    '        studioStreamRef.current=null;',
    '        stopMetronome();',
    '        setStudioRecording(false);',
    "        setStudioStatus('Live take captured. It is loaded above as your current melody/audio take.');",
    '      };',
    '      recorder.start(250);',
    '      setStudioRecording(true);',
    '      startMetronome();',
    "      const label=stream.getAudioTracks()[0]?.label||'selected input';",
    "      setStudioStatus('Recording from '+label+'. '+(headphoneOverdub?'Keep earbuds/headphones connected to hear other Pie parts without feeding them into the selected input.':'Other Pie playback is not being used for monitoring.'));",
    '    } catch(error) {',
    '      stopMetronome();',
    '      setStudioRecording(false);',
    "      setStudioStatus(error instanceof Error?error.message:'Could not start the USB-C/audio input.');",
    '    }',
    '  }',
    '',
    '  function stopStudioRecording() {',
    '    const recorder=studioRecorderRef.current;',
    '    studioRecorderRef.current=null;',
    "    if(recorder&&recorder.state!=='inactive')recorder.stop();",
    '    else {',
    '      studioStreamRef.current?.getTracks().forEach(track=>track.stop());',
    '      studioStreamRef.current=null;',
    '      stopMetronome();',
    '      setStudioRecording(false);',
    '    }',
    '  }',
    '',
    '  useEffect(()=>()=>{',
    '    studioStreamRef.current?.getTracks().forEach(track=>track.stop());',
    '    if(metronomeTimerRef.current)clearInterval(metronomeTimerRef.current);',
    '    const context=metronomeContextRef.current;',
    '    if(context)void context.close().catch(()=>undefined);',
    '  },[]);',
    '',
  ].join('\n');
  source = source.replace(functionAnchor, functions + functionAnchor);
}

const renderAnchor = [
  '        {audioUrl && <audio controls src={audioUrl} />}',
  '      </div>',
  '',
  "      {melodyBlob && <button className=\"primary\" onClick={analyze} disabled={analyzing}>{analyzing ? 'Analyzing Melody…' : '2. Analyze Melody'}</button>}",
].join('\n');

if (source.includes(renderAnchor) && !source.includes('Plug In & Record Live')) {
  const replacement = [
    '        {audioUrl && <audio controls src={audioUrl} />}',
    '      </div>',
    '',
    '      <div className="playerCard" style={{marginTop:14}}>',
    '        <strong>2. Plug In & Record Live</strong>',
    '        <small>Connect a microphone, guitar, bass, keyboard, or other instrument through a USB-C audio interface/adapter with XLR, TRS, or TS. Build your song directly on the phone.</small>',
    '        <button type="button" className="secondary" onClick={()=>void refreshStudioInputs()} disabled={studioRecording}>🔌 Detect USB / Audio Input</button>',
    "        {studioDevices.length>0&&<label style={{display:'grid',gap:6}}><span className=\"controlLabel\">Recording input</span><select value={studioInputId} onChange={event=>setStudioInputId(event.target.value)} disabled={studioRecording}>{studioDevices.map((device,index)=><option key={device.deviceId} value={device.deviceId}>{device.label||('Audio input '+(index+1))}</option>)}</select></label>}",
    "        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>",
    "          <label className=\"statusBox\" style={{display:'grid',gap:7}}><span><strong>Metronome</strong><small style={{display:'block'}}>Optional click in earbuds/headphones</small></span><input type=\"checkbox\" checked={metronomeOn} onChange={event=>setMetronomeOn(event.target.checked)} disabled={studioRecording}/></label>",
    "          <label className=\"statusBox\" style={{display:'grid',gap:7}}><span><strong>Overdub monitoring</strong><small style={{display:'block'}}>Hear other Pie parts through earbuds while the selected input records independently.</small></span><input type=\"checkbox\" checked={headphoneOverdub} onChange={event=>setHeadphoneOverdub(event.target.checked)} disabled={studioRecording}/></label>",
    '        </div>',
    "        {metronomeOn&&<label style={{display:'grid',gap:6}}><span className=\"controlLabel\">Metronome · {metronomeBpm} BPM</span><input type=\"range\" min=\"40\" max=\"220\" step=\"1\" value={metronomeBpm} onChange={event=>setMetronomeBpm(Number(event.target.value))} disabled={studioRecording}/></label>}",
    '        <div className="mixButtons">{!studioRecording?<button type="button" className="primary" onClick={()=>void startStudioRecording()}>⏺ Start Live Take</button>:<button type="button" className="primary" onClick={stopStudioRecording}>■ Stop Live Take</button>}</div>',
    '        <div className="statusBox"><small>{studioStatus}</small></div>',
    '        <small>Best setup: USB-C audio interface/adapter + wired earbuds/headphones. Pie records the selected input track; headphone playback and the metronome stay on the output side unless they acoustically bleed into an open microphone.</small>',
    '      </div>',
    '',
    "      {melodyBlob && <button className=\"primary\" onClick={analyze} disabled={analyzing}>{analyzing ? 'Analyzing Melody…' : '3. Analyze Melody'}</button>}",
  ].join('\n');
  source = source.replace(renderAnchor, replacement);
}

fs.writeFileSync(path, source);
console.log('Added USB-C live recording, input selection, metronome, and headphone overdub controls under Record Melody.');
