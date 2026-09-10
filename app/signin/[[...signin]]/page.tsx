import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import ClerkEmailLogin from '../../login/ClerkEmailLogin';
import ReturningPasskeyOffer from '../ReturningPasskeyOffer';
import styles from '../../login/login.module.css';

function clerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

export default async function CustomerSignInPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const passkeyOffer = (Array.isArray(params?.passkey) ? params.passkey[0] : params?.passkey) === 'offer';

  if (clerkConfigured()) {
    const session = await auth();
    if (session.userId && !passkeyOffer) redirect('/');
  }

  return (
    <main className={styles.shell}>
      <section className={styles.card}>
        <img
          src="/pieinears-horizontal.svg"
          alt="Pieinears — The Kitchens Open. Let Them Cook!"
          style={{ display: 'block', width: 'min(100%, 560px)', height: 'auto', aspectRatio: '700 / 175', objectFit: 'contain', margin: '0 auto 18px' }}
        />
        <p className={styles.sub}>{passkeyOffer ? 'Your Pie sign-in is complete.' : 'Sign in to your Pie account.'}</p>
        {clerkConfigured() ? (
          passkeyOffer ? (
            <ReturningPasskeyOffer />
          ) : (
            <>
              <ClerkEmailLogin />
              <div className={styles.signupBlock}>
                <span>New to Pie?</span>
                <a href="/signup">Create an Account</a>
              </div>
            </>
          )
        ) : (
          <div className={styles.signupBlock}>
            <span>Customer account sign-in is not configured on this test deployment yet.</span>
          </div>
        )}
      </section>
    </main>
  );
}
