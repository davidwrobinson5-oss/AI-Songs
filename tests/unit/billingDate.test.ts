import assert from 'node:assert/strict';
import test from 'node:test';
import { formatBillingDate } from '../../app/billingDate.ts';

test('formats a date-only billing boundary without shifting it backward', () => {
  assert.equal(formatBillingDate('2026-11-11'), '11/11/2026');
});

test('formats a timestamp using the UTC billing date', () => {
  assert.equal(formatBillingDate('2026-11-11T00:00:00.000Z'), '11/11/2026');
});

test('returns an empty label for missing or invalid dates', () => {
  assert.equal(formatBillingDate(null), '');
  assert.equal(formatBillingDate('not-a-date'), '');
});
