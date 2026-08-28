'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';

function passkeyErrorMessage(error: unknown) {
  const value = error as {
    name?: string;
    message?: string;
    errors?: Array<{ code?: string; message?: string; longMessage?: string }>;
  };

  const clerkError = value?.errors?.[0];
  const code = clerkError?.code || value?.name || '';
  const detail = clerkError?.longMessage || clerkError?.message || value?.message || '';

  if (code === 'NotAllowedError' || /cancel|timed? out|not allowed/i.test(detail)) {
    return 'Android did not complete the passkey prompt. Make sure screen lock/passkeys are enabled, then try once in Chrome if Brave cancels it.';
  }
  if (/domain|origin|relying party|rp id/i.test(`${code} ${detail}`)) {
    return 'This passkey was rejected for the current domain. We need to move Clerk to the final custom production domain before enrolling it.';
  }
  if (/not supported|unsupported|publickeycredential/i.test(`${code} ${detail}`)) {
    return 'This browser/device is not exposing WebAuthn passkeys. Try Chrome on this phone or enable your Android passkey provider.';
  }

  return detail ? `Passkey setup failed: ${detail}` : 'Passkey setup could not finish. Try again.';
}

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
      if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
        setStatus('This browser is not exposing WebAuthn passkeys. Try Chrome on this phone.');
        return;
      }
      await user.createPasskey();
      setStatus('Passkey ready. You can use fingerprint, face unlock, or device PIN next time.');
      setTimeout(() => setHidden(true), 1800);
    } catch (error) {
      console.error('Passkey setup failed', error);
      setStatus(passkeyErrorMessage(error));
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
          {status && <div style={{ marginTop: '9px', fontSize: '13px', lineHeight: 1.4, color: '#c4b5fd' }}>{status}</div>}
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
