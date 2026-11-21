import { expect, test } from '@playwright/test';
import { activate, addisDate, apiLogin, PASSWORD, PLATFORM_EMAIL, PLATFORM_PASSWORD, run, signIn, signOut } from './helpers';

/**
 * Critical user journeys, run serially and sharing state:
 * clinic admin → platform approval → staff setup → receptionist → doctor → patient → authorization checks.
 */
test.describe.configure({ mode: 'serial' });

const clinicName = `E2E Clinic ${run}`;
const adminEmail = `admin.${run}@e2e.local`;
const doctorEmail = `doctor.${run}@e2e.local`;
const receptionEmail = `reception.${run}@e2e.local`;
const patientEmail = `patient.${run}@e2e.local`;
const patientLast = `Synthetic${run}`;
let doctorLink = '';
let receptionLink = '';
let patientLink = '';
let clinicId = '';

test('public site renders the hero and core sections', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Smarter Healthcare');
  await expect(page.getByText('Clinic operations still run on paper and memory')).toBeAttached();
  await page.getByRole('link', { name: 'Pricing' }).first().click();
  await expect(page).toHaveURL(/\/pricing/);
  const price = page.getByText('$60', { exact: false }).first();
  await price.scrollIntoViewIfNeeded();
  await expect(price).toBeVisible(); // revealed by the GSAP scroll animation
});

test('clinic administrator journey: register clinic', async ({ page }) => {
  await page.goto('/register-clinic?plan=PROFESSIONAL');
  await page.getByLabel('Clinic name').fill(clinicName);
  await page.getByLabel('Clinic phone').fill('0911000111');
  await page.getByLabel('Clinic email').fill(`clinic.${run}@e2e.local`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('First name').fill('Eve');
  await page.getByLabel('Last name').fill('Admin');
  await page.getByLabel('Your email').fill(adminEmail);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Submit registration' }).click();
  await expect(page.getByRole('heading', { name: 'Registration received' })).toBeVisible();

  await signIn(page, adminEmail);
  await expect(page.getByText('Clinic awaiting approval')).toBeVisible();
});

test('platform admin approves the clinic', async ({ page }) => {
  await signIn(page, PLATFORM_EMAIL, PLATFORM_PASSWORD);
  await page.goto('/admin/clinics');
  const row = page.getByRole('row', { name: new RegExp(clinicName) });
  await row.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByText(/Clinic approve/)).toBeVisible();
});

test('clinic admin sets up service and invites staff', async ({ page }) => {
  await signIn(page, adminEmail);
  await expect(page.getByRole('heading', { name: /Good day/ })).toBeVisible();

  await page.goto('/app/services');
  await page.getByRole('button', { name: 'Add service' }).first().click();
  await page.getByLabel('Name').fill('General consultation');
  await page.getByLabel('Duration (minutes)').fill('30');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('cell', { name: /General consultation/ })).toBeVisible();

  for (const [email, role, last] of [[doctorEmail, 'DOCTOR', 'Doctor'], [receptionEmail, 'RECEPTIONIST', 'Reception']] as const) {
    await page.goto('/app/staff');
    await page.getByRole('button', { name: 'Invite staff' }).click();
    const dlg = page.getByRole('dialog');
    await dlg.getByLabel('First name').fill('E2E');
    await dlg.getByLabel('Last name').fill(last);
    await dlg.getByLabel('Email').fill(email);
    await dlg.getByLabel('Role').selectOption(role);
    await dlg.getByRole('button', { name: 'Send invitation' }).click();
    const link = await page.getByRole('dialog').locator('p.font-mono').textContent();
    expect(link).toContain('/activate?token=');
    if (role === 'DOCTOR') doctorLink = link!;
    else receptionLink = link!;
    await page.keyboard.press('Escape');
  }

});

test('doctor activates and sets weekly availability', async ({ page }) => {
  await activate(page, doctorLink);
  await expect(page.getByRole('heading', { name: /workspace/ })).toBeVisible();
  // Every day 08:00–17:00 so the journey is weekday-independent.
  await page.goto('/app/doctors');
  await page.getByRole('button', { name: 'Edit availability' }).click();
  const dlg = page.getByRole('dialog');
  for (let d = 0; d < 7; d++) {
    await dlg.getByRole('button', { name: 'Add window' }).click();
    await dlg.getByLabel('Day').nth(d).selectOption(String(d));
    await dlg.getByLabel('Start time').nth(d).fill('08:00');
    await dlg.getByLabel('End time').nth(d).fill('17:00');
  }
  await dlg.getByRole('button', { name: 'Save availability' }).click();
  await expect(page.getByText('Availability saved')).toBeVisible();
});

