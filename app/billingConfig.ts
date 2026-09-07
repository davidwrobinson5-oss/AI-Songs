export type PiePlan = {
  id: string;
  level: number;
  name: string;
  stage: string;
  monthlyPrice: number;
  outcome: string;
  unlocks: string[];
  paymentLink?: string;
};

export const TRIAL_DAYS = 7;
export const DEFAULT_PLAN_ID = 'release_planning';

export const PIE_PLANS: PiePlan[] = [
  { id: 'release_planning', level: 2, name: 'Hot Prospect', stage: 'Planning a Release', monthlyPrice: 9, outcome: 'Turn a finished song into a release-ready project.', unlocks: ['Release planning', 'Calendar', 'Licensing + legal basics'], paymentLink: 'https://buy.stripe.com/test_eVq5kD3Qo7Lo9vY99Ha3u00' },
  { id: 'prelaunch', level: 3, name: 'Talent Show Boss', stage: 'Prelaunch', monthlyPrice: 19, outcome: 'Build audience, assets, and momentum before release day.', unlocks: ['Everything in Hot Prospect', 'Marketing', 'Data starter access', 'Fan database', 'Video planning', 'Merch planning'], paymentLink: 'https://buy.stripe.com/test_dRmdR9aeMghUgYqfy5a3u01' },
  { id: 'launch', level: 4, name: 'Local Hero', stage: 'Launch', monthlyPrice: 29, outcome: 'Coordinate distribution, content, outreach, and release day.', unlocks: ['Everything in Talent Show Boss', 'Distribution coordination', 'Launch workflows', 'Release tracking', 'Expanded Data access'], paymentLink: 'https://buy.stripe.com/test_8x2dR93Qo1n037AbhPa3u02' },
  { id: 'campaign', level: 5, name: 'Regional Hit', stage: 'Campaign', monthlyPrice: 49, outcome: 'Run a measurable 6–12 week growth campaign.', unlocks: ['Everything in Local Hero', 'Campaign system', 'Business', 'Accounting', 'Advanced merch campaigns', 'Campaign Data access'], paymentLink: 'https://buy.stripe.com/test_fZueVd4Us0iWfUmgC9a3u03' },
  { id: 'gigs', level: 6, name: 'National Hitmaker', stage: 'Gigs', monthlyPrice: 79, outcome: 'Turn audience growth into live revenue and repeat bookings.', unlocks: ['Everything in Regional Hit', 'Gigs', 'Band', 'Travel', 'Tour merch + settlement', 'Booking + venue Data'], paymentLink: 'https://buy.stripe.com/test_28E14nfz6e9M9vY3Pna3u04' },
  { id: 'national', level: 7, name: 'International Rock Star', stage: 'Local to National', monthlyPrice: 129, outcome: 'Scale proven markets into a repeatable national system.', unlocks: ['Everything in National Hitmaker', 'Market expansion', 'Regional/national routing', 'Team + business scaling', 'National-scale Data'], paymentLink: 'https://buy.stripe.com/test_9B65kDdqYc1EgYqeu1a3u05' },
  { id: 'international', level: 8, name: 'World Legend', stage: 'National to International', monthlyPrice: 199, outcome: 'Operate releases, touring, rights, and partnerships globally.', unlocks: ['Everything in International Rock Star', 'International campaigns', 'Global touring', 'Global rights + business operations', 'International Data access'], paymentLink: 'https://buy.stripe.com/test_14A28r72A9Tw9vYclTa3u06' },
];

export const TRIAL_LIMITS = {
  musicGenerationsTotal: 3,
  voiceRendersTotal: 3,
  videoGenerationsTotal: 1,
  audioAnalysisJobsTotal: 3,
  songScoresTotal: 5,
  originalityScoresTotal: 3,
  otherMeteredAiJobsTotal: 10,
  outputQuality: 'standard',
} as const;

// Compatibility alias for older imports. Pie no longer offers a permanent free subscription.
export const FREE_LIMITS = TRIAL_LIMITS;

export function planById(id: string | null | undefined) {
  return PIE_PLANS.find((plan) => plan.id === id) || PIE_PLANS[0];
}
