'use client';

import { useMemo, useState } from 'react';

type Props = {
  prompt: string;
  vocalRange: string;
  lyrics: string;
  onLyricsChange: (next: string) => void;
};

type AnswerKey = 'listener' | 'moment' | 'want' | 'obstacle' | 'turn' | 'image' | 'truth' | 'textLine';

type ToolAction = 'plan' | 'hook' | 'word-bank' | 'line-polish' | 'critique' | 'generate' | 'rewrite';

const questions: Array<{ key: AnswerKey; label: string; placeholder: string }> = [
  { key: 'listener', label: 'Who are you singing to?', placeholder: 'A person, yourself, God, a crowd, someone you lost…' },
  { key: 'moment', label: 'What exact moment is this song happening in?', placeholder: '2 AM in the car, after the argument, walking back home…' },
  { key: 'want', label: 'What does the singer want more than anything?', placeholder: 'One more chance, freedom, reassurance, to be seen…' },
  { key: 'obstacle', label: 'What is stopping them?', placeholder: 'Pride, distance, fear, another person, time…' },
  { key: 'turn', label: 'What changes by the end?', placeholder: 'A decision, realization, promise, surrender, breakthrough…' },
  { key: 'image', label: 'What physical image proves the feeling?', placeholder: 'An empty passenger seat, keys on the counter, rain on a receipt…' },
  { key: 'truth', label: 'What one sentence should the listener remember?', placeholder: 'The central truth, title idea, or emotional thesis…' },
  { key: 'textLine', label: 'What line would you actually text at 2 AM?', placeholder: 'Write it naturally, before trying to make it poetic.' },
];

const arcs = [
  'Yearning → release',
  'Hurt → acceptance',
  'Doubt → belief',
  'Nostalgia → hope',
  'Flirtation → obsession',
  'Tension → freedom',
  'Confidence → euphoria',
  'Loss → gratitude',
];

const structure = [
  ['Intro · 2–4 bars', 'Give us the sonic world or a one-line title tease. No explanation yet.'],
  ['Verse 1 · 8 lines', 'Show the scene. Use concrete nouns, active verbs, one memorable image, and the problem.'],
  ['Pre-Chorus · 4 lines', 'Raise the stakes. Shorter lines, more tension, and point directly into the hook.'],
  ['Chorus · 4–8 lines', 'Deliver the title early. State the emotional payoff simply. Repeat the title naturally.'],
  ['Verse 2 · 8 lines', 'Add new evidence or consequence. Do not repeat the information from Verse 1.'],
  ['Pre-Chorus · 4 lines', 'Keep the familiar lift but change one key line if the story has moved.'],
  ['Chorus · 4–8 lines', 'Return to the same hook so the listener can sing it by the second pass.'],
  ['Bridge · 4–8 lines', 'Reveal the truth, decision, cost, or opposite perspective. Give the song its new information.'],
  ['Final Chorus + Tag', 'Same core hook, higher stakes. Change one line if needed, then end on the title/tag.'],
];

const craftRules = [
  'Hook/title appears by the first chorus and is easy to say after one listen.',
  'Verses show; chorus tells. Use scenes in verses and the emotional truth in the chorus.',
  'Prefer concrete nouns + active verbs over stacks of adjectives.',
  'Match natural word stress to musical stress. Never bend pronunciation just to rhyme.',
  'Use perfect rhyme sparingly; mix near rhyme, internal rhyme, repetition, and sound echoes.',
  'Keep the chorus vocabulary simpler than the verses so the listener can sing it immediately.',
  'Give Verse 2 genuinely new information.',
  'Use contrast: long/short lines, image/statement, tension/release, specific/universal.',
  'Cut filler words unless they improve groove, character, or natural speech.',
  'End important lines on strong nouns, verbs, images, or the title—not weak connector words.',
];

