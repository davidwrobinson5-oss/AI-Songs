'use client';

import { useSignUp } from '@clerk/nextjs';
import { FormEvent, useMemo, useState } from 'react';
import { DEFAULT_PLAN_ID, PIE_PLANS, TRIAL_DAYS, planById } from '../billingConfig';
import styles from '../login/login.module.css';

type SignupStep = 'details' | 'email-code' | 'phone-code' | 'handoff';

function normalizePhone(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function clerkErrorMessage(error: unknown, fallback: string) {
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

export default function ClerkSecureSignUp() {
  const { signUp, fetchStatus } = useSignUp();
  const [step, setStep] = useState<SignupStep>('details');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(DEFAULT_PLAN_ID);
  const [emailCode, setEmailCode] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const plan = useMemo(() => planById(selectedPlan), [selectedPlan]);
  const busy = fetchStatus === 'fetching' || step === 'handoff';

  function saveSignupDetails(nextName: string, nextPhone: string, nextEmail: string) {
    try {
      sessionStorage.setItem('pieSignupName', nextName);
      sessionStorage.setItem('pieSignupPhone', nextPhone);
      sessionStorage.setItem('pieSignupEmail', nextEmail);
      sessionStorage.setItem('pieSignupPlan', selectedPlan);
    } catch {}
  }

  async function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setInfo('');

    const nextName = name.trim();
    const nextPhone = normalizePhone(phone);
    const nextEmail = email.trim().toLowerCase();
    if (!nextName || !nextPhone || !nextEmail || !password) {
      setError('Enter your name, phone number, email address, and password.');
      return;
    }
    if (!/^\+\d{8,15}$/.test(nextPhone)) {
      setError('Enter a valid phone number including country code if outside the U.S.');
      return;
    }

    const pieces = nextName.split(/\s+/).filter(Boolean);
    const firstName = pieces[0] || undefined;
    const lastName = pieces.slice(1).join(' ') || undefined;

    try {
      saveSignupDetails(nextName, nextPhone, nextEmail);
      setPhone(nextPhone);
      setEmail(nextEmail);

      const result = await signUp.password({
        emailAddress: nextEmail,
        password,
        phoneNumber: nextPhone,
        firstName,
        lastName,
      });
      if (result.error) throw result.error;

      const sendResult = await signUp.verifications.sendEmailCode();
      if (sendResult.error) throw sendResult.error;

      setPassword('');
      setInfo(`We sent a verification code to ${nextEmail}.`);
      setStep('email-code');
    } catch (signupError) {
      setError(clerkErrorMessage(signupError, 'Pie could not start secure signup. Please try again.'));
    }
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const code = emailCode.trim();
    if (!code) {
      setError('Enter the email verification code.');
      return;
    }

    try {
      const result = await signUp.verifications.verifyEmailCode({ code });
      if (result.error) throw result.error;

      const sendPhoneResult = await signUp.verifications.sendPhoneCode({ channel: 'sms' });
      if (sendPhoneResult.error) throw sendPhoneResult.error;

      setEmailCode('');
      setInfo(`Email verified. We sent an SMS code to ${phone}.`);
      setStep('phone-code');
    } catch (verifyError) {
      setError(clerkErrorMessage(verifyError, 'That email code could not be verified.'));
    }
  }

  async function verifyPhone(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const code = phoneCode.trim();
    if (!code) {
      setError('Enter the SMS verification code.');
      return;
    }

    try {
      const result = await signUp.verifications.verifyPhoneCode({ code });
      if (result.error) throw result.error;
      if (signUp.status !== 'complete') {
        const missing = Array.isArray(signUp.missingFields) ? signUp.missingFields.join(', ') : '';
        throw new Error(missing ? `Pie signup still requires: ${missing}.` : 'Pie signup is still waiting for a required verification step.');
      }

      setPhoneCode('');
      setInfo('Email and phone verified. Opening secure card verification…');
      setStep('handoff');

      await signUp.finalize({
        navigate: ({ session, decorateUrl }) => {
          if (session?.currentTask) {
            setStep('phone-code');
            setError('Pie account verification completed, but Clerk returned an unexpected additional setup task. Passkey setup is not required here.');
            return;
          }
          const url = decorateUrl('/checkout/start');
          if (url.startsWith('http')) window.location.href = url;
          else window.location.replace(url);
        },
      });
    } catch (verifyError) {
      setStep('phone-code');
      setError(clerkErrorMessage(verifyError, 'That phone code could not be verified.'));
    }
  }

  async function resendEmailCode() {
    setError('');
    try {
      const result = await signUp.verifications.sendEmailCode();
      if (result.error) throw result.error;
      setInfo(`A new verification code was sent to ${email}.`);
    } catch (resendError) {
      setError(clerkErrorMessage(resendError, 'Pie could not resend the email code.'));
    }
  }

  async function resendPhoneCode() {
    setError('');
    try {
      const result = await signUp.verifications.sendPhoneCode({ channel: 'sms' });
      if (result.error) throw result.error;
      setInfo(`A new SMS code was sent to ${phone}.`);
    } catch (resendError) {
      setError(clerkErrorMessage(resendError, 'Pie could not resend the SMS code.'));
    }
  }

  if (step === 'handoff') {
    return (
      <div className={styles.emailLogin} style={{ textAlign: 'center' }}>
        <div className={styles.methodHeading}>Opening secure card verification…</div>
        <p className={styles.verifyNote}>{info || 'Your email and phone are verified. Pie is taking you directly to Stripe.'}</p>
      </div>
    );
  }

  if (step === 'email-code') {
    return (
      <div className={styles.emailLogin}>
        <div className={styles.methodHeading}>Verify your email</div>
        {info ? <div className={styles.authInfo}>{info}</div> : null}
        <form className={styles.emailLogin} onSubmit={verifyEmail}>
          <label className={styles.emailField}>
            <span>Email verification code</span>
            <input value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" inputMode="numeric" placeholder="123456" required />
          </label>
          {error ? <div className={styles.authError}>{error}</div> : null}
          <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify Email'}</button>
          <button className={styles.resendButton} type="button" onClick={resendEmailCode} disabled={busy}>Send a new code</button>
        </form>
      </div>
    );
  }

  if (step === 'phone-code') {
    return (
      <div className={styles.emailLogin}>
        <div className={styles.methodHeading}>Verify your phone</div>
        {info ? <div className={styles.authInfo}>{info}</div> : null}
        <form className={styles.emailLogin} onSubmit={verifyPhone}>
          <label className={styles.emailField}>
            <span>SMS verification code</span>
            <input value={phoneCode} onChange={(event) => setPhoneCode(event.target.value.replace(/\D/g, ''))} autoComplete="one-time-code" inputMode="numeric" placeholder="123456" required />
          </label>
          {error ? <div className={styles.authError}>{error}</div> : null}
          <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Verifying…' : 'Verify Phone & Continue'}</button>
          <button className={styles.resendButton} type="button" onClick={resendPhoneCode} disabled={busy}>Send a new code</button>
        </form>
      </div>
    );
  }

  return (
    <form className={styles.emailLogin} onSubmit={submitDetails}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 10 }}>
        <label className={styles.emailField}>
          <span>Full name</span>
          <input name="name" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" required />
        </label>
        <label className={styles.emailField}>
          <span>Phone number</span>
          <input name="phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" placeholder="(555) 555-5555" required />
        </label>
      </div>

      <label className={styles.emailField}>
        <span>Email address</span>
        <input name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" autoCapitalize="none" inputMode="email" placeholder="you@example.com" required />
      </label>

      <label className={styles.emailField}>
        <span>Create password</span>
        <input name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="Create your Pie password" required />
      </label>

      <div style={{ display: 'grid', gap: 9, marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 850, color: '#d8d9dd' }}>Choose the plan you want after your {TRIAL_DAYS}-day free trial</div>
        {PIE_PLANS.map((item) => {
          const active = item.id === selectedPlan;
          return (
            <button key={item.id} type="button" onClick={() => setSelectedPlan(item.id)} style={{ width: '100%', border: `1px solid ${active ? '#8a6bc0' : '#505157'}`, borderRadius: 14, background: active ? '#343039' : '#292a2e', color: '#f7f7f8', padding: 12, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{item.name}</strong><strong>${item.monthlyPrice}/mo</strong></div>
              <div style={{ marginTop: 4, color: '#b9bac0', fontSize: 11 }}>{item.outcome}</div>
              <div style={{ marginTop: 6, color: '#d7c8f1', fontSize: 11, fontWeight: 800 }}>{item.monthlyCredits} Pie credits/month included</div>
            </button>
          );
        })}
      </div>

      <div style={{ padding: 12, borderRadius: 13, background: '#292a2e', border: '1px solid #505157', color: '#c3c4c9', fontSize: 12, lineHeight: 1.45 }}>
        <strong style={{ color:'#fff' }}>{TRIAL_DAYS}-day free trial</strong> of {plan.name}, then ${plan.monthlyPrice}/month unless canceled. Pie verifies your email and phone before opening Stripe. The paid plan includes <strong style={{ color:'#fff' }}>{plan.monthlyCredits} Pie credits each billing cycle</strong>. Optional prepaid top-ups are available if you need more; Pie never adds surprise overage charges. Stripe remains in sandbox during this test.
      </div>

      {error ? <div className={styles.authError}>{error}</div> : null}
      <button className={styles.primaryAuthButton} type="submit" disabled={busy}>{busy ? 'Starting secure signup…' : 'Create Pie Account'}</button>

      <div id="clerk-captcha" />
    </form>
  );
}
