'use client';

import { useEffect, useState } from 'react';
import { strToU8, zipSync } from 'fflate';

const ALLOWED_TARGETS = [
  'https://ai-songs-drobinhood1.vercel.app',
  'https://ai-songs-bice.vercel.app',
  'https://ai-songs-git-main-drobinhood1.vercel.app',
];

type AnySong = { id: string; title?: string; createdAt?: string; updatedAt?: string };
type AnyVersion = {
  id: string;
  songId: string;
  versionNumber?: number;
  createdAt?: string;
  masterBlob?: Blob;
  generatedBlob?: Blob;
  drobVocalBlob?: Blob;
  guideVocalBlob?: Blob;
  backingBlob?: Blob;
  precisionGuideBlob?: Blob;
  melodyBlob?: Blob;
};

type Library = { songs: AnySong[]; versions: AnyVersion[] };

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}

function transactionDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('IndexedDB transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}

async function readLibrary(): Promise<Library> {
  if ('databases' in indexedDB) {
    const databases = await indexedDB.databases();
    if (!databases.some((entry) => entry.name === 'ai-songs-library')) {
      return { songs: [], versions: [] };
    }
  }

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('ai-songs-library', 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the song library.'));
  });
  try {
    if (!db.objectStoreNames.contains('songs') || !db.objectStoreNames.contains('versions')) {
      return { songs: [], versions: [] };
    }
    const songsTx = db.transaction('songs', 'readonly');
    const songs = await requestToPromise<AnySong[]>(songsTx.objectStore('songs').getAll());
    await transactionDone(songsTx);
    const versionsTx = db.transaction('versions', 'readonly');
    const versions = await requestToPromise<AnyVersion[]>(versionsTx.objectStore('versions').getAll());
    await transactionDone(versionsTx);
    return { songs, versions };
  } finally {
    db.close();
  }
}

function bestAudio(version: AnyVersion) {
  return version.masterBlob || version.generatedBlob || version.drobVocalBlob || version.guideVocalBlob || version.backingBlob || version.precisionGuideBlob || version.melodyBlob;
}

function extensionFor(blob: Blob) {
  const type = (blob.type || '').toLowerCase();
  if (type.includes('wav')) return 'wav';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mp4') || type.includes('m4a') || type.includes('aac')) return 'm4a';
  return 'mp3';
}

export default function RecoverOriginSourcePage() {
  const [status, setStatus] = useState('Reading this older Pie library…');
  const [library, setLibrary] = useState<Library | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let closeTimer: number | undefined;
    async function run() {
      try {
        const params = new URLSearchParams(window.location.search);
        const target = params.get('target') || '';
        if (target && !ALLOWED_TARGETS.includes(target)) throw new Error('Recovery target is not allowed.');

        const found = await readLibrary();
        setLibrary(found);

        if (!found.songs.length) {
          setStatus('Found 0 songs in this older Pie location.');
          return;
        }

        if (window.opener && target) {
          window.opener.postMessage({ type: 'pie-origin-library', source: window.location.origin, songs: found.songs, versions: found.versions }, target);
          setStatus(`Found ${found.songs.length} song${found.songs.length === 1 ? '' : 's'} here. Sending them back to your current Pie library…`);
          const onAck = (event: MessageEvent) => {
            if (event.origin !== target || event.data?.type !== 'pie-origin-library-ack') return;
            window.removeEventListener('message', onAck);
            setStatus(`Found ${found.songs.length} song${found.songs.length === 1 ? '' : 's'} and copied them safely. You can close this tab.`);
            closeTimer = window.setTimeout(() => window.close(), 900);
          };
          window.addEventListener('message', onAck);
        } else {
          setStatus(`Found ${found.songs.length} song${found.songs.length === 1 ? '' : 's'} here. Brave blocked the return window, so use Download Recovery ZIP below.`);
        }
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not read this Pie library.');
      }
    }
    void run();
    return () => { if (closeTimer) window.clearTimeout(closeTimer); };
  }, []);

  async function downloadRecoveryZip() {
    if (!library) return;
    setExporting(true);
    setStatus('Building recovery ZIP on this phone…');
    try {
      const archive: Record<string, Uint8Array> = {};
      const entries: Array<{ filename: string; title: string; createdAt?: string }> = [];
      let index = 0;

      for (const song of library.songs) {
        const versions = library.versions
          .filter((version) => version.songId === song.id)
          .sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
        const version = versions.find((item) => Boolean(bestAudio(item)));
        if (!version) continue;
        const blob = bestAudio(version)!;
        index += 1;
        const filename = `recovered/song-${String(index).padStart(2, '0')}.${extensionFor(blob)}`;
        archive[filename] = new Uint8Array(await blob.arrayBuffer());
        entries.push({ filename, title: song.title || `Recovered Song ${index}`, createdAt: song.createdAt || version.createdAt });
      }

      archive['pie-recovery-manifest.json'] = strToU8(JSON.stringify({ format: 'pie-recovery-v1', entries }, null, 2));
      const zip = zipSync(archive, { level: 0 });
      const blob = new Blob([zip], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pie-recovery-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setStatus(`Recovery ZIP created with ${entries.length} song${entries.length === 1 ? '' : 's'}. Keep that ZIP, then import it into the current Pie recovery page.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not build the recovery ZIP.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <main style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'24px',background:'#05070a',color:'#fff'}}>
      <section style={{width:'min(100%,520px)',padding:'24px',borderRadius:'20px',border:'1px solid #2d303a',background:'#10131a',textAlign:'center'}}>
        <div style={{fontSize:'34px'}}>🥧</div>
        <h1 style={{margin:'12px 0 8px',fontSize:'28px'}}>Checking older Pie library</h1>
        <p style={{margin:0,color:'#b4b4c1',lineHeight:1.55}}>{status}</p>
        {library && library.songs.length > 0 && (
          <button
            type="button"
            disabled={exporting}
            onClick={() => void downloadRecoveryZip()}
            style={{width:'100%',marginTop:'18px',minHeight:'54px',border:0,borderRadius:'14px',background:'#f3f4ff',color:'#08090d',fontWeight:900,fontSize:'16px'}}
          >
            {exporting ? 'Building Recovery ZIP…' : 'Download Recovery ZIP'}
          </button>
        )}
      </section>
    </main>
  );
}
