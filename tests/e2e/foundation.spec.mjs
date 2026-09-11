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

test('signup renders current Pie email-first auth', async ({ page }) => {
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByAltText(/Pie/i)).toBeVisible();
  await expect(page.getByText(/Create your Pie account/i)).toBeVisible();
  await expect(page.getByLabel(/Full name/i)).toBeVisible();
  await expect(page.getByLabel(/Phone number/i)).toBeVisible();
  await expect(page.getByLabel(/Email address/i)).toBeVisible();
  await expect(page.locator('input[autocomplete="new-password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Create Pie Account/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toHaveCount(0);
});

test('signup plan selection updates locally without creating an account', async ({ page }) => {
  await page.goto('/signup', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Hot Prospect/i })).toBeVisible();
  const talentShowPlan = page.getByRole('button', { name: /Talent Show Boss/i });
  await expect(talentShowPlan).toBeVisible();
  await talentShowPlan.click();
  await expect(page.getByText(/then \$19\/month unless canceled/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Create Pie Account/i })).toBeVisible();
});

test('signin renders password, passkey, and phone recovery without Google', async ({ page }) => {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await expect(page.getByAltText(/Pie/i)).toBeVisible();
  await expect(page.getByText(/Sign in to your Pie account/i)).toBeVisible();
  await expect(page.getByLabel(/Email address/i)).toBeVisible();
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Sign In$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Use a Passkey/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Sign In with Phone Code/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Continue with Google/i })).toHaveCount(0);
});

test('phone recovery opens verified-phone SMS flow', async ({ page }) => {
  await page.goto('/signin', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Sign In with Phone Code/i }).click();
  await expect(page.getByText(/Sign in with your phone/i)).toBeVisible();
  await expect(page.getByLabel(/Phone number/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Text Me a Sign-In Code/i })).toBeVisible();
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

test('Stripe webhook reaches signature verification without customer auth', async ({ request }) => {
  const response = await request.post('/api/billing/webhook', {
    data: '{}',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://hooks.stripe.com',
      'stripe-signature': 't=1,v1=invalid',
    },
  });
  expect([400, 503]).toContain(response.status());
});

test('onboarding does not expose trial setup to signed-out visitors', async ({ page }) => {
  await page.goto('/onboarding', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  expect(page.url()).toMatch(/\/signup|\/signin|\/onboarding/);
  await expect(page.getByRole('button', { name: /Continue to 7-Day Free Trial/i })).toHaveCount(0);
});
