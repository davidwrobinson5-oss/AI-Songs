'use client';

import { useMemo, useState } from 'react';
import type { MelodyAnalysis } from './MelodyWorkspace';

type SheetType = 'chords' | 'lead' | 'drums' | 'bass' | 'guitar' | 'keys' | 'band';

type Props = {
  songTitle: string;
  lyrics: string;
  melodyAnalysis?: MelodyAnalysis | null;
  prompt?: string;
};

type LyricSection = {
  name: string;
  lines: string[];
};

const SHEETS: Array<{ key: SheetType; icon: string; label: string }> = [
  { key: 'chords', icon: '🎼', label: 'Chords + Lyrics' },
  { key: 'lead', icon: '🎤', label: 'Lead + Lyrics' },
  { key: 'drums', icon: '🥁', label: 'Drums' },
  { key: 'bass', icon: '🎸', label: 'Bass' },
  { key: 'guitar', icon: '🎸', label: 'Guitar' },
  { key: 'keys', icon: '🎹', label: 'Keys' },
  { key: 'band', icon: '🎶', label: 'Full Band' },
];

function parseSections(lyrics: string): LyricSection[] {
  const raw = lyrics.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!raw.length) return [{ name: 'Song', lines: ['Add lyrics in the song workspace to populate lyric cues.'] }];
  const sections: LyricSection[] = [];
  let current: LyricSection = { name: 'Song', lines: [] };
  for (const line of raw) {
    const match = line.match(/^\[?\s*(intro|verse(?:\s+\d+)?|pre[- ]?chorus|chorus|hook|bridge|breakdown|outro|tag|refrain)\s*\]?\s*:?$/i);
    if (match) {
      if (current.lines.length || sections.length === 0 && current.name !== 'Song') sections.push(current);
      current = { name: match[1].replace(/\b\w/g, (m) => m.toUpperCase()), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length || !sections.length) sections.push(current);
  return sections;
}

function lyricPreview(lines: string[]) {
  return lines.slice(0, 2).join(' / ') || 'Instrumental';
}

function chordBars(progression: string) {
  const cleaned = progression.trim();
  if (!cleaned) return '— add chord progression —';
  return cleaned.includes('|') ? cleaned : cleaned.split(/\s+/).join('  |  ');
}

function formatSeconds(value: number) {
  const mins = Math.floor(value / 60);
  const secs = Math.max(0, value - mins * 60);
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

export default function SheetsWorkspace({ songTitle, lyrics, melodyAnalysis, prompt = '' }: Props) {
  const [sheet, setSheet] = useState<SheetType>('chords');
  const [keyName, setKeyName] = useState('');
  const [tempo, setTempo] = useState('');
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [progression, setProgression] = useState('');
  const [drumGroove, setDrumGroove] = useState('Kick on 1 & 3 · Snare on 2 & 4 · 8th-note hats');
  const [bassDirection, setBassDirection] = useState('Lock with kick · outline roots · add transitions into section changes');
  const [guitarDirection, setGuitarDirection] = useState('Support the groove · leave space for lead vocal · open up in chorus');
  const [keysDirection, setKeysDirection] = useState('Support harmony · wider voicings in chorus · lighter texture in verses');

  const sections = useMemo(() => parseSections(lyrics), [lyrics]);
  const lyricLines = useMemo(() => sections.flatMap((section) => section.lines), [sections]);
  const phraseRows = useMemo(() => {
    if (!melodyAnalysis?.phrases?.length) return [];
    return melodyAnalysis.phrases.map((phrase, index) => ({
      phrase,
      lyric: lyricLines[index] || '',
    }));
  }, [melodyAnalysis, lyricLines]);

  function printSheet() {
    window.print();
  }

  async function copySheet() {
    const text = document.getElementById('sheet-paper')?.innerText || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
  }

  const meta = (
    <div className="sheetMetaLine">
      <span><b>Key:</b> {keyName || '—'}</span>
      <span><b>Tempo:</b> {tempo ? `${tempo} BPM` : '—'}</span>
      <span><b>Time:</b> {timeSignature || '—'}</span>
    </div>
  );

  const chordLyrics = (
    <>
      {meta}
      <div className="sheetLegend"><b>Progression:</b> {chordBars(progression)}</div>
      {sections.map((section, index) => (
        <section className="sheetSection" key={`${section.name}-${index}`}>
          <h3>{section.name}</h3>
          <div className="chordLine">{chordBars(progression)}</div>
          {section.lines.map((line, i) => <p className="lyricLine" key={i}>{line}</p>)}
        </section>
      ))}
    </>
  );

  const leadSheet = (
    <>
      {meta}
      {melodyAnalysis ? (
        <div className="sheetLegend"><b>Lead range:</b> {melodyAnalysis.lowestNote} - {melodyAnalysis.highestNote} · <b>Detected duration:</b> {formatSeconds(melodyAnalysis.duration)}</div>
      ) : (
        <div className="sheetLegend">Add or analyze a melody to populate lead note information automatically.</div>
      )}
      {phraseRows.length ? phraseRows.map(({ phrase, lyric }, index) => (
        <section className="sheetSection" key={phrase.index}>
          <h3>Phrase {index + 1} · {formatSeconds(phrase.start)} - {formatSeconds(phrase.end)}</h3>
          <div className="noteRun">{phrase.notes.join('  ·  ') || '—'}</div>
          <p className="lyricLine">{lyric || 'Instrumental / vocalization'}</p>
        </section>
      )) : sections.map((section, index) => (
        <section className="sheetSection" key={`${section.name}-${index}`}>
          <h3>{section.name}</h3>
          {section.lines.map((line, i) => <p className="lyricLine" key={i}>{line}</p>)}
        </section>
      ))}
    </>
  );

  const instrumentChart = (instrument: 'Drums' | 'Bass' | 'Guitar' | 'Keys', direction: string) => (
    <>
      {meta}
      <div className="sheetLegend"><b>{instrument} direction:</b> {direction}</div>
      {sections.map((section, index) => (
        <section className="sheetSection instrumentSection" key={`${section.name}-${index}`}>
          <div className="sheetSectionHead"><h3>{section.name}</h3><span>Section {index + 1}</span></div>
          {instrument !== 'Drums' && <div className="chordLine">{chordBars(progression)}</div>}
          {instrument === 'Drums' && <div className="drumPattern">{drumGroove}</div>}
          <p className="cueLine"><b>Lyric cue:</b> {lyricPreview(section.lines)}</p>
          <p className="writeLine">Notes: ________________________________________________</p>
        </section>
      ))}
    </>
  );

  const fullBand = (
    <>
      {meta}
      <div className="sheetLegend"><b>Primary progression:</b> {chordBars(progression)}</div>
      {sections.map((section, index) => (
        <section className="sheetSection bandSection" key={`${section.name}-${index}`}>
          <h3>{section.name}</h3>
          <p><b>Chord / harmony:</b> {chordBars(progression)}</p>
          <p><b>Drums:</b> {drumGroove}</p>
          <p><b>Bass:</b> {bassDirection}</p>
          <p><b>Guitar:</b> {guitarDirection}</p>
          <p><b>Keys:</b> {keysDirection}</p>
          <p><b>Lead cue:</b> {lyricPreview(section.lines)}</p>
        </section>
      ))}
    </>
  );

  let content = chordLyrics;
  if (sheet === 'lead') content = leadSheet;
  if (sheet === 'drums') content = instrumentChart('Drums', drumGroove);
  if (sheet === 'bass') content = instrumentChart('Bass', bassDirection);
  if (sheet === 'guitar') content = instrumentChart('Guitar', guitarDirection);
  if (sheet === 'keys') content = instrumentChart('Keys', keysDirection);
  if (sheet === 'band') content = fullBand;

  const selectedLabel = SHEETS.find((item) => item.key === sheet)?.label || 'Sheet';

  return (
    <section className="panel sheetsWorkspace">
      <div className="sheetSetup noPrint">
        <h2>Song details</h2>
        <div className="sheetFields">
          <label>Key<input value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="e.g. B♭" /></label>
          <label>BPM<input inputMode="numeric" value={tempo} onChange={(e) => setTempo(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="e.g. 90" /></label>
          <label>Time<input value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)} placeholder="4/4" /></label>
        </div>
        <label>Chord progression<input value={progression} onChange={(e) => setProgression(e.target.value)} placeholder="e.g. B♭ | Gm | E♭ | F" /></label>
        <details>
          <summary>Instrument directions</summary>
          <label>Drums<textarea value={drumGroove} onChange={(e) => setDrumGroove(e.target.value)} /></label>
          <label>Bass<textarea value={bassDirection} onChange={(e) => setBassDirection(e.target.value)} /></label>
          <label>Guitar<textarea value={guitarDirection} onChange={(e) => setGuitarDirection(e.target.value)} /></label>
          <label>Keys<textarea value={keysDirection} onChange={(e) => setKeysDirection(e.target.value)} /></label>
        </details>
      </div>

      <div className="sheetTabs noPrint">
        {SHEETS.map((item) => (
          <button key={item.key} className={sheet === item.key ? 'sheetTab activeSheetTab' : 'sheetTab'} onClick={() => setSheet(item.key)}>
            <span>{item.icon}</span><small>{item.label}</small>
          </button>
        ))}
      </div>

      <div className="sheetActions noPrint">
        <button className="secondary" onClick={copySheet}>Copy Sheet</button>
        <button className="primary" onClick={printSheet}>Print / Save PDF</button>
      </div>

      <article className="sheetPaper" id="sheet-paper">
        <header className="sheetHeader">
          <div>
            <p className="sheetBrand">AI SONGS</p>
            <h1>{songTitle || 'Untitled Song'}</h1>
            <h2>{selectedLabel}</h2>
          </div>
          <div className="sheetVersion">Performance Sheet</div>
        </header>
        {prompt && <p className="sheetPrompt">Arrangement brief: {prompt}</p>}
        {content}
      </article>
    </section>
  );
}
