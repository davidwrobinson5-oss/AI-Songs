'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';

function passkeyErrorMessage(error: unknown) {
  const value = error as { name?: string; message?: string; errors?: Array<{ code?: string; message?: string; longMessage?: string }> };
  const clerkError = value?.errors?.[0];
  const code = clerkError?.code || value?.name || '';
  const detail = clerkError?.longMessage || clerkError?.message || value?.message || '';
  if (code === 'NotAllowedError' || /cancel|timed? out|not allowed/i.test(detail)) return 'Android did not complete the passkey prompt. Make sure screen lock/passkeys are enabled, then try once in Chrome if Brave cancels it.';
  if (/domain|origin|relying party|rp id/i.test(`${code} ${detail}`)) return 'This passkey was rejected for the current domain. We need to move Clerk to the final custom production domain before enrolling it.';
  if (/not supported|unsupported|publickeycredential/i.test(`${code} ${detail}`)) return 'This browser/device is not exposing WebAuthn passkeys. Try Chrome on this phone or enable your Android passkey provider.';
  return detail ? `Passkey setup failed: ${detail}` : 'Passkey setup could not finish. Try again.';
}

export default function PasskeySetupBanner() {
  const { isLoaded, isSignedIn, user } = useUser();
  const [busy, setBusy] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [complete, setComplete] = useState(false);
  const [status, setStatus] = useState('');

  if (!isLoaded || !isSignedIn || !user || skipped) return null;

  const hasPasskey = complete || (user.passkeys?.length ?? 0) > 0;

  async function createPasskey() {
    setBusy(true);
    setStatus('');
    try {
      if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
        setStatus('This browser is not exposing WebAuthn passkeys. You can skip this step and add one later from Manage account.');
        return;
      }
      await user.createPasskey();
      setComplete(true);
      setStatus('Passkey ready. You can use fingerprint, face unlock, or your device PIN the next time you sign in.');
    } catch (error) {
      setStatus(passkeyErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ padding: 14, borderRadius: 16, background: hasPasskey ? '#111a16' : '#151225', border: hasPasskey ? '1px solid #2d5441' : '1px solid rgba(167,139,250,.38)', color: '#f5f3ff' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 24 }}>{hasPasskey ? '✓' : '👆'}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 850, fontSize: 16 }}>{hasPasskey ? 'Passkey ready' : 'Optional: set up fingerprint / passkey'}</div>
          <div style={{ marginTop: 4, color: '#b9b8ca', fontSize: 13, lineHeight: 1.45 }}>
            {hasPasskey
              ? 'This device can now use your fingerprint, face unlock, or device PIN for faster Pie sign-in.'
              : 'Set this up once while creating your account. You can skip it and add a passkey later from Manage account.'}
          </div>
          {!hasPasskey && (
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 8, marginTop: 12 }}>
              <button type="button" onClick={createPasskey} disabled={busy} style={{ minHeight: 46, border: 0, borderRadius: 13, background: '#7c3aed', color: '#fff', fontWeight: 850, fontSize: 15 }}>
                {busy ? 'Setting up…' : 'Set Up Passkey'}
              </button>
              <button type="button" onClick={() => setSkipped(true)} disabled={busy} style={{ minHeight: 46, borderRadius: 13, border: '1px solid #3a3b49', background: '#11131a', color: '#d6d6df', fontWeight: 750, padding: '0 14px' }}>
                Not now
              </button>
            </div>
          )}
          {status && <div style={{ marginTop: 9, fontSize: 13, lineHeight: 1.4, color: hasPasskey ? '#a7f3c3' : '#c4b5fd' }}>{status}</div>}
        </div>
      </div>
    </section>
  );
}
