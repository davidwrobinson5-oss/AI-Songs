import ClerkEmailSignUp from './ClerkEmailSignUp';
import styles from '../login/login.module.css';

export default function SignUpPage() {
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
        <p className={styles.sub}>Create your Pie account.</p>
        <ClerkEmailSignUp />
        <div className={styles.signupBlock}>
          <span>Already have an account?</span>
          <a href="/login">Sign In</a>
        </div>
        <div className={styles.bottomRow}>
          <span>Having trouble?</span>
          <a href="/login?legacy=1">Use Studio Password</a>
        </div>
      </section>
    </main>
  );
}
