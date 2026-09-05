'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

function PreviewFallback() {
  return (
    <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:20, background:'#08090d', color:'#fff' }}>
      <section style={{ width:'min(100%,480px)', padding:24, borderRadius:22, background:'#12141c', border:'1px solid #2e3040', textAlign:'center' }}>
        <div style={{ fontSize:42 }}>🥧</div>
        <h1 style={{ margin:'10px 0 8px' }}>Pie Preview</h1>
        <p style={{ color:'#a7a8b5', lineHeight:1.55 }}>Subscription verification is disabled in this preview because Clerk preview credentials are not configured.</p>
        <button type="button" onClick={()=>window.location.href='/'} style={{ minHeight:48, padding:'0 18px', border:0, borderRadius:13, background:'#7c3aed', color:'#fff', fontWeight:900 }}>Enter Pie Preview</button>
      </section>
    </main>
  );
}

function ClerkOnboardingComplete() {
  const { user } = useUser();
  const [status, setStatus] = useState('Verifying your Pie subscription…');

  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    async function refresh() {
      attempts += 1;
      try { await user?.reload(); } catch {}
      const metadata = (user?.publicMetadata || {}) as Record<string, unknown>;
      const planLevel = Number(metadata.piePlanLevel || 1);
      const subscriptionStatus = String(metadata.pieSubscriptionStatus || '');
      if (planLevel > 1 && ['active','trialing'].includes(subscriptionStatus)) {
        if (!stopped) {
          setStatus(`Stage ${planLevel} unlocked. Taking you into Pie…`);
          window.setTimeout(() => { window.location.href = '/'; }, 900);
        }
        return;
      }
      if (attempts >= 10) {
        if (!stopped) setStatus('Payment was submitted. Pie is still syncing the subscription. Refresh in a moment if access has not appeared yet.');
        return;
      }
      window.setTimeout(refresh, 1200);
    }
    refresh();
    return () => { stopped = true; };
  }, [user]);

  return (
    <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:20, background:'#08090d', color:'#fff' }}>
      <section style={{ width:'min(100%,480px)', padding:24, borderRadius:22, background:'#12141c', border:'1px solid #2e3040', textAlign:'center' }}>
        <div style={{ fontSize:42 }}>🥧</div>
        <h1 style={{ margin:'10px 0 8px' }}>Welcome to the next stage.</h1>
        <p style={{ color:'#a7a8b5', lineHeight:1.55 }}>{status}</p>
        <button type="button" onClick={()=>window.location.href='/'} style={{ minHeight:48, padding:'0 18px', border:0, borderRadius:13, background:'#7c3aed', color:'#fff', fontWeight:900 }}>Enter Pie</button>
      </section>
    </main>
  );
}

export default function OnboardingCompletePage() {
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return <PreviewFallback />;
  return <ClerkOnboardingComplete />;
}
