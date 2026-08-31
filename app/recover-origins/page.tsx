'use client';

import { useEffect, useMemo, useState } from 'react';
import { importCloudLibrary, listSongs, type SavedSong, type SavedVersion } from '../songStore';

const PIE_ORIGINS = [
  'https://ai-songs-drobinhood1.vercel.app',
  'https://ai-songs-bice.vercel.app',
  'https://ai-songs-git-main-drobinhood1.vercel.app',
];

type RecoveryMessage = {
  type?: string;
  source?: string;
  songs?: SavedSong[];
  versions?: SavedVersion[];
  error?: string;
};

export default function RecoverOriginsPage() {
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState('Open each older Pie location below. Any songs stored there will be merged into this library.');
  const [checked, setChecked] = useState<string[]>([]);

  const otherOrigins = useMemo(() => {
    if (typeof window === 'undefined') return PIE_ORIGINS;
    return PIE_ORIGINS.filter((origin) => origin !== window.location.origin);
  }, []);

  async function refreshCount() {
    const songs = await listSongs();
    setCount(songs.length);
  }

  useEffect(() => {
    void refreshCount();

    async function onMessage(event: MessageEvent<RecoveryMessage>) {
      if (!PIE_ORIGINS.includes(event.origin)) return;
      const data = event.data;
      if (!data || data.type !== 'pie-origin-library') return;

      if (data.error) {
        setStatus(`Could not read ${event.origin}: ${data.error}`);
        return;
      }

      const songs = Array.isArray(data.songs) ? data.songs : [];
      const versions = Array.isArray(data.versions) ? data.versions : [];
      await importCloudLibrary(songs, versions);
      window.dispatchEvent(new CustomEvent('pie-library-synced'));
      setChecked((current) => current.includes(event.origin) ? current : [...current, event.origin]);
      await refreshCount();
      setStatus(`Recovered ${songs.length} song${songs.length === 1 ? '' : 's'} from ${event.origin}. Check the next location.`);
      try {
        (event.source as Window | null)?.postMessage({ type: 'pie-origin-library-ack' }, event.origin);
      } catch {}
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function openSource(origin: string) {
    setStatus(`Opening ${origin} and checking its local Pie library…`);
    const target = encodeURIComponent(window.location.origin);
    window.open(`${origin}/recover-origins/source?target=${target}`, '_blank');
  }

  return (
    <main style={{ minHeight: '100vh', background: '#05070a', color: '#f7f7fb', padding: '28px 18px 90px' }}>
      <section style={{ width: 'min(100%, 680px)', margin: '0 auto' }}>
        <a href="/" style={{ color: '#b8b8c7', textDecoration: 'none', fontWeight: 800 }}>← Back to Pie</a>
        <div style={{ marginTop: '28px', fontSize: '13px', color: '#9f9fac', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>Library Recovery</div>
        <h1 style={{ margin: '8px 0 12px', fontSize: 'clamp(34px, 8vw, 56px)', lineHeight: 1 }}>Recover My Songs</h1>
        <p style={{ margin: 0, color: '#aaaab8', fontSize: '16px', lineHeight: 1.55 }}>
          Older Pie links can hold separate song libraries on the same phone. This safely copies those songs into the library you are using now. Nothing is deleted from the older locations.
        </p>

        <div style={{ marginTop: '24px', padding: '18px', borderRadius: '18px', border: '1px solid #292b35', background: '#0d1016' }}>
          <div style={{ color: '#aaaab8', fontSize: '13px', fontWeight: 800 }}>Songs in this library now</div>
          <div style={{ marginTop: '4px', fontSize: '42px', fontWeight: 950 }}>{count === null ? '—' : count}</div>
        </div>

        <div style={{ marginTop: '18px', display: 'grid', gap: '12px' }}>
          {otherOrigins.map((origin, index) => {
            const done = checked.includes(origin);
            return (
              <button
                key={origin}
                type="button"
                onClick={() => openSource(origin)}
                style={{ minHeight: '62px', borderRadius: '16px', border: done ? '1px solid #4d7c61' : '1px solid #343641', background: done ? '#102018' : '#141720', color: '#fff', padding: '13px 15px', textAlign: 'left', fontWeight: 900, fontSize: '15px' }}
              >
                {done ? '✓ ' : ''}Check older Pie location {index + 1}
                <div style={{ marginTop: '4px', color: '#8f909c', fontSize: '11px', fontWeight: 600, wordBreak: 'break-all' }}>{origin}</div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: '18px', padding: '15px 16px', borderRadius: '14px', background: '#10131a', color: '#c1c1cc', lineHeight: 1.5, fontSize: '14px' }}>{status}</div>

        <a href="/?screen=songs" onClick={(event) => { event.preventDefault(); window.location.href = '/'; }} style={{ display: 'grid', placeItems: 'center', marginTop: '22px', minHeight: '56px', borderRadius: '16px', background: '#7c3aed', color: '#fff', textDecoration: 'none', fontWeight: 950 }}>Return to My Songs</a>
      </section>
    </main>
  );
}
