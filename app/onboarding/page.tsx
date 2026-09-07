import OnboardingClient from './OnboardingClient';

function clerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

export default function OnboardingPage() {
  if (!clerkConfigured()) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#07080c', color: '#fff' }}>
        <section style={{ width: 'min(100%, 560px)', padding: 22, borderRadius: 18, border: '1px solid #2c2f38', background: '#11131a', textAlign: 'center' }}>
          <strong>Customer onboarding is not configured on this deployment.</strong>
          <p style={{ margin: '8px 0 0', color: '#9fa1ae', fontSize: 13, lineHeight: 1.5 }}>
            Use a deployment with Clerk server credentials enabled for signup and trial checkout testing.
          </p>
        </section>
      </main>
    );
  }

  return <OnboardingClient />;
}
