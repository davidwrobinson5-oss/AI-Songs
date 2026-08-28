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
        <p className={styles.sub}>Passkey, text code, or password.</p>

        <div className={styles.clerkWrap} style={{ colorScheme: 'dark' }}>
          <SignIn
            routing="hash"
            fallbackRedirectUrl="/"
            signUpUrl="/login"
            appearance={{
              variables: {
                colorPrimary: '#8b5cf6',
                colorPrimaryForeground: '#ffffff',
                colorForeground: '#f4f4ff',
                colorMutedForeground: '#a9a9bd',
                colorBackground: '#151522',
                colorInput: '#0d0d17',
                colorInputForeground: '#ffffff',
                colorMuted: '#1c1c2b',
                colorBorder: '#343449',
                colorRing: '#a78bfa',
                colorShadow: '#000000',
                borderRadius: '0.9rem',
                spacing: '0.85rem',
              },
              elements: {
                rootBox: { width: '100%' },
                cardBox: { width: '100%', boxShadow: 'none' },
                card: {
                  width: '100%',
                  boxShadow: 'none',
                  background: 'transparent',
                  padding: 0,
                },
                header: { display: 'none' },
                socialButtonsBlockButton: { display: 'none' },
                dividerRow: { display: 'none' },
                formFieldLabel: { color: '#d8d8e8', fontWeight: 600 },
                formFieldInput: {
                  minHeight: '52px',
                  background: '#0d0d17',
                  border: '1px solid #343449',
                  color: '#ffffff',
                  boxShadow: 'none',
                },
                formButtonPrimary: {
                  minHeight: '52px',
                  background: '#7c3aed',
                  color: '#ffffff',
                  boxShadow: 'none',
                  fontWeight: 700,
                },
                footer: {
                  background: 'transparent',
                  color: '#a9a9bd',
                },
              },
            }}
          />
        </div>

        <p
          style={{
            margin: '16px 0 0',
            textAlign: 'center',
            color: '#8f90a8',
            fontSize: '0.9rem',
          }}
        >
          Having trouble?{' '}
          <a
            href="/login?legacy=1"
            style={{ color: '#b8a7ff', textDecoration: 'none', fontWeight: 700 }}
          >
            Use Studio Password
          </a>
        </p>

        <p className={styles.lockNote}>
          Passkeys can use your phone&apos;s fingerprint, face unlock, or device PIN. Biometric data stays on your device.
        </p>
      </section>
    </main>
  );
}