test('receptionist journey: register patient and book appointment', async ({ page }) => {
  await activate(page, receptionLink);
  await page.goto('/app/patients/new');
  await page.getByLabel('First name').fill('Test');
  await page.getByLabel('Last name').fill(patientLast);
  await page.getByLabel('Date of birth').fill('1991-04-12');
  await page.getByLabel('Sex').selectOption('FEMALE');
  await page.getByLabel('Phone', { exact: true }).fill('0911 223 344');
  await page.getByLabel('Email', { exact: true }).fill(patientEmail);
  await page.getByRole('checkbox', { name: /Required/ }).check();
  await page.getByRole('button', { name: 'Register patient' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(patientLast) })).toBeVisible();
  await expect(page.getByText('+251911223344')).toBeVisible();

  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Service').selectOption({ label: 'General consultation (30 min)' });
  const book = page.getByRole('dialog');
  await book.getByLabel('Doctor').selectOption({ index: 1 });
  await book.getByLabel('Date').fill(addisDate(2));
  await book.getByRole('radio').first().click();
  await book.getByRole('button', { name: 'Book appointment' }).click();
  await expect(page.getByText('Appointment booked and confirmed')).toBeVisible();

  await page.getByRole('button', { name: 'Invite to portal' }).click();
  patientLink = (await page.getByRole('dialog').locator('p.font-mono').textContent())!;
  expect(patientLink).toContain('/activate?token=');
});

test('receptionist cannot open staff management or clinical notes', async ({ page, request }) => {
  await signIn(page, receptionEmail);
  await page.goto('/app/staff');
  await expect(page.getByText('No access')).toBeVisible();
  const token = await apiLogin(request, receptionEmail);
  const me = await request.get('/api/v1/auth/me', { headers: { Authorization: `Bearer ${token}` } });
  clinicId = (await me.json()).data.memberships[0].clinicId;
  const staff = await request.get('/api/v1/staff', { headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId } });
  expect(staff.status()).toBe(200); // staff:read is allowed…
  const invite = await request.post('/api/v1/staff', { headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId }, data: { email: 'x@e2e.local', firstName: 'X', lastName: 'Y', role: 'DOCTOR' } });
  expect(invite.status()).toBe(403); // …managing staff is not
  const notes = await request.get('/api/v1/clinical-notes', { headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': clinicId } });
  expect(notes.status()).toBe(403);
});

test('doctor journey: see patient, write and sign a note', async ({ page }) => {
  await signIn(page, doctorEmail);
  await expect(page.getByRole('heading', { name: /workspace/ })).toBeVisible();
  await page.goto('/app/patients');
  await page.getByRole('link', { name: new RegExp(patientLast) }).click();
  await page.getByRole('tab', { name: 'Clinical' }).click();
  await page.getByRole('link', { name: 'New note' }).click();
  await page.getByLabel('Chief complaint').fill('Cough for three days');
  await page.getByLabel('Plan').fill('Review in one week');
  await page.getByRole('button', { name: 'Save draft' }).click();
  await expect(page.getByText('Draft saved')).toBeVisible();
  await page.getByRole('button', { name: 'Review & sign' }).click();
  await page.getByRole('checkbox', { name: /I have reviewed this note/ }).check();
  await page.getByRole('button', { name: 'Sign note' }).click();
  await expect(page.getByText('Note signed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Amend' })).toBeVisible();
});

test('patient booking journey: activate portal and request an appointment', async ({ page }) => {
  await activate(page, patientLink);
  await expect(page.getByRole('heading', { name: /Hello/ })).toBeVisible();
  await page.goto('/portal/appointments');
  await page.getByRole('button', { name: 'Request appointment' }).first().click();
  const req = page.getByRole('dialog');
  await req.getByLabel('Service').selectOption({ index: 1 });
  await req.getByLabel('Doctor').selectOption({ index: 1 });
  await req.getByLabel('Date').fill(addisDate(3));
  await req.getByRole('radio').nth(1).click();
  await req.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText(/Request sent/)).toBeVisible();
  await expect(page.getByText('Pending').first()).toBeVisible();

  await signOut(page);
  await signIn(page, receptionEmail);
  await page.goto('/app/notifications');
  await expect(page.getByText('New appointment request').first()).toBeVisible();
});

test('cross-tenant access is blocked', async ({ request }) => {
  const token = await apiLogin(request, receptionEmail);
  const other = await request.post('/api/v1/clinics/register', {
    data: {
      clinic: { name: `Other ${run}`, city: 'Adama', phone: '+251911999000', email: `other.${run}@e2e.local` },
      admin: { firstName: 'O', lastName: 'Admin', email: `other.admin.${run}@e2e.local`, password: PASSWORD },
      acceptTerms: true,
    },
  });
  expect([201, 429]).toContain(other.status());
  test.skip(other.status() === 429, 'Registration endpoint rate-limited at the edge; rerun after a minute');
  const otherClinic = (await other.json()).data.clinicId as string;
  const r = await request.get('/api/v1/patients', { headers: { Authorization: `Bearer ${token}`, 'X-Clinic-Id': otherClinic } });
  expect(r.status()).toBe(403);

  const otherToken = await apiLogin(request, `other.admin.${run}@e2e.local`);
  const list = await request.get(`/api/v1/patients?q=${patientLast}`, { headers: { Authorization: `Bearer ${otherToken}`, 'X-Clinic-Id': clinicId } });
  expect(list.status()).toBe(403);
});

test('unauthenticated users are redirected and API rejects them', async ({ page, request }) => {
  await page.goto('/app/patients');
  await expect(page).toHaveURL(/\/sign-in\?next=/);
  expect((await request.get('/api/v1/patients')).status()).toBe(401);
});
