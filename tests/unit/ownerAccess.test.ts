import assert from 'node:assert/strict';
import test from 'node:test';
import { hasOwnerAccess } from '../../app/ownerAccess.ts';

test('production owner exemption is scoped to the production identity and environment', () => {
  assert.equal(hasOwnerAccess('user_3JFNRykFY9nfjkxHkVkUBvPA34P', 'production'), true);
  assert.equal(hasOwnerAccess('user_3JFNRykFY9nfjkxHkVkUBvPA34P', 'preview'), false);
  assert.equal(hasOwnerAccess('user_customer', 'production'), false);
  assert.equal(hasOwnerAccess('', 'production'), false);
});
test('preview Clerk account retains customer subscription behavior', () => {
  assert.equal(hasOwnerAccess('user_3JCFRuy8lxa1w0d7a59MAznPXBZ', 'preview'), false);
  assert.equal(hasOwnerAccess('user_3JCFRuy8lxa1w0d7a59MAznPXBZ', 'production'), false);
});
test('verified legacy owner is supported only in trusted deployment environments', () => {
  assert.equal(hasOwnerAccess('pie-primary', 'preview'), true);
  assert.equal(hasOwnerAccess('pie-primary', 'production'), true);
  assert.equal(hasOwnerAccess('pie-primary', 'development'), false);
  assert.equal(hasOwnerAccess('pie-primary', ''), false);
});
