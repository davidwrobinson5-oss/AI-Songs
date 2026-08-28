'use client';

import { FormEvent, useState } from 'react';
import { useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import styles from './login.module.css';

type Method = 'passkey' | 'phone' | 'email' | null;
type Phase = 'choose' | 'identifier' | 'code';

function normalizeUsPhone(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/\D/g, '')}`;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return trimmed;
}

function errorText(error: unknown) {
  const value = error as {
    message?: string;
    errors?: Array<{ message?: string; longMessage?: string }>;
  };
  return value?.errors?.[0]?.longMessage || value?.errors?.[0]?.message || value?.message || 'Could not complete sign-in.';
}

export default function ClerkChoiceLogin() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const [method, setMethod] = useState<Method>(null);
  const [phase, setPhase] = useState<Phase>('choose');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');

  const busy = fetchStatus === 'fetching';

  async function finish() {
    if (signIn.status !== 'complete') {
      setMessage('Sign-in needs another security step.');
      return;
    }

    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setMessage('Your account needs one more security step before sign-in can finish.');
          return;
        }
        const url = decorateUrl('/');
        if (url.startsWith('http')) window.location.href = url;
        else router.push(url);
      },
    });
  }

  async function choosePasskey() {
    setMessage('');
    setMethod('passkey');
    try {
      await signIn.passkey({ flow: 'discoverable' });
      await finish();
    } catch (error) {
      const text = errorText(error);
      setMessage(/cancel|timed? out|not allowed/i.test(text)
        ? 'Passkey prompt was cancelled or timed out. Try again.'
        : text);
    }
  }

  function choose(methodName: 'phone' | 'email') {
    signIn.reset();
    setMethod(methodName);
    setPhase('identifier');
    setIdentifier('');
    setCode('');
    setMessage('');
  }

  async function sendCode(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      const value = method === 'phone' ? normalizeUsPhone(identifier) : identifier.trim().toLowerCase();
      const { error } = await signIn.create({ identifier: value });
      if (error) {
        setMessage(errorText(error));
        return;
      }

      if (method === 'phone') {
        await signIn.phoneCode.sendCode({ phoneNumber: value });
        setMessage(`Code sent to ${value}.`);
      } else if (method === 'email') {
        await signIn.emailCode.sendCode({ emailAddress: value });
        setMessage(`Code sent to ${value}.`);
      }
      setIdentifier(value);
      setPhase('code');
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      if (method === 'phone') await signIn.phoneCode.verifyCode({ code: code.trim() });
      if (method === 'email') await signIn.emailCode.verifyCode({ code: code.trim() });
      await finish();
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  async function resend() {
    setMessage('');
    try {
      if (method === 'phone') await signIn.phoneCode.sendCode();
      if (method === 'email') await signIn.emailCode.sendCode();
      setMessage('A new code was sent.');
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  function back() {
    signIn.reset();
    setMethod(null);
    setPhase('choose');
    setIdentifier('');
    setCode('');
    setMessage('');
  }

  if (phase === 'choose') {
    return (
      <div className={styles.methodList}>
        <button type="button" className={styles.methodButton} onClick={choosePasskey} disabled={busy}>
          <span className={styles.methodIcon}>👆</span>
          <span><strong>Passkey</strong><small>Fingerprint, face unlock, or device PIN</small></span>
          <span className={styles.chevron}>›</span>
        </button>
        <button type="button" className={styles.methodButton} onClick={() => choose('phone')} disabled={busy}>
          <span className={styles.methodIcon}>📱</span>
          <span><strong>Text Code</strong><small>Send a one-time code to your phone</small></span>
          <span className={styles.chevron}>›</span>
        </button>
        <button type="button" className={styles.methodButton} onClick={() => choose('email')} disabled={busy}>
          <span className={styles.methodIcon}>✉️</span>
          <span><strong>Email Code</strong><small>Send a one-time code to your email</small></span>
          <span className={styles.chevron}>›</span>
        </button>
        {message && <div className={styles.authError}>{message}</div>}
      </div>
    );
  }

  if (phase === 'identifier') {
    const isPhone = method === 'phone';
    return (
      <form className={styles.customAuthForm} onSubmit={sendCode}>
        <button type="button" className={styles.backButton} onClick={back}>← Back</button>
        <div className={styles.methodHeading}>{isPhone ? '📱 Text Code' : '✉️ Email Code'}</div>
        <label htmlFor="identifier">{isPhone ? 'Phone number' : 'Email address'}</label>
        <input
          id="identifier"
          type={isPhone ? 'tel' : 'email'}
          inputMode={isPhone ? 'tel' : 'email'}
          autoComplete={isPhone ? 'tel' : 'email'}
          placeholder={isPhone ? '+1 555 123 4567' : 'you@example.com'}
          value={identifier}
          onChange={(event) => setIdentifier(event.target.value)}
          required
        />
        {(message || errors.fields.identifier?.message) && (
          <div className={styles.authError}>{message || errors.fields.identifier?.message}</div>
        )}
        <button className={styles.primaryAuthButton} type="submit" disabled={busy || !identifier.trim()}>
          {busy ? 'Sending…' : isPhone ? 'Send Text Code' : 'Send Email Code'}
        </button>
      </form>
    );
  }

  return (
    <form className={styles.customAuthForm} onSubmit={verifyCode}>
      <button type="button" className={styles.backButton} onClick={back}>← Start over</button>
      <div className={styles.methodHeading}>{method === 'phone' ? '📱 Check your texts' : '✉️ Check your email'}</div>
      <p className={styles.codeSent}>Enter the 6-digit code sent to <strong>{identifier}</strong>.</p>
      <label htmlFor="code">Verification code</label>
      <input
        id="code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={8}
        placeholder="000000"
        value={code}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
        required
      />
      {(message || errors.fields.code?.message) && (
        <div className={message.startsWith('Code sent') || message.startsWith('A new') ? styles.authInfo : styles.authError}>
          {message || errors.fields.code?.message}
        </div>
      )}
      <button className={styles.primaryAuthButton} type="submit" disabled={busy || code.length < 4}>
        {busy ? 'Verifying…' : 'Verify & Sign In'}
      </button>
      <button type="button" className={styles.resendButton} onClick={resend} disabled={busy}>Send a new code</button>
    </form>
  );
}
