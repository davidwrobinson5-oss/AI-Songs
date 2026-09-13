import assert from 'node:assert/strict';
import test from 'node:test';
import { musicUsageUnitsForDurationMs } from '../../app/billingConfig.ts';

test('music usage preserves the four-credit price through three minutes', () => {
  assert.equal(musicUsageUnitsForDurationMs(30_000), 1);
  assert.equal(musicUsageUnitsForDurationMs(180_000), 1);
});

test('music usage adds a metered block after each three-minute boundary', () => {
  assert.equal(musicUsageUnitsForDurationMs(180_001), 2);
  assert.equal(musicUsageUnitsForDurationMs(300_000), 2);
  assert.equal(musicUsageUnitsForDurationMs(600_000), 4);
});

test('music usage fails safely for invalid duration values', () => {
  assert.equal(musicUsageUnitsForDurationMs(undefined), 1);
  assert.equal(musicUsageUnitsForDurationMs('not-a-number'), 1);
  assert.equal(musicUsageUnitsForDurationMs(-1), 1);
});
