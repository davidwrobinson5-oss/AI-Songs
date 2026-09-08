'use client';

import { useMemo, useState } from 'react';

export type LyricsCreativeFreedom = 'exact' | 'light' | 'balanced' | 'open';

type Props = {
  prompt: string;
  vocalRange: string;
  lyrics: string;
  onLyricsChange: (next: string) => void;
  creativeFreedom: LyricsCreativeFreedom;
  onCreativeFreedomChange: (next: LyricsCreativeFreedom) => void;
  onGenerateSong: () => void;
  musicLoading?: boolean;
};

type AnswerKey = 'listener' | 'moment' | 'want' | 'obstacle' | 'turn' | 'image' | 'truth' | 'textLine';
type ToolAction = 'plan' | 'hook' | 'word-bank' | 'line-polish' | 'critique' | 'generate' | 'rewrite';
type WritingPath = 'tools' | 'own';

const emptyAnswers: Record<AnswerKey, string> = {
  listener: '', moment: '', want: '', obstacle: '', turn: '', image: '', truth: '', textLine: '',
};

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

const freedomOptions: Array<{ id: LyricsCreativeFreedom; label: string; percent: string; copy: string }> = [
  { id: 'exact', label: 'Exact words only', percent: '0%', copy: 'Use only your words. Pie can repeat your existing words or lines when the arrangement needs it, but it cannot add, replace, or delete lyrical words.' },
  { id: 'light', label: 'Light freedom', percent: '25%', copy: 'Keep every word and theme you wrote. Pie may add brief repeats, ad-libs, and tiny connective phrases around your lyrics.' },
  { id: 'balanced', label: 'Balanced freedom', percent: '50%', copy: 'Keep every original word and theme. Pie may add supporting hooks or short lines around your writing to help the song structure and flow.' },
  { id: 'open', label: 'Build around me', percent: '100%', copy: 'Your complete lyric stays in the song. Pie may add sections, hooks, repeats, and supporting lines around it, but your original words and themes are never intentionally removed.' },
];

function CardHeader({ title, action, onAction, disabled = false }: { title: string; action: string; onAction: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <strong>{title}</strong>
      <button type="button" className="secondary" onClick={onAction} disabled={disabled} style={{ padding: '7px 10px', minHeight: 0, whiteSpace: 'nowrap' }}>{action}</button>
    </div>
  );
}

function CreativeFreedomPicker({ value, onChange }: { value: LyricsCreativeFreedom; onChange: (next: LyricsCreativeFreedom) => void }) {
  const selected = freedomOptions.find((option) => option.id === value) || freedomOptions[0];
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div>
        <strong>AI creative freedom</strong>
        <small style={{ display: 'block', marginTop: 4 }}>Your original words and themes stay protected at every level. This only controls how much Pie may add around them.</small>
      </div>
      <div className="chips">
        {freedomOptions.map((option) => (
          <button type="button" key={option.id} className={`chip ${value === option.id ? 'activeChip' : ''}`} onClick={() => onChange(option.id)}>
            {option.percent} · {option.label}
          </button>
        ))}
      </div>
      <div className="statusBox"><strong>{selected.label}</strong><small style={{ display: 'block', marginTop: 4 }}>{selected.copy}</small></div>
    </div>
  );
}

