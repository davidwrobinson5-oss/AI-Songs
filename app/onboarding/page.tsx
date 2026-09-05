export default function OnboardingPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20, background: '#08090d', color: '#fff' }}>
      <section style={{ width: 'min(100%,520px)', padding: 24, borderRadius: 22, background: '#12141c', border: '1px solid #2e3040', textAlign: 'center' }}>
        <img src="/pieinears-horizontal.svg" alt="Pie" style={{ display: 'block', width: 'min(100%,420px)', height: 'auto', margin: '0 auto 16px' }} />
        <h1 style={{ margin: '8px 0' }}>Pie is in private studio mode.</h1>
        <p style={{ color: '#a7a8b5', lineHeight: 1.55 }}>
          New-account onboarding is temporarily paused while the private studio uses its independent authentication path. This keeps Pie usable even if the account provider is unavailable.
        </p>
        <a href="/login" style={{ display: 'inline-grid', placeItems: 'center', minHeight: 48, padding: '0 18px', borderRadius: 13, background: '#7c3aed', color: '#fff', fontWeight: 900, textDecoration: 'none' }}>
          Go to Private Studio Login
        </a>
      </section>
    </main>
  );
}
