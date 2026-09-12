// Validate Stripe's response before telling a customer that a downgrade is scheduled.
export function confirmsDowngrade(schedule: any, expected: {
  subscriptionId: string; currentPriceId: string; targetPriceId: string;
  effectiveAt: number; planId: string; userId: string;
}) {
  const subscriptionId = typeof schedule?.subscription === 'string'
    ? schedule.subscription : schedule?.subscription?.id;
  const phases = schedule?.phases;
  if (schedule?.status !== 'active' || schedule?.end_behavior !== 'release'
    || subscriptionId !== expected.subscriptionId || !Array.isArray(phases)) return false;
  const current = phases.find((phase: any) => phase.start_date < expected.effectiveAt
    && phase.end_date === expected.effectiveAt);
  const future = phases.find((phase: any) => phase.start_date === expected.effectiveAt);
  const matches = (phase: any, price: string) => phase?.items?.length === 1
    && (typeof phase.items[0].price === 'string' ? phase.items[0].price : phase.items[0].price?.id) === price
    && phase.items[0].quantity === 1 && phase.proration_behavior === 'none';
  return matches(current, expected.currentPriceId) && matches(future, expected.targetPriceId)
    && future.end_date > expected.effectiveAt
    && future.metadata?.pie_plan_id === expected.planId
    && future.metadata?.pie_user_id === expected.userId
    && phases.filter((phase: any) => phase.start_date >= expected.effectiveAt).length === 1;
}
