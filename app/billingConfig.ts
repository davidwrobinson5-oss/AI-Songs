export type PiePlan = {
  id: string;
  level: number;
  name: string;
  monthlyPrice: number;
  outcome: string;
  unlocks: string[];
  paymentLink?: string;
};

export const PIE_PLANS: PiePlan[] = [
  { id: 'fun', level: 1, name: 'Create for Fun', monthlyPrice: 0, outcome: 'Create, experiment, and finish songs.', unlocks: ['Limited free generations', 'Standard-quality outputs', 'Music', 'Voice', 'Songs', 'Mix', 'Basic Sheets'] },
  { id: 'release_planning', level: 2, name: 'Planning a Release', monthlyPrice: 9, outcome: 'Turn a finished song into a release-ready project.', unlocks: ['Everything in Stage 1', 'Release planning', 'Calendar', 'Licensing + legal basics'], paymentLink: 'https://buy.stripe.com/test_eVq5kD3Qo7Lo9vY99Ha3u00' },
  { id: 'prelaunch', level: 3, name: 'Prelaunch', monthlyPrice: 19, outcome: 'Build audience, assets, and momentum before release day.', unlocks: ['Everything in Stages 1–2', 'Marketing', 'Fan database', 'Video planning', 'Merch planning'], paymentLink: 'https://buy.stripe.com/test_dRmdR9aeMghUgYqfy5a3u01' },
  { id: 'launch', level: 4, name: 'Launch', monthlyPrice: 29, outcome: 'Coordinate distribution, content, outreach, and release day.', unlocks: ['Everything in Stages 1–3', 'Distribution coordination', 'Launch workflows', 'Release tracking'], paymentLink: 'https://buy.stripe.com/test_8x2dR93Qo1n037AbhPa3u02' },
  { id: 'campaign', level: 5, name: 'Campaign', monthlyPrice: 49, outcome: 'Run a measurable 6–12 week growth campaign.', unlocks: ['Everything in Stages 1–4', 'Campaign system', 'Business', 'Accounting', 'Advanced merch campaigns'], paymentLink: 'https://buy.stripe.com/test_fZueVd4Us0iWfUmgC9a3u03' },
  { id: 'gigs', level: 6, name: 'Gigs', monthlyPrice: 79, outcome: 'Turn audience growth into live revenue and repeat bookings.', unlocks: ['Everything in Stages 1–5', 'Gigs', 'Band', 'Travel', 'Tour merch + settlement'], paymentLink: 'https://buy.stripe.com/test_28E14nfz6e9M9vY3Pna3u04' },
  { id: 'national', level: 7, name: 'Local to National', monthlyPrice: 129, outcome: 'Scale proven markets into a repeatable national system.', unlocks: ['Everything in Stages 1–6', 'Market expansion', 'Regional/national routing', 'Team + business scaling'], paymentLink: 'https://buy.stripe.com/test_9B65kDdqYc1EgYqeu1a3u05' },
  { id: 'international', level: 8, name: 'National to International', monthlyPrice: 199, outcome: 'Operate releases, touring, rights, and partnerships globally.', unlocks: ['Everything in Stages 1–7', 'International campaigns', 'Global touring', 'Global rights + business operations'], paymentLink: 'https://buy.stripe.com/test_14A28r72A9Tw9vYclTa3u06' },
];

export const FREE_LIMITS = {
  musicGenerationsPerMonth: 5,
  videoPlansPerMonth: 2,
  songScoresPerMonth: 5,
  originalityScoresPerMonth: 3,
  outputQuality: 'standard',
} as const;

export function planById(id: string | null | undefined) {
  return PIE_PLANS.find((plan) => plan.id === id) || PIE_PLANS[0];
}
