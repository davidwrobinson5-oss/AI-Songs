'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';

export default function PasskeySetupBanner() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [status, setStatus] = useState('');

  if (!isLoaded || !isSignedIn || !user || hidden || (user.passkeys?.length ?? 0) > 0) return null;

  async function createPasskey() {
    setBusy(true);
    setStatus('');
    try {
      await user.createPasskey();
      setStatus('Passkey ready. You can use fingerprint, face unlock, or device PIN next time.');
      setTimeout(() => setHidden(true), 1800);
    } catch (error) {
      console.error('Passkey setup failed', error);
      setStatus('Passkey setup was cancelled or could not finish. Try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: '84px',
        zIndex: 9999,
        maxWidth: '520px',
        margin: '0 auto',
        padding: '16px',
        borderRadius: '18px',
        border: '1px solid rgba(167,139,250,.35)',
        background: 'rgba(18,18,30,.98)',
        boxShadow: '0 18px 55px rgba(0,0,0,.4)',
        color: '#f5f3ff',
      }}
    >
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '24px' }}>👆</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: '16px' }}>Set up fingerprint / passkey</div>
          <div style={{ marginTop: '4px', color: '#b9b8ca', fontSize: '13px', lineHeight: 1.45 }}>
            Register this phone once. After that, AI Songs can sign you in with your fingerprint, face unlock, or device PIN.
          </div>
          <button
            type="button"
            onClick={createPasskey}
            disabled={busy}
            style={{
              width: '100%',
              marginTop: '12px',
              minHeight: '46px',
              border: 0,
              borderRadius: '13px',
              background: '#7c3aed',
              color: '#fff',
              fontWeight: 800,
              fontSize: '15px',
            }}
          >
            {busy ? 'Setting up…' : 'Set Up Passkey'}
          </button>
          {status && <div style={{ marginTop: '9px', fontSize: '13px', color: '#c4b5fd' }}>{status}</div>}
        </div>
        <button
          type="button"
          aria-label="Dismiss passkey setup"
          onClick={() => setHidden(true)}
          style={{ border: 0, background: 'transparent', color: '#9998ad', fontSize: '22px', padding: 0 }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
