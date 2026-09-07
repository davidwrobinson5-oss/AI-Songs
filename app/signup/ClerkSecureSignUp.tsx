'use client';

import { SignUp } from '@clerk/nextjs';
import { FormEvent, useMemo, useState } from 'react';
import { DEFAULT_PLAN_ID, PIE_PLANS, TRIAL_DAYS, planById } from '../billingConfig';
import styles from '../login/login.module.css';

export default function ClerkSecureSignUp() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedPlan, setSelectedPlan] = useState(DEFAULT_PLAN_ID);
  const [secureStep, setSecureStep] = useState(false);
  const [formError, setFormError] = useState('');
  const plan = useMemo(() => planById(selectedPlan), [selectedPlan]);

  function beginSecureSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    const nextPhone = phone.trim();
    if (!nextName || !nextPhone) {
      setFormError('Please enter your name and phone number.');
      return;
    }

    try {
      sessionStorage.setItem('pieSignupName', nextName);
      sessionStorage.setItem('pieSignupPhone', nextPhone);
      sessionStorage.setItem('pieSignupPlan', selectedPlan);
    } catch {}

    setFormError('');
    setSecureStep(true);
  }

  if (secureStep) {
    return (
      <div style={{ display: 'grid', gap: 14 }}>
        <div className={styles.signupBlock} style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <span>
            Trial plan: <strong>{plan.name}</strong> · ${plan.monthlyPrice}/mo after {TRIAL_DAYS} days
          </span>
          <button className={styles.resendButton} type="button" onClick={() => setSecureStep(false)}>
            Change plan
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
          <SignUp
            routing="hash"
            forceRedirectUrl="/onboarding"
            signInUrl="/signin"
            signInForceRedirectUrl="/"
            appearance={{
              elements: {
                rootBox: { width: '100%', maxWidth: '520px' },
                cardBox: { width: '100%' },
                card: { width: '100%', background: '#0c0e14', border: '1px solid #353746', boxShadow: 'none' },
              },
            }}
          />
        </div>

        <small style={{ color: '#9fa1ae', textAlign: 'center' }}>
          Secure account creation, bot protection, password handling, and email verification are handled by Clerk.
        </small>
      </div>
    );
  }

  return (
    <form className={styles.emailLogin} onSubmit={beginSecureSignup}>
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
        <strong style={{ color:'#fff' }}>{TRIAL_DAYS}-day free trial</strong> of {plan.name}, then ${plan.monthlyPrice}/month unless canceled. The paid plan includes <strong style={{ color:'#fff' }}>{plan.monthlyCredits} Pie credits each billing cycle</strong>. Optional prepaid top-ups are available if you need more; Pie never adds surprise overage charges. Stripe remains in sandbox during this test.
      </div>

      {formError ? <p className={styles.authError}>{formError}</p> : null}
      <button className={styles.primaryAuthButton} type="submit">Continue to Secure Signup</button>
    </form>
  );
}
