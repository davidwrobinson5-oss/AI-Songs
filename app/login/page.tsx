'use client';

import { FormEvent, useState } from 'react';

export default function LoginPage() {
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
    <main className="loginShell">
      <section className="loginCard">
        <div className="loginLogo">🎶</div>
        <p className="eyebrow">PRIVATE STUDIO</p>
        <h1>AI Songs</h1>
        <p className="sub">Enter your studio password to access music generation, your voice tools, mixes, songs, and sheets.</p>
        <form onSubmit={submit} className="loginForm">
          <label>
            Studio password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={12}
              required
              autoFocus
            />
          </label>
          <button className="primary" type="submit" disabled={busy || password.length < 12}>
            {busy ? 'Signing in…' : 'Unlock Studio'}
          </button>
          {status && <div className="statusBox">{status}</div>}
        </form>
      </section>
    </main>
  );
}
