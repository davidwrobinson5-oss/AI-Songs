import ClerkCompleteClient from './ClerkCompleteClient';

function clerkEnabled() {
  return Boolean(
    process.env.PIE_ENABLE_CLERK === '1' &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.CLERK_SECRET_KEY,
  );
}

export default function OnboardingCompletePage() {
  if (clerkEnabled()) return <ClerkCompleteClient />;

  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#08090d', color: '#fff' }}>
      <section style={{ width: 'min(100%,480px)', padding: 24, borderRadius: 22, background: '#12141c', border: '1px solid #2e3040', textAlign: 'center' }}>
        <div style={{ fontSize: 42 }}>🥧</div>
        <h1 style={{ margin: '10px 0 8px' }}>Pie is in private studio mode.</h1>
        <p style={{ color: '#a7a8b5', lineHeight: 1.55 }}>
          Account onboarding is temporarily disabled while Pie uses private studio authentication.
        </p>
        <a href="/login" style={{ display: 'inline-grid', placeItems: 'center', minHeight: 48, padding: '0 18px', borderRadius: 13, background: '#7c3aed', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
          Go to Private Studio Login
        </a>
      </section>
    </main>
  );
}