export default function LyricsFirstStudio({ prompt, vocalRange, lyrics, onLyricsChange }: Props) {
  const [answers, setAnswers] = useState<Record<AnswerKey, string>>({
    listener: '', moment: '', want: '', obstacle: '', turn: '', image: '', truth: '', textLine: '',
  });
  const [arc, setArc] = useState(arcs[0]);
  const [wordQuery, setWordQuery] = useState('');
  const [lineQuery, setLineQuery] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [loading, setLoading] = useState<ToolAction | null>(null);
  const [status, setStatus] = useState('');

  const completed = useMemo(() => Object.values(answers).filter((value) => value.trim()).length, [answers]);

  async function runTool(action: ToolAction) {
    if (loading) return;
    if (action === 'line-polish' && !lineQuery.trim()) return;
    if (action === 'word-bank' && !wordQuery.trim()) return;
    if (action === 'rewrite' && !lyrics.trim()) return;
    setLoading(action);
    setStatus('');
    if (!['generate', 'rewrite'].includes(action)) setToolResult('');

    try {
      const res = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          prompt,
          vocalRange,
          lyrics,
          brief: answers,
          emotionalArc: arc,
          word: wordQuery,
          line: lineQuery,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Songwriting tool failed.');
      const text = String(data.text || '');
      if (action === 'generate' || action === 'rewrite') {
        onLyricsChange(text);
        setStatus(action === 'generate' ? 'Full structured draft ready.' : 'Lyrics polished.');
      } else {
        setToolResult(text);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Songwriting tool failed.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="panel">
      <p className="eyebrow">Lyrics First</p>
      <h2>Pop Song Writing Studio</h2>
      <p className="sub">Build the idea first, lock the emotional arc and hook, then fill a proven pop structure with the strongest words and images for your song.</p>

      <div className="playerCard">
        <strong>1. Answer the questions that make the song matter</strong>
        <small>{completed}/8 answered · These become the creative brief for every Pie writing tool below.</small>
        <div style={{ display: 'grid', gap: 12 }}>
          {questions.map((question) => (
            <label key={question.key} style={{ display: 'grid', gap: 6 }}>
              <span className="controlLabel">{question.label}</span>
              <input
                value={answers[question.key]}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.key]: event.target.value }))}
                placeholder={question.placeholder}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="playerCard">
        <strong>2. Choose the emotional journey</strong>
        <small>A memorable song usually moves somewhere emotionally instead of staying on one feeling.</small>
        <div className="chips">
          {arcs.map((item) => (
            <button type="button" key={item} className={`chip ${arc === item ? 'activeChip' : ''}`} onClick={() => setArc(item)}>{item}</button>
          ))}
        </div>
      </div>

      <div className="playerCard">
        <strong>3. Pie Pop Structure</strong>
        <small>Use this as the default map. Pie can adapt it when your concept clearly needs something different.</small>
        <div style={{ display: 'grid', gap: 8 }}>
          {structure.map(([name, job], index) => (
            <div key={name} className="statusBox" style={{ padding: '10px 12px' }}>
              <strong>{index + 1}. {name}</strong>
              <small style={{ display: 'block', marginTop: 3 }}>{job}</small>
            </div>
          ))}
        </div>
        <button type="button" className="primary" onClick={() => void runTool('plan')} disabled={Boolean(loading)}>
          {loading === 'plan' ? 'Building Outline…' : 'Build My Exact Song Outline'}
        </button>
      </div>

      <div className="playerCard">
        <strong>4. Hook Lab</strong>
        <small>Turn your story into title ideas, chorus hooks, repeatable phrases, and one-line emotional payoffs.</small>
        <button type="button" className="primary" onClick={() => void runTool('hook')} disabled={Boolean(loading)}>
          {loading === 'hook' ? 'Finding Hooks…' : 'Give Me 12 Hook + Title Ideas'}
        </button>
      </div>

      <div className="playerCard">
        <strong>5. Word Lab</strong>
        <small>Context-aware thesaurus + rhyme lab: stronger verbs, concrete nouns, conversational alternatives, perfect/near rhymes, sensory images, and singable open-vowel words.</small>
        <input value={wordQuery} onChange={(event) => setWordQuery(event.target.value)} placeholder="Word, phrase, feeling, or idea…" />
        <button type="button" className="secondary" onClick={() => void runTool('word-bank')} disabled={Boolean(loading) || !wordQuery.trim()}>
          {loading === 'word-bank' ? 'Building Word Bank…' : 'Find the Best-Fit Words'}
        </button>
      </div>

      <div className="playerCard">
        <strong>6. Line Lab</strong>
        <small>Test a line for clarity, prosody, cliché, rhyme, imagery, conversational flow, syllable pressure, and singability.</small>
        <textarea value={lineQuery} onChange={(event) => setLineQuery(event.target.value)} placeholder="Paste one lyric line here…" />
        <button type="button" className="secondary" onClick={() => void runTool('line-polish')} disabled={Boolean(loading) || !lineQuery.trim()}>
          {loading === 'line-polish' ? 'Polishing Line…' : 'Give Me 8 Stronger Versions'}
        </button>
      </div>

      {toolResult && (
        <div className="result">
          <pre style={{ whiteSpace: 'pre-wrap' }}>{toolResult}</pre>
        </div>
      )}

      <details className="playerCard">
        <summary><strong>7. Pro Writing Rules</strong></summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
          {craftRules.map((rule, index) => <small key={rule}><strong>{index + 1}.</strong> {rule}</small>)}
        </div>
      </details>

      <div className="playerCard">
        <strong>8. Write the song</strong>
        <small>Pie uses your answers, emotional arc, song direction, vocal range, and the structure above to create the draft.</small>
        <div className="mixButtons">
          <button type="button" className="primary" onClick={() => void runTool('generate')} disabled={Boolean(loading)}>
            {loading === 'generate' ? 'Writing…' : 'Build Structured Draft'}
          </button>
          <button type="button" className="secondary" onClick={() => void runTool('rewrite')} disabled={Boolean(loading) || !lyrics.trim()}>
            {loading === 'rewrite' ? 'Polishing…' : 'Polish Full Song'}
          </button>
        </div>
        <textarea
          value={lyrics}
          onChange={(event) => onLyricsChange(event.target.value)}
          placeholder="Your structured lyrics will appear here. You can edit every word yourself."
          style={{ minHeight: 360 }}
        />
        <button type="button" className="secondary" onClick={() => void runTool('critique')} disabled={Boolean(loading) || !lyrics.trim()}>
          {loading === 'critique' ? 'Scoring Song…' : 'Song Doctor · Score + Fix What Is Weak'}
        </button>
        {status && <div className="statusBox">{status}</div>}
      </div>
    </section>
  );
}
