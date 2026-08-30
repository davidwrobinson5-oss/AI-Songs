import ClerkEmailSignUp from './ClerkEmailSignUp';
import styles from '../login/login.module.css';

export default function SignUpPage() {
  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <img
          src="/pieinears-horizontal.svg"
          alt="Pieinears — The Kitchens Open. Let Them Cook!"
          style={{ display: 'block', width: 'min(100%, 560px)', height: 'auto', aspectRatio: '700 / 175', objectFit: 'contain', margin: '0 auto 18px' }}
        />
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
