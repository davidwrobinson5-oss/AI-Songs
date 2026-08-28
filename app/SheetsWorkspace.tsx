'use client';

import { useMemo, useState } from 'react';
import type { MelodyAnalysis } from './MelodyWorkspace';

type SheetType = 'full' | 'chords' | 'lead' | 'drums' | 'bass' | 'guitar' | 'keys';

type Props = {
  songTitle: string;
  lyrics: string;
  melodyAnalysis?: MelodyAnalysis | null;
  prompt?: string;
  musicUrl?: string;
  vocalUrl?: string;
  masterUrl?: string;
};

type LyricSection = {
  name: string;
  lines: string[];
};

const SHEETS: Array<{ key: SheetType; icon: string; label: string; description: string }> = [
  { key: 'full', icon: '🎼', label: 'Full Score', description: 'Complete song score with all detected parts.' },
  { key: 'chords', icon: '🎹', label: 'Chords + Lyrics', description: 'Chord symbols aligned with the song lyrics.' },
  { key: 'lead', icon: '🎤', label: 'Lead + Lyrics', description: 'Lead vocal melody with lyrics underneath.' },
  { key: 'drums', icon: '🥁', label: 'Drums', description: 'Drum notation for the performed groove and fills.' },
  { key: 'bass', icon: '🎸', label: 'Bass', description: 'Bass line notation from the finished music.' },
  { key: 'guitar', icon: '🎸', label: 'Guitar', description: 'Guitar part notation / tablature when detected.' },
  { key: 'keys', icon: '🎹', label: 'Keys', description: 'Piano / keyboard notation from the finished music.' },
];

function parseSections(lyrics: string): LyricSection[] {
  const raw = lyrics.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!raw.length) return [{ name: 'Song', lines: ['No lyric text is saved with this song yet.'] }];
  const sections: LyricSection[] = [];
  let current: LyricSection = { name: 'Song', lines: [] };
  for (const line of raw) {
    const match = line.match(/^\[?\s*(intro|verse(?:\s+\d+)?|pre[- ]?chorus|chorus|hook|bridge|breakdown|outro|tag|refrain)\s*\]?\s*:?$/i);
    if (match) {
      if (current.lines.length) sections.push(current);
      current = { name: match[1].replace(/\b\w/g, (m) => m.toUpperCase()), lines: [] };
    } else current.lines.push(line);
  }
  if (current.lines.length || !sections.length) sections.push(current);
  return sections;
}

