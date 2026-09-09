import { createHash } from 'node:crypto';

const secretKey = process.env.CLERK_SECRET_KEY || '';
if (!secretKey) throw new Error('CLERK_SECRET_KEY is not available in this Preview build.');
const expectedEmailHash = '75d257c88a4de7efeadc28ceb0706954b2c2aba590f567cc44fe5987aa9d0dbc';
const expectedPhoneHash = 'ef22faeb7b07fc52cff6c7bb561dc9d61d8a032be95724e016428181a316d799';
const baseUrl = 'https://api.clerk.com/v1';
const hash = (v) => createHash('sha256').update(String(v || '').trim().toLowerCase()).digest('hex');
const phoneHash = (v) => createHash('sha256').update(String(v || '').trim()).digest('hex');
async function clerk(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!response.ok) throw new Error(`Clerk API ${response.status}: ${(await response.text()).slice(0,500)}`);
  if (response.status === 204) return null;
  const text = await response.text(); return text ? JSON.parse(text) : null;
}
async function listUsers() {
  const users = []; const limit = 100;
  for (let offset=0; offset<10000; offset+=limit) {
    const page = await clerk(`/users?limit=${limit}&offset=${offset}`);
    const rows = Array.isArray(page) ? page : (page?.data || []); users.push(...rows); if (rows.length < limit) break;
  }
  return users;
}
const matchesTarget = (user) => (user.email_addresses || []).some((e)=>hash(e.email_address)===expectedEmailHash) || (user.phone_numbers || []).some((p)=>phoneHash(p.phone_number)===expectedPhoneHash);
const before = await listUsers(); const targets = before.filter(matchesTarget);
if (targets.length > 2) throw new Error(`Safety stop: unexpectedly found ${targets.length} matching users.`);
console.log(`[Pie reset] Matching Clerk users before deletion: ${targets.length}`);
for (const user of targets) { await clerk(`/users/${encodeURIComponent(user.id)}`, { method:'DELETE' }); console.log(`[Pie reset] Deleted Clerk user ${user.id}`); }
const remaining = (await listUsers()).filter(matchesTarget);
if (remaining.length) throw new Error(`[Pie reset] Verification failed: ${remaining.length} matching Clerk user(s) remain.`);
console.log('[Pie reset] Verified: target email/phone identifiers are no longer attached to any Clerk user.');