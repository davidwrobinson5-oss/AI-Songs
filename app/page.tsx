'use client';

import { deleteSong } from './songStore';

import { useEffect, useState } from 'react';
import { unzipSync } from 'fflate';
import DrobMixPlayer from './DrobMixPlayer';
import CapturedSongResults from './CapturedSongResults';
import { exportAudioBlob } from './audioExport';
import VoiceWorkspace from './VoiceWorkspace';
import MixWorkspace from './MixWorkspace';
import SheetsWorkspace from './SheetsWorkspace';
import AudioProcessorWorkspace from './AudioProcessorWorkspace';
import MelodyWorkspace, { type MelodyAnalysis } from './MelodyWorkspace';
import PieBottomNav from './PieBottomNav';
import GrowthWorkspaces from './GrowthWorkspaces';
import VideoWorkspace from './VideoWorkspace';
import OperationsWorkspaces from './OperationsWorkspaces';
import MerchWorkspace from './MerchWorkspace';
import LegalGigsWorkspace from './LegalGigsWorkspace';
import DataWorkspace from './DataWorkspace';
import ScoreboardWorkspace from './ScoreboardWorkspace';
import CyberSecurityWorkspace from './CyberSecurityWorkspace';
import VenueMapWorkspace from './VenueMapWorkspace';
import PieGuide from './PieGuide';
import LyricsFirstStudio from './LyricsFirstStudio';
import { getSongVersions, listSongs, renameSong, saveVersion, type SavedSong, type SavedVersion } from './songStore';

type StartMode = 'music' | 'lyrics' | 'melody';
type Screen = 'create' | 'songs' | 'train' | 'mix' | 'sheets' | 'video' | 'marketing' | 'merch' | 'gigs' | 'map' | 'band' | 'licensing' | 'legal' | 'calendar' | 'travel' | 'business' | 'accounting' | 'data' | 'scoreboard' | 'cyber';

const modes = [
  { id: 'music' as StartMode, icon: '🎹', title: 'Music First', copy: 'Generate the music first, then build lyrics, melody, and your final vocal around it.' },
  { id: 'lyrics' as StartMode, icon: '✍️', title: 'Lyrics First', copy: 'Start with the message, hook, verses, rhyme scheme, and song structure.' },
  { id: 'melody' as StartMode, icon: '🎤', title: 'Melody and Chords First', copy: 'Sing, hum, whistle, or record your instrument, then build the song from your melody and chords.' },
];

