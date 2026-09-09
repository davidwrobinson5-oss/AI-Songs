'use client';

import { useEffect, useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';

export default function ClerkCompleteClient() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [status, setStatus] = useState('Verifying your payment method and Pie trial…');
  const [error, setError] = useState('');

  useEffect(() => {
    let stopped = false;
    let attempts = 0;

    async function finishSignup() {
      attempts += 1;
      try { await user?.reload(); } catch {}
      const metadata = (user?.publicMetadata || {}) as Record<string, unknown>;
      const planLevel = Number(metadata.piePlanLevel || 1);
      const subscriptionStatus = String(metadata.pieSubscriptionStatus || '');

      if (planLevel > 1 && ['active', 'trialing'].includes(subscriptionStatus)) {
        if (stopped) return;
        setStatus('Payment method verified. Your Pie account is ready. Preparing sign in…');
        try {
          await signOut();
          try {
            sessionStorage.removeItem('pieSignupName');
            sessionStorage.removeItem('pieSignupPhone');
            sessionStorage.removeItem('pieSignupPlan');
          } catch {}
          window.location.replace('/signin?setup=complete');
        } catch {
          setError('Your payment method was verified, but Pie could not close the temporary signup session. Refresh this page to finish.');
        }
        return;
      }

      if (attempts >= 12) {
        if (!stopped) setStatus('Payment method submitted. Pie is still syncing your trial. Keep this page open or refresh once to finish setup.');
        return;
      }
      window.setTimeout(finishSignup, 1100);
    }

    void finishSignup();
    return () => { stopped = true; };
  }, [user, signOut]);

  return (
    <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:20, background:'radial-gradient(circle at top,#3a3b41 0,#24252a 46%,#17181c 100%)', color:'#fff' }}>
      <section style={{ width:'min(100%,480px)', padding:24, borderRadius:22, background:'#2d2e33', border:'1px solid #4c4d53', textAlign:'center', boxShadow:'0 24px 80px rgba(0,0,0,.36)' }}>
        <img src='/pieinears-horizontal.svg' alt='Pie' style={{ width:'min(100%,360px)', margin:'0 auto 10px', display:'block' }} />
        <h1 style={{ margin:'8px 0' }}>Finishing your Pie account</h1>
        <p style={{ color:'#c0c1c6', lineHeight:1.55 }}>{status}</p>
        {error ? <p style={{ color:'#ffd0d6', lineHeight:1.5 }}>{error}</p> : null}
      </section>
    </main>
  );
}
