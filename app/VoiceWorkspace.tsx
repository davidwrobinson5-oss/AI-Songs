'use client';

import { useRef, useState } from 'react';
import TrainVoiceWorkspace from './TrainVoiceWorkspace';

type Props = {
  backingUrl: string;
  lyrics: string;
  songTitle: string;
  onUseVocal: (blob: Blob) => void;
};

type Take = {
  id: string;
  blob: Blob;
  url: string;
  name: string;
};

type VocalSettings = {
  vocalLevel: number;
  cleanup: number;
  compression: number;
  deEss: number;
  air: number;
  space: number;
  timingMs: number;
};

const PRESETS: Record<string, VocalSettings> = {
  Natural: { vocalLevel: 1, cleanup: 0.68, compression: 0.58, deEss: 0.55, air: 0.42, space: 0.06, timingMs: 0 },
  Warm: { vocalLevel: 1, cleanup: 0.55, compression: 0.66, deEss: 0.42, air: 0.24, space: 0.08, timingMs: 0 },
  Bright: { vocalLevel: 0.98, cleanup: 0.66, compression: 0.54, deEss: 0.68, air: 0.82, space: 0.07, timingMs: 0 },
  Tight: { vocalLevel: 1, cleanup: 0.78, compression: 0.7, deEss: 0.62, air: 0.34, space: 0.02, timingMs: 0 },
};

