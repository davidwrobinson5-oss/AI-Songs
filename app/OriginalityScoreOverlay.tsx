'use client';

import { useEffect, useState } from 'react';

type RequestDetail = {
  songId?: string;
  title?: string;
  lyrics?: string;
  prompt?: string;
};

type ScoreResult = {
  score: number;
  confidence: number;
  label: string;
  summary: string;
  evidence: Array<{ source: string; status: string; detail: string }>;
  dimensions: Array<{ name: string; score: number; detail: string }>;
  disclaimer: string;
};

export default function OriginalityScoreOverlay() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('Song');
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RequestDetail>).detail || {};
      setTitle(detail.title || 'Song');
      setOpen(true);
      setLoading(true);
      setResult(null);
      setError('');
      void fetch('/api/originality-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detail),
      })
        .then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data?.error || 'Originality scan failed.');
          setResult(data as ScoreResult);
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : 'Originality scan failed.'))
        .finally(() => setLoading(false));
    };
    window.addEventListener('pie-originality-score', handler);
    return () => window.removeEventListener('pie-originality-score', handler);
  }, []);

  if (!open) return null;

  return (
    <div className="originalityBackdrop" role="presentation" onClick={() => setOpen(false)}>
      <section className="originalitySheet" role="dialog" aria-modal="true" aria-label={`Originality score for ${title}`} onClick={(event) => event.stopPropagation()}>
        <div className="originalityHead">
          <div><p className="eyebrow">Pie Song Intelligence</p><h2>Originality Score</h2><small>{title}</small></div>
          <button type="button" className="secondary" onClick={() => setOpen(false)}>Close</button>
        </div>

        {loading && <div className="statusBox">Checking song metadata, lyrics, and connected public catalogs…</div>}
        {error && <div className="statusBox">{error}</div>}

        {result && <>
          <div className="originalityHeroScore">
            <strong>{result.score}</strong><span>/100</span>
            <div><b>{result.label}</b><small>Confidence {result.confidence}/100</small></div>
          </div>
          <p className="sub">{result.summary}</p>

          <div className="originalityDimensions">
            {result.dimensions.map((item) => <div className="statusBox" key={item.name}>
              <div className="originalityDimensionTop"><strong>{item.name}</strong><b>{item.score}/100</b></div>
              <small>{item.detail}</small>
            </div>)}
          </div>

          <div className="playerCard">
            <strong>Evidence checked</strong>
            {result.evidence.map((item) => <div key={`${item.source}-${item.detail}`} className="originalityEvidence">
              <span><b>{item.source}</b><small>{item.detail}</small></span><em>{item.status}</em>
            </div>)}
          </div>
          <small className="originalityDisclaimer">{result.disclaimer}</small>
        </>}
      </section>
    </div>
  );
}
