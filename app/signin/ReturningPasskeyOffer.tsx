'use client';

import { useUser } from '@clerk/nextjs';
import { useEffect, useState } from 'react';
import styles from '../login/login.module.css';

function passkeyErrorMessage(error: unknown) {
  if (error && typeof error === 'object') {
    const value = error as {
      errors?: Array<{ longMessage?: string; message?: string }>;
      longMessage?: string;
      message?: string;
      name?: string;
    };
    return value.errors?.[0]?.longMessage || value.errors?.[0]?.message || value.longMessage || value.message || 'Passkey setup could not finish.';
  }
  return 'Passkey setup could not finish.';
}

export default function ReturningPasskeyOffer() {
  const { user, isLoaded, isSignedIn } = useUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      window.location.replace('/signin');
      return;
    }
    if ((user.passkeys?.length ?? 0) > 0) {
      window.location.replace('/');
    }
  }, [isLoaded, isSignedIn, user]);

  async function createPasskey() {
    if (!user || busy) return;
    setBusy(true);
    setError('');
    try {
      if (typeof window === 'undefined' || !('PublicKeyCredential' in window)) {
        throw new Error('This device or browser does not support passkeys. You can continue to Pie without one.');
      }
      await user.createPasskey();
      await user.reload();
      window.location.replace('/');
    } catch (setupError) {
      setError(passkeyErrorMessage(setupError));
      setBusy(false);
    }
  }

  if (!isLoaded || !isSignedIn || !user || (user.passkeys?.length ?? 0) > 0) {
    return (
      <div className={styles.emailLogin} style={{ textAlign: 'center' }}>
        <div className={styles.methodHeading}>Opening Pie…</div>
      </div>
    );
  }

  return (
    <div className={styles.emailLogin}>
      <div className={styles.methodHeading}>Make your next sign-in faster</div>
      <p className={styles.verifyNote}>
        Set up a passkey on this device so next time you can open Pie with your fingerprint, face unlock, or device PIN instead of typing your password.
      </p>
      {error ? <div className={styles.authError}>{error}</div> : null}
      <button className={styles.primaryAuthButton} type="button" onClick={createPasskey} disabled={busy}>
        {busy ? 'Setting up passkey…' : 'Set Up Passkey'}
      </button>
      <button className={styles.googleAuthButton} type="button" onClick={() => window.location.replace('/')} disabled={busy}>
        Not Now — Open Pie
      </button>
      <p className={styles.verifyNote} style={{ textAlign: 'center', marginBottom: 0 }}>
        This is optional. You can always sign in with your email and password or your verified phone number.
      </p>
    </div>
  );
}
