'use client';

import { FormEvent, useState } from 'react';
import styles from './login.module.css';

export default function LegacyLoginForm() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || 'Could not sign in.');
      window.location.href = '/';
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <img
          className={styles.legacyBrandLogo}
          src="/pieinears-horizontal.svg"
          alt="PieInEars — The Kitchens Open. Let Them Cook!"
        />
        <p className={styles.eyebrow}>PRIVATE STUDIO</p>
        <h1>Pie</h1>
        <p className={styles.sub}>Enter your studio password to access music generation, your voice tools, mixes, songs, and sheets.</p>
        <form onSubmit={submit} className={styles.form}>
          <label>
            Studio password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              maxLength={256}
              required
              autoFocus
            />
          </label>
          <button type="submit" disabled={busy || password.length < 12}>
            {busy ? 'Signing in…' : 'Unlock Studio'}
          </button>
          {status && <div className={styles.status}>{status}</div>}
        </form>
        <p className={styles.lockNote}>Protected studio access · signed secure session · paid AI endpoints stay locked until authentication succeeds.</p>
      </section>
    </main>
  );
}
