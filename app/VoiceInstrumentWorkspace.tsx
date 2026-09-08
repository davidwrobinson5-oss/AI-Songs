'use client';

import { useRef, useState } from 'react';

type InstrumentId = 'bass' | 'drums' | 'guitar' | 'keys' | 'strings' | 'synth' | 'percussion';
type Layer = {
  id: string;
  instrument: InstrumentId;
  label: string;
  sketchBlob: Blob;
  sketchUrl: string;
  renderedBlob?: Blob;
  renderedUrl?: string;
  status: 'sketch' | 'rendering' | 'ready' | 'error';
  error?: string;
};

type Props = {
  songTitle: string;
  onUseMusic: (blob: Blob) => void;
};

const INSTRUMENTS: Array<{ id: InstrumentId; icon: string; label: string; help: string }> = [
  { id: 'bass', icon: '🎸', label: 'Bass', help: 'Hum or mouth the bass riff and groove.' },
  { id: 'drums', icon: '🥁', label: 'Drums', help: 'Beatbox the kick, snare, hats, and rhythm.' },
  { id: 'guitar', icon: '🎸', label: 'Guitar', help: 'Sing the riff, chord rhythm, or lead phrase.' },
  { id: 'keys', icon: '🎹', label: 'Keys', help: 'Voice the chord rhythm, hook, or piano figure.' },
  { id: 'strings', icon: '🎻', label: 'Strings', help: 'Sing a pad, counterline, or string phrase.' },
  { id: 'synth', icon: '🎛️', label: 'Synth', help: 'Make the synth rhythm or melodic contour.' },
  { id: 'percussion', icon: '🪘', label: 'Percussion', help: 'Mouth shakers, claps, toms, or extra rhythm.' },
];

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const blockAlign = channels * 2;
  const dataLength = buffer.length * blockAlign;
  const out = new ArrayBuffer(44 + dataLength);
  const view = new DataView(out);
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  const data = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(Math.min(channel, buffer.numberOfChannels - 1)));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, data[channel][i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

async function mixLayers(layers: Layer[]) {
  const ready = layers.filter((layer) => layer.renderedBlob instanceof Blob && layer.renderedBlob.size > 0);
  if (!ready.length) throw new Error('Render at least one instrument first.');
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) throw new Error('This browser cannot build the rough arrangement.');
  const decode = new AudioContextCtor();
  try {
    const buffers = await Promise.all(ready.map(async (layer) => decode.decodeAudioData((await layer.renderedBlob!.arrayBuffer()).slice(0))));
    const duration = Math.max(...buffers.map((buffer) => buffer.duration));
    const offline = new OfflineAudioContext(2, Math.ceil((duration + 0.25) * 44100), 44100);
    for (const buffer of buffers) {
      const source = offline.createBufferSource();
      const gain = offline.createGain();
      source.buffer = buffer;
      gain.gain.value = Math.max(0.35, Math.min(0.9, 1 / Math.sqrt(buffers.length)));
      source.connect(gain).connect(offline.destination);
      source.start(0);
    }
    return audioBufferToWav(await offline.startRendering());
  } finally {
    await decode.close().catch(() => undefined);
  }
}

