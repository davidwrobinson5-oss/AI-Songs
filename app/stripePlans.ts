import { pieDeploymentTarget, stripeSecretMode } from './deploymentEnvironment';

const TEST_PRICE_BY_PLAN = {
  release_planning: { priceId: 'price_1UC0VzGnh6vO8OMLvPvwc5pX', level: 2 },
  prelaunch: { priceId: 'price_1UC0W7Gnh6vO8OMLtkDefW54', level: 3 },
  launch: { priceId: 'price_1UC0WGGnh6vO8OMLTjv4lQpA', level: 4 },
  campaign: { priceId: 'price_1UC0WPGnh6vO8OMLf2Dtnuwf', level: 5 },
  gigs: { priceId: 'price_1UC0WbGnh6vO8OMLdDzJKJcJ', level: 6 },
  national: { priceId: 'price_1UC0WlGnh6vO8OMLaDaGHl4H', level: 7 },
  international: { priceId: 'price_1UC0WsGnh6vO8OMLboLKsv3o', level: 8 },
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

export function stripePlanConfigurationReady() {
  if (pieDeploymentTarget() !== 'production') return true;
  return Object.values(configuredPriceByPlan).every((plan) => /^price_[A-Za-z0-9]+$/.test(plan.priceId));
}

export function stripeEnvironmentSafe() {
  const mode = stripeSecretMode();
  if (pieDeploymentTarget() === 'production') return mode === 'live' && stripePlanConfigurationReady();
  return mode === 'test';
}

