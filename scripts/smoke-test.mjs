const base = process.env.PIE_BASE_URL || 'https://ai-songs-drobinhood1.vercel.app';
const timeoutMs = Number(process.env.PIE_SMOKE_TIMEOUT_MS || 15000);
const expectedEnvironment = process.env.PIE_EXPECTED_ENVIRONMENT;
const expectedCommitSha = process.env.PIE_EXPECTED_COMMIT_SHA;
const expectedClerkMode = process.env.PIE_EXPECTED_CLERK_MODE;
const expectedStripeMode = process.env.PIE_EXPECTED_STRIPE_MODE;

function optionalBoolean(name) {
  const value = process.env[name];
  if (value === undefined) return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
}

const expectedPublic = optionalBoolean('PIE_EXPECTED_PUBLIC');
const expectedGated = optionalBoolean('PIE_EXPECTED_GATED');

function assertHealthContract(health) {
  const failures = [];
  const expect = (condition, message) => {
    if (!condition) failures.push(message);
  };

  expect(health?.service === 'pie', `service=${health?.service ?? 'missing'}`);
  expect(health?.status === 'ok', `status=${health?.status ?? 'missing'}`);
  expect(health?.ready === true, `ready=${String(health?.ready)}`);
  expect(health?.launch?.configurationReady === true, `configurationReady=${String(health?.launch?.configurationReady)}`);

  if (expectedEnvironment) expect(health?.environment === expectedEnvironment, `environment=${health?.environment ?? 'missing'} expected=${expectedEnvironment}`);
  if (expectedCommitSha) expect(health?.commitSha === expectedCommitSha, `commitSha=${health?.commitSha ?? 'missing'} expected=${expectedCommitSha}`);
  if (expectedClerkMode) expect(health?.modes?.clerk === expectedClerkMode, `clerk=${health?.modes?.clerk ?? 'missing'} expected=${expectedClerkMode}`);
  if (expectedStripeMode) expect(health?.modes?.stripe === expectedStripeMode, `stripe=${health?.modes?.stripe ?? 'missing'} expected=${expectedStripeMode}`);
  if (expectedPublic !== undefined) expect(health?.launch?.public === expectedPublic, `public=${String(health?.launch?.public)} expected=${expectedPublic}`);
  if (expectedGated !== undefined) expect(health?.launch?.gated === expectedGated, `gated=${String(health?.launch?.gated)} expected=${expectedGated}`);

  for (const [name, value] of Object.entries(health?.checks || {})) {
    expect(value === true, `check.${name}=${String(value)}`);
  }

  if (failures.length) throw new Error(`Health contract failed: ${failures.join(', ')}`);
}

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
    let ok = check.expect.includes(response.status);
    let detail = '';
    if (check.name === 'health') {
      try {
        const health = await response.json();
        assertHealthContract(health);
      } catch (error) {
        ok = false;
        detail = ` ${error instanceof Error ? error.message : String(error)}`;
      }
    }
    console.log(`${ok ? 'PASS' : 'FAIL'} ${check.name} ${response.status} ${ms}ms ${new URL(check.path, base)}`);
    if (detail) console.error(detail.trim());
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(`FAIL ${check.name} ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

if (failed) process.exit(1);
