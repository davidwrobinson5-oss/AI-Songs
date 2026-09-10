'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

export default function CompleteCheckoutClient() {
  const clerk = useClerk();
  const [message, setMessage] = useState('Opening Pie…');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const savedSessionId = sessionStorage.getItem('pieSignupSessionId');
        if (savedSessionId) {
          await clerk.setActive({
            session: savedSessionId,
            navigate: ({ decorateUrl }) => {
              const url = decorateUrl('/');
              if (url.startsWith('http')) window.location.href = url;
              else window.location.replace(url);
            },
          });
          return;
        }

        if (clerk.session) {
          const url = await clerk.redirectWithAuth('/');
          return void url;
        }

        if (!cancelled) {
          setMessage('Finishing your Pie session…');
          window.location.replace('/signin');
        }
      } catch {
        if (!cancelled) {
          setMessage('Finishing your Pie session…');
          window.location.replace('/signin');
        }
      }
    }

    void finish();
    return () => { cancelled = true; };
  }, [clerk]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#08090d', color: '#fff' }}>
      <section style={{ width: 'min(100%,420px)', padding: 24, borderRadius: 22, background: '#12141c', border: '1px solid #2e3040', textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>🥧</div>
        <h1 style={{ margin: '10px 0 8px' }}>{message}</h1>
        <p style={{ color: '#a7a8b5', lineHeight: 1.55 }}>Your trial is confirmed.</p>
      </section>
    </main>
  );
}
