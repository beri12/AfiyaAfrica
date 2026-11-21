import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import {
  addisTime,
  as,
  clearQueues,
  createClinicWorld,
  createPlatformAdmin,
  createTestApp,
  registerPatient,
  resetDb,
  type ClinicWorld,
  type TestCtx,
} from './helpers';
import { QUEUES } from '../src/modules/jobs/queues';
import { AppointmentsService } from '../src/modules/appointments/appointments.service';

describe('Patients & appointments (integration)', () => {
  let ctx: TestCtx;
  let A: ClinicWorld;

  beforeAll(async () => {
    ctx = await createTestApp();
    await resetDb(ctx.prisma);
    await clearQueues(ctx.app);
    const platform = await createPlatformAdmin(ctx);
    A = await createClinicWorld(ctx, platform);
  });
  afterAll(async () => ctx.app.close());

  describe('patient registration', () => {
    it('registers a patient with MRN, consent ledger and audit trail', async () => {
      const p = await registerPatient(ctx, A.receptionist, { phone: '0911 223 344' });
      expect(p.medicalRecordNumber).toMatch(/^MRN-\d{6}$/);
      const detail = await as(ctx, A.receptionist).get(`/patients/${p.id}`).expect(200);
      expect(detail.body.data.phone).toBe('+251911223344');
      expect(detail.body.data.consents.map((c: { type: string }) => c.type).sort()).toEqual(['DATA_PROCESSING', 'SMS_REMINDERS']);
      const audit = await ctx.prisma.auditLog.findMany({ where: { entityId: p.id } });
      expect(audit.map((a) => a.action)).toEqual(expect.arrayContaining(['patient.created', 'patient.viewed']));
    });

    it('requires processing consent and validates input', async () => {
      const r = await as(ctx, A.receptionist).post('/patients', {
        firstName: 'A',
        lastName: 'B',
        dateOfBirth: '2999-01-01',
        sex: 'FEMALE',
        dataProcessingConsent: false,
      });
      expect(r.status).toBe(400);
      const paths = r.body.error.details.map((d: { path: string }) => d.path);
      expect(paths).toEqual(expect.arrayContaining(['dateOfBirth', 'dataProcessingConsent']));
    });

    it('search returns demographics only and matches name / MRN', async () => {
      const p = await registerPatient(ctx, A.receptionist, { firstName: 'Meseret', lastName: 'Searchable' });
      const r = await as(ctx, A.receptionist).get('/patients?q=meseret').expect(200);
      expect(r.body.data[0].id).toBe(p.id);
      expect(Object.keys(r.body.data[0]).sort()).toEqual(
        ['createdAt', 'dateOfBirth', 'firstName', 'id', 'lastName', 'medicalRecordNumber', 'middleName', 'phone', 'sex', 'status'].sort(),
      );
      expect(r.body.meta).toMatchObject({ page: 1, total: 1 });
    });

    it('consent withdrawal is recorded append-only', async () => {
      const p = await registerPatient(ctx, A.receptionist);
      await as(ctx, A.receptionist).post(`/patients/${p.id}/consents`, { type: 'SMS_REMINDERS', granted: false }).expect(201);
      const history = await as(ctx, A.receptionist).get(`/patients/${p.id}/consents`).expect(200);
      expect(history.body.data.filter((c: { type: string }) => c.type === 'SMS_REMINDERS')).toHaveLength(2);
      const detail = await as(ctx, A.receptionist).get(`/patients/${p.id}`).expect(200);
      expect(detail.body.data.consents.find((c: { type: string }) => c.type === 'SMS_REMINDERS').granted).toBe(false);
    });
  });

  describe('appointments', () => {
    let patientId: string;
    beforeAll(async () => {
      patientId = (await registerPatient(ctx, A.receptionist)).id;
    });

    const book = (startAt: string, pid = patientId) =>
      as(ctx, A.receptionist).post('/appointments', { patientId: pid, doctorId: A.doctor.doctorId, serviceId: A.serviceId, startAt });

    it('creates a confirmed appointment, assigns care and schedules a reminder', async () => {
      const startAt = addisTime(3, 9);
      const r = await book(startAt).expect(201);
      expect(r.body.data.status).toBe('CONFIRMED');
      expect(new Date(r.body.data.endAt).getTime() - new Date(r.body.data.startAt).getTime()).toBe(30 * 60_000);

      const care = await ctx.prisma.careAssignment.findFirst({ where: { patientId, doctorId: A.doctor.doctorId } });
      expect(care).not.toBeNull();

      const reminders = ctx.app.get<Queue>(getQueueToken(QUEUES.reminders));
      const delayed = await reminders.getDelayed();
      expect(delayed.some((j) => j.data.appointmentId === r.body.data.id)).toBe(true);

      // In-app/SMS notification rows exist and SMS is SKIPPED-able later, never faked as SENT here.
      const notes = await ctx.prisma.notification.findMany({ where: { recipientPatientId: patientId } });
      expect(notes.every((n) => n.deliveryStatus === 'QUEUED')).toBe(true);
      expect(notes[0]?.body).not.toMatch(/consultation|diagnos/i);
    });

    it('prevents double booking a doctor (overlap)', async () => {
      const other = await registerPatient(ctx, A.receptionist);
      const r = await book(addisTime(3, 9, 15), other.id);
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('APPOINTMENT_CONFLICT');
    });

    it('prevents double booking under concurrent requests (DB exclusion constraint)', async () => {
      const startAt = addisTime(4, 11);
      const patients = await Promise.all([1, 2, 3, 4].map(() => registerPatient(ctx, A.receptionist)));
      const results = await Promise.all(patients.map((p) => book(startAt, p.id)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(3);
    });

    it('rejects bookings outside availability, in the past, or too far ahead', async () => {
      expect((await book(addisTime(3, 18))).body.error.code).toBe('OUTSIDE_AVAILABILITY');
      expect((await book(addisTime(-2, 10))).body.error.code).toBe('TIME_IN_PAST');
      expect((await book(addisTime(400, 10))).body.error.code).toBe('TOO_FAR_AHEAD');
      expect((await book('2026-13-01T10:00')).status).toBe(400);
    });

    it('lists available slots excluding booked times', async () => {
      const date = addisTime(5, 12).slice(0, 10);
      // addisTime(5,12) is 09:00 UTC on the same calendar date as Addis local date
      await book(addisTime(5, 8)).expect(201);
      const r = await as(ctx, A.receptionist).get(`/doctors/${A.doctor.doctorId}/slots?date=${date}&serviceId=${A.serviceId}`).expect(200);
      const starts: string[] = r.body.data.map((s: { startAt: string }) => s.startAt);
      expect(starts).not.toContain(addisTime(5, 8));
      expect(starts).toContain(addisTime(5, 8, 30));
      expect(starts).toHaveLength(17); // 08:00–17:00 in 30-min slots, minus one booked
    });

    it('reschedules, enforcing conflicts, and cancels with status history', async () => {
      const created = await book(addisTime(6, 10)).expect(201);
      const id = created.body.data.id;
      const blocker = await registerPatient(ctx, A.receptionist);
      await book(addisTime(6, 14), blocker.id).expect(201);
      await as(ctx, A.receptionist).post(`/appointments/${id}/reschedule`, { startAt: addisTime(6, 14) }).expect(409);
      const moved = await as(ctx, A.receptionist).post(`/appointments/${id}/reschedule`, { startAt: addisTime(6, 15) }).expect(200);
      expect(moved.body.data.startAt).toBe(addisTime(6, 15));

      const cancelled = await as(ctx, A.receptionist).post(`/appointments/${id}/cancel`, { reason: 'Patient travelling' }).expect(200);
      expect(cancelled.body.data.status).toBe('CANCELLED');
      expect(cancelled.body.data.statusHistory.map((h: { toStatus: string }) => h.toStatus)).toEqual(['CONFIRMED', 'CONFIRMED', 'CANCELLED']);
      await as(ctx, A.receptionist).post(`/appointments/${id}/cancel`, {}).expect(409);
      // Cancelled slot can be rebooked.
      await book(addisTime(6, 15), blocker.id).expect(201);
    });

    it('cannot complete an appointment that has not started', async () => {
      const r = await book(addisTime(7, 10)).expect(201);
      const res = await as(ctx, A.doctor).post(`/appointments/${r.body.data.id}/complete`);
      expect(res.status).toBe(422);
    });

    it('doctors see only their own schedule', async () => {
      const list = await as(ctx, A.doctor).get('/appointments?pageSize=100').expect(200);
      expect(list.body.data.every((a: { doctor: { id: string } }) => a.doctor.id === A.doctor.doctorId)).toBe(true);
    });

    it('reminder worker skips stale jobs and sends for current ones', async () => {
      const r = await book(addisTime(8, 10)).expect(201);
      const svc = ctx.app.get(AppointmentsService);
      expect(await svc.sendReminder({ appointmentId: r.body.data.id, startAt: new Date(0).toISOString() })).toBe('stale');
      expect(await svc.sendReminder({ appointmentId: r.body.data.id, startAt: r.body.data.startAt })).toBe('sent');
    });
  });
});
