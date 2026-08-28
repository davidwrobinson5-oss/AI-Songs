'use client';

import { FormEvent, useState } from 'react';
import styles from './login.module.css';

export default function AccessRequestForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setStatus('');

    try {
      const response = await fetch('/api/access-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message, website: '' }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Request could not be sent.');
      setStatus('Request sent. You’ll receive access after approval.');
      setName('');
      setEmail('');
      setMessage('');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Request could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={styles.customAuthForm} onSubmit={submit}>
      <div className={styles.methodHeading}>Request Access</div>
      <label htmlFor="access-name">Name</label>
      <input id="access-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} placeholder="Your name" />

      <label htmlFor="access-email">Email address</label>
      <input id="access-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="you@example.com" />

      <label htmlFor="access-message">Message <span style={{ opacity: .65 }}>(optional)</span></label>
      <textarea id="access-message" value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} placeholder="Tell us who you are or why you need access." className={styles.authTextarea} />

      {status && <div className={status.startsWith('Request sent') ? styles.authInfo : styles.authError}>{status}</div>}
      <button className={styles.primaryAuthButton} type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send Access Request'}</button>
    </form>
  );
}
