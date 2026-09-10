'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

export default function ActivatePieSession() {
  const clerk = useClerk();
  const [message, setMessage] = useState('Opening Pie…');

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      try {
        const signupSessionId = sessionStorage.getItem('pieSignupSessionId') || '';
        if (signupSessionId) {
          await clerk.setActive({ session: signupSessionId });
        }
        if (cancelled) return;
        try {
          sessionStorage.removeItem('pieSignupSessionId');
          sessionStorage.removeItem('pieSignupName');
          sessionStorage.removeItem('pieSignupPhone');
          sessionStorage.removeItem('pieSignupEmail');
          sessionStorage.removeItem('pieSignupPlan');
        } catch {}
        window.location.replace('/');
      } catch {
        if (cancelled) return;
        setMessage('Your Pie account is ready. Finishing secure sign-in…');
        window.setTimeout(() => window.location.replace('/signin?setup=complete'), 600);
      }
    }

    void finish();
    return () => { cancelled = true; };
  }, [clerk]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#08090d', color: '#fff' }}>
      <section style={{ width: 'min(100%,420px)', padding: 24, borderRadius: 22, background: '#12141c', border: '1px solid #2e3040', textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>🥧</div>
        <h1 style={{ margin: '10px 0 8px' }}>Opening Pie…</h1>
        <p style={{ color: '#a7a8b5', lineHeight: 1.55, marginBottom: 0 }}>{message}</p>
      </section>
    </main>
  );
}
