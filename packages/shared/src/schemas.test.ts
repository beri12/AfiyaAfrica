import { createPatientSchema, phoneSchema, passwordSchema, setAvailabilitySchema, ROLE_PERMISSIONS, roleHasPermission } from './index';

describe('phoneSchema', () => {
  it('normalises Ethiopian local mobile numbers to E.164', () => {
    expect(phoneSchema.parse('0911 234 567')).toBe('+251911234567');
    expect(phoneSchema.parse('0711234567')).toBe('+251711234567');
  });
  it('rejects malformed numbers', () => {
    expect(phoneSchema.safeParse('12345').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('requires length and letters+digits', () => {
    expect(passwordSchema.safeParse('short1').success).toBe(false);
    expect(passwordSchema.safeParse('onlyletterslong').success).toBe(false);
    expect(passwordSchema.safeParse('Secure-pass-2026').success).toBe(true);
  });
});

describe('createPatientSchema', () => {
  const base = { firstName: 'Test', lastName: 'Patient', dateOfBirth: '1990-01-01', sex: 'FEMALE', dataProcessingConsent: true };
  it('requires data processing consent', () => {
    expect(createPatientSchema.safeParse({ ...base, dataProcessingConsent: false }).success).toBe(false);
    expect(createPatientSchema.safeParse(base).success).toBe(true);
  });
  it('rejects future dates of birth', () => {
    expect(createPatientSchema.safeParse({ ...base, dateOfBirth: '2999-01-01' }).success).toBe(false);
  });
  it('rejects unknown fields (mass assignment)', () => {
    expect(createPatientSchema.safeParse({ ...base, clinicId: 'x' }).success).toBe(false);
  });
});

describe('setAvailabilitySchema', () => {
  it('rejects overlapping windows on the same day', () => {
    const r = setAvailabilitySchema.safeParse({
      windows: [
        { dayOfWeek: 1, startMinute: 480, endMinute: 720 },
        { dayOfWeek: 1, startMinute: 700, endMinute: 900 },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('permission matrix', () => {
  it('denies clinical access to receptionists and clinic admins', () => {
    expect(roleHasPermission('RECEPTIONIST', 'clinical:read')).toBe(false);
    expect(roleHasPermission('CLINIC_ADMIN', 'clinical:read')).toBe(false);
    expect(roleHasPermission('DOCTOR', 'clinical:read')).toBe(true);
  });
  it('gives patients only self-service permissions', () => {
    expect(ROLE_PERMISSIONS.PATIENT).toEqual(['portal:self', 'notification:read']);
  });
});
