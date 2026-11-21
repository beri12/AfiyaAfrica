import { navFor, can } from './nav';
import { qs } from './api';
import { ageFrom, fullName, money } from './format';
import { homeFor } from './auth';
import type { CurrentUser } from '@afyalink/shared';

describe('navFor', () => {
  const hrefs = (r: Parameters<typeof navFor>[0]) => navFor(r).map((i) => i.href);
  it('hides clinical records from receptionists and admins', () => {
    expect(hrefs('RECEPTIONIST')).not.toContain('/app/clinical');
    expect(hrefs('CLINIC_ADMIN')).not.toContain('/app/clinical');
    expect(hrefs('DOCTOR')).toContain('/app/clinical');
  });
  it('shows billing and staff only to clinic admins', () => {
    expect(hrefs('CLINIC_ADMIN')).toEqual(expect.arrayContaining(['/app/billing', '/app/staff']));
    expect(hrefs('DOCTOR')).not.toContain('/app/billing');
    expect(hrefs('LABORATORY_STAFF')).toEqual(['/app/lab', '/app/notifications', '/app/settings']);
  });
  it('can() reflects the shared matrix', () => {
    expect(can('RECEPTIONIST', 'patient:create')).toBe(true);
    expect(can(null, 'patient:create')).toBe(false);
  });
});

describe('helpers', () => {
  it('qs drops empty values', () => expect(qs({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y'));
  it('fullName joins parts', () => expect(fullName({ firstName: 'A', middleName: null, lastName: 'B' })).toBe('A B'));
  it('money formats cents', () => expect(money(2500)).toBe('$25'));
  it('ageFrom computes whole years', () => expect(ageFrom('2000-01-01')).toBeGreaterThanOrEqual(26));
});

describe('homeFor', () => {
  const base: CurrentUser = { id: '1', email: 'x', firstName: 'x', lastName: 'y', preferredLanguage: 'en', platformRoles: [], mfaEnabled: false, memberships: [] };
  const m = (role: CurrentUser['memberships'][number]['role']) => ({ clinicId: 'c', clinicName: 'C', clinicStatus: 'ACTIVE' as const, role });
  it('routes each role to the right home', () => {
    expect(homeFor({ ...base, platformRoles: ['PLATFORM_ADMIN'] })).toBe('/admin');
    expect(homeFor({ ...base, memberships: [m('DOCTOR')] })).toBe('/app/workspace');
    expect(homeFor({ ...base, memberships: [m('CLINIC_ADMIN')] })).toBe('/app/overview');
    expect(homeFor({ ...base, memberships: [m('PATIENT')] })).toBe('/portal');
    expect(homeFor({ ...base, memberships: [m('LABORATORY_STAFF')] })).toBe('/app/lab');
  });
});
