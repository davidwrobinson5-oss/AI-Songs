'use client';

import { useState } from 'react';

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

export default function Home() {
  const [mode, setMode] = useState<StartMode>('music');
  const [vocalRange, setVocalRange] = useState('Baritone');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [durationMs, setDurationMs] = useState(30000);
  const [instrumental, setInstrumental] = useState(true);

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
      setAudioUrl(URL.createObjectURL(blob));
    } catch {
      setMusicError('Could not reach ElevenLabs Music v2.');
    } finally {
      setMusicLoading(false);
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
              <span><strong>Instrumental first</strong><small>Generate the music without vocals so we can build lyrics and your final voice afterward.</small></span>
            </label>

            <button className="primary" onClick={generateMusic} disabled={musicLoading || !prompt.trim()}>{musicLoading ? 'Generating Music…' : 'Generate Music v2'}</button>

            {audioUrl && (
              <div className="playerCard">
                <strong>Generated track</strong>
                <audio controls src={audioUrl} />
                <small>Next: keep this version, regenerate it, add lyrics, or build your vocal.</small>
              </div>
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
