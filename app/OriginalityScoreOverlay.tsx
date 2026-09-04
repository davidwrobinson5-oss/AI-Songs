'use client';

import { useEffect, useState } from 'react';
import { analyzeSongAudio, saveAudioOriginalitySignature, type PieAudioAnalysis } from './audioOriginalityAnalysis';

type RequestDetail = {
  songId?: string;
  title?: string;
  lyrics?: string;
  prompt?: string;
  audioUrl?: string;
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
  const [audio, setAudio] = useState<PieAudioAnalysis | null>(null);
  const [audioStatus, setAudioStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<RequestDetail>).detail || {};
      setTitle(detail.title || 'Song');
      setOpen(true);
      setLoading(true);
      setResult(null);
      setAudio(null);
      setAudioStatus(detail.audioUrl ? 'Analyzing audio fingerprint, melody, and harmony…' : 'No playable song audio was attached to this scan.');
      setError('');

      const audioTask = detail.audioUrl
        ? fetch(detail.audioUrl).then(async (response) => {
            if (!response.ok) throw new Error('Could not load song audio for deep analysis.');
            const analysis = await analyzeSongAudio(await response.arrayBuffer(), detail.songId || '', detail.title || 'Song');
            setAudio(analysis);
            if (detail.songId) saveAudioOriginalitySignature(detail.songId, detail.title || 'Song', analysis);
            setAudioStatus(analysis.chromaprint ? 'Audio fingerprint + melody + harmony analysis complete.' : 'Melody + harmony analysis complete; Chromaprint was unavailable in this browser build.');
            return analysis;
          }).catch((reason) => {
            setAudioStatus(reason instanceof Error ? reason.message : 'Deep audio analysis could not run.');
            return null;
          })
        : Promise.resolve(null);

      void Promise.all([
        audioTask,
        Promise.resolve(),
      ]).then(async ([audioAnalysis]) => {
        const response = await fetch('/api/originality-score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...detail, audioAnalysis }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Originality scan failed.');
        setResult(data as ScoreResult);
      }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Originality scan failed.'))
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

        {loading && <div className="statusBox">Checking lyrics, metadata, public catalogs, audio fingerprint, melody, and harmony…</div>}
        {audioStatus && <div className="statusBox">{audioStatus}</div>}
        {error && <div className="statusBox">{error}</div>}

        {audio && <div className="playerCard">
          <strong>Deep Audio Evidence</strong>
          <div className="originalityEvidence"><span><b>Chromaprint</b><small>{audio.chromaprint ? `Generated from ${audio.analyzedSeconds}s of audio.` : 'Fingerprint unavailable; score did not claim fingerprint evidence.'}</small></span><em>{audio.chromaprint ? 'Generated' : 'Unavailable'}</em></div>
          <div className="originalityEvidence"><span><b>Melody contour</b><small>{audio.melody.detail}</small></span><em>{audio.melody.score}/100</em></div>
          <div className="originalityEvidence"><span><b>Harmony profile</b><small>{audio.harmony.detail}</small></span><em>{audio.harmony.score}/100</em></div>
          <div className="originalityEvidence"><span><b>Pie library comparison</b><small>{audio.localLibrary.compared ? `Compared with ${audio.localLibrary.compared} previously scanned Pie song(s). Closest: ${audio.localLibrary.closestTitle || 'none'}.` : 'No previously scanned Pie songs are available yet for local similarity comparison.'}</small></span><em>{Math.round((1 - audio.localLibrary.maxSimilarity) * 100)}/100 novel</em></div>
        </div>}

        {result && <>
          <div className="originalityHeroScore">
            <strong>{result.score}</strong><span>/100</span>
            <div><b>{result.label}</b><small>Trust / confidence {result.confidence}/100</small></div>
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