function createImpulse(context: BaseAudioContext, seconds = 1, decay = 2.8) {
  const length = Math.max(1, Math.floor(context.sampleRate * seconds));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel++) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function createVocalChain(context: BaseAudioContext, settings: VocalSettings) {
  const input = context.createGain();
  const highpass = context.createBiquadFilter();
  const mudCut = context.createBiquadFilter();
  const presence = context.createBiquadFilter();
  const deEss = context.createBiquadFilter();
  const air = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const level = context.createGain();
  const dry = context.createGain();
  const wet = context.createGain();
  const reverb = context.createConvolver();
  const output = context.createGain();

  highpass.type = 'highpass';
  highpass.frequency.value = 72;
  mudCut.type = 'peaking';
  mudCut.frequency.value = 285;
  mudCut.Q.value = 0.95;
  mudCut.gain.value = -4.3 * settings.cleanup;
  presence.type = 'peaking';
  presence.frequency.value = 3200;
  presence.Q.value = 0.9;
  presence.gain.value = 1.3 + settings.cleanup * 1.5;
  deEss.type = 'peaking';
  deEss.frequency.value = 6900;
  deEss.Q.value = 1.35;
  deEss.gain.value = -4.8 * settings.deEss;
  air.type = 'highshelf';
  air.frequency.value = 9800;
  air.gain.value = 3.2 * settings.air;
  compressor.threshold.value = -14 - settings.compression * 12;
  compressor.knee.value = 12;
  compressor.ratio.value = 1.8 + settings.compression * 2.8;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.14;
  level.gain.value = settings.vocalLevel;
  dry.gain.value = Math.max(0.72, 1 - settings.space * 0.7);
  wet.gain.value = settings.space;
  reverb.buffer = createImpulse(context);

  input.connect(highpass);
  highpass.connect(mudCut);
  mudCut.connect(presence);
  presence.connect(deEss);
  deEss.connect(air);
  air.connect(compressor);
  compressor.connect(level);
  level.connect(dry).connect(output);
  level.connect(reverb).connect(wet).connect(output);
  return { input, output };
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function audioBufferToWav(buffer: AudioBuffer) {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const blockAlign = channels * 2;
  const dataLength = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataLength);
  const view = new DataView(arrayBuffer);
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
  const channelData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(Math.min(i, buffer.numberOfChannels - 1)));
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < channels; channel++) {
      const sample = Math.max(-1, Math.min(1, channelData[channel][i] || 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

export default function VoiceWorkspace({ backingUrl, lyrics, songTitle, onUseVocal }: Props) {
  const [choice, setChoice] = useState<'record' | 'train' | null>(null);
  const [takes, setTakes] = useState<Take[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState('');
  const [presetName, setPresetName] = useState('Natural');
  const [settings, setSettings] = useState<VocalSettings>(PRESETS.Natural);
  const [renderedUrl, setRenderedUrl] = useState('');
  const [renderedBlob, setRenderedBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const backingAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewContextRef = useRef<AudioContext | null>(null);
  const previewSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const selectedTake = takes.find((take) => take.id === selectedId) || takes[takes.length - 1];

  function updateSetting(key: keyof VocalSettings, value: number) {
    setPresetName('Custom');
    setSettings((current) => ({ ...current, [key]: value }));
    setRenderedBlob(null);
    if (renderedUrl) URL.revokeObjectURL(renderedUrl);
    setRenderedUrl('');
  }

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (!preset) return;
    setPresetName(name);
    setSettings({ ...preset, timingMs: settings.timingMs });
    setRenderedBlob(null);
    if (renderedUrl) URL.revokeObjectURL(renderedUrl);
    setRenderedUrl('');
  }

  async function startRecording() {
    if (!backingUrl) {
      setStatus('Create or open a song with music first, then come back to Voice → Record Live.');
      return;
    }
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
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const take: Take = { id, blob, url: URL.createObjectURL(blob), name: `Live Take ${takes.length + 1}` };
        setTakes((current) => [...current, take]);
        setSelectedId(id);
        setRecording(false);
        setStatus('Take captured. Use Preview Mix, adjust the vocal tools, then render the polished vocal.');
      };
      recorder.start(250);
      setRecording(true);
      setStatus('Recording live with the backing track. Use headphones so the music does not bleed into the mic.');
      if (backingAudioRef.current) {
        backingAudioRef.current.currentTime = 0;
        backingAudioRef.current.onended = () => {
          if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
        };
        await backingAudioRef.current.play();
      }
    } catch (error) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setRecording(false);
      setStatus(error instanceof Error ? error.message : 'Microphone access is required for Record Live.');
    }
  }

  function stopRecording() {
    backingAudioRef.current?.pause();
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
    recorderRef.current = null;
  }

  function stopPreview() {
    for (const source of previewSourcesRef.current) {
      try { source.stop(); } catch {}
    }
    previewSourcesRef.current = [];
  }

  async function previewMix() {
    if (!selectedTake || !backingUrl) return;
    stopPreview();
    setStatus('Loading preview mix…');
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('This browser does not support live audio preview.');
      const context = previewContextRef.current || new AudioContextCtor();
      previewContextRef.current = context;
      if (context.state === 'suspended') await context.resume();
      const [backingBytes, vocalBytes] = await Promise.all([
        fetch(backingUrl).then((r) => { if (!r.ok) throw new Error('Could not load the backing track.'); return r.arrayBuffer(); }),
        selectedTake.blob.arrayBuffer(),
      ]);
      const [backing, vocal] = await Promise.all([
        context.decodeAudioData(backingBytes.slice(0)),
        context.decodeAudioData(vocalBytes.slice(0)),
      ]);
      const backingSource = context.createBufferSource();
      const vocalSource = context.createBufferSource();
      const backingGain = context.createGain();
      const chain = createVocalChain(context, settings);
      backingSource.buffer = backing;
      vocalSource.buffer = vocal;
      backingGain.gain.value = 0.9;
      backingSource.connect(backingGain).connect(context.destination);
      vocalSource.connect(chain.input);
      chain.output.connect(context.destination);
      const startAt = context.currentTime + 0.12;
      const timing = settings.timingMs / 1000;
      if (timing >= 0) {
        backingSource.start(startAt);
        vocalSource.start(startAt + timing);
      } else {
        vocalSource.start(startAt);
        backingSource.start(startAt + Math.abs(timing));
      }
      previewSourcesRef.current = [backingSource, vocalSource];
      setStatus(`${presetName} preview playing · timing ${settings.timingMs >= 0 ? '+' : ''}${settings.timingMs} ms`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not preview this take.');
    }
  }

  async function renderPolishedVocal() {
    if (!selectedTake) return;
    setStatus('Rendering polished vocal…');
    try {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error('This browser cannot render the vocal.');
      const decodeContext = new AudioContextCtor();
      const vocal = await decodeContext.decodeAudioData((await selectedTake.blob.arrayBuffer()).slice(0));
      await decodeContext.close().catch(() => undefined);
      const sampleRate = 44100;
      const timing = settings.timingMs / 1000;
      const leading = Math.max(0, timing);
      const sourceOffset = Math.max(0, -timing);
      const playable = Math.max(0, vocal.duration - sourceOffset);
      const offline = new OfflineAudioContext(2, Math.ceil((leading + playable + 1.2) * sampleRate), sampleRate);
      const source = offline.createBufferSource();
      const chain = createVocalChain(offline, settings);
      source.buffer = vocal;
      source.connect(chain.input);
      chain.output.connect(offline.destination);
      source.start(leading, sourceOffset);
      const rendered = await offline.startRendering();
      const blob = audioBufferToWav(rendered);
      if (renderedUrl) URL.revokeObjectURL(renderedUrl);
      const url = URL.createObjectURL(blob);
      setRenderedBlob(blob);
      setRenderedUrl(url);
      setStatus('Polished vocal rendered. Listen below, then use it in the song.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not render the polished vocal.');
    }
  }

  function useRenderedVocal() {
    if (!renderedBlob) return;
    onUseVocal(renderedBlob);
    setStatus('Polished live vocal loaded into this song. It is ready for Mix and saving as a song version.');
  }

  if (!choice) {
    return (
      <section className="panel">
        <p className="eyebrow">Voice</p>
        <h2>What do you want to do?</h2>
        <div className="modeGrid">
          <button className="modeCard" onClick={() => setChoice('record')}>
            <span className="icon">🎙️</span><strong>Record Live</strong><small>Sing over music you already created. See the lyrics, record takes, fix timing, clean up the vocal, compress, de-ess, brighten, add space, and render a polished vocal.</small>
          </button>
          <button className="modeCard" onClick={() => setChoice('train')}>
            <span className="icon">🧬</span><strong>Train Voice</strong><small>Record or upload clean solo vocals and prepare the Kits training package for your custom AI singing voice.</small>
          </button>
        </div>
      </section>
    );
  }

  if (choice === 'train') {
    return (
      <>
        <section className="panel"><button className="secondary" onClick={() => setChoice(null)}>← Voice Choices</button></section>
        <TrainVoiceWorkspace />
      </>
    );
  }

  return (
    <>
      <section className="panel">
        <button className="secondary" onClick={() => setChoice(null)}>← Voice Choices</button>
        <p className="eyebrow">Record Live</p>
        <h2>{songTitle || 'Current Song'}</h2>
        <p className="sub">Use headphones. The backing track starts when recording starts so you can build the lead vocal directly on top of the song.</p>
      </section>

      <section className="panel">
        <h2>Backing track</h2>
        {backingUrl ? <audio ref={backingAudioRef} controls src={backingUrl} style={{ width: '100%' }} /> : <div className="statusBox">No music is loaded. Create or open a song first.</div>}
        <div className="mixButtons">
          {!recording ? <button className="primary" onClick={startRecording} disabled={!backingUrl}>🎙️ Record Live Take</button> : <button className="primary" onClick={stopRecording}>■ Stop Take</button>}
          <label className="secondary">Upload Take<input type="file" accept="audio/*" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; const take = { id, blob: file, url: URL.createObjectURL(file), name: file.name }; setTakes((current) => [...current, take]); setSelectedId(id); setStatus('Vocal take uploaded.'); }} /></label>
        </div>
      </section>

      <section className="panel">
        <h2>Lyrics</h2>
        <div className="result" style={{ maxHeight: 340, overflowY: 'auto' }}><pre>{lyrics.trim() || 'No lyrics loaded for this song yet.'}</pre></div>
      </section>

      {takes.length > 0 && (
        <section className="panel">
          <h2>Vocal takes</h2>
          {takes.map((take, index) => (
            <div className="playerCard" key={take.id}>
              <strong>{take.name || `Take ${index + 1}`}{take.id === selectedTake?.id ? ' · Selected' : ''}</strong>
              <audio controls src={take.url} />
              <button className="secondary" onClick={() => { setSelectedId(take.id); setRenderedBlob(null); if (renderedUrl) URL.revokeObjectURL(renderedUrl); setRenderedUrl(''); }}>Use This Take</button>
            </div>
          ))}
        </section>
      )}

      {selectedTake && (
        <section className="panel">
          <h2>Perfect the vocal</h2>
          <div className="chips">{Object.keys(PRESETS).map((name) => <button key={name} className={presetName === name ? 'chip activeChip' : 'chip'} onClick={() => applyPreset(name)}>{name}</button>)}</div>

          <div className="playerCard">
            <label>Vocal Level · {Math.round(settings.vocalLevel * 100)}%</label>
            <input type="range" min="0.5" max="1.4" step="0.01" value={settings.vocalLevel} onChange={(e) => updateSetting('vocalLevel', Number(e.target.value))} />
            <label>Cleanup · {Math.round(settings.cleanup * 100)}%</label>
            <input type="range" min="0" max="1" step="0.01" value={settings.cleanup} onChange={(e) => updateSetting('cleanup', Number(e.target.value))} />
            <label>Compression · {Math.round(settings.compression * 100)}%</label>
            <input type="range" min="0" max="1" step="0.01" value={settings.compression} onChange={(e) => updateSetting('compression', Number(e.target.value))} />
            <label>De-ess · {Math.round(settings.deEss * 100)}%</label>
            <input type="range" min="0" max="1" step="0.01" value={settings.deEss} onChange={(e) => updateSetting('deEss', Number(e.target.value))} />
            <label>Air / Clarity · {Math.round(settings.air * 100)}%</label>
            <input type="range" min="0" max="1" step="0.01" value={settings.air} onChange={(e) => updateSetting('air', Number(e.target.value))} />
            <label>Space / Reverb · {Math.round(settings.space * 100)}%</label>
            <input type="range" min="0" max="0.35" step="0.01" value={settings.space} onChange={(e) => updateSetting('space', Number(e.target.value))} />
            <label>Timing · {settings.timingMs >= 0 ? '+' : ''}{settings.timingMs} ms</label>
            <input type="range" min="-500" max="500" step="10" value={settings.timingMs} onChange={(e) => updateSetting('timingMs', Number(e.target.value))} />
          </div>

          <div className="mixButtons">
            <button className="primary" onClick={previewMix}>▶ Preview Mix</button>
            <button className="secondary" onClick={stopPreview}>■ Stop</button>
          </div>
          <button className="primary" onClick={renderPolishedVocal}>✨ Render Polished Vocal</button>
        </section>
      )}

      {renderedUrl && (
        <section className="panel">
          <h2>Polished vocal</h2>
          <audio controls src={renderedUrl} style={{ width: '100%' }} />
          <button className="primary" onClick={useRenderedVocal}>✓ Use This Vocal in Song</button>
        </section>
      )}

      {status && <div className="statusBox">{status}</div>}
    </>
  );
}
