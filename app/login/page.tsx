import { SignIn } from '@clerk/nextjs';
import LegacyLoginForm from './LegacyLoginForm';
import styles from './login.module.css';

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ legacy?: string }>;
}) {
  const params = await searchParams;

  if (!clerkConfigured() || params.legacy === '1') return <LegacyLoginForm />;

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
        <a
          href="/login?legacy=1"
          style={{
            display: 'block',
            width: '100%',
            marginTop: '18px',
            padding: '14px 16px',
            border: '1px solid rgba(180, 184, 255, 0.28)',
            borderRadius: '14px',
            color: '#f4f4ff',
            textAlign: 'center',
            textDecoration: 'none',
            fontWeight: 700,
            background: 'rgba(255,255,255,0.035)',
          }}
        >
          🔐 Use Studio Password
        </a>
        <p className={styles.lockNote}>If passkey or phone options do not appear, use the Studio Password fallback above. Passkeys can use your phone's fingerprint, face unlock, or device PIN. Biometric data stays on your device.</p>
      </section>
    </main>
  );
}
