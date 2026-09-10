import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ClerkEmailLogin from '../../login/ClerkEmailLogin';
import styles from '../../login/login.module.css';

function clerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

export default async function CustomerSignInPage() {
  if (clerkConfigured()) {
    const session = await auth();
    if (session.userId) redirect('/');
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <img
          src="/pieinears-horizontal.svg"
          alt="Pieinears — The Kitchens Open. Let Them Cook!"
          style={{ display: 'block', width: 'min(100%, 560px)', height: 'auto', aspectRatio: '700 / 175', objectFit: 'contain', margin: '0 auto 18px' }}
        />
        <p className={styles.sub}>Sign in to your Pie account.</p>
        {clerkConfigured() ? (
          <>
            <ClerkEmailLogin />
            <div className={styles.signupBlock}>
              <span>New to Pie?</span>
              <a href="/signup">Create an Account</a>
            </div>
          </>
        ) : (
          <div className={styles.signupBlock}>
            <span>Customer account sign-in is not configured on this test deployment yet.</span>
          </div>
        )}
      </section>
    </main>
  );
}
