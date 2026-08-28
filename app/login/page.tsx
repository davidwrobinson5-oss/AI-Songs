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
        <div className={styles.brandRow}>
          <div className={styles.logo}>🎶</div>
          <div>
            <p className={styles.eyebrow}>PRIVATE STUDIO</p>
            <h1>AI Songs</h1>
          </div>
        </div>

        <p className={styles.sub}>Sign in with passkey, text code, or password.</p>

        <div className={styles.clerkWrap} style={{ colorScheme: 'dark' }}>
          <SignIn
            routing="hash"
            fallbackRedirectUrl="/"
            signUpUrl="/login"
            appearance={{
              variables: {
                colorPrimary: '#8b5cf6',
                colorPrimaryForeground: '#ffffff',
                colorForeground: '#f5f3ff',
                colorMutedForeground: '#9b9ab0',
                colorBackground: '#11111b',
                colorInput: '#0c0c14',
                colorInputForeground: '#ffffff',
                colorMuted: '#171723',
                colorBorder: '#2f3043',
                colorRing: '#a78bfa',
                colorShadow: '#000000',
                borderRadius: '0.9rem',
                spacing: '0.75rem',
              },
              elements: {
                rootBox: { width: '100%' },
                cardBox: { width: '100%', boxShadow: 'none' },
                card: { width: '100%', boxShadow: 'none', background: 'transparent', padding: 0 },
                header: { display: 'none' },
                socialButtonsBlockButton: { display: 'none' },
                dividerRow: { display: 'none' },
                formFieldLabel: { color: '#d6d5e4', fontWeight: 700, fontSize: '0.9rem' },
                formFieldInput: {
                  minHeight: '50px',
                  background: '#0c0c14',
                  border: '1px solid #2f3043',
                  color: '#ffffff',
                  boxShadow: 'none',
                },
                formButtonPrimary: {
                  minHeight: '50px',
                  background: '#7c3aed',
                  color: '#ffffff',
                  boxShadow: 'none',
                  fontWeight: 800,
                },
                footer: { background: 'transparent', color: '#8f8da4' },
                footerAction: { display: 'none' },
              },
            }}
          />
        </div>

        <div className={styles.bottomRow}>
          <span>Having trouble?</span>
          <a href="/login?legacy=1">Use Studio Password</a>
        </div>
        <p className={styles.lockNote}>Passkeys use your phone&apos;s fingerprint, face unlock, or device PIN.</p>
      </section>
    </main>
  );
}
