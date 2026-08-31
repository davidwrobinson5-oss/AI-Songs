'use client';

import { useEffect, useState } from 'react';
import { exportLocalLibrary } from '../../songStore';

const ALLOWED_TARGETS = [
  'https://ai-songs-drobinhood1.vercel.app',
  'https://ai-songs-bice.vercel.app',
  'https://ai-songs-git-main-drobinhood1.vercel.app',
];

export default function RecoverOriginSourcePage() {
  const [status, setStatus] = useState('Reading this Pie library…');

  useEffect(() => {
    let closeTimer: number | undefined;

    async function run() {
      try {
        const params = new URLSearchParams(window.location.search);
        const target = params.get('target') || '';
        if (!ALLOWED_TARGETS.includes(target)) throw new Error('Recovery target is not allowed.');
        if (!window.opener) throw new Error('Return window is not available.');

        const library = await exportLocalLibrary();
        window.opener.postMessage({
          type: 'pie-origin-library',
          source: window.location.origin,
          songs: library.songs,
          versions: library.versions,
        }, target);
        setStatus(`Found ${library.songs.length} song${library.songs.length === 1 ? '' : 's'} here. Sending them back to your current Pie library…`);

        const onAck = (event: MessageEvent) => {
          if (event.origin !== target || event.data?.type !== 'pie-origin-library-ack') return;
          window.removeEventListener('message', onAck);
          setStatus('Songs copied safely. You can close this tab.');
          closeTimer = window.setTimeout(() => window.close(), 900);
        };
        window.addEventListener('message', onAck);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not read this Pie library.';
        setStatus(message);
        try {
          const params = new URLSearchParams(window.location.search);
          const target = params.get('target') || '';
          if (ALLOWED_TARGETS.includes(target) && window.opener) {
            window.opener.postMessage({ type: 'pie-origin-library', source: window.location.origin, error: message }, target);
          }
        } catch {}
      }
    }

    void run();
    return () => { if (closeTimer) window.clearTimeout(closeTimer); };
  }, []);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#05070a', color: '#fff' }}>
      <section style={{ width: 'min(100%, 520px)', padding: '24px', borderRadius: '20px', border: '1px solid #2d303a', background: '#10131a', textAlign: 'center' }}>
        <div style={{ fontSize: '34px' }}>🥧</div>
        <h1 style={{ margin: '12px 0 8px', fontSize: '28px' }}>Checking this Pie library</h1>
        <p style={{ margin: 0, color: '#b4b4c1', lineHeight: 1.55 }}>{status}</p>
      </section>
    </main>
  );
}
