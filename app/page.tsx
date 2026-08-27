'use client';

import { useEffect, useState } from 'react';
import { unzipSync } from 'fflate';
import DrobMixPlayer from './DrobMixPlayer';
import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';
import { getSongVersions, listSongs, saveVersion, type SavedSong, type SavedVersion } from './songStore';

type StartMode = 'music' | 'lyrics' | 'melody';
type Screen = 'create' | 'songs';

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

function audioMime(name: string) {
  const lower = name.toLowerCase();
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  return 'audio/mpeg';
}

function blobUrl(blob?: Blob) {
  return blob ? URL.createObjectURL(blob) : '';
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>('create');
  const [mode, setMode] = useState<StartMode>('music');
  const [vocalRange, setVocalRange] = useState('Baritone');
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsStatus, setLyricsStatus] = useState('');
  const [melodyBlob, setMelodyBlob] = useState<Blob | null>(null);
  const [melodyAnalysis, setMelodyAnalysis] = useState<MelodyAnalysis | null>(null);
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
  const [masterBlob, setMasterBlob] = useState<Blob | null>(null);
  const [songTitle, setSongTitle] = useState('Untitled Song');
  const [currentSongId, setCurrentSongId] = useState<string | undefined>();
  const [currentVersionNumber, setCurrentVersionNumber] = useState<number | undefined>();
  const [saveStatus, setSaveStatus] = useState('');
  const [songs, setSongs] = useState<SavedSong[]>([]);
  const [versionsBySong, setVersionsBySong] = useState<Record<string, SavedVersion[]>>({});

  async function refreshLibrary() {
    try {
      const allSongs = await listSongs();
      setSongs(allSongs);
      const pairs = await Promise.all(allSongs.map(async (song) => [song.id, await getSongVersions(song.id)] as const));
      setVersionsBySong(Object.fromEntries(pairs));
    } catch {
      setSongs([]);
    }
  }

  useEffect(() => {
    if (screen === 'songs') refreshLibrary();
  }, [screen]);

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

  async function runLyrics(action: 'generate' | 'rewrite') {
    if (action === 'rewrite' && !lyrics.trim()) return;
    setLyricsLoading(true);
    setLyricsStatus(action === 'generate' ? 'Writing full lyrics…' : 'Improving lyrics…');
    try {
      const res = await fetch('/api/lyrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, vocalRange, lyrics, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Lyrics generation failed.');
      setLyrics(data.text || '');
      setLyricsStatus(action === 'generate' ? 'Full lyrics ready.' : 'Lyrics improved.');
    } catch (error) {
      setLyricsStatus(error instanceof Error ? error.message : 'Lyrics generation failed.');
    } finally {
      setLyricsLoading(false);
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
    setMasterBlob(null);
    setGeneratedBlob(null);
    setCurrentVersionNumber(undefined);
    setSaveStatus('');

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl('');
    }

    const lyricInstruction = lyrics.trim() ? `\n\nUse these lyrics as the song text:\n${lyrics}` : '';
    const melodyInstruction = melodyAnalysis
      ? `\n\nThe lead melody was analyzed as ${melodyAnalysis.lowestNote} to ${melodyAnalysis.highestNote} with ${melodyAnalysis.phrases.length} phrases. Keep vocal phrasing compatible with that melodic shape.`
      : '';
    const productionPrompt = instrumental
      ? `${prompt}\n\nGenerate an original instrumental composition with no vocals. Leave space for a future ${vocalRange} lead vocal.${melodyInstruction}`
      : `${prompt}\n\nGenerate an original song. Keep the lead vocal comfortably suited to a ${vocalRange} range.${lyricInstruction}${melodyInstruction}`;

    try {
      const res = await fetch('/api/elevenlabs/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: productionPrompt, music_length_ms: durationMs, force_instrumental: instrumental }),
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
    setMasterBlob(null);

    try {
      const modelsRes = await fetch('/api/kits/models', { cache: 'no-store' });
      const models = await modelsRes.json();
      const model = models?.data?.find((m: { title?: string; isUsable?: boolean }) => m.title?.toLowerCase() === 'drob' && m.isUsable)
        || models?.data?.find((m: { isUsable?: boolean }) => m.isUsable);
      if (!modelsRes.ok || !model?.id) throw new Error('No usable Kits custom voice was found.');

      setDrobStatus('Creating clean vocal and instrumental stems in ElevenLabs…');
      const stemForm = new FormData();
      stemForm.append('file', generatedBlob, 'generated-song.mp3');
      const stemsRes = await fetch('/api/elevenlabs/stems', { method: 'POST', body: stemForm });
      if (!stemsRes.ok) throw new Error((await stemsRes.text()) || 'ElevenLabs stem separation failed.');

      const archive = unzipSync(new Uint8Array(await stemsRes.arrayBuffer()));
      const entries = Object.entries(archive).filter(([name]) => /\.(mp3|wav|m4a)$/i.test(name));
      if (entries.length < 2) throw new Error('ElevenLabs did not return both vocal and instrumental stems.');

      const vocalEntry = entries.find(([name]) => /vocal/i.test(name));
      const backingEntry = entries.find(([name]) => /(instrumental|accompaniment|backing|music)/i.test(name) && !/vocal/i.test(name))
        || entries.find(([name]) => name !== vocalEntry?.[0]);
      if (!vocalEntry || !backingEntry) throw new Error('Could not identify the ElevenLabs vocal and instrumental stems.');

      const guideVocalBlob = new Blob([vocalEntry[1]], { type: audioMime(vocalEntry[0]) });
      const backingBlob = new Blob([backingEntry[1]], { type: audioMime(backingEntry[0]) });
      setGuideVocalUrl(URL.createObjectURL(guideVocalBlob));
      setBackingUrl(URL.createObjectURL(backingBlob));

      setDrobStatus('Converting the clean guide vocal to Drob…');
      const convertForm = new FormData();
      convertForm.append('file', guideVocalBlob, vocalEntry[0].split('/').pop() || 'guide-vocal.mp3');
      convertForm.append('modelId', String(model.id));
      convertForm.append('pitchShift', '0');
      const convertRes = await fetch('/api/kits/convert', { method: 'POST', body: convertForm });
      const conversionJob = await convertRes.json();
      if (!convertRes.ok || !conversionJob?.id) throw new Error(conversionJob?.error || 'Could not start Drob voice conversion.');

      await waitForConversion(conversionJob.id);
      setDrobVocalUrl(`/api/kits/conversion-audio?id=${encodeURIComponent(String(conversionJob.id))}`);
      setDrobStatus('Drob voice is ready. Use the auto-aligned mix below.');
    } catch (error) {
      setDrobError(error instanceof Error ? error.message : 'Could not create the Drob vocal.');
      setDrobStatus('');
    } finally {
      setDrobLoading(false);
    }
  }

  async function urlToBlob(url: string) {
    if (!url) return undefined;
    const res = await fetch(url);
    if (!res.ok) return undefined;
    return res.blob();
  }

  async function saveCurrentVersion() {
    if (!generatedBlob && !lyrics.trim() && !melodyBlob) return;
    setSaveStatus('Saving song version…');
    try {
      const [backingBlob, guideVocalBlob, drobVocalBlob] = await Promise.all([
        urlToBlob(backingUrl),
        urlToBlob(guideVocalUrl),
        urlToBlob(drobVocalUrl),
      ]);
      const saved = await saveVersion({
        songId: currentSongId,
        title: songTitle.trim() || 'Untitled Song',
        prompt,
        mode,
        vocalRange,
        durationMs,
        instrumental,
        lyrics: lyrics || undefined,
        melodyBlob: melodyBlob || undefined,
        melodyAnalysis: melodyAnalysis || undefined,
        generatedBlob: generatedBlob || undefined,
        backingBlob,
        guideVocalBlob,
        drobVocalBlob,
        masterBlob: masterBlob || undefined,
      });
      setCurrentSongId(saved.song.id);
      setCurrentVersionNumber(saved.version.versionNumber);
      setSaveStatus(`Saved Version ${saved.version.versionNumber}`);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not save this version.');
    }
  }

  function loadSavedVersion(song: SavedSong, version: SavedVersion) {
    setCurrentSongId(song.id);
    setCurrentVersionNumber(version.versionNumber);
    setSongTitle(song.title);
    setPrompt(version.prompt);
    setLyrics(version.lyrics || '');
    setMelodyBlob(version.melodyBlob || null);
    setMelodyAnalysis(version.melodyAnalysis || null);
    setMode(version.mode);
    setVocalRange(version.vocalRange);
    setDurationMs(version.durationMs);
    setInstrumental(version.instrumental);
    setGeneratedBlob(version.generatedBlob || null);
    setAudioUrl(blobUrl(version.generatedBlob));
    setBackingUrl(blobUrl(version.backingBlob));
    setGuideVocalUrl(blobUrl(version.guideVocalBlob));
    setDrobVocalUrl(blobUrl(version.drobVocalBlob));
    setMasterBlob(version.masterBlob || null);
    setDrobStatus(version.drobVocalBlob ? `Loaded ${song.title} — Version ${version.versionNumber}` : '');
    setSaveStatus(`Loaded Version ${version.versionNumber}`);
    setScreen('create');
  }

  function newSong() {
    setCurrentSongId(undefined);
    setCurrentVersionNumber(undefined);
    setSongTitle('Untitled Song');
    setPrompt('');
    setLyrics('');
    setMelodyBlob(null);
    setMelodyAnalysis(null);
    setGeneratedBlob(null);
    setAudioUrl('');
    setBackingUrl('');
    setGuideVocalUrl('');
    setDrobVocalUrl('');
    setMasterBlob(null);
    setSaveStatus('');
    setDrobStatus('');
    setLyricsStatus('');
    setScreen('create');
  }

  if (screen === 'songs') {
    return (
      <main>
        <section className="hero">
          <div className="brand">AI SONGS</div>
          <p className="eyebrow">Song Library</p>
          <h1>Your songs & versions.</h1>
          <p className="sub">Saved locally on this device so your audio, lyrics, melodies, and versions survive refreshes.</p>
          <button className="primary" onClick={newSong}>＋ New Song</button>
        </section>

        <section className="panel">
          {songs.length === 0 && <div className="statusBox">No saved songs yet. Create lyrics, a melody, or music, then tap Save Song Version.</div>}
          {songs.map((song) => (
            <div className="playerCard" key={song.id}>
              <strong>{song.title}</strong>
              <small>{(versionsBySong[song.id] || []).length} saved version(s)</small>
              {(versionsBySong[song.id] || []).map((version) => (
                <button className="secondary" key={version.id} onClick={() => loadSavedVersion(song, version)}>
                  Open Version {version.versionNumber} · {new Date(version.createdAt).toLocaleString()}
                </button>
              ))}
            </div>
          ))}
        </section>

        <nav className="bottomNav">
          <span onClick={() => setScreen('create')}>🏠<small>Home</small></span>
          <span className="navActive">🎵<small>Songs</small></span>
          <span onClick={newSong}>＋<small>Create</small></span>
          <span>🎚️<small>Mix</small></span>
          <span>📄<small>Sheets</small></span>
        </nav>
      </main>
    );
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
        <h2>Song project</h2>
        <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
        {currentVersionNumber && <div className="statusBox">Working from Version {currentVersionNumber}</div>}
      </section>

      <section className="panel">
        <h2>How do you want to start?</h2>
        <div className="modeGrid">
          {modes.map((item) => (
            <button key={item.id} className={`modeCard ${mode === item.id ? 'active' : ''}`} onClick={() => setMode(item.id)}>
              <span className="icon">{item.icon}</span><strong>{item.title}</strong><small>{item.copy}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Lead vocal range</h2>
        <div className="chips">{ranges.map((r) => <button key={r} className={vocalRange === r ? 'chip activeChip' : 'chip'} onClick={() => setVocalRange(r)}>{r}</button>)}</div>
      </section>

      <section className="panel">
        <h2>Describe the song</h2>
        <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />

        {mode === 'lyrics' && (
          <div className="musicControls">
            <button className="primary" onClick={() => runLyrics('generate')} disabled={lyricsLoading || !prompt.trim()}>
              {lyricsLoading ? 'Writing Lyrics…' : 'Generate Full Lyrics'}
            </button>
            <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} placeholder="Your full lyrics will appear here. You can edit every word." style={{ minHeight: 360 }} />
            <button className="secondary" onClick={() => runLyrics('rewrite')} disabled={lyricsLoading || !lyrics.trim()}>
              Improve / Rework Lyrics
            </button>
            {lyricsStatus && <div className="statusBox">{lyricsStatus}</div>}
            {lyrics.trim() && (
              <div className="playerCard">
                <button className="primary" onClick={saveCurrentVersion}>💾 Save Lyrics Version</button>
                {saveStatus && <small>{saveStatus}</small>}
                <small>Each save creates a new version, so earlier lyric drafts stay available.</small>
              </div>
            )}
            <button className="secondary" onClick={() => setMode('music')} disabled={!lyrics.trim()}>Continue to Music →</button>
          </div>
        )}

        {mode === 'melody' && (
          <div className="musicControls">
            <MelodyWorkspace
              prompt={prompt}
              vocalRange={vocalRange}
              lyrics={lyrics}
              initialBlob={melodyBlob}
              initialAnalysis={melodyAnalysis}
              onLyricsFitted={(fittedLyrics) => {
                setLyrics(fittedLyrics);
                setLyricsStatus('Lyrics fitted to your melody.');
              }}
              onMelodyChanged={(blob, analysis) => {
                setMelodyBlob(blob);
                setMelodyAnalysis(analysis);
              }}
            />
            {lyrics.trim() && (
              <div className="playerCard">
                <strong>Melody-fit lyrics</strong>
                <textarea value={lyrics} onChange={(e) => setLyrics(e.target.value)} style={{ minHeight: 300 }} />
                <button className="primary" onClick={saveCurrentVersion}>💾 Save Melody Version</button>
                {saveStatus && <small>{saveStatus}</small>}
                <button className="secondary" onClick={() => setMode('music')}>Continue to Music →</button>
              </div>
            )}
          </div>
        )}

        {mode === 'music' && (
          <div className="musicControls">
            {lyrics.trim() && (
              <details>
                <summary>Lyrics attached to this song</summary>
                <pre style={{ whiteSpace: 'pre-wrap' }}>{lyrics}</pre>
              </details>
            )}
            {melodyAnalysis && (
              <div className="statusBox">Melody attached: {melodyAnalysis.lowestNote}–{melodyAnalysis.highestNote}, {melodyAnalysis.phrases.length} phrases.</div>
            )}
            <div>
              <div className="controlLabel">Generation length</div>
              <div className="chips">{durations.map((d) => <button key={d.value} className={durationMs === d.value ? 'chip activeChip' : 'chip'} onClick={() => setDurationMs(d.value)}>{d.label}</button>)}</div>
            </div>

            <label className="toggleRow">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
              <span><strong>Instrumental first</strong><small>Turn this off when you want ElevenLabs to create a guide singer that we can convert into Drob.</small></span>
            </label>

            <button className="primary" onClick={generateMusic} disabled={musicLoading || !prompt.trim()}>{musicLoading ? 'Generating Music…' : 'Generate Music v2'}</button>

            {audioUrl && (
              <div className="playerCard">
                <strong>Generated track</strong><audio controls src={audioUrl} />
                {!instrumental && generatedBlob && <button className="secondary" onClick={useDrobVoice} disabled={drobLoading}>{drobLoading ? 'Building Clean Drob Vocal…' : 'Use Drob Voice — Clean Stem'}</button>}
                <small>{instrumental ? 'Instrumental version ready for lyrics and vocals.' : 'Drob uses ElevenLabs’ dedicated vocal stem before Kits conversion.'}</small>
              </div>
            )}

            {drobStatus && <div className="statusBox">{drobStatus}</div>}
            {drobError && <div className="errorBox">{drobError}</div>}

            {drobVocalUrl && backingUrl && guideVocalUrl && (
              <DrobMixPlayer backingUrl={backingUrl} guideVocalUrl={guideVocalUrl} drobVocalUrl={drobVocalUrl} onMasterRendered={setMasterBlob} />
            )}

            {generatedBlob && (
              <div className="playerCard">
                <button className="primary" onClick={saveCurrentVersion}>💾 Save Song Version</button>
                {saveStatus && <small>{saveStatus}</small>}
                <small>Saving again creates the next version instead of overwriting the previous one.</small>
              </div>
            )}

            {musicError && <div className="errorBox">{musicError}</div>}
            <button className="secondary" onClick={generateDirection} disabled={loading || !prompt.trim()}>{loading ? 'Planning…' : 'Plan Song Before Generating'}</button>
          </div>
        )}

        {result && <div className="result"><pre>{result}</pre></div>}
      </section>

      <nav className="bottomNav">
        <span>🏠<small>Home</small></span>
        <span onClick={() => setScreen('songs')}>🎵<small>Songs</small></span>
        <span className="navActive" onClick={newSong}>＋<small>Create</small></span>
        <span>🎚️<small>Mix</small></span>
        <span>📄<small>Sheets</small></span>
      </nav>
    </main>
  );
}
