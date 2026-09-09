import { clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';

function safeSessionId(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const sessionId = typeof raw === 'string' ? raw.trim() : '';
  return /^cs_(?:test_|live_)?[A-Za-z0-9]+$/.test(sessionId) ? sessionId : '';
}

async function retrieveCheckoutSession(sessionId: string) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecret) return null;

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${stripeSecret}` },
    cache: 'no-store',
  });
  if (!response.ok) return null;
  return response.json().catch(() => null);
}

async function finalizePieAccount(session: any) {
  const userId = String(session?.client_reference_id || session?.metadata?.pie_user_id || '');
  const metadataUserId = String(session?.metadata?.pie_user_id || '');
  const planId = String(session?.metadata?.pie_plan_id || 'none');
  const planLevel = Number(session?.metadata?.pie_plan_level || 0);
  const subscriptionStatus = session?.status === 'complete' ? 'trialing' : '';

  if (!userId || !metadataUserId || userId !== metadataUserId || !Number.isFinite(planLevel) || planLevel < 1) {
    throw new Error('Pie could not verify the completed checkout account.');
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      ...(user.publicMetadata || {}),
      pieSubscriptionStatus: subscriptionStatus || 'trialing',
      piePlanId: planId,
      piePlanLevel: planLevel,
      pieStripeCustomerId: session?.customer || null,
      pieStripeSubscriptionId: session?.subscription || null,
      pieOnboardingCompleted: true,
      pieEntitlementUpdatedAt: new Date().toISOString(),
    },
  });
}

export default async function OnboardingCompletePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const sessionId = safeSessionId(params?.session_id);

  if (!sessionId) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#08090d', color: '#fff' }}>
        <section style={{ width: 'min(100%,480px)', padding: 24, borderRadius: 22, background: '#12141c', border: '1px solid #2e3040', textAlign: 'center' }}>
          <div style={{ fontSize: 42 }}>🥧</div>
          <h1 style={{ margin: '10px 0 8px' }}>We could not verify that checkout return.</h1>
          <p style={{ color: '#a7a8b5', lineHeight: 1.55 }}>Your account is still safe. Please sign in to Pie and we’ll continue from there.</p>
          <a href="/signin" style={{ display: 'inline-grid', placeItems: 'center', minHeight: 48, padding: '0 18px', borderRadius: 13, background: '#7c3aed', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>Go to Pie Sign In</a>
        </section>
      </main>
    );
  }

  const session = await retrieveCheckoutSession(sessionId);
  const valid = Boolean(
    session &&
    session.id === sessionId &&
    session.mode === 'subscription' &&
    session.status === 'complete' &&
    ['paid', 'no_payment_required'].includes(String(session.payment_status || '')),
  );

  if (!valid) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#08090d', color: '#fff' }}>
        <section style={{ width: 'min(100%,480px)', padding: 24, borderRadius: 22, background: '#12141c', border: '1px solid #2e3040', textAlign: 'center' }}>
          <div style={{ fontSize: 42 }}>🥧</div>
          <h1 style={{ margin: '10px 0 8px' }}>Pie is still verifying your trial.</h1>
          <p style={{ color: '#a7a8b5', lineHeight: 1.55 }}>Please wait a moment, then sign in. If the trial is not attached yet, Pie can retry the billing sync.</p>
          <a href="/signin" style={{ display: 'inline-grid', placeItems: 'center', minHeight: 48, padding: '0 18px', borderRadius: 13, background: '#7c3aed', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>Continue to Pie Sign In</a>
        </section>
      </main>
    );
  }

  try {
    await finalizePieAccount(session);
  } catch (error) {
    console.error('Pie checkout completion metadata sync failed', error instanceof Error ? error.message : 'unknown');
  }

  redirect('/signin?setup=complete');
}
