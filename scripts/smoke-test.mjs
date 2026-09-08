const base = process.env.PIE_BASE_URL || 'https://ai-songs-drobinhood1.vercel.app';
const timeoutMs = Number(process.env.PIE_SMOKE_TIMEOUT_MS || 15000);

const checks = [
  { name: 'home', path: '/', expect: [200, 307, 308] },
  { name: 'signup', path: '/signup', expect: [200, 307, 308] },
  { name: 'signin', path: '/signin', expect: [200, 307, 308] },
  { name: 'health', path: '/api/health', expect: [200] },
];

let failed = false;
for (const check of checks) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const response = await fetch(new URL(check.path, base), {
      redirect: 'manual',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'user-agent': 'PieSmokeTest/1.0' },
    });
    const ms = Date.now() - started;
    const ok = check.expect.includes(response.status);
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name} ${response.status} ${ms}ms ${new URL(check.path, base)}`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`FAIL ${check.name} ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

if (failed) process.exit(1);
