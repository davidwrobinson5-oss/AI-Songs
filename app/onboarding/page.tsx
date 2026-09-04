'use client';

import { useUser } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { PIE_PLANS, planById } from '../billingConfig';

export default function OnboardingPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPlan, setSelectedPlan] = useState('fun');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const plan = useMemo(() => planById(selectedPlan), [selectedPlan]);

  if (!isLoaded) return <main style={shell}><section style={card}>Loading…</section></main>;
  if (!isSignedIn) {
    if (typeof window !== 'undefined') window.location.href = '/signup';
    return null;
  }

  async function continueOnboarding(event: FormEvent) {
    event.preventDefault();
    if (!user || busy) return;
    setBusy(true);
    setError('');
    try {
      const trimmedName = name.trim();
      const pieces = trimmedName.split(/\s+/).filter(Boolean);
      const firstName = pieces[0] || user.firstName || undefined;
      const lastName = pieces.slice(1).join(' ') || user.lastName || undefined;

      await user.update({
        firstName,
        lastName,
        unsafeMetadata: {
          ...user.unsafeMetadata,
          pieOnboardingPhone: phone.trim(),
          pieSelectedPlanId: plan.id,
          pieSelectedPlanLevel: plan.level,
          pieOnboardingStartedAt: new Date().toISOString(),
        },
      });

      if (plan.level === 1) {
        await user.update({
          unsafeMetadata: {
            ...user.unsafeMetadata,
            pieOnboardingPhone: phone.trim(),
            pieSelectedPlanId: plan.id,
            pieSelectedPlanLevel: plan.level,
            pieSubscriptionStatus: 'free',
            pieOnboardingCompleted: true,
            pieOnboardingCompletedAt: new Date().toISOString(),
          },
        });
        router.push('/');
        return;
      }

      if (!plan.paymentLink) throw new Error('This plan is not available for checkout yet.');
      window.location.href = plan.paymentLink;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'We could not finish setup.');
      setBusy(false);
    }
  }

  return (
    <main style={shell}>
      <form onSubmit={continueOnboarding} style={card}>
        <img src="/pieinears-horizontal.svg" alt="Pie" style={{ width: 'min(100%,520px)', margin: '0 auto 6px', display: 'block' }} />
        <div>
          <div style={eyebrow}>WELCOME TO PIE</div>
          <h1 style={{ margin: '5px 0 7px', fontSize: '30px' }}>Where are you headed?</h1>
          <p style={muted}>Choose the stage that matches what you are actually trying to accomplish. Every paid stage includes everything before it.</p>
        </div>

        <div style={twoCols}>
          <label style={label}>Name<input required value={name} onChange={(e)=>setName(e.target.value)} style={input} placeholder="Your name" autoComplete="name" /></label>
          <label style={label}>Phone number<input required value={phone} onChange={(e)=>setPhone(e.target.value)} style={input} placeholder="(555) 555-5555" autoComplete="tel" inputMode="tel" /></label>
        </div>

        <div style={{ display:'grid', gap:10 }}>
          {PIE_PLANS.map((item) => {
            const active = item.id === selectedPlan;
            return (
              <button key={item.id} type="button" onClick={()=>setSelectedPlan(item.id)} style={{ ...planCard, borderColor: active ? '#8b5cf6' : '#2c2d39', background: active ? '#181329' : '#11131a' }}>
                <div style={{ display:'flex', justifyContent:'space-between', gap:12, alignItems:'flex-start' }}>
                  <div style={{ textAlign:'left' }}><div style={{ fontSize:12, color:'#8f90a0', fontWeight:850 }}>STAGE {item.level}</div><strong style={{ fontSize:18 }}>{item.name}</strong></div>
                  <div style={{ fontWeight:900, fontSize:18 }}>{item.monthlyPrice === 0 ? 'Free' : `$${item.monthlyPrice}/mo`}</div>
                </div>
                <div style={{ marginTop:7, color:'#b0b1bd', fontSize:12, lineHeight:1.45, textAlign:'left' }}>{item.outcome}</div>
                <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>{item.unlocks.slice(0,4).map((unlock)=><span key={unlock} style={pill}>{unlock}</span>)}</div>
              </button>
            );
          })}
        </div>

        <section style={{ padding:14, borderRadius:16, background:'#10131b', border:'1px solid #2a2d3a' }}>
          <strong>{plan.name}</strong>
          <div style={{ color:'#a8a9b7', fontSize:12, lineHeight:1.5, marginTop:5 }}>
            {plan.level === 1
              ? 'Start free with limited generations and standard-quality outputs. Upgrade whenever you need more generations, higher-quality outputs, or the next stage of the business system.'
              : 'Paid checkout is handled securely by Stripe. After payment, Pie will use the subscription status to unlock this stage and everything below it.'}
          </div>
        </section>

        {error && <div style={{ color:'#ffb6c0', fontSize:12 }}>{error}</div>}
        <button type="submit" disabled={busy} style={primary}>{busy ? 'Setting up…' : plan.level === 1 ? 'Start Creating Free' : `Continue to ${plan.name}`}</button>
        <p style={{ ...muted, fontSize:10, margin:0 }}>This checkout is currently connected to Pie's Stripe sandbox while billing is being tested before live charges are enabled.</p>
      </form>
    </main>
  );
}

const shell: React.CSSProperties = { minHeight:'100vh', padding:'22px 14px 40px', background:'radial-gradient(circle at top,#24163b 0,#090a0f 42%,#06070a 100%)', color:'#fff' };
const card: React.CSSProperties = { width:'min(100%,760px)', margin:'0 auto', display:'grid', gap:16, padding:'20px', borderRadius:24, background:'rgba(15,16,23,.96)', border:'1px solid rgba(255,255,255,.1)', boxShadow:'0 24px 80px rgba(0,0,0,.45)' };
const eyebrow: React.CSSProperties = { color:'#9b7cff', fontSize:11, fontWeight:950, letterSpacing:'.12em' };
const muted: React.CSSProperties = { color:'#9899a8', lineHeight:1.5, fontSize:13 };
const twoCols: React.CSSProperties = { display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:10 };
const label: React.CSSProperties = { display:'grid', gap:6, fontSize:12, fontWeight:850, color:'#d8d9e5' };
const input: React.CSSProperties = { minHeight:48, borderRadius:13, border:'1px solid #353746', background:'#090a10', color:'#fff', padding:'11px 12px', fontSize:15, outline:'none' };
const planCard: React.CSSProperties = { width:'100%', color:'#fff', border:'1px solid', borderRadius:16, padding:'13px', cursor:'pointer' };
const pill: React.CSSProperties = { padding:'4px 7px', borderRadius:999, background:'#242633', color:'#c8c9d4', fontSize:9, fontWeight:800 };
const primary: React.CSSProperties = { minHeight:54, border:0, borderRadius:15, background:'#7c3aed', color:'#fff', fontWeight:950, fontSize:15 };
