import LegacyLoginForm from './LegacyLoginForm';
import AccessRequestForm from './AccessRequestForm';
import ClerkEmailLogin from './ClerkEmailLogin';
import styles from './login.module.css';

function clerkConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY);
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ legacy?: string; signup?: string }>;
}) {
  const params = await searchParams;
  if (!clerkConfigured() || params.legacy === '1') return <LegacyLoginForm />;

  const signingUp = params.signup === '1';

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

        <p className={styles.sub}>
          {signingUp ? 'Request access to AI Songs.' : 'Sign in with your email.'}
        </p>

        {signingUp ? <AccessRequestForm /> : <ClerkEmailLogin />}

        {!signingUp ? (
          <div className={styles.signupBlock}>
            <span>New to AI Songs?</span>
            <a href="/login?signup=1">Sign Up</a>
          </div>
        ) : (
          <div className={styles.signupBlock}>
            <span>Already approved?</span>
            <a href="/login">Sign In</a>
          </div>
        )}

        <div className={styles.bottomRow}>
          <span>Having trouble?</span>
          <a href="/login?legacy=1">Use Studio Password</a>
        </div>
        {!signingUp ? <p className={styles.lockNote}>Email sign-in is used for the production studio.</p> : null}
      </section>
    </main>
  );
}
