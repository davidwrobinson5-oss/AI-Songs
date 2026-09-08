'use client';

import { SignUp, useUser } from '@clerk/nextjs';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PLAN_ID, PIE_PLANS, TRIAL_DAYS, planById } from '../billingConfig';
import styles from '../login/login.module.css';

function normalizePhone(value: string) {
  const raw = value.trim();
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

export default function ClerkSecureSignUp() {
  const { isLoaded, isSignedIn } = useUser();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(DEFAULT_PLAN_ID);
  const [secureStep, setSecureStep] = useState(false);
  const [secureAttempt, setSecureAttempt] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const [clerkLoadSlow, setClerkLoadSlow] = useState(false);
  const [formError, setFormError] = useState('');
  const plan = useMemo(() => planById(selectedPlan), [selectedPlan]);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.replace('/onboarding');
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const syncOnline = () => setIsOnline(navigator.onLine);
    syncOnline();
    window.addEventListener('online', syncOnline);
    window.addEventListener('offline', syncOnline);
    return () => {
      window.removeEventListener('online', syncOnline);
      window.removeEventListener('offline', syncOnline);
    };
  }, []);

  useEffect(() => {
    setClerkLoadSlow(false);
    if (!secureStep || isLoaded) return;
    const timer = window.setTimeout(() => setClerkLoadSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [secureStep, secureAttempt, isLoaded]);

  function saveSignupDetails(nextName = name.trim(), nextPhone = normalizePhone(phone), nextEmail = email.trim().toLowerCase()) {
    try {
      if (nextName) sessionStorage.setItem('pieSignupName', nextName);
      if (nextPhone) sessionStorage.setItem('pieSignupPhone', nextPhone);
      if (nextEmail) sessionStorage.setItem('pieSignupEmail', nextEmail);
      sessionStorage.setItem('pieSignupPlan', selectedPlan);
    } catch {}
  }

  function beginSecureSignup() {
    const nextName = name.trim();
    const nextPhone = normalizePhone(phone);
    const nextEmail = email.trim().toLowerCase();
    if (!nextName || !nextPhone || !nextEmail) {
      setFormError('Please enter your name, phone number, and email address.');
      return;
    }
    if (!/^\+\d{8,15}$/.test(nextPhone)) {
      setFormError('Please enter a valid phone number including country code if outside the U.S.');
      return;
    }

    saveSignupDetails(nextName, nextPhone, nextEmail);
    setPhone(nextPhone);
    setEmail(nextEmail);
    setFormError('');
    setSecureStep(true);
  }

  function beginGoogleSignup() {
    saveSignupDetails();
    setFormError('');
    setSecureStep(true);
  }

  function submitSecureSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    beginSecureSignup();
  }

  function retrySecureSignup() {
    setClerkLoadSlow(false);
    setSecureAttempt((attempt) => attempt + 1);
  }

  if (secureStep) {
    const pieces = name.trim().split(/\s+/).filter(Boolean);
    const firstName = pieces[0] || undefined;
    const lastName = pieces.slice(1).join(' ') || undefined;

    if (!isOnline) {
      return (
        <div style={{ display: 'grid', gap: 12, textAlign: 'center', padding: 18 }}>
          <strong>Internet connection lost.</strong>
          <small style={{ color: '#b9bac0' }}>Your Pie signup details are saved in this tab. Reconnect, then retry secure signup.</small>
          <button className={styles.primaryAuthButton} type="button" onClick={retrySecureSignup}>Retry Secure Signup</button>
          <button className={styles.resendButton} type="button" onClick={() => setSecureStep(false)}>Change details</button>
        </div>
      );
    }

    if (!isLoaded) {
      return (
        <div style={{ display: 'grid', gap: 12, textAlign: 'center', padding: 18 }}>
          <strong>{clerkLoadSlow ? 'Secure signup is taking longer than expected.' : 'Loading secure signup…'}</strong>
          <small style={{ color: '#b9bac0' }}>
            {clerkLoadSlow ? 'Retry the secure connection. If the account was already created, use Sign In instead of starting over.' : 'Pie is connecting to the verification service.'}
          </small>
          {clerkLoadSlow ? <button className={styles.primaryAuthButton} type="button" onClick={retrySecureSignup}>Retry Secure Signup</button> : null}
          {clerkLoadSlow ? <a href="/signin" style={{ color: '#d7c8f1', fontWeight: 800 }}>Sign In to an Existing Account</a> : null}
          <button className={styles.resendButton} type="button" onClick={() => setSecureStep(false)}>Change details</button>
        </div>
      );
    }

    if (isSignedIn) {
      return (
        <div style={{ display: 'grid', gap: 12, textAlign: 'center', padding: 18 }}>
          <strong>Account verified.</strong>
          <small style={{ color: '#b9bac0' }}>Taking you to your Pie setup…</small>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 14 }}>
        {(email || name || phone) ? (
          <div className={styles.signupBlock} style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <span>
              {email ? <><strong>{email}</strong> · </> : null}{plan.name} · ${plan.monthlyPrice}/mo after {TRIAL_DAYS} days
            </span>
            <button className={styles.resendButton} type="button" onClick={() => setSecureStep(false)}>
              Change details
            </button>
          </div>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: 360, padding: '8px 0' }}>
          <SignUp
            key={secureAttempt}
            routing="hash"
            oauthFlow="auto"
            forceRedirectUrl="/onboarding"
            fallbackRedirectUrl="/onboarding"
            signInUrl="/signin"
            signInForceRedirectUrl="/onboarding"
            initialValues={{ emailAddress: email || undefined, phoneNumber: phone || undefined, firstName, lastName }}
            appearance={{
              variables: {
                colorPrimary: '#7254a8',
                colorPrimaryForeground: '#ffffff',
                colorForeground: '#f2f2f3',
                colorMutedForeground: '#b8b9be',
                colorBackground: '#303136',
                colorInput: '#25262a',
                colorInputForeground: '#f5f5f6',
                colorBorder: '#515258',
                colorNeutral: '#a9aab0',
                colorRing: '#8a6bc0',
                borderRadius: '16px',
              },
              elements: {
                rootBox: { width: '100%', maxWidth: '520px' },
                cardBox: { width: '100%' },
                card: {
                  width: '100%',
                  background: '#303136',
                  color: '#f2f2f3',
                  border: '1px solid #515258',
                  borderRadius: '22px',
                  boxShadow: '0 20px 60px rgba(0,0,0,.28)',
                },
                headerTitle: { color: '#f7f7f8', fontWeight: 800 },
                headerSubtitle: { color: '#b8b9be' },
                socialButtonsBlockButton: {
                  background: '#3a3b40',
                  color: '#f7f7f8',
                  border: '1px solid #5b5c62',
                  minHeight: '50px',
                  borderRadius: '14px',
                  fontWeight: 800,
                },
                dividerLine: { background: '#55565c' },
                dividerText: { color: '#a9aab0' },
                formFieldLabel: { color: '#d7d8db', fontWeight: 700 },
                formFieldInput: {
                  background: '#25262a',
                  color: '#f5f5f6',
                  border: '1px solid #55565c',
                  minHeight: '50px',
                  borderRadius: '14px',
                  boxShadow: 'none',
                },
                formFieldInputShowPasswordButton: { color: '#b8b9be' },
                formButtonPrimary: {
                  background: '#7254a8',
                  color: '#ffffff',
                  minHeight: '52px',
                  borderRadius: '14px',
                  fontWeight: 800,
                  fontSize: '16px',
                  boxShadow: '0 8px 20px rgba(42,31,63,.24)',
                },
                footer: { background: '#2b2c30' },
                footerActionText: { color: '#b8b9be' },
                footerActionLink: { color: '#d7c8f1', fontWeight: 700 },
                identityPreviewText: { color: '#f2f2f3' },
                identityPreviewEditButton: { color: '#d7c8f1', fontWeight: 700 },
              },
            }}
          />
        </div>

        <div style={{ display: 'grid', gap: 8, textAlign: 'center' }}>
          <small style={{ color: '#b9bac0' }}>
            Pie uses Clerk for secure email, Google, phone, and account verification. After verification, you will continue directly to onboarding.
          </small>
          <small style={{ color: '#95969d' }}>
            If this panel stops responding, <button type="button" onClick={retrySecureSignup} style={{ border: 0, padding: 0, background: 'transparent', color: '#d7c8f1', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>restart secure signup</button> or <a href="/signin" style={{ color: '#d7c8f1', fontWeight: 800 }}>sign in</a> if your account was already created.
          </small>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.emailLogin} onSubmit={submitSecureSignup}>
      <button className={styles.googleAuthButton} type="button" onClick={beginGoogleSignup}>
        Continue with Google
      </button>
      <div className={styles.authDivider}><span>or continue with email</span></div>

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
        <strong style={{ color:'#fff' }}>{TRIAL_DAYS}-day free trial</strong> of {plan.name}, then ${plan.monthlyPrice}/month unless canceled. Pie verifies your account before checkout. The paid plan includes <strong style={{ color:'#fff' }}>{plan.monthlyCredits} Pie credits each billing cycle</strong>. Optional prepaid top-ups are available if you need more; Pie never adds surprise overage charges. Stripe remains in sandbox during this test.
      </div>

      {formError ? <p className={styles.authError}>{formError}</p> : null}
      <button className={styles.primaryAuthButton} type="submit">Continue to Secure Signup</button>
    </form>
  );
}