export default function VoiceInstrumentWorkspace({ songTitle, onUseMusic }: Props) {
  const [instrument, setInstrument] = useState<InstrumentId>('bass');
  const [layers, setLayers] = useState<Layer[]>([]);
  const [recording, setRecording] = useState(false);
  const [bpm, setBpm] = useState(92);
  const [direction, setDirection] = useState('');
  const [status, setStatus] = useState('Pick an instrument, then perform the part with your mouth or voice.');
  const [songBuilding, setSongBuilding] = useState(false);
  const [roughUrl, setRoughUrl] = useState('');
  const [songUrl, setSongUrl] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const selected = INSTRUMENTS.find((item) => item.id === instrument) || INSTRUMENTS[0];

  async function startSketch() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      streamRef.current = stream;
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const layer: Layer = {
          id,
          instrument,
          label: selected.label,
          sketchBlob: blob,
          sketchUrl: URL.createObjectURL(blob),
          status: 'sketch',
        };
        setLayers((current) => [...current, layer]);
        setRecording(false);
        setStatus(`${selected.label} sketch captured. Tap Turn Into ${selected.label}.`);
      };
      recorder.start(250);
      setRecording(true);
      setStatus(`Recording ${selected.label} sketch at ${bpm} BPM. Perform the part from beat 1.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Microphone permission is required.');
    }
  }

  function stopSketch() {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recorderRef.current = null;
  }

  async function renderLayer(id: string) {
    const layer = layers.find((item) => item.id === id);
    if (!layer || layer.status === 'rendering') return;
    setLayers((current) => current.map((item) => item.id === id ? { ...item, status: 'rendering', error: undefined } : item));
    setStatus(`Turning your ${layer.label} sketch into a real instrument…`);
    try {
      const form = new FormData();
      form.append('file', layer.sketchBlob, `voice-${layer.instrument}.webm`);
      form.append('mode', 'instrument');
      form.append('instrument', layer.instrument);
      form.append('direction', `${direction ? `${direction}. ` : ''}Tempo target: ${bpm} BPM. Keep this as one isolated ${layer.label} layer that can stack with other parts.`);
      form.append('music_length_ms', '30000');
      form.append('reference_duration_ms', '30000');
      const response = await fetch('/api/elevenlabs/voice-instrument', { method: 'POST', body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || `Could not render ${layer.label}.`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setLayers((current) => current.map((item) => {
        if (item.id !== id) return item;
        if (item.renderedUrl) URL.revokeObjectURL(item.renderedUrl);
        return { ...item, renderedBlob: blob, renderedUrl: url, status: 'ready', error: undefined };
      }));
      setStatus(`${layer.label} is ready. Add another instrument or build the song.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : `Could not render ${layer.label}.`;
      setLayers((current) => current.map((item) => item.id === id ? { ...item, status: 'error', error: message } : item));
      setStatus(message);
    }
  }

  function removeLayer(id: string) {
    const layer = layers.find((item) => item.id === id);
    if (layer) {
      URL.revokeObjectURL(layer.sketchUrl);
      if (layer.renderedUrl) URL.revokeObjectURL(layer.renderedUrl);
    }
    setLayers((current) => current.filter((item) => item.id !== id));
  }

  async function previewRoughArrangement() {
    try {
      setStatus('Building your rough instrument arrangement…');
      const blob = await mixLayers(layers);
      if (roughUrl) URL.revokeObjectURL(roughUrl);
      setRoughUrl(URL.createObjectURL(blob));
      setStatus('Rough arrangement ready. This is the blueprint Pie can use to build the finished song.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not build the rough arrangement.');
    }
  }

  async function buildSong() {
    const ready = layers.filter((layer) => layer.status === 'ready' && layer.renderedBlob);
    if (!ready.length) return;
    setSongBuilding(true);
    setStatus('Combining your instrument ideas, then building the song…');
    try {
      const rough = await mixLayers(ready);
      if (roughUrl) URL.revokeObjectURL(roughUrl);
      setRoughUrl(URL.createObjectURL(rough));
      const form = new FormData();
      form.append('file', rough, 'pie-voice-instrument-arrangement.wav');
      form.append('mode', 'song');
      form.append('instrument', 'bass');
      form.append('direction', `${direction ? `${direction}. ` : ''}Target tempo: ${bpm} BPM. Source layers: ${ready.map((layer) => layer.label).join(', ')}. Keep their musical ideas recognizable while producing a coherent full arrangement.`);
      form.append('music_length_ms', '120000');
      form.append('reference_duration_ms', '30000');
      const response = await fetch('/api/elevenlabs/voice-instrument', { method: 'POST', body: form });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || 'Could not build the song.');
      }
      const blob = await response.blob();
      if (songUrl) URL.revokeObjectURL(songUrl);
      setSongUrl(URL.createObjectURL(blob));
      onUseMusic(blob);
      setStatus(`Song built from your ${ready.length} voice-created instrument layer${ready.length === 1 ? '' : 's'}. It is now loaded into ${songTitle || 'the current Pie song'}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not build the song.');
    } finally {
      setSongBuilding(false);
    }
  }

  function clearWorkspace() {
    if (recording || songBuilding) return;
    for (const layer of layers) {
      URL.revokeObjectURL(layer.sketchUrl);
      if (layer.renderedUrl) URL.revokeObjectURL(layer.renderedUrl);
    }
    if (roughUrl) URL.revokeObjectURL(roughUrl);
    if (songUrl) URL.revokeObjectURL(songUrl);
    setLayers([]);
    setRoughUrl('');
    setSongUrl('');
    setDirection('');
    setBpm(92);
    setInstrument('bass');
    setStatus('Voice-to-Instruments cleared. Saved Songs were not deleted.');
  }

  return (
    <>
      <section className="panel">
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
          <div><p className="eyebrow">Voice → Instruments</p><h2>Build a band with your mouth.</h2></div>
          <button type="button" className="secondary" onClick={clearWorkspace} disabled={recording || songBuilding || layers.length === 0}>↺ Clear</button>
        </div>
        <p className="sub">Pick an instrument, perform the idea with your voice, and Pie turns that performance into an instrument layer. Stack bass, drums, guitar, keys, and more, then let AI build the full song from your arrangement.</p>
      </section>

      <section className="panel">
        <h2>1. Pick the instrument</h2>
        <div className="modeGrid">
          {INSTRUMENTS.map((item) => (
            <button key={item.id} type="button" className={instrument === item.id ? 'modeCard active' : 'modeCard'} onClick={() => setInstrument(item.id)} disabled={recording}>
              <span className="icon">{item.icon}</span><strong>{item.label}</strong><small>{item.help}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>2. Perform the part</h2>
        <div className="playerCard">
          <strong>{selected.icon} {selected.label}</strong>
          <small>{selected.help} Start on beat 1 so every layer lines up.</small>
          <label className="controlLabel">Shared tempo · {bpm} BPM</label>
          <input type="range" min="40" max="220" step="1" value={bpm} onChange={(event) => setBpm(Number(event.target.value))} disabled={recording} />
          <label className="controlLabel">Sound / production direction</label>
          <textarea value={direction} onChange={(event) => setDirection(event.target.value)} maxLength={1200} placeholder="Example: warm vintage soul, punchy live drums, deep round bass, clean funk guitar…" />
          <div className="mixButtons">
            {!recording ? <button type="button" className="primary" onClick={startSketch}>🎙️ Record {selected.label} With My Voice</button> : <button type="button" className="primary" onClick={stopSketch}>■ Stop {selected.label}</button>}
          </div>
        </div>
      </section>

      {layers.length > 0 && (
        <section className="panel">
          <h2>3. Build your instrument layers</h2>
          <div style={{display:'grid',gap:12}}>
            {layers.map((layer, index) => (
              <div className="playerCard" key={layer.id}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
                  <strong>{index + 1}. {layer.label}</strong>
                  <button type="button" className="secondary" onClick={() => removeLayer(layer.id)} disabled={layer.status === 'rendering'}>Remove</button>
                </div>
                <small>Your mouth/voice sketch</small>
                <audio controls src={layer.sketchUrl} />
                {layer.status !== 'ready' && <button type="button" className="primary" onClick={() => void renderLayer(layer.id)} disabled={layer.status === 'rendering'}>{layer.status === 'rendering' ? `Turning into ${layer.label}…` : `✨ Turn Into ${layer.label}`}</button>}
                {layer.renderedUrl && <><small>AI instrument layer</small><audio controls src={layer.renderedUrl} /></>}
                {layer.error && <div className="errorBox">{layer.error}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {layers.some((layer) => layer.status === 'ready') && (
        <section className="panel">
          <h2>4. Turn the layers into a song</h2>
          <p className="sub">Pie stacks your rendered parts into a rough blueprint first. Then AI uses that blueprint to develop a polished instrumental song while keeping your riffs and grooves as the creative foundation.</p>
          <div className="mixButtons">
            <button type="button" className="secondary" onClick={() => void previewRoughArrangement()} disabled={songBuilding}>▶ Rough Arrangement</button>
            <button type="button" className="primary" onClick={() => void buildSong()} disabled={songBuilding}>{songBuilding ? 'Turning up the heat…' : '🔥 Build Full Song'}</button>
          </div>
          {roughUrl && <><small>Rough layered blueprint</small><audio controls src={roughUrl} /></>}
          {songUrl && <><small>Finished AI song</small><audio controls src={songUrl} /></>}
        </section>
      )}

      {status && <div className="statusBox">{status}</div>}
    </>
  );
}
