'use client';

import { useEffect, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import LiveSupportCenter from './LiveSupportCenter';

export default function AccountControl() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
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
            {isSignedIn && <button type="button" role="menuitem" onClick={() => { setOpen(false); setSupportOpen(true); }} style={menuButtonStyle}>🛟 Live Support</button>}
            <button type="button" role="menuitem" onClick={signOutEverywhere} disabled={busy} style={{ ...menuButtonStyle, color: '#ffb4bf' }}>{busy ? 'Signing out…' : '↪ Sign out'}</button>
          </div>
        )}
      </div>

      {supportOpen && <LiveSupportCenter onClose={() => setSupportOpen(false)} />}
    </>
  );
}

const menuButtonStyle: React.CSSProperties = { width: '100%', border: 0, borderRadius: '11px', padding: '11px 10px', background: 'transparent', color: '#f5f3ff', textAlign: 'left', fontWeight: 700, fontSize: '13px' };
