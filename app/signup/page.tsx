import ClerkEmailSignUp from './ClerkEmailSignUp';
import styles from '../login/login.module.css';

function clerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

export default function SignUpPage() {
  return (
    <main className={styles.shell}>
      <section className={styles.card} style={{ width: 'min(100%,760px)' }}>
        <img
          src="/pieinears-horizontal.svg"
          alt="Pieinears — The Kitchens Open. Let Them Cook!"
          style={{ display: 'block', width: 'min(100%, 560px)', height: 'auto', aspectRatio: '700 / 175', objectFit: 'contain', margin: '0 auto 12px' }}
        />
        <p className={styles.sub}>Create your Pie account and choose the stage that fits where you are headed.</p>
        {clerkConfigured() ? (
          <>
            <ClerkEmailSignUp />
            <div className={styles.signupBlock}>
              <span>Already have a Pie account?</span>
              <a href="/signin">Sign In</a>
            </div>
          </>
        ) : (
          <div className={styles.signupBlock}>
            <span>Customer signup is not configured on this test deployment yet.</span>
          </div>
        )}
      </section>
    </main>
  );
}
