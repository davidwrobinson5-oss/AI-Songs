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
    if (secureStep && isLoaded && isSignedIn) {
      window.location.replace('/onboarding');
    }
  }, [secureStep, isLoaded, isSignedIn]);

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

    try {
      sessionStorage.setItem('pieSignupName', nextName);
      sessionStorage.setItem('pieSignupPhone', nextPhone);
      sessionStorage.setItem('pieSignupEmail', nextEmail);
      sessionStorage.setItem('pieSignupPlan', selectedPlan);
    } catch {}

    setPhone(nextPhone);
    setEmail(nextEmail);
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
          <small style={{ color: '#9fa1ae' }}>Your Pie signup details are saved in this tab. Reconnect, then retry secure signup.</small>
          <button className={styles.primaryAuthButton} type="button" onClick={retrySecureSignup}>Retry Secure Signup</button>
          <button className={styles.resendButton} type="button" onClick={() => setSecureStep(false)}>Change details</button>
        </div>
      );
    }

    if (!isLoaded) {
      return (
        <div style={{ display: 'grid', gap: 12, textAlign: 'center', padding: 18 }}>
          <strong>{clerkLoadSlow ? 'Secure signup is taking longer than expected.' : 'Loading secure signup…'}</strong>
          <small style={{ color: '#9fa1ae' }}>
            {clerkLoadSlow ? 'Retry the secure connection. If the account was already created, use Sign In instead of starting over.' : 'Pie is connecting to the verification service.'}
          </small>
          {clerkLoadSlow ? <button className={styles.primaryAuthButton} type="button" onClick={retrySecureSignup}>Retry Secure Signup</button> : null}
          {clerkLoadSlow ? <a href="/signin" style={{ color: '#cabdff', fontWeight: 800 }}>Sign In to an Existing Account</a> : null}
          <button className={styles.resendButton} type="button" onClick={() => setSecureStep(false)}>Change details</button>
        </div>
      );
    }

    if (isSignedIn) {
      return (
        <div style={{ display: 'grid', gap: 12, textAlign: 'center', padding: 18 }}>
          <strong>Email verified.</strong>
          <small style={{ color: '#9fa1ae' }}>Taking you to your plan and trial setup…</small>
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div className={styles.signupBlock} style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>
            <strong>{email}</strong> · {plan.name} · ${plan.monthlyPrice}/mo after {TRIAL_DAYS} days
          </span>
          <button className={styles.resendButton} type="button" onClick={() => setSecureStep(false)}>
            Change details
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: 360, padding: '8px 0' }}>
          <SignUp
            key={secureAttempt}
            routing="hash"
            forceRedirectUrl="/onboarding"
            signInUrl="/signin"
            signInForceRedirectUrl="/onboarding"
            initialValues={{ emailAddress: email, phoneNumber: phone, firstName, lastName }}
            appearance={{
              variables: {
                colorPrimary: '#6f42c1',
                colorPrimaryForeground: '#ffffff',
                colorForeground: '#1b1c20',
                colorMutedForeground: '#5b5d66',
                colorBackground: '#d7d8dd',
                colorInput: '#c3c5cc',
                colorInputForeground: '#17181c',
                colorBorder: '#a9abb3',
                colorNeutral: '#666872',
                colorRing: '#7c4dd4',
                borderRadius: '16px',
              },
              elements: {
                rootBox: { width: '100%', maxWidth: '520px' },
                cardBox: { width: '100%' },
                card: {
                  width: '100%',
                  background: '#d7d8dd',
                  color: '#1b1c20',
                  border: '1px solid #a9abb3',
                  borderRadius: '22px',
                  boxShadow: '0 20px 60px rgba(0,0,0,.25)',
                },
                headerTitle: { color: '#191a1f', fontWeight: 800 },
                headerSubtitle: { color: '#565861' },
                socialButtonsBlockButton: { display: 'none' },
                socialButtonsIconButton: { display: 'none' },
                dividerRow: { display: 'none' },
                formFieldLabel: { color: '#32343b', fontWeight: 700 },
                formFieldInput: {
                  background: '#c3c5cc',
                  color: '#17181c',
                  border: '1px solid #9fa2ab',
                  minHeight: '50px',
                  borderRadius: '14px',
                  boxShadow: 'none',
                },
                formFieldInputShowPasswordButton: { color: '#5f616a' },
                formButtonPrimary: {
                  background: '#6f42c1',
                  color: '#ffffff',
                  minHeight: '52px',
                  borderRadius: '14px',
                  fontWeight: 800,
                  fontSize: '16px',
                  boxShadow: '0 8px 20px rgba(73,45,125,.22)',
                },
                footer: { background: '#c9cad0' },
                footerActionText: { color: '#555760' },
                footerActionLink: { color: '#5c2fa8', fontWeight: 700 },
                identityPreviewText: { color: '#1b1c20' },
                identityPreviewEditButton: { color: '#5c2fa8', fontWeight: 700 },
              },
            }}
          />
        </div>

        <div style={{ display: 'grid', gap: 8, textAlign: 'center' }}>
          <small style={{ color: '#9fa1ae' }}>
            During testing, Pie only requires email verification. SMS verification is saved for a later Clerk Pro upgrade.
          </small>
          <small style={{ color: '#77798a' }}>
            If this panel stops responding, <button type="button" onClick={retrySecureSignup} style={{ border: 0, padding: 0, background: 'transparent', color: '#cabdff', font: 'inherit', fontWeight: 800, cursor: 'pointer' }}>restart secure signup</button> or <a href="/signin" style={{ color: '#cabdff', fontWeight: 800 }}>sign in</a> if your account was already created.
          </small>
        </div>
      </div>
    );
  }

  return (
    <form className={styles.emailLogin} onSubmit={submitSecureSignup}>
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
        <div style={{ fontSize: 12, fontWeight: 850, color: '#d8d9e5' }}>Choose the plan you want after your {TRIAL_DAYS}-day free trial</div>
        {PIE_PLANS.map((item) => {
          const active = item.id === selectedPlan;
          return (
            <button key={item.id} type="button" onClick={() => setSelectedPlan(item.id)} style={{ width: '100%', border: `1px solid ${active ? '#8b5cf6' : '#353746'}`, borderRadius: 14, background: active ? '#19142b' : '#0c0e14', color: '#fff', padding: 12, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><strong>{item.name}</strong><strong>${item.monthlyPrice}/mo</strong></div>
              <div style={{ marginTop: 4, color: '#9fa1ae', fontSize: 11 }}>{item.outcome}</div>
              <div style={{ marginTop: 6, color: '#cabdff', fontSize: 11, fontWeight: 800 }}>{item.monthlyCredits} Pie credits/month included</div>
            </button>
          );
        })}
      </div>

      <div style={{ padding: 12, borderRadius: 13, background: '#11131a', border: '1px solid #2c2f38', color: '#b7b8c4', fontSize: 12, lineHeight: 1.45 }}>
        <strong style={{ color:'#fff' }}>{TRIAL_DAYS}-day free trial</strong> of {plan.name}, then ${plan.monthlyPrice}/month unless canceled. During this test, Pie verifies your email address before checkout. Your phone number is saved as contact information but is not SMS-verified yet. The paid plan includes <strong style={{ color:'#fff' }}>{plan.monthlyCredits} Pie credits each billing cycle</strong>. Optional prepaid top-ups are available if you need more; Pie never adds surprise overage charges. Stripe remains in sandbox during this test.
      </div>

      {formError ? <p className={styles.authError}>{formError}</p> : null}
      <button className={styles.primaryAuthButton} type="button" onClick={beginSecureSignup}>Continue to Secure Signup</button>
    </form>
  );
}
