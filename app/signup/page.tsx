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
        <p className={styles.sub}>Pie is currently running in private studio mode.</p>
        <div className={styles.signupBlock}>
          <span>New account signup is temporarily paused while Clerk is isolated.</span>
          <a href="/login">Go to Private Studio Login</a>
        </div>
      </section>
    </main>
  );
}
