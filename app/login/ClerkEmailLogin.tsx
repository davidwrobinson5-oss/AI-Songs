'use client';

import { useSignIn } from '@clerk/nextjs';
import { FormEvent, useState } from 'react';
import styles from './login.module.css';

type SignInMode = 'password' | 'phone' | 'phone-code';

function normalizePhone(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const value = error as {
      errors?: Array<{ longMessage?: string; message?: string }>;
      longMessage?: string;
      message?: string;
    };
    return value.errors?.[0]?.longMessage || value.errors?.[0]?.message || value.longMessage || value.message || fallback;
  }
  return fallback;
}

export default function ClerkEmailLogin() {
  const { signIn, fetchStatus } = useSignIn();
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const busy = fetchStatus === 'fetching';

  async function finalizeIfComplete() {
    if (signIn.status !== 'complete') {
      setError('Pie needs an additional verification step before sign-in can finish.');
      return false;
    }

    await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl('/onboarding');
        if (url.startsWith('http')) window.location.href = url;
        else window.location.replace(url);
      },
    });
    return true;
  }

  async function resetTo(nextMode: SignInMode) {
    setError('');
    setInfo('');
    setCode('');
    await signIn.reset();
    setMode(nextMode);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setInfo('');
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || !password) {
      setError('Enter your email address and password.');
      return;
    }

    const result = await signIn.password({ emailAddress: nextEmail, password });
    if (result.error) {
      setError(errorMessage(result.error, 'Pie could not sign you in with that email and password.'));
      return;
    }
    await finalizeIfComplete();
  }

  async function usePasskey() {
    setError('');
    setInfo('');
    await signIn.reset();
    const result = await signIn.passkey({ flow: 'discoverable' });
    if (result.error) {
      setError(errorMessage(result.error, 'No usable Pie passkey was found on this device. You can use email/password or your verified phone number instead.'));
      return;
    }
    await finalizeIfComplete();
  }

  async function sendPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setInfo('');
    const nextPhone = normalizePhone(phone);
    if (!/^\+\d{8,15}$/.test(nextPhone)) {
      setError('Enter the verified phone number on your Pie account.');
      return;
    }

    setPhone(nextPhone);
    const result = await signIn.phoneCode.sendCode({ phoneNumber: nextPhone, channel: 'sms' });
    if (result.error) {
      setError(errorMessage(result.error, 'Pie could not send a code to that phone number. Make sure it is the verified number on your account.'));
      return;
    }
    setMode('phone-code');
    setInfo(`We sent a one-time sign-in code to ${nextPhone}.`);
  }

  async function verifyPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const nextCode = code.trim();
    if (!nextCode) {
      setError('Enter the code Pie sent to your phone.');
      return;
    }

    const result = await signIn.phoneCode.verifyCode({ code: nextCode });
    if (result.error) {
      setError(errorMessage(result.error, 'That code could not be verified. Try again or request a new code.'));
      return;
    }
    await finalizeIfComplete();
  }

  if (mode === 'phone') {
    return (
      <div className={styles.emailLogin}>
        <button className={styles.backButton} type="button" onClick={() => resetTo('password')} disabled={busy}>← Back to email sign-in</button>
        <div className={styles.methodHeading}>Sign in with your phone</div>
        <p className={styles.verifyNote}>Use the verified phone number on your Pie account. We’ll text you a one-time code.</p>
        <form className={styles.emailLogin} onSubmit={sendPhoneCode}>
          <label className={styles.emailField}>
            <span>Phone number</span>
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="(555) 555-5555" required />
          </label>
          {error ? <div className={styles.authError}>{error}</div> : null}
          <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Sending code…' : 'Text Me a Sign-In Code'}</button>
        </form>
      </div>
    );
  }

  if (mode === 'phone-code') {
    return (
      <div className={styles.emailLogin}>
        <button className={styles.backButton} type="button" onClick={() => resetTo('phone')} disabled={busy}>← Change phone number</button>
        <div className={styles.methodHeading}>Enter your Pie code</div>
        {info ? <div className={styles.authInfo}>{info}</div> : null}
        <form className={styles.emailLogin} onSubmit={verifyPhoneCode}>
          <label className={styles.emailField}>
            <span>One-time code</span>
            <input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" inputMode="numeric" placeholder="123456" required />
          </label>
          {error ? <div className={styles.authError}>{error}</div> : null}
          <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify & Sign In'}</button>
          <button className={styles.resendButton} type="button" onClick={() => resetTo('phone')} disabled={busy}>Send a new code</button>
        </form>
      </div>
    );
  }

  return (
    <div className={styles.emailLogin}>
      <form className={styles.emailLogin} onSubmit={submitPassword}>
        <label className={styles.emailField}>
          <span>Email address</span>
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" inputMode="email" placeholder="you@example.com" required />
        </label>
        <label className={styles.emailField}>
          <span>Password</span>
          <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" required />
        </label>
        {error ? <div className={styles.authError}>{error}</div> : null}
        <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button>
      </form>

      <div className={styles.authDivider}><span>or</span></div>

      <button className={styles.googleAuthButton} type="button" onClick={usePasskey} disabled={busy}>Use a Passkey</button>
      <button className={styles.googleAuthButton} type="button" onClick={() => resetTo('phone')} disabled={busy}>Sign In with Phone Code</button>
      <p className={styles.verifyNote} style={{ textAlign: 'center', marginBottom: 0 }}>Forgot your password or can’t access your email? Use your verified phone number to get back into Pie.</p>
    </div>
  );
}
