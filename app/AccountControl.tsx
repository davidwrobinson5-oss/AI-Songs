'use client';

import { useEffect, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

export default function AccountControl() {
  const pathname = usePathname();
  const { isLoaded, isSignedIn, user } = useUser();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (pathname.startsWith('/login') || !isLoaded) return null;

  const label = isSignedIn
    ? user?.firstName || user?.primaryEmailAddress?.emailAddress?.split('@')[0] || 'Account'
    : 'Studio';

  async function signOutEverywhere() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
      if (isSignedIn) {
        await clerk.signOut({ redirectUrl: '/login' });
      } else {
        window.location.href = '/login';
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'fixed',
        top: 'max(12px, env(safe-area-inset-top))',
        right: '14px',
        zIndex: 10000,
      }}
    >
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          minHeight: '40px',
          padding: '7px 11px 7px 8px',
          borderRadius: '999px',
          border: '1px solid rgba(167,139,250,.28)',
          background: 'rgba(18,18,30,.92)',
          color: '#f5f3ff',
          boxShadow: '0 10px 28px rgba(0,0,0,.28)',
          backdropFilter: 'blur(12px)',
          fontWeight: 750,
          fontSize: '13px',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: '27px',
            height: '27px',
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            background: '#7c3aed',
            fontSize: '14px',
          }}
        >
          {isSignedIn ? (user?.firstName?.[0] || user?.primaryEmailAddress?.emailAddress?.[0] || '👤').toUpperCase() : '🔐'}
        </span>
        <span style={{ maxWidth: '92px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span aria-hidden="true" style={{ opacity: .7, fontSize: '10px' }}>▼</span>
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: '48px',
            right: 0,
            width: '220px',
            padding: '10px',
            borderRadius: '16px',
            border: '1px solid rgba(167,139,250,.25)',
            background: '#151522',
            color: '#f5f3ff',
            boxShadow: '0 22px 55px rgba(0,0,0,.45)',
          }}
        >
          {isSignedIn && (
            <div style={{ padding: '7px 9px 11px', borderBottom: '1px solid #2c2c3e', marginBottom: '7px' }}>
              <div style={{ fontSize: '12px', color: '#9695a8' }}>Signed in as</div>
              <div style={{ marginTop: '3px', fontSize: '13px', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.primaryEmailAddress?.emailAddress || label}
              </div>
            </div>
          )}

          {isSignedIn && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                clerk.openUserProfile();
              }}
              style={menuButtonStyle}
            >
              👤 Manage account
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={signOutEverywhere}
            disabled={busy}
            style={{ ...menuButtonStyle, color: '#ffb4bf' }}
          >
            {busy ? 'Signing out…' : '↪ Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}

const menuButtonStyle: React.CSSProperties = {
  width: '100%',
  border: 0,
  borderRadius: '11px',
  padding: '11px 10px',
  background: 'transparent',
  color: '#f5f3ff',
  textAlign: 'left',
  fontWeight: 700,
  fontSize: '13px',
};
