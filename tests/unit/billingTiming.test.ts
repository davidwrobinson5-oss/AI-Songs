import test from 'node:test';
import assert from 'node:assert/strict';
import { billingTiming } from '../../app/billingTiming.ts';
test('uses the supplied simulated date for the remaining billing days', () => {
  const start = Date.parse('2027-04-12T00:00:00Z') / 1000;
  const end = Date.parse('2027-05-12T00:00:00Z') / 1000;
  assert.equal(billingTiming(start, end, start + 86400)?.daysRemaining, 29);
  assert.equal(billingTiming(start, end, end)?.daysRemaining, 0);
  assert.equal(billingTiming(start, end, end + 86400)?.daysElapsed, 30);
});
test('rejects an invalid clock or billing interval', () => {
  assert.equal(billingTiming(100, 200, 99), null);
  assert.equal(billingTiming(200, 100, 300), null);
  assert.equal(billingTiming(100, 200, NaN), null);
});
