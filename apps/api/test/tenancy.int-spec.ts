import {
  as,
  createClinicWorld,
  createPlatformAdmin,
  createTestApp,
  login,
  PASSWORD,
  registerPatient,
  resetDb,
  addisTime,
  type ClinicWorld,
  type Session,
  type TestCtx,
} from './helpers';

describe('Tenant isolation & RBAC (integration)', () => {
  let ctx: TestCtx;
  let platform: Session;
  let A: ClinicWorld;
  let B: ClinicWorld;
  let patientA: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    platform = await createPlatformAdmin(ctx);
    A = await createClinicWorld(ctx, platform, 'Clinic Alpha');
    B = await createClinicWorld(ctx, platform, 'Clinic Beta');
    patientA = await registerPatient(ctx, A.receptionist);
  });
  afterAll(async () => ctx.app.close());

  it('requires the clinic header for tenant routes', async () => {
    await as(ctx, A.admin, '').get('/patients').expect(400);
    await as(ctx, A.admin, 'not-a-uuid').get('/patients').expect(400);
  });

  it('blocks access to another clinic by switching the header', async () => {
    const r = await as(ctx, A.admin, B.clinicId).get('/patients');
    expect(r.status).toBe(403);
    await as(ctx, A.receptionist, B.clinicId).post('/patients', {}).expect(403);
  });

  it("cannot read another clinic's patient by id, even with own clinic header", async () => {
    await as(ctx, B.admin).get(`/patients/${patientA.id}`).expect(404);
    await as(ctx, B.receptionist).patch(`/patients/${patientA.id}`, { firstName: 'Hacked' }).expect(404);
    await as(ctx, B.admin).post(`/patients/${patientA.id}/consents`, { type: 'SMS_REMINDERS', granted: false }).expect(404);
    const list = await as(ctx, B.admin).get('/patients').expect(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).not.toContain(patientA.id);
  });

  it("cannot book an appointment with another clinic's patient, doctor or service", async () => {
    const startAt = addisTime(2, 10);
    await as(ctx, B.receptionist)
      .post('/appointments', { patientId: patientA.id, doctorId: B.doctor.doctorId, serviceId: B.serviceId, startAt })
      .expect(404);
    const pB = await registerPatient(ctx, B.receptionist);
    await as(ctx, B.receptionist)
      .post('/appointments', { patientId: pB.id, doctorId: A.doctor.doctorId, serviceId: B.serviceId, startAt })
      .expect(404);
    await as(ctx, B.receptionist)
      .post('/appointments', { patientId: pB.id, doctorId: B.doctor.doctorId, serviceId: A.serviceId, startAt })
      .expect(404);
  });

  it('rejects mass-assignment of tenant ids', async () => {
    const r = await as(ctx, A.receptionist).post('/patients', {
      firstName: 'X',
      lastName: 'Y',
      dateOfBirth: '1990-01-01',
      sex: 'MALE',
      dataProcessingConsent: true,
      clinicId: B.clinicId,
    });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('audit logs are tenant scoped', async () => {
    const a = await as(ctx, A.admin).get('/audit-logs?pageSize=100').expect(200);
    const b = await as(ctx, B.admin).get('/audit-logs?pageSize=100').expect(200);
    const aIds = new Set(a.body.data.map((x: { id: string }) => x.id));
    expect(b.body.data.some((x: { id: string }) => aIds.has(x.id))).toBe(false);
    expect(a.body.data.some((x: { entityId: string }) => x.entityId === patientA.id)).toBe(true);
  });

  describe('role permissions', () => {
    it('receptionist cannot manage staff, billing or audit logs', async () => {
      await as(ctx, A.receptionist).post('/staff', { email: 'x@test.local', firstName: 'X', lastName: 'Y', role: 'DOCTOR' }).expect(403);
      await as(ctx, A.receptionist).post('/billing/subscription/change-plan', { planCode: 'ENTERPRISE' }).expect(403);
      await as(ctx, A.receptionist).get('/audit-logs').expect(403);
    });

    it('doctor cannot invite staff or change clinic settings', async () => {
      await as(ctx, A.doctor).post('/staff', { email: 'y@test.local', firstName: 'X', lastName: 'Y', role: 'DOCTOR' }).expect(403);
      await as(ctx, A.doctor).patch('/clinic', { name: 'Renamed' }).expect(403);
    });

    it('clinic admins cannot use platform endpoints; platform admins get no tenant data', async () => {
      await as(ctx, A.admin).get('/platform/clinics').expect(403);
      await as(ctx, platform, A.clinicId).get('/patients').expect(403);
    });

    it('doctor only sees patients assigned to their care', async () => {
      const before = await as(ctx, A.doctor).get('/patients').expect(200);
      expect(before.body.data.map((p: { id: string }) => p.id)).not.toContain(patientA.id);
      await as(ctx, A.doctor).get(`/patients/${patientA.id}`).expect(404);

      await as(ctx, A.receptionist).post(`/patients/${patientA.id}/care-team`, { doctorId: A.doctor.doctorId }).expect(201);
      const after = await as(ctx, A.doctor).get('/patients').expect(200);
      expect(after.body.data.map((p: { id: string }) => p.id)).toContain(patientA.id);
    });

    it('a disabled staff member loses access immediately', async () => {
      const res = await as(ctx, A.admin).post('/staff', { email: 'temp@test.local', firstName: 'Temp', lastName: 'Staff', role: 'RECEPTIONIST' }).expect(201);
      const token = new URL(res.body.data.activationUrl).searchParams.get('token');
      await ctx.http().post('/api/v1/auth/activate').send({ token, password: PASSWORD }).expect(200);
      const temp = { ...(await login(ctx, 'temp@test.local')), clinicId: A.clinicId };
      await as(ctx, temp).get('/patients').expect(200);
      await as(ctx, A.admin).patch(`/staff/${res.body.data.member.id}`, { status: 'DISABLED' }).expect(200);
      await as(ctx, temp).get('/patients').expect(403);
    });

    it('keeps at least one clinic admin', async () => {
      const staff = await as(ctx, A.admin).get('/staff').expect(200);
      const me = staff.body.data.find((m: { role: string; user: { id: string } }) => m.user.id === A.admin.userId);
      await as(ctx, A.admin).patch(`/staff/${me.id}`, { role: 'RECEPTIONIST' }).expect(409);
    });
  });

  describe('clinic lifecycle', () => {
    it('pending clinics cannot use operational endpoints until approved', async () => {
      const reg = await ctx
        .http()
        .post('/api/v1/clinics/register')
        .send({
          clinic: { name: 'Pending Clinic', city: 'Adama', phone: '+251911000001', email: 'pending@test.local' },
          admin: { firstName: 'P', lastName: 'Admin', email: 'pending-admin@test.local', password: PASSWORD },
          acceptTerms: true,
        })
        .expect(201);
      const s = { ...(await login(ctx, 'pending-admin@test.local')), clinicId: reg.body.data.clinicId };
      const me = await as(ctx, s).get('/auth/me').expect(200);
      expect(me.body.data.memberships[0].clinicStatus).toBe('PENDING_APPROVAL');
      await as(ctx, s).get('/clinic').expect(200); // allowed while pending
      await as(ctx, s).get('/patients').expect(403);
      const sub = await as(ctx, s).get('/billing/subscription').expect(200);
      expect(sub.body.data.current.status).toBe('TRIALING');

      await as(ctx, platform).post(`/platform/clinics/${s.clinicId}/review`, { decision: 'APPROVE' }).expect(200);
      await as(ctx, s).get('/patients').expect(200);

      await as(ctx, platform).post(`/platform/clinics/${s.clinicId}/review`, { decision: 'SUSPEND', reason: 'Test' }).expect(200);
      await as(ctx, s).get('/patients').expect(403);
    });

    it('rejects duplicate registrations for the same email', async () => {
      const r = await ctx
        .http()
        .post('/api/v1/clinics/register')
        .send({
          clinic: { name: 'Dup', city: 'Adama', phone: '+251911000001', email: 'dup@test.local' },
          admin: { firstName: 'P', lastName: 'Admin', email: 'pending-admin@test.local', password: PASSWORD },
          acceptTerms: true,
        });
      expect(r.status).toBe(409);
    });
  });
});
