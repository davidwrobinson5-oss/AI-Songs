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
        <p className={styles.sub}>Sign in securely with your passkey, phone code, or password.</p>
        <div className={styles.clerkWrap}>
          <SignIn
            routing="hash"
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
        <p className={styles.lockNote}>Passkeys can use your phone's fingerprint, face unlock, or device PIN. Biometric data stays on your device.</p>
      </section>
    </main>
  );
}
