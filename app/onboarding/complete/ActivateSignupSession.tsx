'use client';

import { useClerk } from '@clerk/nextjs';
import { useEffect, useState } from 'react';

export default function ActivateSignupSession() {
  const { client, setActive, loaded } = useClerk();
  const [message, setMessage] = useState('Opening Pie…');

  useEffect(() => {
    if (!loaded) return;

    let cancelled = false;

    async function finish() {
      try {
        let savedSessionId = '';
        try {
          savedSessionId = sessionStorage.getItem('pieSignupSessionId') || '';
        } catch {}

        const available = client.sessions || [];
        const target = savedSessionId
          ? available.find((session) => session.id === savedSessionId)
          : available[0];

        if (!target) {
          if (!cancelled) window.location.replace('/signin');
          return;
        }

        await setActive({
          session: target.id,
          navigate: async ({ session, decorateUrl }) => {
            if (session?.currentTask) {
              if (!cancelled) {
                setMessage('Finishing account setup…');
                window.location.replace('/signin');
              }
              return;
            }

            try {
              sessionStorage.removeItem('pieSignupSessionId');
              sessionStorage.removeItem('pieSignupPlan');
            } catch {}

            const url = decorateUrl('/');
            if (!cancelled) window.location.replace(url);
          },
        });
      } catch {
        if (!cancelled) window.location.replace('/signin');
      }
    }

    void finish();
    return () => { cancelled = true; };
  }, [client.sessions, loaded, setActive]);

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#08090d', color: '#fff', padding: 20 }}>
      <div style={{ textAlign: 'center', fontWeight: 800 }}>{message}</div>
    </main>
  );
}
