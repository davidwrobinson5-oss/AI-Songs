'use client';

import { useClerk, useSignIn, useUser } from '@clerk/nextjs';
import { FormEvent, useEffect, useState } from 'react';
import styles from './login.module.css';

type SignInMode = 'password' | 'phone' | 'phone-code';
type SignupGate = 'idle' | 'checking' | 'email-code' | 'phone-code' | 'checkout' | 'failed';

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
  const { user, isLoaded: userLoaded, isSignedIn } = useUser();
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [signupGate, setSignupGate] = useState<SignupGate>('idle');
  const [signupCode, setSignupCode] = useState('');
  const [signupMessage, setSignupMessage] = useState('');
  const busy = fetchStatus === 'fetching' || ['checking', 'checkout'].includes(signupGate);

  useEffect(() => {
    try {
      const savedEmail = sessionStorage.getItem('pieSignupEmail');
      if (savedEmail) setEmail(savedEmail);
    } catch {}
  }, []);

  useEffect(() => {
    if (!userLoaded) return;
    const params = new URLSearchParams(window.location.search);
    const created = params.get('created') === '1';
    if (!created) return;

    if (!isSignedIn || !user) {
      window.history.replaceState({}, '', '/signin');
      return;
    }

    if (signupGate !== 'idle') return;
    setSignupGate('checking');
    void continueSignupGate();
  }, [userLoaded, isSignedIn, user, signupGate]);

  function savedSignupIdentity() {
    let savedEmail = email.trim().toLowerCase();
    let savedPhone = '';
    let savedPlan = '';
    try {
      savedEmail = (sessionStorage.getItem('pieSignupEmail') || savedEmail).trim().toLowerCase();
      savedPhone = normalizePhone(sessionStorage.getItem('pieSignupPhone') || '');
      savedPlan = sessionStorage.getItem('pieSignupPlan') || '';
    } catch {}
    return { savedEmail, savedPhone, savedPlan };
  }

  async function startCardVerification() {
    const { savedPlan } = savedSignupIdentity();
    if (!savedPlan) throw new Error('Pie could not recover your selected plan. Start signup again and choose a plan.');

    setSignupGate('checkout');
    setSignupMessage('Email and phone verified. Opening secure card verification…');

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 25000);
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planId: savedPlan }),
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) throw new Error(data?.error || 'Secure card verification could not be started.');
      window.location.replace(data.url);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function continueSignupGate() {
    if (!user) return;
    try {
      setError('');
      setSignupMessage('Checking your required Pie signup verification…');
      await user.reload();
      const { savedEmail, savedPhone } = savedSignupIdentity();

      const emailAddress = user.emailAddresses.find((item) => item.emailAddress.toLowerCase() === savedEmail) || user.emailAddresses[0];
      if (!emailAddress) throw new Error('Pie could not find the email address from this signup attempt.');

      if (emailAddress.verification.status !== 'verified') {
        await emailAddress.prepareVerification({ strategy: 'email_code' });
        setSignupCode('');
        setSignupMessage(`Enter the verification code sent to ${emailAddress.emailAddress}.`);
        setSignupGate('email-code');
        return;
      }

      if (!savedPhone) throw new Error('Pie could not recover the phone number from this signup attempt. Start signup again so phone verification can be completed.');

      let phoneNumber = user.phoneNumbers.find((item) => item.phoneNumber === savedPhone);
      if (!phoneNumber) {
        const createdPhone = await user.createPhoneNumber({ phoneNumber: savedPhone });
        await user.reload();
        phoneNumber = user.phoneNumbers.find((item) => item.id === createdPhone.id) || user.phoneNumbers.find((item) => item.phoneNumber === savedPhone);
      }

      if (!phoneNumber) throw new Error('Pie could not attach your phone number for verification.');

      if (phoneNumber.verification.status !== 'verified') {
        await phoneNumber.prepareVerification();
        setSignupCode('');
        setSignupMessage(`Enter the SMS verification code sent to ${phoneNumber.phoneNumber}.`);
        setSignupGate('phone-code');
        return;
      }

      await startCardVerification();
    } catch (gateError) {
      setSignupGate('failed');
      setError(errorMessage(gateError, 'Pie could not finish the required signup verification.'));
    }
  }

  async function verifySignupCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    const nextCode = signupCode.trim();
    if (!nextCode) { setError('Enter the verification code.'); return; }

    setError('');
    try {
      const { savedEmail, savedPhone } = savedSignupIdentity();
      if (signupGate === 'email-code') {
        const emailAddress = user.emailAddresses.find((item) => item.emailAddress.toLowerCase() === savedEmail) || user.emailAddresses[0];
        if (!emailAddress) throw new Error('Pie could not find the email address to verify.');
        const result = await emailAddress.attemptVerification({ code: nextCode });
        if (result.verification.status !== 'verified') throw new Error('That email code was not verified.');
      } else if (signupGate === 'phone-code') {
        const phoneNumber = user.phoneNumbers.find((item) => item.phoneNumber === savedPhone) || user.phoneNumbers[0];
        if (!phoneNumber) throw new Error('Pie could not find the phone number to verify.');
        const result = await phoneNumber.attemptVerification({ code: nextCode });
        if (result.verification.status !== 'verified') throw new Error('That phone code was not verified.');
      } else return;

      await user.reload();
      setSignupCode('');
      setSignupGate('checking');
      await continueSignupGate();
    } catch (verifyError) {
      setError(errorMessage(verifyError, 'That verification code could not be confirmed.'));
    }
  }

  async function resendSignupCode() {
    if (!user) return;
    setError('');
    try {
      const { savedEmail, savedPhone } = savedSignupIdentity();
      if (signupGate === 'email-code') {
        const emailAddress = user.emailAddresses.find((item) => item.emailAddress.toLowerCase() === savedEmail) || user.emailAddresses[0];
        if (!emailAddress) throw new Error('Pie could not find the email address to verify.');
        await emailAddress.prepareVerification({ strategy: 'email_code' });
        setSignupMessage(`A new verification code was sent to ${emailAddress.emailAddress}.`);
      } else if (signupGate === 'phone-code') {
        const phoneNumber = user.phoneNumbers.find((item) => item.phoneNumber === savedPhone) || user.phoneNumbers[0];
        if (!phoneNumber) throw new Error('Pie could not find the phone number to verify.');
        await phoneNumber.prepareVerification();
        setSignupMessage(`A new SMS verification code was sent to ${phoneNumber.phoneNumber}.`);
      }
    } catch (resendError) {
      setError(errorMessage(resendError, 'Pie could not resend that verification code.'));
    }
  }

  async function finalizeIfComplete() {
    if (signIn.status !== 'complete') {
      setError('Pie needs an additional verification step before sign-in can finish.');
      return false;
    }
    await signIn.finalize({
      navigate: ({ decorateUrl }) => {
        const url = decorateUrl('/');
        if (url.startsWith('http')) window.location.href = url;
        else window.location.replace(url);
      },
    });
    return true;
  }

  async function resetTo(nextMode: SignInMode) {
    setError(''); setInfo(''); setCode(''); await signIn.reset(); setMode(nextMode);
  }

  async function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setInfo('');
    const nextEmail = email.trim().toLowerCase();
    if (!nextEmail || !password) { setError('Enter your email address and password.'); return; }
    const result = await signIn.password({ emailAddress: nextEmail, password });
    if (result.error) { setError(errorMessage(result.error, 'Pie could not sign you in with that email and password.')); return; }
    await finalizeIfComplete();
  }

  async function usePasskey() {
    setError(''); setInfo(''); await signIn.reset();
    const result = await signIn.passkey({ flow: 'discoverable' });
    if (result.error) { setError(errorMessage(result.error, 'No usable Pie passkey was found on this device. You can use email/password or your verified phone number instead.')); return; }
    await finalizeIfComplete();
  }

  async function sendPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setInfo('');
    const nextPhone = normalizePhone(phone);
    if (!/^\+\d{8,15}$/.test(nextPhone)) { setError('Enter the verified phone number on your Pie account.'); return; }
    setPhone(nextPhone);
    const result = await signIn.phoneCode.sendCode({ phoneNumber: nextPhone, channel: 'sms' });
    if (result.error) { setError(errorMessage(result.error, 'Pie could not send a code to that phone number. Make sure it is the verified number on your account.')); return; }
    setMode('phone-code'); setInfo(`We sent a one-time sign-in code to ${nextPhone}.`);
  }

  async function verifyPhoneCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const nextCode = code.trim();
    if (!nextCode) { setError('Enter the code Pie sent to your phone.'); return; }
    const result = await signIn.phoneCode.verifyCode({ code: nextCode });
    if (result.error) { setError(errorMessage(result.error, 'That code could not be verified. Try again or request a new code.')); return; }
    await finalizeIfComplete();
  }

  if (signupGate !== 'idle') {
    if (signupGate === 'checking' || signupGate === 'checkout') {
      return <div className={styles.emailLogin} style={{ textAlign:'center' }}><div className={styles.methodHeading}>{signupGate === 'checkout' ? 'Secure payment method' : 'Finish setting up Pie'}</div><p className={styles.verifyNote}>{signupMessage || 'Checking your required signup steps…'}</p></div>;
    }
    if (signupGate === 'failed') {
      return <div className={styles.emailLogin}><div className={styles.methodHeading}>Finish setting up Pie</div>{error ? <div className={styles.authError}>{error}</div> : null}<button className={styles.primaryAuthButton} type='button' onClick={() => { setSignupGate('checking'); void continueSignupGate(); }}>Retry</button><a href='/signup' style={{ color:'#d7c8f1', textAlign:'center', fontWeight:800 }}>Start signup again</a></div>;
    }
    return <div className={styles.emailLogin}><div className={styles.methodHeading}>{signupGate === 'email-code' ? 'Verify your email' : 'Verify your phone'}</div><p className={styles.verifyNote}>{signupMessage}</p><form className={styles.emailLogin} onSubmit={verifySignupCode}><label className={styles.emailField}><span>Verification code</span><input value={signupCode} onChange={(event)=>setSignupCode(event.target.value.replace(/\D/g,''))} autoComplete='one-time-code' inputMode='numeric' placeholder='123456' required /></label>{error ? <div className={styles.authError}>{error}</div> : null}<button className={styles.primaryAuthButton} type='submit'>Verify & Continue</button><button className={styles.resendButton} type='button' onClick={resendSignupCode}>Send a new code</button></form></div>;
  }

  if (mode === 'phone') {
    return <div className={styles.emailLogin}><button className={styles.backButton} type='button' onClick={()=>resetTo('password')} disabled={busy}>← Back to email sign-in</button><div className={styles.methodHeading}>Sign in with your phone</div><p className={styles.verifyNote}>Use the verified phone number on your Pie account. We’ll text you a one-time code.</p><form className={styles.emailLogin} onSubmit={sendPhoneCode}><label className={styles.emailField}><span>Phone number</span><input type='tel' value={phone} onChange={(event)=>setPhone(event.target.value)} autoComplete='tel' inputMode='tel' placeholder='(555) 555-5555' required /></label>{error ? <div className={styles.authError}>{error}</div> : null}<button className={styles.primaryAuthButton} type='submit' disabled={busy}>{busy ? 'Sending code…' : 'Text Me a Sign-In Code'}</button></form></div>;
  }

  if (mode === 'phone-code') {
    return <div className={styles.emailLogin}><button className={styles.backButton} type='button' onClick={()=>resetTo('phone')} disabled={busy}>← Change phone number</button><div className={styles.methodHeading}>Enter your Pie code</div>{info ? <div className={styles.authInfo}>{info}</div> : null}<form className={styles.emailLogin} onSubmit={verifyPhoneCode}><label className={styles.emailField}><span>One-time code</span><input value={code} onChange={(event)=>setCode(event.target.value.replace(/\D/g,''))} autoComplete='one-time-code' inputMode='numeric' placeholder='123456' required /></label>{error ? <div className={styles.authError}>{error}</div> : null}<button className={styles.primaryAuthButton} type='submit' disabled={busy}>{busy ? 'Verifying…' : 'Verify & Sign In'}</button><button className={styles.resendButton} type='button' onClick={()=>resetTo('phone')} disabled={busy}>Send a new code</button></form></div>;
  }

  return <div className={styles.emailLogin}><form className={styles.emailLogin} onSubmit={submitPassword}><label className={styles.emailField}><span>Email address</span><input type='email' value={email} onChange={(event)=>setEmail(event.target.value)} autoComplete='email' autoCapitalize='none' inputMode='email' placeholder='you@example.com' required /></label><label className={styles.emailField}><span>Password</span><input type='password' value={password} onChange={(event)=>setPassword(event.target.value)} autoComplete='current-password' placeholder='Your password' required /></label>{error ? <div className={styles.authError}>{error}</div> : null}<button className={styles.primaryAuthButton} type='submit' disabled={busy}>{busy ? 'Signing in…' : 'Sign In'}</button></form><div className={styles.authDivider}><span>or</span></div><button className={styles.googleAuthButton} type='button' onClick={usePasskey} disabled={busy}>Use a Passkey</button><button className={styles.googleAuthButton} type='button' onClick={()=>resetTo('phone')} disabled={busy}>Sign In with Phone Code</button><p className={styles.verifyNote} style={{ textAlign:'center', marginBottom:0 }}>Forgot your password or can’t access your email? Use your verified phone number to get back into Pie.</p></div>;
}
