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
  const [phoneError, setPhoneError] = useState('');
  const [prefilled, setPrefilled] = useState(false);
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneStep, setPhoneStep] = useState<'ready' | 'code' | 'verified'>('ready');
  const [phoneResourceId, setPhoneResourceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      setName(sessionStorage.getItem('pieSignupName') || '');
      setPhone(sessionStorage.getItem('pieSignupPhone') || '');
      setSelectedPlan(sessionStorage.getItem('pieSignupPlan') || DEFAULT_PLAN_ID);
    } catch {}
    setPrefilled(true);
  }, []);

  useEffect(() => {
    if (!user) return;
    const verified = user.phoneNumbers.find((item) => item.verification?.status === 'verified');
    if (verified) {
      setPhoneStep('verified');
      setPhoneResourceId(verified.id);
      if (!phone) setPhone(verified.phoneNumber);
    }
  }, [user, phone]);

  const plan = useMemo(() => planById(selectedPlan), [selectedPlan]);

  if (!isLoaded || !prefilled) return <main style={shell}><section style={card}>Loading your Pie setup…</section></main>;
  if (!isSignedIn) {
    if (typeof window !== 'undefined') window.location.href = '/signup';
    return null;
  }

  async function sendPhoneCode() {
    if (!user || busy || !phone.trim()) return;
    setBusy(true);
    setPhoneError('');
    setError('');
    try {
      let resource = user.phoneNumbers.find((item) => item.phoneNumber === phone.trim());
      if (!resource) resource = await user.createPhoneNumber({ phoneNumber: phone.trim() });
      await resource.prepareVerification();
      setPhoneResourceId(resource.id);
      setPhoneStep('code');
    } catch {
      setPhoneError('SMS verification is currently blocked by Pie’s authentication settings. Enable phone verification in Clerk Production, then tap Send SMS Code again.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyPhone(event: FormEvent) {
    event.preventDefault();
    if (!user || busy || !phoneCode.trim()) return;
    setBusy(true);
    setPhoneError('');
    setError('');
    try {
      const resource = user.phoneNumbers.find((item) => item.id === phoneResourceId);
      if (!resource) throw new Error('Phone verification session expired. Please send a new code.');
      const result = await resource.attemptVerification({ code: phoneCode.trim() });
      if (result.verification?.status !== 'verified') throw new Error('That code did not verify the phone number.');
      await user.reload();
      setPhoneStep('verified');
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : 'That verification code did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function continueOnboarding(event: FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    if (phoneStep !== 'verified') {
      setError('Verify your phone number before starting the free trial.');
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
        pieOnboardingPhone: phone.trim(),
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
          <h1 style={{ margin: '5px 0 7px', fontSize: '30px' }}>Next: verify your phone</h1>
          <p style={muted}>Your email is verified. We saved the details you already entered, so you do not need to fill them out again.</p>
        </div>

        <section style={summaryCard}>
          <div><span style={summaryLabel}>Name</span><strong>{name || user?.fullName || 'Pie member'}</strong></div>
          <div><span style={summaryLabel}>Phone</span><strong>{phone || 'Not provided'}</strong></div>
          <div><span style={summaryLabel}>Email</span><strong>{user?.primaryEmailAddress?.emailAddress || ''}</strong></div>
        </section>

        {phoneStep === 'verified' ? (
          <section style={verifiedCard}><strong>✓ Phone verified</strong><span style={muted}>Your contact verification is complete.</span></section>
        ) : phoneStep === 'code' ? (
          <form onSubmit={verifyPhone} style={{ display:'grid', gap:10 }}>
            <label style={label}>SMS verification code<input required value={phoneCode} onChange={(e)=>setPhoneCode(e.target.value)} style={input} inputMode="numeric" autoComplete="one-time-code" placeholder="Enter code" /></label>
            <button type="submit" disabled={busy || !phoneCode.trim()} style={primary}>{busy ? 'Verifying…' : 'Verify Phone'}</button>
            <button type="button" disabled={busy} onClick={sendPhoneCode} style={secondary}>Send another code</button>
          </form>
        ) : (
          <button type="button" disabled={busy || !phone.trim()} onClick={sendPhoneCode} style={primary}>{busy ? 'Sending code…' : `Send SMS Code to ${phone}`}</button>
        )}

        {phoneError ? <div style={phoneErrorStyle}>{phoneError}</div> : null}

        <div>
          <div style={eyebrow}>CHOOSE YOUR PLAN</div>
          <p style={muted}>Your earlier selection is highlighted. Change it only if you want a different stage.</p>
        </div>

        <div style={{ display:'grid', gap:10 }}>
          {PIE_PLANS.map((item) => {
            const active = item.id === selectedPlan;
            return (
              <button key={item.id} type="button" onClick={()=>setSelectedPlan(item.id)} style={{ ...planCard, borderColor: active ? '#8b5cf6' : '#2c2d39', background: active ? '#181329' : '#11131a' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                  <div style={{ textAlign:'left' }}><div style={{ fontSize:12, color:'#8f90a0', fontWeight:850 }}>STAGE {item.level}</div><strong style={{ fontSize:18 }}>{item.name}</strong></div>
                  <div style={{ fontWeight:900, fontSize:18 }}>${item.monthlyPrice}/mo</div>
                </div>
                <div style={{ marginTop:7, color:'#b0b1bd', fontSize:12, lineHeight:1.45, textAlign:'left' }}>{item.outcome}</div>
                <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>{item.unlocks.slice(0,4).map((unlock)=><span key={unlock} style={pill}>{unlock}</span>)}</div>
              </button>
            );
          })}
        </div>

        <section style={{ padding:14, borderRadius:16, background:'#10131b', border:'1px solid #2a2d3a' }}>
          <strong>{TRIAL_DAYS}-day free trial of {plan.name}</strong>
          <div style={{ color:'#a8a9b7', fontSize:12, lineHeight:1.5, marginTop:5 }}>
            Trial usage is capped to protect generation costs. A payment method is collected in Stripe sandbox, and the subscription begins at ${plan.monthlyPrice}/month after the trial unless canceled. No live charge is made during this test.
          </div>
        </section>

        {error && <div style={{ color:'#ffb6c0', fontSize:12 }}>{error}</div>}
        <form onSubmit={continueOnboarding}>
          <button type="submit" disabled={busy || phoneStep !== 'verified'} style={{ ...primary, width:'100%', opacity: phoneStep === 'verified' ? 1 : .55 }}>{busy ? 'Setting up…' : `Continue to ${TRIAL_DAYS}-Day Free Trial`}</button>
        </form>
      </section>
    </main>
  );
}

const shell: React.CSSProperties = { minHeight:'100vh', padding:'22px 14px 40px', background:'radial-gradient(circle at top,#24163b 0,#090a0f 42%,#06070a 100%)', color:'#fff' };
const card: React.CSSProperties = { width:'min(100%,760px)', margin:'0 auto', display:'grid', gap:16, padding:'20px', borderRadius:24, background:'rgba(15,16,23,.96)', border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 80px rgba(0,0,0,.45)' };
const eyebrow: React.CSSProperties = { color:'#9b7cff', fontSize:11, fontWeight:950, letterSpacing:'.12em' };
const muted: React.CSSProperties = { color:'#9899a8', lineHeight:1.5, fontSize:13 };
const label: React.CSSProperties = { display:'grid', gap:6, fontSize:12, fontWeight:850, color:'#d8d9e5' };
const input: React.CSSProperties = { minHeight:48, borderRadius:13, border:'1px solid #353746', background:'#090a10', color:'#fff', padding:'11px 12px', fontSize:15, outline:'none' };
const summaryCard: React.CSSProperties = { display:'grid', gap:10, padding:14, borderRadius:16, background:'#11131a', border:'1px solid #2c2f38' };
const summaryLabel: React.CSSProperties = { display:'block', marginBottom:3, color:'#8f90a0', fontSize:10, fontWeight:900, textTransform:'uppercase', letterSpacing:'.08em' };
const verifiedCard: React.CSSProperties = { display:'grid', gap:4, padding:14, borderRadius:16, background:'#111a16', border:'1px solid #2d5441' };
const phoneErrorStyle: React.CSSProperties = { marginTop:-4, padding:'10px 12px', borderRadius:12, background:'#25151b', border:'1px solid #6a3343', color:'#ffc1cc', fontSize:12, lineHeight:1.45 };
const planCard: React.CSSProperties = { width:'100%', color:'#fff', border:'1px solid', borderRadius:16, padding:'13px', cursor:'pointer' };
const pill: React.CSSProperties = { padding:'4px 7px', borderRadius:999, background:'#242633', color:'#c8c9d4', fontSize:9, fontWeight:800 };
const primary: React.CSSProperties = { minHeight:54, border:0, borderRadius:15, background:'#6f42c1', color:'#fff', fontWeight:950, fontSize:15, padding:'0 16px' };
const secondary: React.CSSProperties = { minHeight:44, borderRadius:13, background:'#191b24', border:'1px solid #343744', color:'#d8d9e5', fontWeight:800 };
