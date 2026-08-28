'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

export default function AccountControl() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
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
          subject: supportSubject,
          message: supportMessage,
          website: '',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Support request could not be sent.');
      setSupportStatus('Support request sent.');
      setSupportSubject('');
      setSupportMessage('');
    } catch (error) {
      setSupportStatus(error instanceof Error ? error.message : 'Support request could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div ref={wrapRef} style={{ position: 'fixed', top: 'max(12px, env(safe-area-inset-top))', right: '14px', zIndex: 10000 }}>
        <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={{ display: 'flex', alignItems: 'center', gap: '8px', minHeight: '40px', padding: '7px 11px 7px 8px', borderRadius: '999px', border: '1px solid rgba(167,139,250,.28)', background: 'rgba(18,18,30,.92)', color: '#f5f3ff', boxShadow: '0 10px 28px rgba(0,0,0,.28)', backdropFilter: 'blur(12px)', fontWeight: 750, fontSize: '13px' }}>
          <span aria-hidden="true" style={{ width: '27px', height: '27px', borderRadius: '50%', display: 'grid', placeItems: 'center', background: '#7c3aed', fontSize: '14px' }}>
            {isSignedIn ? (user?.firstName?.[0] || email?.[0] || '👤').toUpperCase() : '🔐'}
          </span>
          <span style={{ maxWidth: '92px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span aria-hidden="true" style={{ opacity: .7, fontSize: '10px' }}>▼</span>
        </button>

        {open && (
          <div role="menu" style={{ position: 'absolute', top: '48px', right: 0, width: '220px', padding: '10px', borderRadius: '16px', border: '1px solid rgba(167,139,250,.25)', background: '#151522', color: '#f5f3ff', boxShadow: '0 22px 55px rgba(0,0,0,.45)' }}>
            {isSignedIn && (
              <div style={{ padding: '7px 9px 11px', borderBottom: '1px solid #2c2c3e', marginBottom: '7px' }}>
                <div style={{ fontSize: '12px', color: '#9695a8' }}>Signed in as</div>
                <div style={{ marginTop: '3px', fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email || label}</div>
              </div>
            )}

            {isSignedIn && <button type="button" role="menuitem" onClick={() => { setOpen(false); clerk.openUserProfile(); }} style={menuButtonStyle}>👤 Manage account</button>}
            {isSignedIn && <button type="button" role="menuitem" onClick={() => { setOpen(false); setSupportOpen(true); setSupportStatus(''); }} style={menuButtonStyle}>💬 Support</button>}
            <button type="button" role="menuitem" onClick={signOutEverywhere} disabled={busy} style={{ ...menuButtonStyle, color: '#ffb4bf' }}>{busy ? 'Signing out…' : '↪ Sign out'}</button>
          </div>
        )}
      </div>

      {supportOpen && (
        <div role="dialog" aria-modal="true" aria-label="AI Songs support" style={{ position: 'fixed', inset: 0, zIndex: 11000, display: 'grid', placeItems: 'center', padding: '18px', background: 'rgba(0,0,0,.68)' }}>
          <form onSubmit={sendSupport} style={{ width: 'min(100%,420px)', display: 'grid', gap: '12px', padding: '20px', borderRadius: '20px', border: '1px solid #34344a', background: '#151522', color: '#fff', boxShadow: '0 24px 70px rgba(0,0,0,.5)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
              <div><div style={{ fontSize: '20px', fontWeight: 900 }}>Support</div><div style={{ marginTop: '3px', color: '#9999ad', fontSize: '12px' }}>Send a message to AI Songs support.</div></div>
              <button type="button" aria-label="Close support" onClick={() => setSupportOpen(false)} style={{ border: 0, background: 'transparent', color: '#aaa9bd', fontSize: '24px' }}>×</button>
            </div>
            <label style={labelStyle}>Subject<input value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} maxLength={120} required style={inputStyle} placeholder="What do you need help with?" /></label>
            <label style={labelStyle}>Message<textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} maxLength={2500} required style={{ ...inputStyle, minHeight: '130px', resize: 'vertical' }} placeholder="Describe the issue or request." /></label>
            {supportStatus && <div style={{ padding: '10px 12px', borderRadius: '12px', background: supportStatus === 'Support request sent.' ? '#17162b' : '#251219', color: supportStatus === 'Support request sent.' ? '#c4b5fd' : '#ffb5c0', fontSize: '12px' }}>{supportStatus}</div>}
            <button type="submit" disabled={busy || !supportSubject.trim() || !supportMessage.trim()} style={{ minHeight: '50px', border: 0, borderRadius: '14px', background: '#7c3aed', color: '#fff', fontWeight: 900 }}>{busy ? 'Sending…' : 'Send Support Request'}</button>
          </form>
        </div>
      )}
    </>
  );
}

const menuButtonStyle: React.CSSProperties = { width: '100%', border: 0, borderRadius: '11px', padding: '11px 10px', background: 'transparent', color: '#f5f3ff', textAlign: 'left', fontWeight: 700, fontSize: '13px' };
const labelStyle: React.CSSProperties = { display: 'grid', gap: '7px', color: '#d8d8e8', fontSize: '13px', fontWeight: 800 };
const inputStyle: React.CSSProperties = { width: '100%', minHeight: '48px', padding: '12px 13px', borderRadius: '13px', border: '1px solid #34344a', background: '#0d0d16', color: '#fff', outline: 'none', fontSize: '15px' };