export default function LyricsFirstStudio({ prompt, vocalRange, lyrics, onLyricsChange, creativeFreedom, onCreativeFreedomChange, onGenerateSong, musicLoading = false }: Props) {
  const [answers, setAnswers] = useState<Record<AnswerKey, string>>({ ...emptyAnswers });
  const [arc, setArc] = useState(arcs[0]);
  const [wordQuery, setWordQuery] = useState('');
  const [lineQuery, setLineQuery] = useState('');
  const [toolResult, setToolResult] = useState('');
  const [loading, setLoading] = useState<ToolAction | null>(null);
  const [status, setStatus] = useState('');
  const [writingPath, setWritingPath] = useState<WritingPath>('tools');

  const completed = useMemo(() => Object.values(answers).filter((value) => value.trim()).length, [answers]);

  function resetBrief() {
    setAnswers({ ...emptyAnswers });
    setArc(arcs[0]);
    setToolResult('');
    setStatus('Creative brief reset. Your song description and lyrics were not changed.');
  }

  function clearWordLab() {
    setWordQuery('');
    setToolResult('');
    setStatus('Word Lab cleared.');
  }

  function clearLineLab() {
    setLineQuery('');
    setToolResult('');
    setStatus('Line Lab cleared.');
  }

  function clearLyrics() {
    if (lyrics.trim() && !window.confirm('Clear the current lyric text? Saved song versions will not be deleted.')) return;
    onLyricsChange('');
    setToolResult('');
    setStatus('Current lyric editor cleared. Saved song versions were not deleted.');
  }

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
      <h2>Write the song</h2>
      <p className="sub">Start with the song name and Describe the song section directly above. Tell Pie the genre, style, mood, tempo, instruments, vocal feel, era, production direction, or any other musical notes you want. Then choose whether Pie helps write or you paste the full lyric yourself.</p>

      <div className="modeGrid" style={{ marginBottom: 16 }}>
        <button type="button" className={`modeCard ${writingPath === 'tools' ? 'active' : ''}`} onClick={() => setWritingPath('tools')}>
          <span className="icon">🧰</span><strong>Use Pie Writing Tools</strong><small>Brief, structure, hooks, rhyme, line polish, full draft, and Song Doctor.</small>
        </button>
        <button type="button" className={`modeCard ${writingPath === 'own' ? 'active' : ''}`} onClick={() => setWritingPath('own')}>
          <span className="icon">✍️</span><strong>Write / Paste My Full Song</strong><small>Bring any length of lyrics. Pie builds the musical arrangement around what you wrote.</small>
        </button>
      </div>

      {writingPath === 'own' ? (
        <>
          <div className="playerCard">
            <CardHeader title="Song lyrics" action="Clear lyrics" onAction={clearLyrics} disabled={Boolean(loading) || !lyrics.trim()} />
            <small>Write here or paste the finished song directly below your song description. Section labels like [Verse], [Chorus], and [Bridge] help, but they are optional. Pie keeps the lyrics separate from the music-direction prompt so your full lyric is preserved.</small>
            <textarea
              value={lyrics}
              onChange={(event) => onLyricsChange(event.target.value)}
              placeholder={'Paste or write the entire song here…\n\n[Verse 1]\n…\n\n[Chorus]\n…'}
              style={{ minHeight: 440 }}
            />
            <small>{lyrics.length.toLocaleString()} characters · {lyrics.trim() ? lyrics.trim().split(/\s+/).length.toLocaleString() : 0} words</small>
          </div>

          <div className="playerCard">
            <CreativeFreedomPicker value={creativeFreedom} onChange={onCreativeFreedomChange} />
          </div>

          <div className="playerCard">
            <strong>Build the song around your lyrics</strong>
            <small>The song description above is optional. If you leave it blank, Pie chooses a production direction that supports your lyrics and {vocalRange.toLowerCase()} vocal range.</small>
            <button type="button" className="primary" onClick={onGenerateSong} disabled={musicLoading || !lyrics.trim()}>
              {musicLoading ? 'Turning up the heat…' : '🎵 Generate Song from These Lyrics'}
            </button>
            <small>Pie is instructed never to intentionally drop your original words. Exact-word mode forbids new lyrical words; higher freedom levels allow additions around your complete original lyric.</small>
            {status && <div className="statusBox">{status}</div>}
          </div>
        </>
      ) : (
        <>
          <div className="playerCard">
            <CardHeader title="1. Answer the questions that make the song matter" action="↺ Reset brief" onAction={resetBrief} disabled={Boolean(loading)} />
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
              {loading === 'plan' ? 'Turning up the heat…' : 'Build My Exact Song Outline'}
            </button>
          </div>

          <div className="playerCard">
            <strong>4. Hook Lab</strong>
            <small>Turn your story into title ideas, chorus hooks, repeatable phrases, and one-line emotional payoffs.</small>
            <button type="button" className="primary" onClick={() => void runTool('hook')} disabled={Boolean(loading)}>
              {loading === 'hook' ? 'Turning up the heat…' : 'Give Me 12 Hook + Title Ideas'}
            </button>
          </div>

          <div className="playerCard">
            <CardHeader title="5. Word Lab" action="Clear" onAction={clearWordLab} disabled={Boolean(loading) || (!wordQuery && !toolResult)} />
            <small>Context-aware thesaurus + rhyme lab: stronger verbs, concrete nouns, conversational alternatives, perfect/near rhymes, sensory images, and singable open-vowel words.</small>
            <input value={wordQuery} onChange={(event) => setWordQuery(event.target.value)} placeholder="Word, phrase, feeling, or idea…" />
            <button type="button" className="secondary" onClick={() => void runTool('word-bank')} disabled={Boolean(loading) || !wordQuery.trim()}>
              {loading === 'word-bank' ? 'Turning up the heat…' : 'Find the Best-Fit Words'}
            </button>
          </div>

          <div className="playerCard">
            <CardHeader title="6. Line Lab" action="Clear" onAction={clearLineLab} disabled={Boolean(loading) || (!lineQuery && !toolResult)} />
            <small>Test a line for clarity, prosody, cliché, rhyme, imagery, conversational flow, syllable pressure, and singability.</small>
            <textarea value={lineQuery} onChange={(event) => setLineQuery(event.target.value)} placeholder="Paste one lyric line here…" />
            <button type="button" className="secondary" onClick={() => void runTool('line-polish')} disabled={Boolean(loading) || !lineQuery.trim()}>
              {loading === 'line-polish' ? 'Turning up the heat…' : 'Give Me 8 Stronger Versions'}
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
            <CardHeader title="8. Write the song" action="Clear lyrics" onAction={clearLyrics} disabled={Boolean(loading) || !lyrics.trim()} />
            <small>Pie uses your answers, emotional arc, song direction, vocal range, and the structure above to create the draft.</small>
            <div className="mixButtons">
              <button type="button" className="primary" onClick={() => void runTool('generate')} disabled={Boolean(loading)}>
                {loading === 'generate' ? 'Turning up the heat…' : 'Build Structured Draft'}
              </button>
              <button type="button" className="secondary" onClick={() => void runTool('rewrite')} disabled={Boolean(loading) || !lyrics.trim()}>
                {loading === 'rewrite' ? 'Turning up the heat…' : 'Polish Full Song'}
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

          {lyrics.trim() && (
            <div className="playerCard">
              <CreativeFreedomPicker value={creativeFreedom} onChange={onCreativeFreedomChange} />
              <button type="button" className="primary" onClick={onGenerateSong} disabled={musicLoading}>
                {musicLoading ? 'Turning up the heat…' : '🎵 Generate Song from These Lyrics'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