function formatSeconds(value: number) {
  const mins = Math.floor(value / 60);
  const secs = Math.max(0, value - mins * 60);
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

export default function SheetsWorkspace({ songTitle, lyrics, melodyAnalysis, prompt = '', musicUrl = '', vocalUrl = '', masterUrl = '' }: Props) {
  const [sheet, setSheet] = useState<SheetType>('full');
  const [status, setStatus] = useState('');
  const [generated, setGenerated] = useState(false);
  const sections = useMemo(() => parseSections(lyrics), [lyrics]);
  const lyricLines = useMemo(() => sections.flatMap((section) => section.lines), [sections]);
  const phraseRows = useMemo(() => {
    if (!melodyAnalysis?.phrases?.length) return [];
    return melodyAnalysis.phrases.map((phrase, index) => ({ phrase, lyric: lyricLines[index] || '' }));
  }, [melodyAnalysis, lyricLines]);

  const hasMusic = Boolean(masterUrl || musicUrl);
  const hasVocal = Boolean(vocalUrl || melodyAnalysis);
  const hasLyrics = Boolean(lyrics.trim());
  const readyAssets = [hasMusic, hasVocal, hasLyrics].filter(Boolean).length;

  function generatePackage() {
    if (!hasMusic && !hasVocal) {
      setStatus('Create or load a song with music or vocals first.');
      return;
    }
    setGenerated(true);
    if (melodyAnalysis?.phrases?.length) {
      setStatus('Lead-vocal notation is ready from the saved song data. Full-band parts will use the transcription engine once it is connected.');
    } else {
      setStatus('Song assets are ready. Full notation requires the automatic transcription engine to analyze the finished audio.');
    }
  }

  function printCurrentSheet() {
    if (!generated) generatePackage();
    requestAnimationFrame(() => window.print());
  }

  const selected = SHEETS.find((item) => item.key === sheet) || SHEETS[0];
  const needsFullTranscription = sheet !== 'lead';

  return (
    <section className="panel sheetsWorkspace exportSheetsWorkspace">
      <div className="sheetSourceCard noPrint">
        <div>
          <p className="eyebrow">Source song</p>
          <h2>{songTitle || 'Untitled Song'}</h2>
          <p className="sub">Sheets are generated from the song you already created. Nothing here changes the music, lyrics, vocal, or arrangement.</p>
        </div>
        <div className="assetStatusGrid">
          <div className={hasMusic ? 'assetReady' : 'assetMissing'}><span>{hasMusic ? '✓' : '—'}</span><small>Music / Master</small></div>
          <div className={hasVocal ? 'assetReady' : 'assetMissing'}><span>{hasVocal ? '✓' : '—'}</span><small>Lead Vocal</small></div>
          <div className={hasLyrics ? 'assetReady' : 'assetMissing'}><span>{hasLyrics ? '✓' : '—'}</span><small>Lyrics</small></div>
        </div>
        <div className="statusBox">{readyAssets}/3 song sources available for sheet generation.</div>
        <button className="primary" onClick={generatePackage}>🎼 Generate Sheet Music From Song</button>
        {status && <div className="statusBox">{status}</div>}
      </div>

      <div className="sheetExportGrid noPrint">
        {SHEETS.map((item) => (
          <button key={item.key} className={sheet === item.key ? 'sheetExportCard activeSheetExportCard' : 'sheetExportCard'} onClick={() => setSheet(item.key)}>
            <span className="sheetExportIcon">{item.icon}</span>
            <span><strong>{item.label}</strong><small>{item.description}</small></span>
            <b>›</b>
          </button>
        ))}
      </div>

      <div className="sheetActions noPrint">
        <button className="primary" onClick={printCurrentSheet} disabled={!hasMusic && !hasVocal}>⬇ Download / Save PDF</button>
      </div>

      <article className="sheetPaper" id="sheet-paper">
        <header className="sheetHeader">
          <div>
            <p className="sheetBrand">AI SONGS</p>
            <h1>{songTitle || 'Untitled Song'}</h1>
            <h2>{selected.label}</h2>
          </div>
          <div className="sheetVersion">Generated From Finished Song</div>
        </header>

        {prompt && <p className="sheetPrompt">Original song brief: {prompt}</p>}

        {!generated ? (
          <div className="sheetEmptyState">Tap <b>Generate Sheet Music From Song</b> to prepare the downloadable notation package from the current music and vocal.</div>
        ) : sheet === 'lead' && phraseRows.length ? (
          <>
            <div className="sheetLegend"><b>Detected lead range:</b> {melodyAnalysis?.lowestNote} - {melodyAnalysis?.highestNote} · <b>Duration:</b> {formatSeconds(melodyAnalysis?.duration || 0)}</div>
            {phraseRows.map(({ phrase, lyric }, index) => (
              <section className="sheetSection" key={phrase.index}>
                <h3>Phrase {index + 1} · {formatSeconds(phrase.start)} - {formatSeconds(phrase.end)}</h3>
                <div className="noteRun">{phrase.notes.join('  ·  ') || '—'}</div>
                <p className="lyricLine">{lyric || 'Instrumental / vocalization'}</p>
              </section>
            ))}
          </>
        ) : sheet === 'lead' ? (
          <div className="sheetEmptyState">The saved vocal needs automatic note transcription before a lead-vocal score can be downloaded.</div>
        ) : needsFullTranscription ? (
          <div className="sheetEmptyState">
            <h3>{selected.label}</h3>
            <p>This part will be generated by analyzing the finished music itself — not by asking you to type chords or instrument notes.</p>
            <p>The transcription engine will detect the performed notes, rhythm, chords, tempo, meter, and instrument parts, then provide downloadable PDF / MusicXML / MIDI output.</p>
          </div>
        ) : null}

        {generated && sheet === 'chords' && hasLyrics && (
          <section className="sheetSection sheetLyricsReference">
            <h3>Saved Lyrics</h3>
            {sections.map((section, index) => (
              <div key={`${section.name}-${index}`}>
                <h4>{section.name}</h4>
                {section.lines.map((line, i) => <p className="lyricLine" key={i}>{line}</p>)}
              </div>
            ))}
          </section>
        )}
      </article>
    </section>
  );
}
