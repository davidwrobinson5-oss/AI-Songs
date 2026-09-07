'use client';

import { useSignUp } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import { DEFAULT_PLAN_ID, PIE_PLANS, TRIAL_DAYS, planById } from '../billingConfig';
import styles from '../login/login.module.css';

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    if ('message' in error) {
      const message = String((error as { message?: unknown }).message || '').trim();
      if (message) return message;
    }
    if ('errors' in error) {
      const first = (error as { errors?: Array<{ longMessage?: string; message?: string }> }).errors?.[0];
      const message = String(first?.longMessage || first?.message || '').trim();
      if (message) return message;
    }
  }
  return fallback;
}

export default function ClerkEmailSignUp() {
  const { signUp, errors, fetchStatus } = useSignUp();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(DEFAULT_PLAN_ID);
  const [code, setCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [formError, setFormError] = useState('');
  const [status, setStatus] = useState('');

  const busy = fetchStatus === 'fetching';
  const plan = useMemo(() => planById(selectedPlan), [selectedPlan]);

  function stashOnboarding(nextName = name, nextPhone = phone) {
    try {
      sessionStorage.setItem('pieSignupName', nextName.trim());
      sessionStorage.setItem('pieSignupPhone', nextPhone.trim());
      sessionStorage.setItem('pieSignupPlan', selectedPlan);
    } catch {}
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    const form = new FormData(event.currentTarget);
    const submittedName = String(form.get('name') || '').trim();
    const submittedPhone = String(form.get('phone') || '').trim();
    const submittedEmail = String(form.get('email') || '').trim();
    const submittedPassword = String(form.get('password') || '');

    setName(submittedName);
    setPhone(submittedPhone);
    setEmail(submittedEmail);
    setPassword(submittedPassword);
    setFormError('');
    setStatus('Starting your Pie account…');

    if (!submittedName || !submittedPhone || !submittedEmail || !submittedPassword) {
      setStatus('');
      setFormError('Please complete your name, phone, email, and password.');
      return;
    }

    stashOnboarding(submittedName, submittedPhone);

    try {
      const { error } = await signUp.password({ emailAddress: submittedEmail, password: submittedPassword });
      if (error) {
        setStatus('');
        setFormError(errorMessage(error, 'We could not create the account. Check the details and try again.'));
        return;
      }

      setStatus('Sending your verification code…');
      const verification = await signUp.verifications.sendEmailCode();
      if (verification.error) {
        setStatus('');
        setFormError(errorMessage(verification.error, 'We could not send the verification email. Please try again.'));
        return;
      }

      setStatus('');
      setVerifying(true);
    } catch (error) {
      console.error('Pie signup failed', error);
      setStatus('');
      setFormError(errorMessage(error, 'Signup could not start on this browser. Please try again.'));
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setFormError('');
    setStatus('Verifying your email…');

    try {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) {
        setStatus('');
        setFormError(errorMessage(error, 'That verification code did not work. Please try again.'));
        return;
      }

      if (signUp.status !== 'complete') {
        setStatus('');
        setFormError('Your account is not fully verified yet. Please try again.');
        return;
      }

      stashOnboarding();
      setStatus('Finishing your Pie account…');
      await signUp.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            setStatus('');
            setFormError('Your account needs one more verification step before setup can finish.');
            return;
          }
          const url = decorateUrl('/onboarding');
          if (url.startsWith('http')) window.location.href = url;
          else router.push(url);
        },
      });
    } catch (error) {
      console.error('Pie email verification failed', error);
      setStatus('');
      setFormError(errorMessage(error, 'Email verification could not finish. Please try again.'));
    }
  }

  if (verifying) {
    return (
      <form className={styles.emailLogin} onSubmit={handleVerify}>
        <p className={styles.verifyNote}>We sent a verification code to {email}.</p>
        <label className={styles.emailField}>
          <span>Verification code</span>
          <input name="code" value={code} onChange={(event) => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" required />
        </label>
        {errors.fields.code?.message ? <p className={styles.fieldError}>{errors.fields.code.message}</p> : null}
        {status ? <p className={styles.verifyNote}>{status}</p> : null}
        {formError ? <p className={styles.authError}>{formError}</p> : null}
        <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify & Continue'}</button>
        <button className={styles.resendButton} type="button" disabled={busy} onClick={() => signUp.verifications.sendEmailCode()}>Send another code</button>
      </form>
    );
  }

  return (
    <form className={styles.emailLogin} onSubmit={handleCreate}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
        <label className={styles.emailField}><span>Full name</span><input name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" required /></label>
        <label className={styles.emailField}><span>Phone number</span><input name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="(555) 555-5555" required /></label>
      </div>

      <label className={styles.emailField}><span>Email address</span><input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" required /></label>
      {errors.fields.emailAddress?.message ? <p className={styles.fieldError}>{errors.fields.emailAddress.message}</p> : null}

      <label className={styles.emailField}>
        <span>Create password</span>
        <div className={styles.passwordWrap}>
          <input name="password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" required />
          <button className={styles.togglePassword} type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)}>{showPassword ? 'Hide' : 'Show'}</button>
        </div>
      </label>
      {errors.fields.password?.message ? <p className={styles.fieldError}>{errors.fields.password.message}</p> : null}

      <div style={{ display: 'grid', gap: 9, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 850, color: '#d8d9e5' }}>Choose the plan you want after your {TRIAL_DAYS}-day free trial</div>
        {PIE_PLANS.map((item) => {
          const active = item.id === selectedPlan;
          return (
            <button key={item.id} type="button" onClick={() => setSelectedPlan(item.id)} style={{ width: '100%', border: `1px solid ${active ? '#8b5cf6' : '#353746'}`, borderRadius: 14, background: active ? '#19142b' : '#0c0e14', color: '#fff', padding: 12, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{item.name}</strong><strong>${item.monthlyPrice}/mo</strong></div>
              <div style={{ marginTop: 4, color: '#9fa1ae', fontSize: 11 }}>{item.outcome}</div>
            </button>
          );
        })}
      </div>

      <div style={{ padding: 12, borderRadius: 13, background: '#11131a', border: '1px solid #2c2f38', color: '#b7b8c4', fontSize: 12, lineHeight: 1.45 }}>
        <strong style={{ color:'#fff' }}>{TRIAL_DAYS}-day free trial</strong> of {plan.name}, then ${plan.monthlyPrice}/month unless canceled. Trial usage is capped to control generation costs. Stripe remains in sandbox during this test.
      </div>

      {status ? <p className={styles.verifyNote}>{status}</p> : null}
      {formError ? <p className={styles.authError}>{formError}</p> : null}
      <div id="clerk-captcha" />
      <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Creating your Pie account…' : `Start ${TRIAL_DAYS}-Day Free Trial`}</button>
    </form>
  );
}
