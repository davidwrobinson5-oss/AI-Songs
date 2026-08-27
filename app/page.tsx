'use client';

import { useState } from 'react';

type StartMode = 'music' | 'lyrics' | 'melody';

const modes = [
  { id: 'music' as StartMode, icon: '🎹', title: 'Music First', copy: 'Generate or shape the music, then build lyrics and vocals around it.' },
  { id: 'lyrics' as StartMode, icon: '✍️', title: 'Lyrics First', copy: 'Start with the message, hook, verses, rhyme scheme, and song structure.' },
  { id: 'melody' as StartMode, icon: '🎤', title: 'Melody First', copy: 'Sing, hum, or upload a melody, then fit lyrics precisely to it.' },
];

const ranges = ['Bass', 'Baritone', 'Tenor', 'Alto', 'Soprano', 'Custom'];

export default function Home() {
  const [mode, setMode] = useState<StartMode>('music');
  const [vocalRange, setVocalRange] = useState('Baritone');
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);

  async function generate() {
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

  return (
    <main>
      <section className="hero">
        <div className="brand">AI SONGS</div>
        <p className="eyebrow">Your cloud music studio</p>
        <h1>Create a song from your phone.</h1>
        <p className="sub">Start with music, lyrics, or a melody. The app will grow into your full songwriting, vocal, mixing, mastering, and sheet-music workspace.</p>
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
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop song about holding onto faith when life feels uncertain..." />
        <button className="primary" onClick={generate} disabled={loading}>{loading ? 'Creating…' : 'Create Song Direction'}</button>
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
