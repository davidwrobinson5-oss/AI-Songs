import { pieDeploymentTarget, stripeSecretMode } from './deploymentEnvironment';

// Preview uses a dedicated Stripe test catalog; Production never falls back to these IDs.
const TEST_PRICE_BY_PLAN = {
  release_planning: { priceId: 'price_1UEZoKGthW0xzGswohEcWSUS', level: 2 },
  prelaunch: { priceId: 'price_1UEZoPGthW0xzGswk2qNGV5H', level: 3 },
  launch: { priceId: 'price_1UEZoWGthW0xzGswoOF72y84', level: 4 },
  campaign: { priceId: 'price_1UEZoaGthW0xzGsw7YIKucaL', level: 5 },
  gigs: { priceId: 'price_1UEZoeGthW0xzGsw7BydvjoQ', level: 6 },
  national: { priceId: 'price_1UEZojGthW0xzGsw68pvnSbJ', level: 7 },
  international: { priceId: 'price_1UEZoqGthW0xzGswW1U7ausC', level: 8 },
} as const;

const configuredPriceByPlan = {
  release_planning: { priceId: process.env.STRIPE_PRICE_RELEASE_PLANNING?.trim() || '', level: 2 },
  prelaunch: { priceId: process.env.STRIPE_PRICE_PRELAUNCH?.trim() || '', level: 3 },
  launch: { priceId: process.env.STRIPE_PRICE_LAUNCH?.trim() || '', level: 4 },
  campaign: { priceId: process.env.STRIPE_PRICE_CAMPAIGN?.trim() || '', level: 5 },
  gigs: { priceId: process.env.STRIPE_PRICE_GIGS?.trim() || '', level: 6 },
  national: { priceId: process.env.STRIPE_PRICE_NATIONAL?.trim() || '', level: 7 },
  international: { priceId: process.env.STRIPE_PRICE_INTERNATIONAL?.trim() || '', level: 8 },
} as const;

export type PiePlanId = keyof typeof configuredPriceByPlan;

export function stripePlan(planId: string) {
  if (!(planId in configuredPriceByPlan)) return null;
  const id = planId as PiePlanId;
  const configured = configuredPriceByPlan[id];
  if (configured.priceId) return configured;
  if (pieDeploymentTarget() !== 'production') return TEST_PRICE_BY_PLAN[id];
  return null;
}

export function stripePlanIdForPrice(priceId: string) {
  for (const planId of Object.keys(configuredPriceByPlan) as PiePlanId[]) {
    if (stripePlan(planId)?.priceId === priceId) return planId;
  }
  return null;
}

export function stripePlanConfigurationReady() {
  if (pieDeploymentTarget() !== 'production') return true;
  return Object.values(configuredPriceByPlan).every((plan) => /^price_[A-Za-z0-9]+$/.test(plan.priceId));
}

export function stripeEnvironmentSafe() {
  const mode = stripeSecretMode();
  if (pieDeploymentTarget() === 'production') return mode === 'live' && stripePlanConfigurationReady();
  return mode === 'test';
}
