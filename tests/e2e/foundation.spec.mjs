import { test, expect } from '@playwright/test';

test('health endpoint reports Pie runtime status', async ({ request }) => {
  const response = await request.get('/api/health');
  const requirePublic = process.env.PIE_HEALTH_PUBLIC_REQUIRED === 'true';

  if (response.status() === 401 && !requirePublic) {
    const body = await response.json();
    expect(body.error).toMatch(/Authentication required/i);
    return;
  }

  expect([200, 503]).toContain(response.status());
  const body = await response.json();
  expect(body.service).toBe('pie');
  expect(['ok', 'degraded']).toContain(body.status);
  expect(body.checks?.app).toBe(true);
});

test('signup renders Pie auth with Google available', async ({ page }) => {
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByAltText(/Pie/i)).toBeVisible();
  await expect(page.getByText(/Create your Pie account/i)).toBeVisible();
  await expect(page.getByLabel(/Full name/i)).toBeVisible();
  await expect(page.getByLabel(/Phone number/i)).toBeVisible();
  await expect(page.getByLabel(/Email address/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue to Secure Signup/i })).toBeVisible();
});

test('signup local step advances to Clerk without creating an account', async ({ page }) => {
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await page.getByLabel(/Full name/i).fill('Pie Browser Test');
  await page.getByLabel(/Phone number/i).fill('+12025550123');
  await page.getByLabel(/Email address/i).fill('pie-browser-test@example.invalid');
  await page.getByRole('button', { name: /Continue to Secure Signup/i }).click();

  await expect(page.getByText(/Loading secure signup|Create your account|Secure signup is taking longer/i)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/SMS verification is deferred|Clerk Pro upgrade/i)).toHaveCount(0);
});

test('signin renders Clerk secure sign-in', async ({ page }) => {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByAltText(/Pie/i)).toBeVisible();
  await expect(page.getByText(/Sign in to your Pie account/i)).toBeVisible();
  await expect(page.getByText(/Sign in|Welcome back/i).first()).toBeVisible({ timeout: 20000 });
});

test('unauthenticated billing checkout is denied', async ({ request }) => {
  const response = await request.post('/api/billing/checkout', {
    data: { planId: 'release_planning' },
    headers: { 'Content-Type': 'application/json' },
  });
  const requirePublic = process.env.PIE_HEALTH_PUBLIC_REQUIRED === 'true';

  if (response.status() === 503 && !requirePublic) {
    const body = await response.json();
    expect(body.error).toMatch(/authentication is not configured/i);
    return;
  }

  expect([401, 403]).toContain(response.status());
});

test('onboarding does not expose trial setup to signed-out visitors', async ({ page }) => {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  expect(page.url()).toMatch(/\/signup|\/signin|\/onboarding/);
  await expect(page.getByRole('button', { name: /Continue to 7-Day Free Trial/i })).toHaveCount(0);
});
