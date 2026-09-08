const fs = require('fs');

const pagePath = 'app/page.tsx';
let page = fs.readFileSync(pagePath, 'utf8');

function replaceOnce(source, before, after, label) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(before, after);
}

page = replaceOnce(
  page,
  "import LyricsFirstStudio from './LyricsFirstStudio';",
  "import LyricsFirstStudio, { type LyricsCreativeFreedom } from './LyricsFirstStudio';",
  'LyricsFirstStudio import',
);

page = replaceOnce(
  page,
  "  const [lyrics, setLyrics] = useState('');\n  const [lyricsLoading, setLyricsLoading] = useState(false);",
  "  const [lyrics, setLyrics] = useState('');\n  const [lyricsCreativeFreedom, setLyricsCreativeFreedom] = useState<LyricsCreativeFreedom>('exact');\n  const [lyricsLoading, setLyricsLoading] = useState(false);",
  'lyrics freedom state',
);

const newFunction = `
  async function generateLyricsFirstSong() {
    if (!lyrics.trim() || musicLoading) return;
    setMusicLoading(true);
    setMusicError('');
    setResult('');
    setDrobStatus('');
    setDrobError('');
    setDrobVocalUrl('');
    setMasterBlob(null);
    setGeneratedBlob(null);
    setCurrentVersionNumber(undefined);
    setSaveStatus('');
    setInstrumental(false);
    setBackingUrl('');
    if (!precisionGuideBlob) setGuideVocalUrl('');
    if (audioUrl) {
      try { URL.revokeObjectURL(audioUrl); } catch {}
      setAudioUrl('');
    }

    try {
      const idempotencyKey = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : \`${'${Date.now()}-${Math.random().toString(36).slice(2)}'}\`;
      const queueRes = await fetch('/api/jobs/lyrics-song-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          lyrics,
          vocalRange,
          creativeFreedom: lyricsCreativeFreedom,
          preferred_length_ms: durationMs,
          idempotencyKey,
        }),
      });
      const queued = await queueRes.json().catch(() => ({}));
      if (!queueRes.ok || !queued?.job?.id) throw new Error(queued?.error || 'Lyrics-first song generation could not be queued.');

      const lyricsUsed = typeof queued.lyricsUsed === 'string' && queued.lyricsUsed.trim() ? queued.lyricsUsed : lyrics;
      if (lyricsUsed !== lyrics) setLyrics(lyricsUsed);
      if (Number.isFinite(Number(queued.plannedDurationMs))) setDurationMs(Math.max(3000, Math.min(600000, Number(queued.plannedDurationMs))));

      const jobId = String(queued.job.id);
      setResult('Your full lyrics are locked in. Pie is building the music around them…');
      let completed = false;

      for (let attempt = 0; attempt < 150; attempt++) {
        await sleep(attempt === 0 ? 700 : 2000);
        const statusRes = await fetch(\`/api/jobs/\${encodeURIComponent(jobId)}\`, { cache: 'no-store' });
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) throw new Error(statusData?.error || 'Could not check lyrics-first generation.');
        const job = statusData?.job || {};
        if (job.status === 'queued') {
          setResult('Your lyrics are safe. Pie is preparing the arrangement…');
          continue;
        }
        if (job.status === 'running') {
          setResult(\`Building the song around every lyric… attempt \${job.attemptCount || 1} of \${job.maxAttempts || 3}\`);
          continue;
        }
        if (job.status === 'retrying') {
          setResult(\`Temporary music-provider issue. Pie is retrying without changing your lyrics (\${job.attemptCount || 1}/\${job.maxAttempts || 3}).\`);
          continue;
        }
        if (job.status === 'failed' || job.status === 'cancelled') throw new Error(job.lastErrorMessage || 'Lyrics-first generation failed.');
        if (job.status === 'succeeded') {
          completed = true;
          break;
        }
      }

      if (!completed) throw new Error('Your song is still safely processing in Pie. The durable job will continue.');
      const outputRes = await fetch(\`/api/jobs/\${encodeURIComponent(jobId)}/output\`, { cache: 'no-store' });
      if (!outputRes.ok) {
        const outputError = await outputRes.json().catch(() => ({}));
        throw new Error(outputError?.error || 'Generated song is ready but could not be loaded.');
      }
      const blob = await outputRes.blob();
      const url = URL.createObjectURL(blob);
      setResult('');
      setGeneratedBlob(blob);
      setAudioUrl(url);
      setInstrumental(false);

      try {
        const saved = await saveVersion({
          songId: currentSongId,
          title: songTitle.trim() || 'Untitled Song',
          prompt: prompt || 'Lyrics-first song',
          mode: 'lyrics',
          vocalRange,
          durationMs: Number(queued.plannedDurationMs || durationMs),
          instrumental: false,
          lyrics: lyricsUsed,
          generatedBlob: blob,
        });
        setCurrentSongId(saved.song.id);
        setCurrentVersionNumber(saved.version.versionNumber);
        setSaveStatus(\`Auto-saved to Songs · Version \${saved.version.versionNumber}\`);
      } catch (saveError) {
        setSaveStatus(saveError instanceof Error ? \`Song created, but auto-save failed: \${saveError.message}\` : 'Song created, but auto-save failed.');
      }
    } catch (error) {
      setMusicError(error instanceof Error ? error.message : 'Could not create a song from these lyrics.');
    } finally {
      setMusicLoading(false);
    }
  }
`;

page = replaceOnce(
  page,
  "}\n\n  async function waitForConversion(id: number | string) {",
  `}\n${newFunction}\n  async function waitForConversion(id: number | string) {`,
  'lyrics generation function insertion',
);

page = replaceOnce(
  page,
  `        <LyricsFirstStudio\n          prompt={prompt}\n          vocalRange={vocalRange}\n          lyrics={lyrics}\n          onLyricsChange={setLyrics}\n        />`,
  `        <LyricsFirstStudio\n          prompt={prompt}\n          vocalRange={vocalRange}\n          lyrics={lyrics}\n          onLyricsChange={setLyrics}\n          creativeFreedom={lyricsCreativeFreedom}\n          onCreativeFreedomChange={setLyricsCreativeFreedom}\n          onGenerateSong={() => void generateLyricsFirstSong()}\n          musicLoading={musicLoading}\n        />`,
  'LyricsFirstStudio props',
);

fs.writeFileSync(pagePath, page);

for (const path of ['scripts/apply-lyrics-first-generation.cjs', '.github/workflows/apply-lyrics-first-generation.yml']) {
  try { fs.unlinkSync(path); } catch {}
}
