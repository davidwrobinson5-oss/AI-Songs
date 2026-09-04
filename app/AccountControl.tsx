'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

const supportTypes = [
  'Backend setup + account connections',
  'Coaching + strategy',
  'Sales + booking',
  'Tax + accounting',
  'Legal + contracts',
  'Marketing + growth',
  'Distribution + release setup',
  'Merch + e-commerce',
  'Gigs + touring operations',
  'Team + contractor setup',
  'Funding + budgeting',
  'Other / help me figure it out',
];

const businessStages = [
  '1 · Create for Fun',
  '2 · Planning a Release',
  '3 · Prelaunch',
  '4 · Launch',
  '5 · Campaign',
  '6 · Gigs',
  '7 · Local to National',
  '8 · National to International',
];

export default function AccountControl() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [supportType, setSupportType] = useState(supportTypes[0]);
  const [supportStage, setSupportStage] = useState(businessStages[0]);
  const [supportContact, setSupportContact] = useState('Email');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [supportStatus, setSupportStatus] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (pathname.startsWith('/login') || !isLoaded) return null;

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const label = isSignedIn ? user?.firstName || email.split('@')[0] || 'Account' : 'Studio';

  async function signOutEverywhere() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      if (isSignedIn) await clerk.signOut({ redirectUrl: '/login' });
      else window.location.href = '/login';
    } finally {
      setBusy(false);
    }
  }

  async function sendSupport(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setSupportStatus('');
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'support',
          name: user?.fullName || user?.firstName || '',
          email,
          subject: `[Live Support · ${supportType}] ${supportSubject}`,
          message: `Business stage: ${supportStage}\nPreferred contact: ${supportContact}\nSupport area: ${supportType}\n\n${supportMessage}`,
          website: '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Live Support request could not be sent.');
      setSupportStatus('Live Support request sent.');
      setSupportSubject('');
      setSupportMessage('');
    } catch (error) {
      setSupportStatus(error instanceof Error ? error.message : 'Live Support request could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div ref={wrapRef} style={{ position: 'fixed', top: 'max(14px, env(safe-area-inset-top))', right: '16px', zIndex: 10000 }}>
        <button
          type="button"
          aria-label="Open account options"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          style={{
            width: '42px',
            height: '42px',
            minWidth: '42px',
            minHeight: '42px',
            padding: 0,
            margin: 0,
            borderRadius: '50%',
            border: open ? '1px solid rgba(255,255,255,.72)' : '1px solid rgba(255,255,255,.18)',
            background: '#11151c',
            color: '#f4f4f7',
            boxShadow: '0 6px 16px rgba(0,0,0,.28)',
            display: 'grid',
            placeItems: 'center',
            WebkitAppearance: 'none',
            appearance: 'none',
            cursor: 'pointer',
          }}
        >
          <svg aria-hidden="true" width="21" height="21" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 12.25a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M4.75 20c.8-3.42 3.36-5.25 7.25-5.25S18.45 16.58 19.25 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
        </button>

        {open && (
          <div role="menu" style={{ position: 'absolute', top: '50px', right: 0, width: '236px', padding: '10px', borderRadius: '16px', border: '1px solid rgba(255,255,255,.1)', background: '#151922', color: '#f5f3ff', boxShadow: '0 22px 55px rgba(0,0,0,.45)' }}>
            {isSignedIn && (
              <div style={{ padding: '7px 9px 11px', borderBottom: '1px solid #2c2f38', marginBottom: '7px' }}>
                <div style={{ fontSize: '12px', color: '#9699a5' }}>Signed in as</div>
                <div style={{ marginTop: '3px', fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email || label}</div>
              </div>
            )}

            {isSignedIn && <button type="button" role="menuitem" onClick={() => { setOpen(false); clerk.openUserProfile(); }} style={menuButtonStyle}>👤 Manage account</button>}
            {isSignedIn && <button type="button" role="menuitem" onClick={() => { setOpen(false); setSupportOpen(true); setSupportStatus(''); }} style={menuButtonStyle}>🛟 Live Support</button>}
            <button type="button" role="menuitem" onClick={signOutEverywhere} disabled={busy} style={{ ...menuButtonStyle, color: '#ffb4bf' }}>{busy ? 'Signing out…' : '↪ Sign out'}</button>
          </div>
        )}
      </div>

      {supportOpen && (
        <div role="dialog" aria-modal="true" aria-label="Pie Live Support" style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'grid', placeItems: 'center', padding: '14px', background: 'rgba(0,0,0,.72)' }}>
          <form onSubmit={sendSupport} style={{ width: 'min(100%,560px)', maxHeight: '90vh', overflow: 'auto', display: 'grid', gap: '13px', padding: '20px', borderRadius: '22px', border: '1px solid #34344a', background: '#151522', color: '#fff', boxShadow: '0 24px 70px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
              <div>
                <div style={{ fontSize: '22px', fontWeight: 900 }}>Live Support</div>
                <div style={{ marginTop: '4px', color: '#a5a5b5', fontSize: '12px', lineHeight: 1.45 }}>Hands-on help getting the artist business set up, operating, selling, releasing, touring, and scaling.</div>
              </div>
              <button type="button" aria-label="Close Live Support" onClick={() => setSupportOpen(false)} style={{ border: 0, background: 'transparent', color: '#aaa9bd', fontSize: '24px' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '8px' }}>
              {[
                ['⚙️', 'Backend Setup', 'Accounts, integrations, profiles, distribution, payments and core systems.'],
                ['🧭', 'Coaching + Strategy', 'Business plan, goals, release strategy, growth priorities and accountability.'],
                ['💵', 'Sales', 'Booking, offers, sponsorships, merch, partnerships and revenue development.'],
                ['🧾', 'Tax + Accounting', 'Bookkeeping setup, tax coordination, reporting and financial organization.'],
                ['⚖️', 'Legal', 'Contracts, rights, entity setup, registrations and qualified legal review.'],
                ['🚀', 'Whatever You Need', 'If you do not know the next step, Pie helps diagnose the gap and route the right help.'],
              ].map(([icon, title, copy]) => (
                <div key={title} style={{ padding: '10px', borderRadius: '13px', border: '1px solid #2f3041', background: '#10101a' }}>
                  <div style={{ fontSize: '15px', fontWeight: 850 }}>{icon} {title}</div>
                  <div style={{ marginTop: '4px', color: '#8f90a2', fontSize: '10px', lineHeight: 1.4 }}>{copy}</div>
                </div>
              ))}
            </div>

            <label style={labelStyle}>What do you need?
              <select value={supportType} onChange={(event) => setSupportType(event.target.value)} style={inputStyle}>
                {supportTypes.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>

            <label style={labelStyle}>Where are you in the Pie plan?
              <select value={supportStage} onChange={(event) => setSupportStage(event.target.value)} style={inputStyle}>
                {businessStages.map((stage) => <option key={stage}>{stage}</option>)}
              </select>
            </label>

            <label style={labelStyle}>Preferred contact
              <select value={supportContact} onChange={(event) => setSupportContact(event.target.value)} style={inputStyle}>
                <option>Email</option><option>Phone</option><option>Video call</option><option>In-app message</option>
              </select>
            </label>

            <label style={labelStyle}>Subject<input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} maxLength={120} required style={inputStyle} placeholder="What outcome do you need?" /></label>
            <label style={labelStyle}>Tell us what is going on<textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} maxLength={4000} required style={{ ...inputStyle, minHeight: '145px', resize: 'vertical' }} placeholder="What have you already done, what is blocking you, and what would success look like?" /></label>

            <div style={{ padding: '11px 12px', borderRadius: '13px', background: '#111320', color: '#9899aa', fontSize: '10px', lineHeight: 1.5 }}>
              Tax and legal matters should be handled or reviewed by appropriately qualified professionals. Pie Live Support can organize the work, coordinate specialists, and help you prepare, but does not replace licensed legal or tax advice where required.
            </div>

            {supportStatus && <div style={{ padding: '10px 12px', borderRadius: '12px', background: supportStatus === 'Live Support request sent.' ? '#17162b' : '#251219', color: supportStatus === 'Live Support request sent.' ? '#c4b5fd' : '#ffb5c0', fontSize: '12px' }}>{supportStatus}</div>}
            <button type="submit" disabled={busy || !supportSubject.trim() || !supportMessage.trim()} style={{ minHeight: '52px', border: 0, borderRadius: '14px', background: '#7c3aed', color: '#fff', fontWeight: 900 }}>{busy ? 'Sending…' : 'Request Live Support'}</button>
          </form>
        </div>
      )}
    </>
  );
}

const menuButtonStyle: React.CSSProperties = { width: '100%', border: 0, borderRadius: '11px', padding: '11px 10px', background: 'transparent', color: '#f5f3ff', textAlign: 'left', fontWeight: 700, fontSize: '13px' };
const labelStyle: React.CSSProperties = { display: 'grid', gap: '7px', color: '#d8d8e8', fontSize: '13px', fontWeight: 800 };
const inputStyle: React.CSSProperties = { width: '100%', minHeight: '48px', padding: '12px 13px', borderRadius: '13px', border: '1px solid #34344a', background: '#0d0d16', color: '#fff', outline: 'none', fontSize: '14px' };
