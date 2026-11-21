import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PLATFORM_EMAIL = process.env.E2E_PLATFORM_EMAIL ?? 'admin@afyalink.local';
export const PLATFORM_PASSWORD = process.env.E2E_PLATFORM_PASSWORD ?? 'Platform-admin-2026';
export const PASSWORD = 'E2e-password-2026';
export const run = Date.now().toString(36);

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  // Fill after hydration and verify, so a late hydration pass cannot discard input.
  await expect(async () => {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await expect(page.getByLabel('Email')).toHaveValue(email, { timeout: 500 });
  }).toPass({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(/\/(app|admin|portal)/);
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

/** Activates an invited account through the UI. */
export async function activate(page: Page, url: string) {
  await page.context().clearCookies();
  await page.goto(new URL(url).pathname + new URL(url).search, { waitUntil: 'networkidle' });
  await page.getByLabel('New password').fill(PASSWORD);
  await page.getByLabel('Confirm password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Activate and sign in' }).click();
  await page.waitForURL(/\/(app|portal)/);
}

/** Direct API login for assertions that bypass the UI (authorization tests). */
export async function apiLogin(request: APIRequestContext, email: string, password = PASSWORD): Promise<string> {
  // Edge rate limiting (10 logins/min/IP) is expected in production-like stacks: back off and retry.
  for (let attempt = 0; attempt < 8; attempt++) {
    const r = await request.post('/api/v1/auth/login', { data: { email, password } });
    if (r.status() === 429) {
      await new Promise((res) => setTimeout(res, 7_000));
      continue;
    }
    expect(r.status()).toBe(200);
    return (await r.json()).data.accessToken as string;
  }
  throw new Error('Login rate-limited for too long');
}

/** Clinic-local (UTC+3) date string N days ahead. */
export function addisDate(daysAhead: number): string {
  const d = new Date(Date.now() + 3 * 3_600_000 + daysAhead * 86_400_000);
  return d.toISOString().slice(0, 10);
}
