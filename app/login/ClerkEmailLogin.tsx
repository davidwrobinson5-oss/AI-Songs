'use client';

import { useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import styles from './login.module.css';

export default function ClerkEmailLogin() {
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needsCode, setNeedsCode] = useState(false);
  const [formError, setFormError] = useState('');

  const busy = fetchStatus === 'fetching';

  async function finish() {
    if (signIn.status !== 'complete') return;

    await signIn.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setFormError('Your account needs one more verification step before sign-in can finish.');
          return;
        }

        const url = decorateUrl('/');
        if (url.startsWith('http')) window.location.href = url;
        else router.push(url);
      },
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    const { error } = await signIn.password({
      emailAddress: email.trim(),
      password,
    });

    if (error) {
      setFormError('We could not sign you in. Check your email and password and try again.');
      return;
    }

    if (signIn.status === 'complete') {
      await finish();
      return;
    }

    if (signIn.status === 'needs_client_trust') {
      const emailCodeFactor = signIn.supportedSecondFactors.find(
        (factor) => factor.strategy === 'email_code',
      );
      if (emailCodeFactor) {
        await signIn.mfa.sendEmailCode();
        setNeedsCode(true);
        return;
      }
    }

    if (signIn.status === 'needs_second_factor') {
      setFormError('Additional verification is required for this account.');
      return;
    }

    setFormError('Sign-in could not be completed. Please try again.');
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    const { error } = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (error) {
      setFormError('That verification code did not work. Please try again.');
      return;
    }

    if (signIn.status === 'complete') {
      await finish();
      return;
    }

    setFormError('Verification is not complete yet. Please try again.');
  }

  if (needsCode) {
    return (
      <form className={styles.emailLogin} onSubmit={handleVerify}>
        <p className={styles.verifyNote}>We sent a verification code to your email.</p>
        <label className={styles.emailField}>
          <span>Verification code</span>
          <input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        </label>
        {errors.fields.code?.message ? <p className={styles.fieldError}>{errors.fields.code.message}</p> : null}
        {formError ? <p className={styles.authError}>{formError}</p> : null}
        <button className={styles.primaryAuthButton} type="submit" disabled={busy || !code.trim()}>
          {busy ? 'Verifying…' : 'Verify & Sign In'}
        </button>
        <button
          className={styles.resendButton}
          type="button"
          disabled={busy}
          onClick={() => signIn.mfa.sendEmailCode()}
        >
          Send another code
        </button>
        <button
          className={styles.secondaryAction}
          type="button"
          disabled={busy}
          onClick={() => {
            signIn.reset();
            setNeedsCode(false);
            setCode('');
            setFormError('');
          }}
        >
          Start over
        </button>
      </form>
    );
  }

  return (
    <form className={styles.emailLogin} onSubmit={handleSubmit}>
      <label className={styles.emailField}>
        <span>Email address</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          autoCapitalize="none"
          required
        />
      </label>
      {errors.fields.identifier?.message ? <p className={styles.fieldError}>{errors.fields.identifier.message}</p> : null}

      <label className={styles.emailField}>
        <span>Password</span>
        <div className={styles.passwordWrap}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
          <button
            className={styles.togglePassword}
            type="button"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>
      </label>
      {errors.fields.password?.message ? <p className={styles.fieldError}>{errors.fields.password.message}</p> : null}
      {formError ? <p className={styles.authError}>{formError}</p> : null}

      <button
        className={styles.primaryAuthButton}
        type="submit"
        disabled={busy || !email.trim() || !password}
      >
        {busy ? 'Signing in…' : 'Sign In'}
      </button>
    </form>
  );
}
