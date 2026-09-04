'use client';

import { useEffect, useState } from 'react';

type ScoreResult = {
  score: number;
  label: string;
  summary: string;
  dimensions: Array<{ name: string; score: number; detail: string }>;
  nextMoves: string[];
};

export default function SongScoreOverlay() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('Song');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};
      setTitle(String(detail.title || 'Song'));
      setOpen(true); setLoading(true); setResult(null); setError('');
      void fetch('/api/song-score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(detail) })
        .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data?.error || 'Song scoring failed.'); setResult(data); })
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'Song scoring failed.'))
        .finally(() => setLoading(false));
    };
    window.addEventListener('pie-song-score', handler);
    return () => window.removeEventListener('pie-song-score', handler);
  }, []);

  if (!open) return null;
  return <div className="originalityBackdrop" onClick={() => setOpen(false)}>
    <section className="originalitySheet" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
      <div className="originalityHead"><div><p className="eyebrow">Pie Song Intelligence</p><h2>Song Score</h2><small>{title}</small></div><button className="secondary" type="button" onClick={() => setOpen(false)}>Close</button></div>
      {loading && <div className="statusBox">Scoring hook, structure, lyrics, concept, memorability, and release readiness…</div>}
      {error && <div className="statusBox">{error}</div>}
      {result && <>
        <div className="originalityHeroScore"><strong>{result.score}</strong><span>/100</span><div><b>{result.label}</b><small>Overall Pie score</small></div></div>
        <p className="sub">{result.summary}</p>
        <div className="originalityDimensions">{result.dimensions.map((item) => <div className="statusBox" key={item.name}><div className="originalityDimensionTop"><strong>{item.name}</strong><b>{item.score}/100</b></div><small>{item.detail}</small></div>)}</div>
        <div className="playerCard"><strong>Best next moves</strong>{result.nextMoves.map((move, index) => <small key={move}><b>{index + 1}.</b> {move}</small>)}</div>
      </>}
    </section>
  </div>;
}
