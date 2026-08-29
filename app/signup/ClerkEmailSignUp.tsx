'use client';

import { useSignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import styles from '../login/login.module.css';

export default function ClerkEmailSignUp() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState('');

  const busy = fetchStatus === 'fetching';

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    const { error } = await signUp.password({
      emailAddress: email.trim(),
      password,
    });

    if (error) {
      setFormError('We could not create the account. Check the details and try again.');
      return;
    }

    await signUp.verifications.sendEmailCode();
    setVerifying(true);
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');

    const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
    if (error) {
      setFormError('That verification code did not work. Please try again.');
      return;
    }

    if (signUp.status !== 'complete') {
      setFormError('Your account is not fully verified yet. Please try again.');
      return;
    }

    await signUp.finalize({
      navigate: ({ session, decorateUrl }) => {
        if (session?.currentTask) {
          setFormError('Your account needs one more verification step before setup can finish.');
          return;
        }

        const url = decorateUrl('/');
        if (url.startsWith('http')) window.location.href = url;
        else router.push(url);
      },
    });
  }

  if (verifying) {
    return (
      <form className={styles.emailLogin} onSubmit={handleVerify}>
        <p className={styles.verifyNote}>We sent a verification code to {email}.</p>
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
          {busy ? 'Verifying…' : 'Verify & Create Account'}
        </button>
        <button
          className={styles.resendButton}
          type="button"
          disabled={busy}
          onClick={() => signUp.verifications.sendEmailCode()}
        >
          Send another code
        </button>
      </form>
    );
  }

  return (
    <form className={styles.emailLogin} onSubmit={handleCreate}>
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
      {errors.fields.emailAddress?.message ? <p className={styles.fieldError}>{errors.fields.emailAddress.message}</p> : null}

      <label className={styles.emailField}>
        <span>Create password</span>
        <div className={styles.passwordWrap}>
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
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

      <button className={styles.primaryAuthButton} type="submit" disabled={busy || !email.trim() || !password}>
        {busy ? 'Creating account…' : 'Create Account'}
      </button>
    </form>
  );
}
