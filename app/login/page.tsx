import LegacyLoginForm from './LegacyLoginForm';
import ClerkEmailLogin from './ClerkEmailLogin';
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
          <img src="/pieinears-mark.svg" alt="" width="66" height="66" className={styles.brandLogo} />
          <div>
            <p className={styles.eyebrow}>THE KITCHEN&apos;S OPEN</p>
            <h1>Pieinears</h1>
          </div>
        </div>

        <p className={styles.brandTagline}>Let Them Cook!</p>
        <p className={styles.sub}>Your music. Your voice. Your studio.</p>
        <ClerkEmailLogin />

        <div className={styles.signupBlock}>
          <span>New to Pie?</span>
          <a href="/signup">Sign Up</a>
        </div>

        <div className={styles.bottomRow}>
          <span>Having trouble?</span>
          <a href="/login?legacy=1">Use Studio Password</a>
        </div>
        <p className={styles.lockNote}>Email sign-in is used for the production studio.</p>
      </section>
    </main>
  );
}
