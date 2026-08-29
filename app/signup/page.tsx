import ClerkEmailSignUp from './ClerkEmailSignUp';
import styles from '../login/login.module.css';

export default function SignUpPage() {
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
        <p className={styles.sub}>Create your AI Songs account.</p>
        <ClerkEmailSignUp />
        <div className={styles.signupBlock}>
          <span>Already have an account?</span>
          <a href="/login">Sign In</a>
        </div>
      </section>
    </main>
  );
}
