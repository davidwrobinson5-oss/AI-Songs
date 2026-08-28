import { SignIn } from '@clerk/nextjs';
import LegacyLoginForm from './LegacyLoginForm';
import styles from './login.module.css';

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export default function LoginPage() {
  if (!clerkConfigured()) return <LegacyLoginForm />;

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <div className={styles.logo}>🎶</div>
        <p className={styles.eyebrow}>PRIVATE STUDIO</p>
        <h1>AI Songs</h1>
        <p className={styles.sub}>Choose your preferred secure sign-in method. Passkey uses your phone's fingerprint or face unlock, SMS sends a one-time code, and password remains available as a fallback.</p>
        <div className={styles.authChoiceList}>
          <div>👆 Fingerprint / Face ID</div>
          <div>📱 Text me a code</div>
          <div>🔐 Password</div>
        </div>
        <div className={styles.clerkWrap}>
          <SignIn
            path="/login"
            routing="path"
            fallbackRedirectUrl="/"
            signUpUrl="/login"
            appearance={{
              elements: {
                rootBox: { width: '100%' },
                cardBox: { width: '100%', boxShadow: 'none' },
                card: { width: '100%', boxShadow: 'none', background: 'transparent', padding: 0 },
              },
            }}
          />
        </div>
        <p className={styles.lockNote}>Biometric data stays on your device. The app receives only a cryptographic passkey result, never your fingerprint or face scan.</p>
      </section>
    </main>
  );
}