const ranges = ['Bass', 'Baritone', 'Tenor', 'Alto', 'Soprano', 'Custom'];
const durations = [
  { label: '30 sec', value: 30000 },
  { label: '1 min', value: 60000 },
  { label: '2 min', value: 120000 },
  { label: '3 min', value: 180000 },
  { label: '3:30', value: 210000 },
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

  useEffect(() => {
    try {
      const saved=sessionStorage.getItem('pieActiveScreen')||'';
      if(['create','train','songs','mix','sheets'].includes(saved)&&saved!==screen){
        setScreen(saved as Screen);
      }
    } catch {}
    // Read only once after hydration. Persisting below keeps later tab taps current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem('pieActiveScreen',screen); } catch {}
  }, [screen]);

  useEffect(() => {
    const screenParam = new URL(window.location.href).searchParams.get('screen');
    if (screenParam === 'songs') setScreen('songs');
  }, []);
  const [mode, setMode] = useState<StartMode>('music');
  const [vocalRange, setVocalRange] = useState('Baritone');
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsStatus, setLyricsStatus] = useState('');
  const [melodyBlob, setMelodyBlob] = useState<Blob | null>(null);
  const [melodyAnalysis, setMelodyAnalysis] = useState<MelodyAnalysis | null>(null);
  const [precisionGuideBlob, setPrecisionGuideBlob] = useState<Blob | null>(null);
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [musicLoading, setMusicLoading] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [referenceAudioBlob, setReferenceAudioBlob] = useState<Blob | null>(null);
  const [referenceAudioUrl, setReferenceAudioUrl] = useState('');
  const [referenceAudioName, setReferenceAudioName] = useState('');
  const [referenceAudioDurationMs, setReferenceAudioDurationMs] = useState(30000);
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
  const [songMenuId, setSongMenuId] = useState<string | null>(null);
  const [renameSongTarget, setRenameSongTarget] = useState<SavedSong | null>(null);
  const [renameSongValue, setRenameSongValue] = useState('');
  const [renameSongBusy, setRenameSongBusy] = useState(false);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);

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

  async function restoreLatestPlayableMusic() {
    if (audioUrl || generatedBlob) return;
    try {
      const allSongs = await listSongs();
      for (const song of allSongs) {
        const versions = await getSongVersions(song.id);
        for (const version of versions) {
          const playable = version.masterBlob || version.generatedBlob || version.backingBlob;
          if (!(playable instanceof Blob) || playable.size === 0) continue;
          const url = URL.createObjectURL(playable);
          setCurrentSongId(song.id);
          setCurrentVersionNumber(version.versionNumber);
          setSongTitle(song.title);
          setGeneratedBlob(version.generatedBlob || playable);
          setMasterBlob(version.masterBlob || null);
          setAudioUrl(url);
          if (version.backingBlob || version.instrumental) setBackingUrl(URL.createObjectURL(version.backingBlob || playable));
          setSaveStatus('Loaded your latest playable track.');
          return;
        }
      }
    } catch {}
  }

  useEffect(() => {
    if (screen === 'songs') refreshLibrary();
    if (screen === 'create') void restoreLatestPlayableMusic();
  }, [screen]);

  /* PIE LIBRARY SYNC REFRESH */
  useEffect(() => {
    const onSynced = () => {
      if (screen === 'songs') void refreshLibrary();
    };
    window.addEventListener('pie-library-synced', onSynced);
    return () => window.removeEventListener('pie-library-synced', onSynced);
  }, [screen]);

  useEffect(() => {
    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));
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
    setLyricsStatus(action === 'generate' ? 'Turning up the heat…' : 'Turning up the heat…');
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
    setMasterBlob(null);
    setGeneratedBlob(null);
    setCurrentVersionNumber(undefined);
    setSaveStatus('');

    if (!precisionGuideBlob) {
      setGuideVocalUrl('');
    }
    setBackingUrl('');

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
      let res: Response;
      if (referenceAudioBlob) {
        const form = new FormData();
        form.append('file', referenceAudioBlob, referenceAudioName || 'reference-audio');
        form.append('prompt', productionPrompt);
        form.append('music_length_ms', String(durationMs));
        form.append('reference_duration_ms', String(Math.min(30000, Math.max(50, referenceAudioDurationMs))));
        form.append('force_instrumental', String(instrumental));
        res = await fetch('/api/elevenlabs/generate-reference', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/elevenlabs/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: productionPrompt, music_length_ms: durationMs, force_instrumental: instrumental }),
        });
      }

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
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      if (instrumental) setBackingUrl(url);

      try {
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
          precisionGuideBlob: precisionGuideBlob || undefined,
          generatedBlob: blob,
          backingBlob: instrumental ? blob : undefined,
        });
        setCurrentSongId(saved.song.id);
        setCurrentVersionNumber(saved.version.versionNumber);
        setSaveStatus(`Auto-saved to Songs · Version ${saved.version.versionNumber}`);
      } catch (saveError) {
        setSaveStatus(saveError instanceof Error ? `Music created, but auto-save failed: ${saveError.message}` : 'Music created, but auto-save failed.');
      }
    } catch {
      setMusicError('Could not reach Music Generator.');
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

  async function findDrobModel() {
    const modelsRes = await fetch('/api/kits/models', { cache: 'no-store' });
    const models = await modelsRes.json();
    const model = models?.data?.find((m: { title?: string; isUsable?: boolean }) => m.title?.toLowerCase() === 'drob' && m.isUsable)
      || models?.data?.find((m: { isUsable?: boolean }) => m.isUsable);
    if (!modelsRes.ok || !model?.id) throw new Error('No usable Kits custom voice was found.');
    return model;
  }

  async function convertGuideToDrob(guideBlob: Blob, filename = 'precision-guide.wav') {
    setDrobLoading(true);
    setDrobError('');
    setDrobStatus('Turning up the heat…');
    setMasterBlob(null);

    try {
      const model = await findDrobModel();
      const guideUrl = URL.createObjectURL(guideBlob);
      setGuideVocalUrl(guideUrl);

      const convertForm = new FormData();
      convertForm.append('file', guideBlob, filename);
      convertForm.append('modelId', String(model.id));
      convertForm.append('pitchShift', '0');
      const convertRes = await fetch('/api/kits/convert', { method: 'POST', body: convertForm });
      const conversionJob = await convertRes.json();
      if (!convertRes.ok || !conversionJob?.id) throw new Error(conversionJob?.error || 'Could not start Drob voice conversion.');

      await waitForConversion(conversionJob.id);
      const renderedDrobUrl = `/api/kits/conversion-audio?id=${encodeURIComponent(String(conversionJob.id))}`;
      setDrobVocalUrl(renderedDrobUrl);
      const savedVersion = await saveDrobRenderVersion(renderedDrobUrl, guideBlob);
      setDrobStatus(savedVersion ? `Drob precision vocal is ready · automatically saved as Version ${savedVersion}.` : 'Drob precision vocal is ready. Automatic library save did not complete.');
    } catch (error) {
      setDrobError(error instanceof Error ? error.message : 'Could not create the Drob precision vocal.');
      setDrobStatus('');
    } finally {
      setDrobLoading(false);
    }
  }

  async function useDrobVoice() {
    if (!generatedBlob || instrumental) return;
    setDrobLoading(true);
    setDrobError('');
    setDrobStatus('Turning up the heat…');
    setMasterBlob(null);

    try {
      const model = await findDrobModel();

      setDrobStatus('Turning up the heat…');
      const stemForm = new FormData();
      stemForm.append('file', generatedBlob, 'generated-song.mp3');
      const stemsRes = await fetch('/api/elevenlabs/stems', { method: 'POST', body: stemForm });
      if (!stemsRes.ok) throw new Error((await stemsRes.text()) || 'Music Engine stem separation failed.');

      const archive = unzipSync(new Uint8Array(await stemsRes.arrayBuffer()));
      const entries = Object.entries(archive).filter(([name]) => /\.(mp3|wav|m4a)$/i.test(name));
      if (entries.length < 2) throw new Error('Music Engine did not return both vocal and instrumental stems.');

      const vocalEntry = entries.find(([name]) => /vocal/i.test(name));
      const backingEntry = entries.find(([name]) => /(instrumental|accompaniment|backing|music)/i.test(name) && !/vocal/i.test(name))
        || entries.find(([name]) => name !== vocalEntry?.[0]);
      if (!vocalEntry || !backingEntry) throw new Error('Could not identify the Music Engine vocal and instrumental stems.');

      const guideVocalBlob = new Blob([vocalEntry[1]], { type: audioMime(vocalEntry[0]) });
      const backingBlob = new Blob([backingEntry[1]], { type: audioMime(backingEntry[0]) });
      setGuideVocalUrl(URL.createObjectURL(guideVocalBlob));
      setBackingUrl(URL.createObjectURL(backingBlob));

      setDrobStatus('Turning up the heat…');
      const convertForm = new FormData();
      convertForm.append('file', guideVocalBlob, vocalEntry[0].split('/').pop() || 'guide-vocal.mp3');
      convertForm.append('modelId', String(model.id));
      convertForm.append('pitchShift', '0');
      const convertRes = await fetch('/api/kits/convert', { method: 'POST', body: convertForm });
      const conversionJob = await convertRes.json();
      if (!convertRes.ok || !conversionJob?.id) throw new Error(conversionJob?.error || 'Could not start Drob voice conversion.');

      await waitForConversion(conversionJob.id);
      const renderedDrobUrl = `/api/kits/conversion-audio?id=${encodeURIComponent(String(conversionJob.id))}`;
      setDrobVocalUrl(renderedDrobUrl);
      const savedVersion = await saveDrobRenderVersion(renderedDrobUrl, guideVocalBlob, backingBlob);
      setDrobStatus(savedVersion ? `Drob voice is ready · automatically saved as Version ${savedVersion}.` : 'Drob voice is ready. Automatic library save did not complete.');
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

  /* AUTO_SAVE_DROB_VERSION */
  async function saveDrobRenderVersion(drobUrl: string, guideOverride?: Blob, backingOverride?: Blob) {
    setSaveStatus('Turning up the heat…');
    try {
      const [savedDrob, savedGuide, savedBacking] = await Promise.all([
        urlToBlob(drobUrl),
        guideOverride ? Promise.resolve(guideOverride) : urlToBlob(guideVocalUrl),
        backingOverride ? Promise.resolve(backingOverride) : urlToBlob(backingUrl || audioUrl),
      ]);
      if (!savedDrob) throw new Error('Could not read the rendered Drob vocal.');

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
        precisionGuideBlob: precisionGuideBlob || undefined,
        generatedBlob: generatedBlob || undefined,
        backingBlob: savedBacking,
        guideVocalBlob: savedGuide,
        drobVocalBlob: savedDrob,
        masterBlob: masterBlob || undefined,
      });

      setCurrentSongId(saved.song.id);
      setCurrentVersionNumber(saved.version.versionNumber);
      setSaveStatus(`Drob vocal saved automatically · Version ${saved.version.versionNumber}`);
      return saved.version.versionNumber;
    } catch (error) {
      setSaveStatus(error instanceof Error ? `Drob vocal rendered, but automatic library save failed: ${error.message}` : 'Drob vocal rendered, but automatic library save failed.');
      return undefined;
    }
  }

  async function saveCurrentVersion() {
    if (!generatedBlob && !lyrics.trim() && !melodyBlob && !precisionGuideBlob) return;
    setSaveStatus('Turning up the heat…');
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
        precisionGuideBlob: precisionGuideBlob || undefined,
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
    setPrecisionGuideBlob(version.precisionGuideBlob || null);
    setMode(version.mode);
    setVocalRange(version.vocalRange);
    setDurationMs(version.durationMs);
    setInstrumental(version.instrumental);
    setGeneratedBlob(version.generatedBlob || null);
    setAudioUrl(blobUrl(version.generatedBlob));
    setBackingUrl(blobUrl(version.backingBlob));
    setGuideVocalUrl(blobUrl(version.guideVocalBlob || version.precisionGuideBlob));
    setDrobVocalUrl(blobUrl(version.drobVocalBlob));
    setMasterBlob(version.masterBlob || null);
    setDrobStatus(version.drobVocalBlob ? `Loaded ${song.title} — Version ${version.versionNumber}` : '');
    setSaveStatus(`Loaded Version ${version.versionNumber}`);
    setScreen('create');
  }

  function bestSavedAudio(version: SavedVersion) {
    return version.masterBlob || version.generatedBlob || version.backingBlob;
  }

  function safeDownloadName(value: string) {
    return value.replace(/[^a-z0-9-_ ]+/gi, '').trim().replace(/\s+/g, '-') || 'ai-song';
  }

  function stopSavedVersionPlayback() {
    const audio = document.querySelector<HTMLAudioElement>('audio[data-ai-songs-library-preview]');
    if (audio) audio.pause();
    else setPlayingSongId(null);
  }

  function toggleSavedVersion(songId: string, version: SavedVersion) {
    const blob = bestSavedAudio(version);
    const cloudUrl = `/api/song-library?songId=${encodeURIComponent(songId)}`;

    if (playingSongId === songId) {
      stopSavedVersionPlayback();
      return;
    }

    window.dispatchEvent(new Event('ai-songs-stop-all-audio'));
    document.querySelectorAll<HTMLAudioElement>('audio[data-ai-songs-library-preview]').forEach((node) => {
      try { node.pause(); } catch {}
      node.remove();
    });

    const localUrl = blob instanceof Blob && blob.size > 0 ? URL.createObjectURL(blob) : '';
    const url = localUrl || cloudUrl;
    const audio = document.createElement('audio');
    audio.dataset.aiSongsLibraryPreview = songId;
    audio.src = url;
    audio.preload = 'auto';
    audio.setAttribute('playsinline','');
    audio.style.position = 'fixed';
    audio.style.width = '1px';
    audio.style.height = '1px';
    audio.style.opacity = '0';
    audio.style.pointerEvents = 'none';
    document.body.appendChild(audio);

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      cleaned = true;
      if (localUrl) URL.revokeObjectURL(localUrl);
      audio.remove();
      setPlayingSongId((current) => current === songId ? null : current);
    };

    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', () => {
      setSaveStatus('Pie could not play this saved audio. It will restore the cloud copy and you can tap Play again.');
      window.dispatchEvent(new CustomEvent('pie-local-library-changed'));
      cleanup();
    }, { once: true });
    audio.addEventListener('pause', cleanup, { once: true });
    setPlayingSongId(songId);
    void audio.play().catch((error) => {
      console.error('Pie song playback failed', error);
      setSaveStatus('Could not start playback. Tap Play once more after the audio finishes restoring.');
      window.dispatchEvent(new CustomEvent('pie-local-library-changed'));
      cleanup();
    });
  }

  async function resolveSavedVersionAudio(songId: string, version: SavedVersion) {
    const local = bestSavedAudio(version);
    if (local instanceof Blob && local.size > 0) return version;

    const response = await fetch(`/api/song-library?songId=${encodeURIComponent(songId)}`, { cache: 'no-store' });
    if (!response.ok) {
      let message = 'No downloadable audio is available for this song yet.';
      try {
        const data = await response.json();
        if (typeof data?.error === 'string' && data.error) message = data.error;
      } catch {}
      throw new Error(message);
    }

    const cloudBlob = await response.blob();
    if (!(cloudBlob instanceof Blob) || cloudBlob.size === 0) throw new Error('The cloud audio file was empty.');
    return { ...version, masterBlob: cloudBlob } as SavedVersion;
  }

  async function downloadSavedVersionResolved(song: SavedSong, version: SavedVersion) {
    try {
      setSaveStatus('Preparing download…');
      const resolved = await resolveSavedVersionAudio(song.id, version);
      downloadSavedVersion(song, resolved);
      setSaveStatus('Download ready.');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not prepare this download.');
    }
  }

  async function shareSavedVersionResolved(song: SavedSong, version: SavedVersion, format: 'mp3' | 'wav') {
    try {
      setSaveStatus(`Preparing ${format.toUpperCase()} share…`);
      const resolved = await resolveSavedVersionAudio(song.id, version);
      await shareSavedVersion(song, resolved, format);
      setSaveStatus(`${format.toUpperCase()} ready to share.`);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not prepare this share.');
    }
  }

  function downloadSavedVersion(song: SavedSong, version: SavedVersion) {
    const blob = bestSavedAudio(version);
    if (!blob) return;
    const extension = blob.type.includes('wav') ? 'wav' : blob.type.includes('mp4') ? 'm4a' : 'mp3';
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${safeDownloadName(song.title)}-v${version.versionNumber}.${extension}`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function shareSavedVersion(song: SavedSong, version: SavedVersion, format: 'mp3' | 'wav') {
    const sourceBlob = bestSavedAudio(version);
    if (!sourceBlob) return;
    try {
      const blob = await exportAudioBlob(sourceBlob, format);
      const file = new File(
        [blob],
        `${safeDownloadName(song.title)}-v${version.versionNumber}.${format}`,
        { type: format === 'wav' ? 'audio/wav' : 'audio/mpeg' },
      );
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({
          title: song.title,
          text: `${song.title} — Version ${version.versionNumber} (${format.toUpperCase()})`,
          files: [file],
        });
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSaveStatus(error instanceof Error ? `Could not share audio: ${error.message}` : 'Could not share audio.');
    }
  }

  async function renameSavedSongDirect(song: SavedSong) {
    setSongMenuId(null);
    const nextTitle = window.prompt('Rename song', song.title);
    if (nextTitle === null) return;
    const cleanTitle = nextTitle.trim();
    if (!cleanTitle || cleanTitle === song.title) return;
    try {
      const cloudRes = await fetch('/api/song-library', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renameSong', songId: song.id, title: cleanTitle }),
        cache: 'no-store',
      });
      const cloudData = await cloudRes.json().catch(() => ({}));
      if (!cloudRes.ok) throw new Error(typeof cloudData?.error === 'string' ? cloudData.error : 'Could not rename song in cloud.');
      const updated = await renameSong(song.id, cleanTitle);
      if (currentSongId === updated.id) setSongTitle(updated.title);
      await refreshLibrary();
      window.dispatchEvent(new Event('pie-local-library-changed'));
      setSaveStatus('Song renamed.');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not rename song.');
    }
  }

  function beginSongRename(song: SavedSong) {
    setSongMenuId(null);
    setRenameSongTarget(song);
    setRenameSongValue(song.title);
  }

  async function commitSongRename(event: React.FormEvent) {
    event.preventDefault();
    if (!renameSongTarget || renameSongBusy || !renameSongValue.trim()) return;
    setRenameSongBusy(true);
    try {
      const cleanTitle = renameSongValue.trim();
      const cloudRes = await fetch('/api/song-library', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renameSong', songId: renameSongTarget.id, title: cleanTitle }),
        cache: 'no-store',
      });
      const cloudData = await cloudRes.json().catch(() => ({}));
      if (!cloudRes.ok) throw new Error(typeof cloudData?.error === 'string' ? cloudData.error : 'Could not rename song in cloud.');

      const updated = await renameSong(renameSongTarget.id, cleanTitle);
      if (currentSongId === updated.id) setSongTitle(updated.title);
      await refreshLibrary();
      window.dispatchEvent(new Event('pie-local-library-changed'));
      setRenameSongTarget(null);
      setRenameSongValue('');
      setSaveStatus('Song renamed.');
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : 'Could not rename song.');
    } finally {
      setRenameSongBusy(false);
    }
  }

  async function deleteSavedSong(song: SavedSong) {
    const confirmed = window.confirm(`Delete “${song.title}” and all of its saved versions? This cannot be undone.`);
    if (!confirmed) return;
    setSongMenuId(null);
    const cloudRes = await fetch('/api/song-library', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteSong', songId: song.id }),
      cache: 'no-store',
    });
    const cloudData = await cloudRes.json().catch(() => ({}));
    if (!cloudRes.ok) {
      setSaveStatus(typeof cloudData?.error === 'string' ? `Could not delete from cloud: ${cloudData.error}` : 'Could not delete from cloud.');
      return;
    }
    await deleteSong(song.id);
    await refreshLibrary();
    if (currentSongId === song.id) {
      setCurrentSongId(undefined);
      setCurrentVersionNumber(undefined);
    }
  }

  function newSong() {
    setCurrentSongId(undefined);
    setCurrentVersionNumber(undefined);
    setSongTitle('Untitled Song');
    setPrompt('');
    setLyrics('');
    setMelodyBlob(null);
    setMelodyAnalysis(null);
    setPrecisionGuideBlob(null);
    setGeneratedBlob(null);
    if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);
    setReferenceAudioBlob(null);
    setReferenceAudioUrl('');
    setReferenceAudioName('');
    setReferenceAudioDurationMs(30000);
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

  if (screen === 'sheets') {
    return (
      <main>
        <section className="hero noPrint">
          <div className="brand pieStudioBrand"><img src="/pie-mark.svg" alt="" /><span>Pie</span></div>
          <p className="eyebrow">Sheets</p>
          <h1>Export the song to sheet music.</h1>
          <p className="sub">Use the finished music, vocal, lyrics, and melody already created in this song to generate downloadable notation.</p>
        </section>
        <AudioProcessorWorkspace />
        <SheetsWorkspace
          songTitle={songTitle}
          lyrics={lyrics}
          melodyAnalysis={melodyAnalysis}
          prompt={prompt}
          musicUrl={backingUrl || audioUrl}
          vocalUrl={drobVocalUrl || guideVocalUrl}
          masterUrl={masterBlob ? URL.createObjectURL(masterBlob) : ''}
        />
        {renameSongTarget && (
          <div className="songRenameBackdrop" role="presentation" onClick={() => !renameSongBusy && setRenameSongTarget(null)}>
            <form className="songRenameSheet" onSubmit={commitSongRename} onClick={(event) => event.stopPropagation()}>
              <div className="songRenameHead">
                <div><small>SONG OPTIONS</small><strong>Rename song</strong></div>
                <button type="button" aria-label="Close rename" onClick={() => setRenameSongTarget(null)} disabled={renameSongBusy}>×</button>
              </div>
              <input autoFocus value={renameSongValue} onChange={(event) => setRenameSongValue(event.target.value)} maxLength={120} aria-label="Song title" />
              <div className="songRenameActions">
                <button type="button" className="secondary" onClick={() => setRenameSongTarget(null)} disabled={renameSongBusy}>Cancel</button>
                <button type="submit" className="primary" disabled={renameSongBusy || !renameSongValue.trim()}>{renameSongBusy ? 'Turning up the heat…' : 'Save name'}</button>
              </div>
            </form>
          </div>
        )}

        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </main>
    );
  }

  if (screen === 'mix') {
    return (
      <main>
        <section className="hero">
          <div className="brand pieStudioBrand"><img src="/pie-mark.svg" alt="" /><span>Pie</span></div>
          <p className="eyebrow">Mix</p>
          <h1>Finish the record.</h1>
          <p className="sub">Balance the music and vocals, polish the lead, add doubles or harmonies, then render a finished master.</p>
        </section>
        <MixWorkspace
          musicUrl={backingUrl || audioUrl}
          leadVocalUrl={drobVocalUrl || guideVocalUrl}
          guideVocalUrl={guideVocalUrl}
          songTitle={songTitle}
          onMasterRendered={async (blob) => {
            setMasterBlob(blob);
            try {
              const [savedBacking, savedGuide, savedDrob] = await Promise.all([
                urlToBlob(backingUrl || audioUrl),
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
                precisionGuideBlob: precisionGuideBlob || undefined,
                generatedBlob: generatedBlob || undefined,
                backingBlob: savedBacking,
                guideVocalBlob: savedGuide,
                drobVocalBlob: savedDrob,
                masterBlob: blob,
              });
              setCurrentSongId(saved.song.id);
              setCurrentVersionNumber(saved.version.versionNumber);
              setSaveStatus(`Master saved to Songs · Version ${saved.version.versionNumber}`);
            } catch (error) {
              setSaveStatus(error instanceof Error ? `Master rendered, but library save failed: ${error.message}` : 'Master rendered, but library save failed.');
            }
          }}
        />
        {saveStatus && <div className="statusBox">{saveStatus}</div>}
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </main>
    );
  }

  if (screen === 'train') {
    return (
      <main>
        <section className="hero">
          <div className="brand pieStudioBrand"><img src="/pie-mark.svg" alt="" /><span>Pie</span></div>
          <p className="eyebrow">Voice</p>
          <h1>Build the vocal.</h1>
          <p className="sub">Record a live performance over your song or train your custom AI singing voice.</p>
        </section>
        <VoiceWorkspace
          backingUrl={backingUrl || audioUrl}
          lyrics={lyrics}
          songTitle={songTitle}
          onUseVocal={(blob) => {
            if (drobVocalUrl) URL.revokeObjectURL(drobVocalUrl);
            setDrobVocalUrl(URL.createObjectURL(blob));
            setMasterBlob(null);
            setDrobStatus('Live vocal loaded into the song.');
          }}
        />
        {drobVocalUrl && (
          <section className="panel">
            /* LYRICS_HANDOFF_AFTER_VOCAL */
            <p className="eyebrow">Next Step</p>
            <h2>Work on the lyrics.</h2>
            <p className="sub">Your finished vocal stays attached to this song. Open Lyrics to review, rewrite, or replace the words without losing the music or vocal.</p>
            {lyrics.trim() && <div className="statusBox">Current lyrics loaded · {lyrics.split('\n').filter(Boolean).length} line(s)</div>}
            <button
              className="primary"
              onClick={() => {
                setMode('lyrics');
                setLyricsStatus(lyrics.trim() ? 'Loaded the current song lyrics for editing.' : 'Lyrics editor ready. Add or generate lyrics for this song.');
                setScreen('create');
              }}
            >
              ✍️ Next: Work on Lyrics →
            </button>
          </section>
        )}
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </main>
    );
  }

  if (screen === 'video') {
    return (
      <>
        <VideoWorkspace onNavigate={(next) => setScreen(next as Screen)} />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'marketing' || screen === 'band' || screen === 'licensing') {
    return (
      <>
        <GrowthWorkspaces workspace={screen} onNavigate={(next) => setScreen(next as Screen)} />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'merch') {
    return (
      <>
        <MerchWorkspace onNavigate={(next) => setScreen(next as Screen)} />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'legal' || screen === 'gigs') {
    return (
      <>
        <LegalGigsWorkspace workspace={screen} onNavigate={(next) => setScreen(next as Screen)} />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'map') {
    return (
      <>
        <VenueMapWorkspace onNavigate={(next) => setScreen(next as Screen)} />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'calendar' || screen === 'travel' || screen === 'business' || screen === 'accounting') {
    return (
      <>
        <OperationsWorkspaces workspace={screen} onNavigate={(next) => setScreen(next as Screen)} />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'data') {
    return (
      <>
        <DataWorkspace />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'scoreboard') {
    return (
      <>
        <ScoreboardWorkspace />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'cyber') {
    return (
      <>
        <CyberSecurityWorkspace />
        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </>
    );
  }

  if (screen === 'songs') {
    return (
      <main className="songsScreen">
        <section className="songsHero">
          <div className="songsHeroTop">
            <div>
              <div className="brand pieStudioBrand"><img src="/pie-mark.svg" alt="" /><span>Pie</span></div>
              <p className="eyebrow">Library</p>
              <h1>My Songs</h1>
            </div>
            
          </div>
          <p className="sub">Tap a cover to play. Tap a song to edit it. Use ••• for downloads, sharing, and older versions.</p>
          <a className="songsRecoveryButton" href="/recover-songs">Import Audio Files</a>
        </section>

        <section className="songsLibraryPanel">
          <div id="captured"><CapturedSongResults /></div>
          <div className="songsSectionHead"><strong>{songs.length} {songs.length === 1 ? 'song' : 'songs'}</strong><span>Newest first</span></div>
          {songs.length === 0 && <div className="songsEmpty"><span>♫</span><strong>No songs yet</strong><small>Create music and it will appear here automatically.</small><button className="primary" onClick={newSong}>Create a Song</button></div>}
          <div className="songsList">
            {songs.map((song, songIndex) => {
              const versions = versionsBySong[song.id] || [];
              const latest = versions[0];
              const playable = versions.find((version) => {
                const blob = bestSavedAudio(version);
                return blob instanceof Blob && blob.size > 0;
              }) || latest;
              return (
                <article className="songListRow" key={song.id}>
                  <button className={`songCoverButton songCoverTone${songIndex % 4}`} aria-label={`${playingSongId === song.id ? 'Stop' : 'Play'} ${song.title}`} onClick={() => latest && toggleSavedVersion(song.id, playable || latest)} disabled={!latest}>
                    <span>{playingSongId === song.id ? '■' : '▶'}</span>
                  </button>
                  <button className="songRowInfo" onClick={() => latest && loadSavedVersion(song, latest)} disabled={!latest}>
                    <div className="songTitleLine"><strong>{song.title}</strong>{latest && <span>v{latest.versionNumber}</span>}</div>
                    <small className="songDescription">{latest?.prompt || 'Pie project'}</small>
                    <div className="songMeta">
                      {latest && <span>{Math.floor(latest.durationMs / 60000)}:{String(Math.floor((latest.durationMs % 60000) / 1000)).padStart(2, '0')}</span>}
                      {latest && <span>{latest.vocalRange}</span>}
                      {latest?.masterBlob && <span>Master</span>}
                      {versions.length > 1 && <span>{versions.length} versions</span>}
                    </div>
                  </button>
                  <div className="songMenuWrap">
                    <button type="button" className="songMenuButton" aria-label={`Options for ${song.title}`} aria-haspopup="menu" aria-expanded={songMenuId === song.id} onClick={() => setSongMenuId((current) => current === song.id ? null : song.id)}>•••</button>
                    {songMenuId === song.id && (
                      <>
                        <div className="songActionMenu" role="menu" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
                          <div className="songActionMenuTitle"><strong>{song.title}</strong><small>{versions.length} {versions.length === 1 ? 'version' : 'versions'}</small></div>
                          {latest && <>
                            <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); if (latest) toggleSavedVersion(song.id, playable || latest); }} disabled={!latest}>{playingSongId === song.id ? '■ Stop' : '▶ Play'}</button>
                            <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); loadSavedVersion(song, latest); }}>✎ Edit latest</button>
                            <button type="button" role="menuitem" onClick={() => void renameSavedSongDirect(song)}>✎ Rename</button>
                            <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); void downloadSavedVersionResolved(song, latest); }} disabled={!latest}>↓ Download</button>
                            <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); void shareSavedVersionResolved(song, latest, 'mp3'); }} disabled={!latest}>↗ Share MP3</button>
                            <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); void shareSavedVersionResolved(song, latest, 'wav'); }} disabled={!latest}>↗ Share WAV</button>
                          </>}
                          <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); window.dispatchEvent(new CustomEvent('pie-song-score', { detail: { songId: song.id, title: song.title, lyrics: latest?.lyrics || '', prompt: latest?.prompt || '', vocalRange: latest?.vocalRange || '' } })); }}>🎯 Song Score</button>
                          <button type="button" role="menuitem" onClick={() => { setSongMenuId(null); window.dispatchEvent(new CustomEvent('pie-originality-score', { detail: { songId: song.id, title: song.title, lyrics: latest?.lyrics || '', prompt: latest?.prompt || '' } })); }}>🧬 Originality Score</button>
                          {versions.length > 1 && <div className="songVersionMenu"><small>OLDER VERSIONS</small><div>{versions.slice(1).map((version) => <button type="button" key={version.id} onClick={() => { setSongMenuId(null); loadSavedVersion(song, version); }}>Version {version.versionNumber}<span>{new Date(version.createdAt).toLocaleDateString()}</span></button>)}</div></div>}
                          <button type="button" className="songDeleteAction" role="menuitem" onClick={() => void deleteSavedSong(song)}>🗑 Delete Song</button>
                          <button type="button" className="songMenuCloseAction" onClick={() => setSongMenuId(null)}>Close</button>
                        </div>
                      </>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
      </main>
    );
  }

  return (
    <main>
      <section className="hero">
        <div className="brand pieStudioBrand"><img src="/pie-mark.svg" alt="" /><span>Pie</span></div>
        <p className="eyebrow">Your music kitchen</p>
        <h1>Create a song from your phone.</h1>
        <p className="sub">Start with music, lyrics, or a melody. Build the song, vocals, mix, master, stems, MIDI, and sheet music in one mobile-first workspace.</p>
        <div className="heroVisual noPrint" aria-hidden="true">
          <div className="heroAlbum"><span>AI</span><b>SONGS</b></div>
          <div className="heroVisualBody">
            <div className="heroNow"><i /> LIVE STUDIO</div>
            <div className="heroWave">
              <i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i />
            </div>
            <div className="heroSpecs"><span>24-BIT</span><span>44.1 / 48 / 96K</span><span>TIGHT SYNC</span></div>
          </div>
        </div>
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

      <section className="panel songProjectPanel">
        <div className="songProjectBlock">
          <h2>Song project</h2>
          <input value={songTitle} onChange={(e) => setSongTitle(e.target.value)} placeholder="Song title" />
          {currentVersionNumber && <div className="statusBox">Working from Version {currentVersionNumber}</div>}
        </div>
        <div className="songDescriptionBlock">
          <h2>Describe the song</h2>
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Example: uplifting Christian hip-hop with warm piano, deep bass, crisp drums, hopeful energy, 92 BPM..." />
        </div>

        {mode === 'lyrics' && (
        <LyricsFirstStudio
          prompt={prompt}
          vocalRange={vocalRange}
          lyrics={lyrics}
          onLyricsChange={setLyrics}
        />
      )}

      {mode === 'melody' && (
          <div className="musicControls">
            <MelodyWorkspace
              prompt={prompt}
              vocalRange={vocalRange}
              lyrics={lyrics}
              initialBlob={melodyBlob}
              initialAnalysis={melodyAnalysis}
              initialPrecisionGuide={precisionGuideBlob}
              onLyricsFitted={(fittedLyrics) => {
                setLyrics(fittedLyrics);
                setLyricsStatus('Lyrics fitted to your melody.');
              }}
              onMelodyChanged={(blob, analysis) => {
                setMelodyBlob(blob);
                setMelodyAnalysis(analysis);
                setPrecisionGuideBlob(null);
              }}
              onPrecisionGuide={(blob, matchingBacking) => {
                setPrecisionGuideBlob(blob);
                setGuideVocalUrl(URL.createObjectURL(blob));
                if (matchingBacking) setBackingUrl(URL.createObjectURL(matchingBacking));
                setDrobVocalUrl('');
              }}
            />

            {precisionGuideBlob && (
              <div className="playerCard">
                <strong>Precision guide → Drob</strong>
                <small>The Drob vocal now uses the instrumental separated from the exact same Mureka performance for tight alignment.</small>
                <button className="primary" onClick={() => convertGuideToDrob(precisionGuideBlob)} disabled={drobLoading}>
                  {drobLoading ? 'Turning up the heat…' : '5. Convert Precision Guide to Drob'}
                </button>
                {drobStatus && <div className="statusBox">{drobStatus}</div>}
                {drobError && <div className="errorBox">{drobError}</div>}
                {drobVocalUrl && (
                  <>
                    <small>Drob precision vocal</small>
                    <audio controls src={drobVocalUrl} />
                  </>
                )}
              </div>
            )}

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
            {precisionGuideBlob && (
              <div className="statusBox">Precision guide attached. You can generate an instrumental around it, then mix with Drob.</div>
            )}
            <div className="playerCard">
              <strong>Reference audio</strong>
              <small>Optional: upload music to guide the sound, instrumentation, tempo, groove, mood, and production style of a new Music v2 generation.</small>
              <label className="secondary">
                🎧 Upload Reference Audio
                <input
                  type="file"
                  accept="audio/*"
                  style={{ display: 'none' }}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    if (referenceAudioUrl) URL.revokeObjectURL(referenceAudioUrl);
                    const url = URL.createObjectURL(file);
                    setReferenceAudioBlob(file);
                    setReferenceAudioUrl(url);
                    setReferenceAudioName(file.name);
                    setReferenceAudioDurationMs(30000);
                    const probe = new Audio(url);
                    probe.onloadedmetadata = () => {
                      if (Number.isFinite(probe.duration)) setReferenceAudioDurationMs(Math.min(30000, Math.max(50, Math.round(probe.duration * 1000))));
                    };
                  }}
                />
              </label>
              {referenceAudioUrl && (
                <>
                  <small>{referenceAudioName} · up to the first {Math.round(Math.min(30000, referenceAudioDurationMs) / 1000)} sec will guide the generation</small>
                  <audio controls src={referenceAudioUrl} />
                  <button className="secondary" onClick={() => {
                    URL.revokeObjectURL(referenceAudioUrl);
                    setReferenceAudioBlob(null);
                    setReferenceAudioUrl('');
                    setReferenceAudioName('');
                    setReferenceAudioDurationMs(30000);
                  }}>Remove Reference</button>
                </>
              )}
            </div>

            <div>
              <div className="controlLabel">Generation length</div>
              <div className="chips">{durations.map((d) => <button key={d.value} className={durationMs === d.value ? 'chip activeChip' : 'chip'} onClick={() => setDurationMs(d.value)}>{d.label}</button>)}</div>
            </div>

            <label className="toggleRow">
              <input type="checkbox" checked={instrumental} onChange={(e) => setInstrumental(e.target.checked)} />
              <span><strong>Instrumental first</strong><small>Turn this off when you want Music Engine to create a guide singer that we can convert into Drob.</small></span>
            </label>

            <button className="primary" onClick={generateMusic} disabled={musicLoading || !prompt.trim()}>{musicLoading ? 'Turning up the heat…' : 'Generate Music v2'}</button>

            {audioUrl && (
              <div className="playerCard">
                <strong>Generated track</strong><audio controls src={audioUrl} />
                {!instrumental && generatedBlob && !precisionGuideBlob && <button className="secondary" onClick={useDrobVoice} disabled={drobLoading}>{drobLoading ? 'Turning up the heat…' : 'Use Drob Voice — Clean Stem'}</button>}
                {precisionGuideBlob && !drobVocalUrl && (
                  <button className="secondary" onClick={() => convertGuideToDrob(precisionGuideBlob)} disabled={drobLoading}>
                    {drobLoading ? 'Turning up the heat…' : 'Use Precision Guide for Drob'}
                  </button>
                )}
                <small>{precisionGuideBlob ? 'Precision mode uses the dry score-based vocal instead of extracting a singer from the generated song.' : instrumental ? 'Instrumental version ready for lyrics and vocals.' : 'Drob uses Music Engine’ dedicated vocal stem before Kits conversion.'}</small>
              </div>
            )}

            {drobStatus && <div className="statusBox">{drobStatus}</div>}
            {drobError && <div className="errorBox">{drobError}</div>}

            {drobVocalUrl && backingUrl && guideVocalUrl && (
              <DrobMixPlayer
                backingUrl={backingUrl}
                guideVocalUrl={guideVocalUrl}
                drobVocalUrl={drobVocalUrl}
                onMasterRendered={async (blob) => {
                  /* SAVE_POLISHED_DROB_AS_SONG */
                  setMasterBlob(blob);
                  setSaveStatus('Turning up the heat…');
                  try {
                    const [savedBacking, savedGuide, savedDrob] = await Promise.all([
                      urlToBlob(backingUrl || audioUrl),
                      urlToBlob(guideVocalUrl),
                      urlToBlob(drobVocalUrl),
                    ]);
                    const baseTitle = songTitle.trim() || 'Untitled Song';
                    const saved = await saveVersion({
                      title: `${baseTitle}/Drob`,
                      prompt,
                      mode,
                      vocalRange,
                      durationMs,
                      instrumental,
                      lyrics: lyrics || undefined,
                      melodyBlob: melodyBlob || undefined,
                      melodyAnalysis: melodyAnalysis || undefined,
                      precisionGuideBlob: precisionGuideBlob || undefined,
                      generatedBlob: generatedBlob || undefined,
                      backingBlob: savedBacking,
                      guideVocalBlob: savedGuide,
                      drobVocalBlob: savedDrob,
                      masterBlob: blob,
                    });
                    setSaveStatus(`Saved to Songs · ${saved.song.title}`);
                  } catch (error) {
                    setSaveStatus(error instanceof Error ? `Polished Drob rendered, but Songs save failed: ${error.message}` : 'Polished Drob rendered, but Songs save failed.');
                  }
                }}
              />
            )}

            {drobVocalUrl && (
              <div className="playerCard">
                <strong>Next step · Lyrics</strong>
                <small>Your music and finished vocal are ready. Open the Lyrics editor to make changes while keeping this song loaded.</small>
                {lyrics.trim() && <small>Existing lyrics will load automatically.</small>}
                <button
                  className="primary"
                  onClick={() => {
                    setMode('lyrics');
                    setLyricsStatus(lyrics.trim() ? 'Loaded the current song lyrics for editing.' : 'Lyrics editor ready. Add or generate lyrics for this song.');
                  }}
                >
                  ✍️ Work on Lyrics →
                </button>
              </div>
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

      <PieGuide />
        <PieBottomNav active={screen} onNavigate={(next) => setScreen(next as Screen)} />
    </main>
  );
}
