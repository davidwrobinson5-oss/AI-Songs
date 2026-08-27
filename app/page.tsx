'use client';

import { useState } from 'react';
import DrobMixPlayer from './DrobMixPlayer';

type StartMode = 'music' | 'lyrics' | 'melody';

const modes = [
  { id: 'music' as StartMode, icon: '🎹', title: 'Music First', copy: 'Generate the music first, then build lyrics, melody, and your final vocal around it.' },
  { id: 'lyrics' as StartMode, icon: '✍️', title: 'Lyrics First', copy: 'Start with the message, hook, verses, rhyme scheme, and song structure.' },
  { id: 'melody' as StartMode, icon: '🎤', title: 'Melody First', copy: 'Sing, hum, or upload a melody, then fit lyrics precisely to it.' },
];

const ranges = ['Bass', 'Baritone', 'Tenor', 'Alto', 'Soprano', 'Custom'];
const durations = [
  { label: '30 sec', value: 30000 },
  { label: '1 min', value: 60000 },
  { label: '2 min', value: 120000 },
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Home() {
  const [mode, setMode] = useState<StartMode>('music');
  const [vocalRange, setVocalRange] = useState('Baritone');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [durationMs, setDurationMs] = useState(30000);
  const [instrumental, setInstrumental] = useState(true);
  const [drobLoading, setDrobLoading] = useState(false);
  const [drobStatus, setDrobStatus] = useState('');
  const [drobError, setDrobError] = useState('');
  const [drobVocalUrl, setDrobVocalUrl] = useState('');
  const [guideVocalUrl, setGuideVocalUrl] = useState('');
  const [backingUrl, setBackingUrl] = useState('');

  async function generateDirection() {
    setLoading(true);
    setResult('');
    try {
      const res = await fetch('/api/song-idea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, vocalRange, prompt }),
      });
      const data = await res.json();
      setResult(data.text ?? data.error ?? 'No response returned.');
    } catch {
      setResult('Could not reach the AI service.');
    } finally {
      setLoading(false);
    }
  }

  async function generateMusic() {
    if (!prompt.trim()) return;
    setMusicLoading(true);
    setMusicError('');
    setResult('');
    setDrobStatus('');
    setDrobError('');
    setDrobVocalUrl('');
    setGuideVocalUrl('');
    setBackingUrl('');
    setGeneratedBlob(null);

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl('');
    }

    const productionPrompt = instrumental
      ? `${prompt}\n\nGenerate an original instrumental composition with no vocals. Leave space for a future ${vocalRange} lead vocal.`
      : `${prompt}\n\nGenerate an original song. Keep the lead vocal comfortably suited to a ${vocalRange} range.`;

    try {
      const res = await fetch('/api/elevenlabs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: productionPrompt,
          music_length_ms: durationMs,
          force_instrumental: instrumental,
        }),
      });

      if (!res.ok) {
        const raw = await res.text();
        let message = raw || 'Music generation failed.';
        try {
          const parsed = JSON.parse(raw);
          message = parsed?.detail?.message || parsed?.detail?.status || parsed?.error || message;
          const suggestion = parsed?.detail?.data?.prompt_suggestion;
          if (suggestion) message += `\nSuggested prompt: ${suggestion}`;
        } catch {}
        setMusicError(message);
        return;
      }

      const blob = await res.blob();
      setGeneratedBlob(blob);
      setAudioUrl(URL.createObjectURL(blob));
    } catch {
      setMusicError('Could not reach ElevenLabs Music v2.');
    } finally {
      setMusicLoading(false);
    }
  }

  async function waitForSeparation(id: number | string) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const res = await fetch(`/api/kits/separation-status?id=${encodeURIComponent(String(id))}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not check vocal separation.');
      if (data.status === 'success') return data;
      if (data.status === 'error' || data.status === 'cancelled') throw new Error('Kits vocal separation failed.');
      await sleep(2000);
    }
    throw new Error('Vocal separation timed out. Try again.');
  }

  async function waitForConversion(id: number | string) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const res = await fetch(`/api/kits/conversion-status?id=${encodeURIComponent(String(id))}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Could not check voice conversion.');
      if (data.status === 'success') return data;
      if (data.status === 'error' || data.status === 'cancelled') throw new Error('Kits voice conversion failed.');
      await sleep(2000);
    }
    throw new Error('Voice conversion timed out. Try again.');
  }

  async function useDrobVoice() {
    if (!generatedBlob || instrumental) return;
    setDrobLoading(true);
    setDrobError('');
    setDrobStatus('Finding Drob voice…');

    try {
      const modelsRes = await fetch('/api/kits/models', { cache: 'no-store' });
      const models = await modelsRes.json();
      const model = models?.data?.find((m: { title?: string; isUsable?: boolean }) => m.title?.toLowerCase() === 'drob' && m.isUsable)
        || models?.data?.find((m: { isUsable?: boolean }) => m.isUsable);
      if (!modelsRes.ok || !model?.id) throw new Error('No usable Kits custom voice was found.');

      setDrobStatus('Separating the original singer…');
      const form = new FormData();
      form.append('file', generatedBlob, 'generated-song.mp3');
      const separateRes = await fetch('/api/kits/separate', { method: 'POST', body: form });
      const separationJob = await separateRes.json();
      if (!separateRes.ok || !separationJob?.id) throw new Error(separationJob?.error || 'Could not start vocal separation.');

      const separation = await waitForSeparation(separationJob.id);
      const backing = separation.backingAudioFileUrl
        || separation.stemFileUrls?.find((s: { instrument?: string }) => s.instrument === 'backing')?.url
        || separation.lossyStemFileUrls?.find((s: { instrument?: string }) => s.instrument === 'backing')?.url;
      const guideVocal = separation.vocalAudioFileUrl || separation.lossyVocalAudioFileUrl;
      if (!backing || !guideVocal) throw new Error('Kits did not return both the backing and vocal stems.');
      setBackingUrl(backing);
      setGuideVocalUrl(guideVocal);

      setDrobStatus('Converting the singer to Drob…');
      const convertRes = await fetch('/api/kits/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: model.id, separationId: separationJob.id, pitchShift: 0 }),
      });
      const conversionJob = await convertRes.json();
      if (!convertRes.ok || !conversionJob?.id) throw new Error(conversionJob?.error || 'Could not start Drob voice conversion.');

      const conversion = await waitForConversion(conversionJob.id);
      const converted = conversion.outputFileUrl || conversion.lossyOutputFileUrl || conversion.recombinedAudioFileUrl;
      if (!converted) throw new Error('Kits finished the conversion but no output audio was returned.');
      setDrobVocalUrl(converted);
      setDrobStatus('Drob voice is ready. Auto-alignment will correct timing when you play it.');
    } catch (error) {
      setDrobError(error instanceof Error ? error.message : 'Could not create the Drob vocal.');
      setDrobStatus('');
    } finally {
      setDrobLoading(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="brand">AI SONGS</div>
        <p className="eyebrow">Your cloud music studio</p>
        <h1>Create a song from your phone.</h1>
        <p className="sub">Start with music, lyrics, or a melody. Build the song, vocals, mix, master, stems, MIDI, and sheet music in one mobile-first workspace.</p>
      </section>

      <section className="panel">
        <h2>How do you want to start?</h2>
        <div className="modeGrid">
          {modes.map((item) => (
            <button key={item.id} className={`modeCard ${mode === item.id ? 'active' : ''}`} onClick={() => setMode(item.id)}>
              <span className="icon">{item.icon}</span>
              <strong>{item.title}</strong>
              <small>{item.copy}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Lead vocal range</h2>
        <div className="chips">
          {ranges.map((r) => <button key={r} className={vocalRange === r ? 'chip activeChip' : 'chip'} onClick={() => setVocalRange(r)}>{r}</button>)}
        </div>
      </section>

      <section className="panel">
        <h2>Describe the song</h2>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />

        {mode === 'music' && (
          <div className="musicControls">
            <div>
              <div className="controlLabel">Generation length</div>
              <div className="chips">
                {durations.map((d) => <button key={d.value} className={durationMs === d.value ? 'chip activeChip' : 'chip'} onClick={() => setDurationMs(d.value)}>{d.label}</button>)}
              </div>
            </div>

            <label className="toggleRow">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
              <span><strong>Instrumental first</strong><small>Turn this off when you want ElevenLabs to create a guide singer that we can convert into Drob.</small></span>
            </label>

            <button className="primary" onClick={generateMusic} disabled={musicLoading || !prompt.trim()}>{musicLoading ? 'Generating Music…' : 'Generate Music v2'}</button>

            {audioUrl && (
              <div className="playerCard">
                <strong>Generated track</strong>
                <audio controls src={audioUrl} />
                {!instrumental && generatedBlob && (
                  <button className="secondary" onClick={useDrobVoice} disabled={drobLoading}>
                    {drobLoading ? 'Building Drob Vocal…' : 'Use Drob Voice'}
                  </button>
                )}
                <small>{instrumental ? 'Instrumental version ready for lyrics and vocals.' : 'The generated singer is a guide. Use Drob Voice to replace that singer with your Kits voice.'}</small>
              </div>
            )}

            {drobStatus && <div className="statusBox">{drobStatus}</div>}
            {drobError && <div className="errorBox">{drobError}</div>}

            {drobVocalUrl && backingUrl && guideVocalUrl && (
              <DrobMixPlayer backingUrl={backingUrl} guideVocalUrl={guideVocalUrl} drobVocalUrl={drobVocalUrl} />
            )}

            {musicError && <div className="errorBox">{musicError}</div>}

            <button className="secondary" onClick={generateDirection} disabled={loading || !prompt.trim()}>{loading ? 'Planning…' : 'Plan Song Before Generating'}</button>
          </div>
        )}

        {mode !== 'music' && <button className="primary" onClick={generateDirection} disabled={loading || !prompt.trim()}>{loading ? 'Creating…' : 'Create Song Direction'}</button>}
        {result && <div className="result"><pre>{result}</pre></div>}
      </section>

      <nav className="bottomNav">
        <span>🏠<small>Home</small></span>
        <span>🎵<small>Songs</small></span>
        <span className="navActive">＋<small>Create</small></span>
        <span>🎚️<small>Mix</small></span>
        <span>📄<small>Sheets</small></span>
      </nav>
    </main>
  );
}
