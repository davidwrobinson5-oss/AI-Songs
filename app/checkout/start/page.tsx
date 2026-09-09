'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';

export default function CheckoutStartPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [message, setMessage] = useState('Preparing secure card verification…');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      window.location.replace('/signin?created=1');
      return;
    }

    let cancelled = false;

    async function startCheckout() {
      try {
        const planId = sessionStorage.getItem('pieSignupPlan') || '';
        if (!planId) {
          window.location.replace('/signup');
          return;
        }

        const response = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId }),
          cache: 'no-store',
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.url) {
          if (!cancelled) {
            setError(typeof data?.error === 'string' ? data.error : 'Secure card verification could not be started.');
            setMessage('Card verification needs attention.');
          }
          return;
        }

        window.location.replace(data.url);
      } catch {
        if (!cancelled) {
          setError('Secure card verification could not be reached. Please try again.');
          setMessage('Card verification needs attention.');
        }
      }
    }

    void startCheckout();
    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn]);

  return (
    <main style={{ minHeight:'100vh', display:'grid', placeItems:'center', padding:20, background:'radial-gradient(circle at top,#3a3b41 0,#24252a 46%,#17181c 100%)', color:'#fff' }}>
      <section style={{ width:'min(100%,480px)', padding:24, borderRadius:22, background:'#2d2e33', border:'1px solid #4c4d53', textAlign:'center', boxShadow:'0 24px 80px rgba(0,0,0,.36)' }}>
        <img src='/pieinears-horizontal.svg' alt='Pie' style={{ width:'min(100%,360px)', margin:'0 auto 10px', display:'block' }} />
        <h1 style={{ margin:'8px 0' }}>Secure checkout</h1>
        <p style={{ color:'#c0c1c6', lineHeight:1.55 }}>{message}</p>
        {error ? <p style={{ color:'#ffd0d6', lineHeight:1.5 }}>{error}</p> : null}
        {error ? <button type='button' onClick={() => window.location.reload()} style={{ marginTop:8, minHeight:46, padding:'0 18px', borderRadius:12, border:'1px solid #6d6e75', background:'#3b3c42', color:'#fff', fontWeight:800 }}>Retry</button> : null}
      </section>
    </main>
  );
}
