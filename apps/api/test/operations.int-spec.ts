import {
  addisTime,
  as,
  createClinicWorld,
  createPlatformAdmin,
  createTestApp,
  login,
  PASSWORD,
  registerPatient,
  resetDb,
  type ClinicWorld,
  type Session,
  type TestCtx,
} from './helpers';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { BillingService } from '../src/modules/billing/billing.service';
import { FollowUpsService } from '../src/modules/followups/followups.module';
import { RetentionService } from '../src/modules/jobs/retention.service';

describe('Portal, follow-ups, analytics, billing, notifications (integration)', () => {
  let ctx: TestCtx;
  let A: ClinicWorld;
  let platform: Session;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    platform = await createPlatformAdmin(ctx);
    A = await createClinicWorld(ctx, platform);
  });
  afterAll(async () => ctx.app.close());

  describe('patient portal journey', () => {
    let patientUser: Session;
    let patientId: string;

    it('receptionist invites a patient who activates a portal account', async () => {
      const p = await registerPatient(ctx, A.receptionist, { email: 'portal.patient@test.local' });
      patientId = p.id;
      const inv = await as(ctx, A.receptionist).post(`/patients/${p.id}/invite`).expect(200);
      const token = new URL(inv.body.data.activationUrl).searchParams.get('token');
      await ctx.http().post('/api/v1/auth/activate').send({ token, password: PASSWORD }).expect(200);
      patientUser = await login(ctx, 'portal.patient@test.local');
      const me = await as(ctx, patientUser).get('/me/patient-profiles').expect(200);
      expect(me.body.data).toHaveLength(1);
      expect(me.body.data[0].clinic.id).toBe(A.clinicId);
    });

    it('patient cannot use staff endpoints even with the clinic header', async () => {
      await as(ctx, patientUser, A.clinicId).get('/patients').expect(403);
      await as(ctx, patientUser, A.clinicId).get('/appointments').expect(403);
    });

    it('patient requests an appointment (PENDING), staff is notified and confirms it', async () => {
      const opts = await as(ctx, patientUser).get(`/me/clinics/${A.clinicId}/booking-options`).expect(200);
      expect(opts.body.data.services).toHaveLength(1);
      const date = addisTime(3, 12).slice(0, 10);
      const slots = await as(ctx, patientUser)
        .get(`/me/clinics/${A.clinicId}/doctors/${A.doctor.doctorId}/slots?date=${date}&serviceId=${A.serviceId}`)
        .expect(200);
      const req = await as(ctx, patientUser)
        .post('/me/appointments', { clinicId: A.clinicId, doctorId: A.doctor.doctorId, serviceId: A.serviceId, startAt: slots.body.data[2].startAt })
        .expect(201);
      expect(req.body.data.status).toBe('PENDING');

      const inbox = await as(ctx, A.receptionist).get('/notifications').expect(200);
      expect(inbox.body.data.some((n: { type: string }) => n.type === 'APPOINTMENT_REQUESTED')).toBe(true);
      expect(inbox.body.meta.unread).toBeGreaterThan(0);

      await as(ctx, A.receptionist).post(`/appointments/${req.body.data.id}/confirm`).expect(200);
      const patientInbox = await as(ctx, patientUser).get('/notifications').expect(200);
      expect(patientInbox.body.data.some((n: { type: string }) => n.type === 'APPOINTMENT_CONFIRMED')).toBe(true);

      const mine = await as(ctx, patientUser).get('/me/appointments').expect(200);
      expect(mine.body.data[0].status).toBe('CONFIRMED');
      await as(ctx, patientUser).post(`/me/appointments/${req.body.data.id}/cancel`, {}).expect(200);
    });

    it("patient cannot see or cancel another patient's appointments", async () => {
      const other = await registerPatient(ctx, A.receptionist);
      const appt = await as(ctx, A.receptionist)
        .post('/appointments', { patientId: other.id, doctorId: A.doctor.doctorId, serviceId: A.serviceId, startAt: addisTime(4, 9) })
        .expect(201);
      await as(ctx, patientUser).post(`/me/appointments/${appt.body.data.id}/cancel`, {}).expect(404);
      const mine = await as(ctx, patientUser).get('/me/appointments').expect(200);
      expect(mine.body.data.map((a: { id: string }) => a.id)).not.toContain(appt.body.data.id);
    });

    it('patient sees only signed notes shared with them, and can manage self-service consent', async () => {
      await as(ctx, A.receptionist).post(`/patients/${patientId}/care-team`, { doctorId: A.doctor.doctorId }).expect(201);
      const shared = await as(ctx, A.doctor).post('/clinical-notes', { patientId, title: 'Visit summary', sections: { plan: 'Rest and fluids' }, shareWithPatient: true }).expect(201);
      await as(ctx, A.doctor).post('/clinical-notes', { patientId, title: 'Private draft', sections: { history: 'internal' }, shareWithPatient: true }).expect(201);
      let rec = await as(ctx, patientUser).get('/me/records').expect(200);
      expect(rec.body.data.notes).toHaveLength(0); // nothing signed yet
      await as(ctx, A.doctor).post(`/clinical-notes/${shared.body.data.id}/sign`, { attestation: true }).expect(200);
      rec = await as(ctx, patientUser).get('/me/records').expect(200);
      expect(rec.body.data.notes.map((n: { title: string }) => n.title)).toEqual(['Visit summary']);

      await as(ctx, patientUser).post(`/me/patient-profiles/${patientId}/consents`, { type: 'PORTAL_RECORD_ACCESS', granted: false }).expect(201);
      rec = await as(ctx, patientUser).get('/me/records').expect(200);
      expect(rec.body.data.notes).toHaveLength(0);
      await as(ctx, patientUser).post(`/me/patient-profiles/${patientId}/consents`, { type: 'DATA_PROCESSING', granted: false }).expect(403);
    });
  });

  describe('follow-ups', () => {
    it('creates, assigns, reminds once, and completes follow-up tasks', async () => {
      const p = await registerPatient(ctx, A.receptionist);
      const today = addisTime(0, 12).slice(0, 10);
      const f = await as(ctx, A.receptionist)
        .post('/follow-ups', { patientId: p.id, title: 'Call to book review', dueDate: today, priority: 'HIGH', assignedToUserId: A.receptionist.userId })
        .expect(201);
      const svc = ctx.app.get(FollowUpsService);
      expect(await svc.sendDueReminders()).toBeGreaterThanOrEqual(1);
      expect(await svc.sendDueReminders()).toBe(0); // only once
      const done = await as(ctx, A.receptionist).patch(`/follow-ups/${f.body.data.id}`, { status: 'DONE' }).expect(200);
      expect(done.body.data.completedAt).not.toBeNull();
      await as(ctx, A.receptionist).post('/follow-ups', { patientId: p.id, title: 'x', dueDate: today, assignedToUserId: platform.userId }).expect(400);
    });
  });

  describe('analytics reflect real database state', () => {
    it('overview and appointment analytics match created data', async () => {
      const overview = await as(ctx, A.admin).get('/analytics/overview').expect(200);
      const dbPatients = await ctx.prisma.patient.count({ where: { clinicId: A.clinicId } });
      expect(overview.body.data.totalPatients).toBe(dbPatients);
      expect(overview.body.data.activeDoctors).toBe(1);
      expect(overview.body.data.appointmentTrend).toHaveLength(14);

      const from = addisTime(0, 12).slice(0, 10);
      const to = addisTime(10, 12).slice(0, 10);
      const appts = await as(ctx, A.admin).get(`/analytics/appointments?from=${from}&to=${to}`).expect(200);
      const dbCount = await ctx.prisma.appointment.count({ where: { clinicId: A.clinicId } });
      expect(appts.body.data.totals.total).toBe(dbCount);
      expect(appts.body.data.totals.cancelled).toBeGreaterThanOrEqual(1);
      expect(appts.body.data.byDay).toHaveLength(11);

      const services = await as(ctx, A.admin).get(`/analytics/services?from=${from}&to=${to}`).expect(200);
      expect(services.body.data.services[0].total).toBe(dbCount);

      await as(ctx, A.receptionist).get('/analytics/overview').expect(403);
      await as(ctx, A.admin).get('/analytics/appointments?from=2026-05-01&to=2026-01-01').expect(400);
    });
  });

  describe('billing & subscriptions', () => {
    it('enforces plan limits, changes plan, issues invoices and records sandbox payments', async () => {
      const billing = ctx.app.get(BillingService);
      // Downgrade blocked? Professional → Starter allowed only if usage fits (5 staff max).
      await as(ctx, A.admin).post('/billing/subscription/change-plan', { planCode: 'STARTER' }).expect(200);
      const sub = await as(ctx, A.admin).get('/billing/subscription').expect(200);
      expect(sub.body.data.current.plan.code).toBe('STARTER');
      expect(sub.body.data.history.length).toBe(2);
      expect(sub.body.data.paymentMode).toBe('sandbox');

      // STARTER max staff 5: admin + doctor + receptionist (+ none) → invite until limit
      for (let i = 0; i < 2; i++) {
        await as(ctx, A.admin).post('/staff', { email: `extra${i}@test.local`, firstName: 'E', lastName: `${i}`, role: 'RECEPTIONIST' }).expect(201);
      }
      const over = await as(ctx, A.admin).post('/staff', { email: 'over@test.local', firstName: 'O', lastName: 'L', role: 'RECEPTIONIST' });
      expect(over.status).toBe(402);
      expect(over.body.error.code).toBe('PLAN_LIMIT_REACHED');

      // Force period end and generate invoices.
      await ctx.prisma.subscription.updateMany({ where: { clinicId: A.clinicId, isCurrent: true }, data: { currentPeriodEnd: new Date(Date.now() - 1000) } });
      expect(await billing.generateDueInvoices()).toBe(1);
      expect(await billing.generateDueInvoices()).toBe(0); // idempotent
      const invoices = await as(ctx, A.admin).get('/billing/invoices').expect(200);
      expect(invoices.body.data[0].amountUsdCents).toBe(2500);
      const pay = await as(ctx, A.admin).post(`/billing/invoices/${invoices.body.data[0].id}/pay`).expect(200);
      expect(pay.body.data).toMatchObject({ status: 'SUCCEEDED', sandbox: true });
      await as(ctx, A.admin).post(`/billing/invoices/${invoices.body.data[0].id}/pay`).expect(409);
    });

    it('public plan catalogue lists the three plans with configured prices', async () => {
      const r = await ctx.http().get('/api/v1/billing/plans').expect(200);
      expect(r.body.data.map((p: { code: string; monthlyPriceUsdCents: number }) => [p.code, p.monthlyPriceUsdCents])).toEqual([
        ['STARTER', 2500],
        ['PROFESSIONAL', 6000],
        ['ENTERPRISE', 15000],
      ]);
    });
  });

  describe('notification delivery', () => {
    it('marks SMS as SKIPPED (not SENT) when no provider is configured, respecting consent', async () => {
      await as(ctx, A.admin).post('/billing/subscription/change-plan', { planCode: 'PROFESSIONAL' }).expect(200);
      const withConsent = await registerPatient(ctx, A.receptionist, { smsRemindersConsent: true });
      const noConsent = await registerPatient(ctx, A.receptionist, { smsRemindersConsent: false });
      for (const [p, h] of [[withConsent, 9], [noConsent, 10]] as const) {
        await as(ctx, A.receptionist)
          .post('/appointments', { patientId: p.id, doctorId: A.doctor.doctorId, serviceId: A.serviceId, startAt: addisTime(9, h) })
          .expect(201);
      }
      const sms = await ctx.prisma.notification.findFirstOrThrow({ where: { recipientPatientId: withConsent.id, channel: 'SMS' } });
      expect(await ctx.prisma.notification.count({ where: { recipientPatientId: noConsent.id, channel: 'SMS' } })).toBe(0);
      await ctx.app.get(NotificationsService).deliver(sms.id);
      const after = await ctx.prisma.notification.findUniqueOrThrow({ where: { id: sms.id } });
      expect(after.deliveryStatus).toBe('SKIPPED');
      expect(after.deliveryError).toBe('SMS_PROVIDER_NOT_CONFIGURED');
    });

    it('users can set channel preferences and mark notifications read', async () => {
      const prefs = await as(ctx, A.receptionist).put('/notifications/preferences', { preferences: [{ type: 'APPOINTMENT_REQUESTED', channel: 'EMAIL', enabled: false }] }).expect(200);
      expect(prefs.body.data.channelsConfigured).toEqual({ EMAIL: false, SMS: false, IN_APP: true });
      await as(ctx, A.receptionist).post('/notifications/read-all').expect(204);
      const r = await as(ctx, A.receptionist).get('/notifications?unreadOnly=true').expect(200);
      expect(r.body.meta.unread).toBe(0);
    });
  });

  describe('AI without configuration', () => {
    it('returns 503 AI_NOT_CONFIGURED rather than fabricating output; emergency guidance still works', async () => {
      const r = await as(ctx, A.doctor).post('/ai/clinical-draft', { patientId: '00000000-0000-4000-8000-000000000000', rawNotes: 'cough for days', language: 'en' });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('AI_NOT_CONFIGURED');
      const status = await as(ctx, A.doctor).get('/ai/status').expect(200);
      expect(status.body.data.configured).toBe(false);
      const e = await as(ctx, A.doctor).post('/ai/health-info', { question: 'he is unconscious', language: 'am' }).expect(200);
      expect(e.body.data.emergency).toBe(true);
      expect(e.body.data.answer).toContain('907');
    });
  });

  describe('retention', () => {
    it('purges expired operational data only', async () => {
      const before = await ctx.prisma.auditLog.count();
      const r = await ctx.app.get(RetentionService).purge(new Date(Date.now() + 400 * 86_400_000));
      expect(r.sessions).toBeGreaterThan(0);
      expect(await ctx.prisma.auditLog.count()).toBe(before); // audit untouched
      expect(await ctx.prisma.clinicalNote.count()).toBeGreaterThan(0);
    });
  });

  describe('health & docs', () => {
    it('serves readiness and OpenAPI', async () => {
      const r = await ctx.http().get('/api/v1/health/ready').expect(200);
      expect(r.body.data.checks).toEqual({ database: 'up', redis: 'up' });
      const doc = await ctx.http().get('/api/docs/openapi.json').expect(200);
      expect(Object.keys(doc.body.paths).length).toBeGreaterThan(50);
      expect(doc.body.paths['/api/v1/patients'].post.requestBody).toBeDefined();
    });
  });
});
