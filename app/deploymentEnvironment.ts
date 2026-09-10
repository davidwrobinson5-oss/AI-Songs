export type PieDeploymentTarget = 'development' | 'preview' | 'staging' | 'production';

export function pieDeploymentTarget(): PieDeploymentTarget {
  const target = (process.env.VERCEL_TARGET_ENV || process.env.VERCEL_ENV || '').trim().toLowerCase();
  if (target === 'production') return 'production';
  if (target === 'staging') return 'staging';
  if (target === 'preview') return 'preview';
  return 'development';
}

export function piePublicLaunchEnabled() {
  return process.env.PIE_PUBLIC_LAUNCH?.trim().toLowerCase() === 'true';
}

export function pieProductionConfigurationReady() {
  if (pieDeploymentTarget() !== 'production') return true;
  const required = [
    process.env.AI_SONGS_PASSWORD,
    process.env.AI_SONGS_SESSION_SECRET,
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    process.env.CLERK_SECRET_KEY,
    process.env.STRIPE_SECRET_KEY,
    process.env.STRIPE_WEBHOOK_SECRET,
    process.env.STRIPE_PRICE_RELEASE_PLANNING,
    process.env.STRIPE_PRICE_PRELAUNCH,
    process.env.STRIPE_PRICE_LAUNCH,
    process.env.STRIPE_PRICE_CAMPAIGN,
    process.env.STRIPE_PRICE_GIGS,
    process.env.STRIPE_PRICE_NATIONAL,
    process.env.STRIPE_PRICE_INTERNATIONAL,
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY,
    process.env.OPENAI_API_KEY,
    process.env.MAPBOX_ACCESS_TOKEN,
  ];
  return required.every((value) => Boolean(value?.trim()))
    && (process.env.AI_SONGS_PASSWORD?.length || 0) >= 12
    && (process.env.AI_SONGS_SESSION_SECRET?.length || 0) >= 32
    && clerkKeyMode() === 'live'
    && stripeSecretMode() === 'live';
}

export function pieLaunchGateEnabled() {
  return pieDeploymentTarget() === 'production'
    && (!piePublicLaunchEnabled() || !pieProductionConfigurationReady());
}

export function stripeSecretMode() {
  const secret = process.env.STRIPE_SECRET_KEY?.trim() || '';
  if (secret.startsWith('sk_live_')) return 'live' as const;
  if (secret.startsWith('sk_test_')) return 'test' as const;
  return 'missing' as const;
}

export function clerkKeyMode() {
  const publishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() || '';
  const secret = process.env.CLERK_SECRET_KEY?.trim() || '';
  if (!publishable || !secret) return 'missing' as const;
  if (publishable.startsWith('pk_live_') && secret.startsWith('sk_live_')) return 'live' as const;
  if (publishable.startsWith('pk_test_') && secret.startsWith('sk_test_')) return 'test' as const;
  return 'mismatch' as const;
}
