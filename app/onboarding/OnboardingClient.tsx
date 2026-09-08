'use client';

import { useUser } from '@clerk/nextjs';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PLAN_ID, PIE_PLANS, TRIAL_DAYS, planById } from '../billingConfig';

export default function OnboardingClient() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(DEFAULT_PLAN_ID);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [prefilled, setPrefilled] = useState(false);

  useEffect(() => {
    try {
      setName(sessionStorage.getItem('pieSignupName') || '');
      setPhone(sessionStorage.getItem('pieSignupPhone') || '');
      setSelectedPlan(sessionStorage.getItem('pieSignupPlan') || DEFAULT_PLAN_ID);
    } catch {}
    setPrefilled(true);
  }, []);

  const plan = useMemo(() => planById(selectedPlan), [selectedPlan]);
  const verifiedEmail = user?.primaryEmailAddress?.verification?.status === 'verified';
  const clerkPhone = user?.primaryPhoneNumber?.phoneNumber || '';
  const verifiedPhone = user?.primaryPhoneNumber?.verification?.status === 'verified';

  if (!isLoaded || !prefilled) return <main style={shell}><section style={card}>Loading your Pie setup…</section></main>;
  if (!isSignedIn) {
    if (typeof window !== 'undefined') window.location.href = '/signup';
    return null;
  }

  async function continueOnboarding(event: FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    if (!verifiedEmail) {
      setError('Please finish email verification before starting your Pie trial.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const trimmedName = name.trim();
      const pieces = trimmedName.split(/\s+/).filter(Boolean);
      const firstName = pieces[0] || user.firstName || undefined;
      const lastName = pieces.slice(1).join(' ') || user.lastName || undefined;

      const metadata = {
        ...user.unsafeMetadata,
        pieOnboardingPhone: phone.trim() || clerkPhone,
        pieSelectedPlanId: plan.id,
        pieSelectedPlanLevel: plan.level,
        pieTrialDays: TRIAL_DAYS,
        pieOnboardingStartedAt: new Date().toISOString(),
      };

      await user.update({ firstName, lastName, unsafeMetadata: metadata });

      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 25000);
      let response: Response;
      try {
        response = await fetch('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: plan.id }),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) throw new Error(data?.error || 'Checkout could not be started.');
      window.location.href = data.url;
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError'
        ? 'Checkout took too long to respond. Your verified account is safe; please try again.'
        : err instanceof Error ? err.message : 'We could not finish setup.';
      setError(message);
      setBusy(false);
    }
  }

  return (
    <main style={shell}>
      <section style={card}>
        <img src="/pieinears-horizontal.svg" alt="Pie" style={{ width: 'min(100%,520px)', margin: '0 auto 6px', display: 'block' }} />
        <div>
          <div style={eyebrow}>WELCOME TO PIE</div>
          <h1 style={{ margin: '5px 0 7px', fontSize: '30px' }}>Account verified</h1>
          <p style={muted}>Your Pie account is verified. We kept the details you already entered, so you can continue directly to your plan and trial setup.</p>
        </div>

        <section style={summaryCard}>
          <div><span style={summaryLabel}>Name</span><strong>{name || user?.fullName || 'Pie member'}</strong></div>
          <div><span style={summaryLabel}>Phone</span><strong>{phone || clerkPhone || 'Not provided'}</strong></div>
          <div><span style={summaryLabel}>Email</span><strong>{user?.primaryEmailAddress?.emailAddress || ''}</strong></div>
        </section>

        <section style={verifiedCard}>
          <strong>{verifiedEmail ? '✓ Email verified' : 'Email verification required'}</strong>
          <span style={muted}>
            {verifiedPhone ? '✓ Phone verified through Clerk. ' : clerkPhone ? 'Phone is connected to your Clerk account. ' : ''}
            Pie will not start checkout until the required account verification is complete.
          </span>
        </section>

        <div>
          <div style={eyebrow}>CHOOSE YOUR PLAN</div>
          <p style={muted}>Your earlier selection is highlighted. Change it only if you want a different stage.</p>
        </div>

        <div style={{ display:'grid', gap:10 }}>
          {PIE_PLANS.map((item) => {
            const active = item.id === selectedPlan;
            return (
              <button key={item.id} type="button" onClick={()=>setSelectedPlan(item.id)} style={{ ...planCard, borderColor: active ? '#8a6bc0' : '#505157', background: active ? '#343039' : '#292a2e' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                  <div style={{ textAlign:'left' }}><div style={{ fontSize:12, color:'#aeb0b6', fontWeight:850 }}>STAGE {item.level}</div><strong style={{ fontSize:18 }}>{item.name}</strong></div>
                  <div style={{ fontWeight:900, fontSize:18 }}>${item.monthlyPrice}/mo</div>
                </div>
                <div style={{ marginTop:7, color:'#c0c1c6', fontSize:12, lineHeight:1.45, textAlign:'left' }}>{item.outcome}</div>
                <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>{item.unlocks.slice(0,4).map((unlock)=><span key={unlock} style={pill}>{unlock}</span>)}</div>
              </button>
            );
          })}
        </div>

        <section style={{ padding:14, borderRadius:16, background:'#292a2e', border:'1px solid #505157' }}>
          <strong>{TRIAL_DAYS}-day free trial of {plan.name}</strong>
          <div style={{ color:'#c0c1c6', fontSize:12, lineHeight:1.5, marginTop:5 }}>
            Trial usage is capped to protect generation costs. A payment method is collected in Stripe sandbox, and the subscription begins at ${plan.monthlyPrice}/month after the trial unless canceled. No live charge is made during this test.
          </div>
        </section>

        {error && <div style={{ color:'#ffd0d6', fontSize:12 }}>{error}</div>}
        <form onSubmit={continueOnboarding}>
          <button type="submit" disabled={busy || !verifiedEmail} style={{ ...primary, width:'100%', opacity: verifiedEmail ? 1 : .55 }}>{busy ? 'Setting up…' : `Continue to ${TRIAL_DAYS}-Day Free Trial`}</button>
        </form>
      </section>
    </main>
  );
}

const shell: React.CSSProperties = { minHeight:'100vh', padding:'22px 14px 40px', background:'radial-gradient(circle at top,#3a3b41 0,#24252a 46%,#17181c 100%)', color:'#fff' };
const card: React.CSSProperties = { width:'min(100%,760px)', margin:'0 auto', display:'grid', gap:16, padding:'20px', borderRadius:24, background:'#2d2e33', border:'1px solid #4c4d53', boxShadow:'0 24px 80px rgba(0,0,0,.36)' };
const eyebrow: React.CSSProperties = { color:'#d7c8f1', fontSize:11, fontWeight:950, letterSpacing:'.12em' };
const muted: React.CSSProperties = { color:'#c0c1c6', lineHeight:1.5, fontSize:13 };
const summaryCard: React.CSSProperties = { display:'grid', gap:10, padding:14, borderRadius:16, background:'#292a2e', border:'1px solid #505157' };
const summaryLabel: React.CSSProperties = { display:'block', marginBottom:3, color:'#aeb0b6', fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'.08em' };
const verifiedCard: React.CSSProperties = { display:'grid', gap:4, padding:14, borderRadius:16, background:'#29342f', border:'1px solid #4e675a' };
const planCard: React.CSSProperties = { width:'100%', color:'#fff', border:'1px solid', borderRadius:16, padding:'13px', cursor:'pointer' };
const pill: React.CSSProperties = { padding:'4px 7px', borderRadius:999, background:'#3b3c42', color:'#d2d3d7', fontSize:9, fontWeight:800 };
const primary: React.CSSProperties = { minHeight:54, border:0, borderRadius:15, background:'#7254a8', color:'#fff', fontWeight:950, fontSize:15, padding:'0 16px' };
