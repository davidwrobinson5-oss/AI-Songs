import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmsDowngrade } from '../../app/billingSchedule.ts';

const expected = { subscriptionId: 'sub_test', currentPriceId: 'price_19', targetPriceId: 'price_9', effectiveAt: 200, planId: 'release_planning', userId: 'user_test' };
const schedule = () => ({ status: 'active', end_behavior: 'release', subscription: 'sub_test', phases: [
  { start_date: 100, end_date: 200, items: [{ price: 'price_19', quantity: 1 }], proration_behavior: 'none', metadata: {} },
  { start_date: 200, end_date: 300, items: [{ price: 'price_9', quantity: 1 }], proration_behavior: 'none', metadata: { pie_plan_id: 'release_planning', pie_user_id: 'user_test' } },
] });

test('confirms the unchanged current tier and downgrade at renewal', () => {
  assert.equal(confirmsDowngrade(schedule(), expected), true);
});

test('does not confirm an early downgrade, wrong customer, or canceling schedule', () => {
  for (const mutate of [
    (s: any) => { s.phases[1].start_date = 199; },
    (s: any) => { s.subscription = 'sub_other'; },
    (s: any) => { s.end_behavior = 'cancel'; },
    (s: any) => { s.phases[0].items[0].price = 'price_9'; },
    (s: any) => { s.phases[1].proration_behavior = 'create_prorations'; },
    (s: any) => { s.phases[1].metadata.pie_user_id = 'user_other'; },
    (s: any) => { s.phases[1].items[0].quantity = 2; },
    (s: any) => { s.phases.push({ ...s.phases[1], start_date: 300, end_date: 400 }); },
  ]) {
    const value = schedule();
    mutate(value);
    assert.equal(confirmsDowngrade(value, expected), false);
  }
});

test('does not confirm missing or incomplete Stripe responses', () => {
  for (const value of [null, {}, { ...schedule(), phases: [] }]) {
    assert.equal(confirmsDowngrade(value, expected), false);
  }
});
