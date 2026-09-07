'use client';

import { useEffect, useMemo, useState } from 'react';
import { PIE_PLANS, planById } from '../../billingConfig';

type Pack = { id: string; name: string; credits: number; price: number };
type UsageData = {
  planId: string;
  planLevel: number;
  status: string;
  computeUsed: number;
  computeLimit: number | null;
  overageCredits: number;
  includedRemaining: number | null;
  availableNow: number | null;
  averagePerDay: number;
  projectedTotal: number;
  projectedShortfall: number;
  recommendedPackId: string;
  resetAt: string | null;
  daysRemaining: number;
  packs: Pack[];
};

export default function BillingUsagePage() {
  const [data, setData] = useState<UsageData | null>(null);
  const [error, setError] = useState('');
  const [busyPack, setBusyPack] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    setError('');
    const response = await fetch('/api/billing/usage', { cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body?.error || 'Could not load usage.');
      return;
    }
    setData(body);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('topup') === 'success') setNotice('Top-up payment received. Your credits will appear as soon as Stripe confirms the payment.');
    if (params.get('topup') === 'cancelled') setNotice('Top-up checkout was canceled. No charge was made.');
    void load();
  }, []);

  const plan = useMemo(() => data ? planById(data.planId) : PIE_PLANS[0], [data]);
  const percent = data?.computeLimit ? Math.min(100, Math.round((data.computeUsed / data.computeLimit) * 100)) : 0;
  const active = data?.status === 'active';
  const trialing = data?.status === 'trialing';

  async function buy(packId: string) {
    if (busyPack) return;
    setBusyPack(packId);
    setError('');
    try {
      const response = await fetch('/api/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.url) throw new Error(body?.error || 'Could not start top-up checkout.');
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start top-up checkout.');
      setBusyPack('');
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#090b10', color: '#f7f7fb', padding: '28px 16px 80px' }}>
      <section style={{ width: 'min(760px,100%)', margin: '0 auto', display: 'grid', gap: 16 }}>
        <div>
          <a href="/" style={{ color: '#b9a7ff', textDecoration: 'none', fontWeight: 800 }}>← Back to Pie</a>
          <h1 style={{ margin: '18px 0 6px', fontSize: 'clamp(28px,7vw,44px)' }}>Usage & top-ups</h1>
          <p style={{ margin: 0, color: '#a7a9b4', lineHeight: 1.5 }}>Your included Pie credits reset with your subscription billing cycle. Top-ups are optional and never charged automatically.</p>
        </div>

        {notice ? <div style={noticeStyle}>{notice}</div> : null}
        {error ? <div style={errorStyle}>{error}</div> : null}
        {!data && !error ? <div style={cardStyle}>Loading your usage…</div> : null}

        {data ? (
          <>
            <section style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <div><div style={eyebrow}>Current plan</div><strong style={{ fontSize: 22 }}>{plan.name}</strong></div>
                <strong>${plan.monthlyPrice}/mo</strong>
              </div>
              <div style={{ marginTop: 18, display: 'grid', gap: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Included monthly credits</span><strong>{data.computeLimit ?? '—'}</strong></div>
                <div style={{ height: 12, borderRadius: 999, background: '#242733', overflow: 'hidden' }}><div style={{ width: `${percent}%`, height: '100%', background: 'linear-gradient(90deg,#6d4aff,#a572ff)' }} /></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: '#a7a9b4', fontSize: 13 }}><span>{data.computeUsed} used</span><span>{data.includedRemaining ?? 0} included left</span></div>
                {data.overageCredits > 0 ? <div style={{ color: '#d8d0ff', fontWeight: 800 }}>+ {data.overageCredits} prepaid top-up credits available</div> : null}
              </div>
            </section>

            {active ? (
              <section style={cardStyle}>
                <div style={eyebrow}>Usage forecast</div>
                <h2 style={{ margin: '5px 0 10px' }}>Based on your current pace</h2>
                <p style={{ margin: 0, color: '#b9bbc4', lineHeight: 1.55 }}>
                  You are averaging <strong style={{ color: '#fff' }}>{data.averagePerDay} credits/day</strong>. With {data.daysRemaining} days left before reset, Pie projects about <strong style={{ color: '#fff' }}>{data.projectedTotal} credits</strong> for this cycle.
                </p>
                {data.projectedShortfall > 0 ? <p style={{ margin: '12px 0 0', color: '#f1c5ff', fontWeight: 800 }}>Projected need beyond your current allowance: about {data.projectedShortfall} more credits.</p> : <p style={{ margin: '12px 0 0', color: '#bdf7ce', fontWeight: 800 }}>Your current allowance looks sufficient through the next reset.</p>}
                <div style={{ marginTop: 12, color: '#8f92a0', fontSize: 12 }}>Reset: {data.resetAt ? new Date(data.resetAt).toLocaleDateString() : 'next billing cycle'}</div>
              </section>
            ) : null}

            {trialing ? (
              <section style={cardStyle}><strong>You’re currently in the capped 7-day trial.</strong><p style={{ color: '#a7a9b4', lineHeight: 1.5 }}>Top-up packs become available after the paid subscription starts. Trial limits protect Pie from uncontrolled generation costs.</p></section>
            ) : null}

            {active ? (
              <section style={cardStyle}>
                <div style={eyebrow}>Optional top-ups</div>
                <h2 style={{ margin: '5px 0 4px' }}>Add credits only when you need them</h2>
                <p style={{ margin: '0 0 14px', color: '#a7a9b4', lineHeight: 1.5 }}>No surprise overage billing. Purchased credits are valid for the current billing cycle and are used only after included credits are exhausted.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                  {data.packs.map((pack) => {
                    const recommended = pack.id === data.recommendedPackId && data.projectedShortfall > 0;
                    return (
                      <button key={pack.id} type="button" onClick={() => buy(pack.id)} disabled={Boolean(busyPack)} style={{ border: recommended ? '1px solid #9b72ff' : '1px solid #353846', borderRadius: 16, background: recommended ? '#1b1530' : '#10131a', color: '#fff', padding: 16, textAlign: 'left' }}>
                        {recommended ? <div style={{ fontSize: 10, fontWeight: 900, color: '#c7afff', textTransform: 'uppercase', letterSpacing: '.08em' }}>Recommended</div> : null}
                        <div style={{ fontSize: 19, fontWeight: 900, marginTop: 4 }}>{pack.name}</div>
                        <div style={{ marginTop: 5, color: '#b5b7c2' }}>{pack.credits} credits</div>
                        <div style={{ marginTop: 9, fontSize: 21, fontWeight: 900 }}>${pack.price}</div>
                        <div style={{ marginTop: 9, fontSize: 12, color: '#8f92a0' }}>{busyPack === pack.id ? 'Opening Stripe…' : 'Buy one-time top-up'}</div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section style={cardStyle}>
              <div style={eyebrow}>How credits work</div>
              <div style={{ display: 'grid', gap: 8, marginTop: 9, color: '#c6c8d0' }}>
                <div>Normal AI planning / analysis: <strong>1 credit</strong></div>
                <div>Voice render / conversion: <strong>2 credits</strong></div>
                <div>Stem or sheet processing job: <strong>3 credits</strong></div>
                <div>Music generation / AI remix: <strong>4 credits</strong></div>
                <div>Heavy voice-training job: <strong>8 credits</strong></div>
              </div>
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

const cardStyle: React.CSSProperties = { border: '1px solid #2b2e39', borderRadius: 18, background: '#11141c', padding: 18, boxShadow: '0 16px 36px rgba(0,0,0,.18)' };
const eyebrow: React.CSSProperties = { fontSize: 11, fontWeight: 900, color: '#9d84ff', textTransform: 'uppercase', letterSpacing: '.08em' };
const noticeStyle: React.CSSProperties = { ...cardStyle, borderColor: '#4f426f', color: '#ddd3ff' };
const errorStyle: React.CSSProperties = { ...cardStyle, borderColor: '#6f3846', color: '#ffc5ce' };
