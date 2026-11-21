import {
  addisTime,
  as,
  createClinicWorld,
  createPlatformAdmin,
  createTestApp,
  registerPatient,
  resetDb,
  type ClinicWorld,
  type TestCtx,
} from './helpers';
import { AiProvider, type CompletionRequest } from '../src/modules/ai/ai.provider';

/** Test double for the AI provider port. Records requests so tests can assert what left the platform. */
class StubAiProvider extends AiProvider {
  readonly name = 'stub';
  readonly model = 'stub-model-1';
  readonly configured = true;
  requests: CompletionRequest[] = [];
  next = '';
  async complete(req: CompletionRequest) {
    this.requests.push(req);
    return { text: this.next, model: this.model, inputTokens: 10, outputTokens: 20 };
  }
}

describe('Clinical documentation & AI (integration)', () => {
  let ctx: TestCtx;
  let A: ClinicWorld;
  let B: ClinicWorld;
  let patient: { id: string };
  const stub = new StubAiProvider();

  beforeAll(async () => {
    ctx = await createTestApp([{ provide: AiProvider, useValue: stub }]);
    await resetDb(ctx.prisma);
    const platform = await createPlatformAdmin(ctx);
    A = await createClinicWorld(ctx, platform);
    B = await createClinicWorld(ctx, platform);
    patient = await registerPatient(ctx, A.receptionist, { firstName: 'Almaz', lastName: 'Tesfaye' });
    await as(ctx, A.receptionist)
      .post('/appointments', { patientId: patient.id, doctorId: A.doctor.doctorId, serviceId: A.serviceId, startAt: addisTime(2, 9) })
      .expect(201);
  });
  afterAll(async () => ctx.app.close());

  const sections = { chiefComplaint: 'Cough for 3 days', examination: 'Temp 37.9', plan: 'Review in one week' };

  describe('note lifecycle', () => {
    let noteId: string;

    it('doctor in care creates a draft; content is encrypted at rest', async () => {
      const r = await as(ctx, A.doctor).post('/clinical-notes', { patientId: patient.id, title: 'Consultation', sections }).expect(201);
      noteId = r.body.data.id;
      expect(r.body.data.status).toBe('DRAFT');
      const v = await ctx.prisma.clinicalNoteVersion.findFirstOrThrow({ where: { noteId } });
      expect(v.contentEnc).toMatch(/^v1:/);
      expect(v.contentEnc).not.toContain('Cough');
    });

    it('receptionist, clinic admin and other-clinic doctor cannot access clinical notes', async () => {
      await as(ctx, A.receptionist).get(`/clinical-notes/${noteId}`).expect(403);
      await as(ctx, A.admin).get(`/clinical-notes/${noteId}`).expect(403);
      await as(ctx, A.receptionist).get(`/patients/${patient.id}/record`).expect(403);
      await as(ctx, B.doctor).get(`/clinical-notes/${noteId}`).expect(404);
      await as(ctx, B.doctor).post('/clinical-notes', { patientId: patient.id, title: 'X', sections }).expect(404);
    });

    it('edits draft, signs with attestation, blocks editing signed notes, amends with new version', async () => {
      await as(ctx, A.doctor).patch(`/clinical-notes/${noteId}`, { sections: { ...sections, assessment: 'Clinician assessment text' } }).expect(200);
      await as(ctx, A.doctor).post(`/clinical-notes/${noteId}/sign`, {}).expect(400); // attestation required
      const signed = await as(ctx, A.doctor).post(`/clinical-notes/${noteId}/sign`, { attestation: true }).expect(200);
      expect(signed.body.data.status).toBe('SIGNED');

      await as(ctx, A.doctor).patch(`/clinical-notes/${noteId}`, { sections }).expect(409);
      const amended = await as(ctx, A.doctor)
        .post(`/clinical-notes/${noteId}/amend`, { sections: { ...sections, plan: 'Review in 3 days' }, reason: 'Corrected follow-up interval', attestation: true })
        .expect(200);
      expect(amended.body.data.status).toBe('AMENDED');
      expect(amended.body.data.versions).toHaveLength(2);
      expect(amended.body.data.current.sections.plan).toBe('Review in 3 days');
      expect(amended.body.data.versions[1].sections.plan).toBe('Review in one week'); // original preserved
    });

    it('database refuses to modify signed versions', async () => {
      const v1 = await ctx.prisma.clinicalNoteVersion.findFirstOrThrow({ where: { noteId, version: 1 } });
      await expect(ctx.prisma.clinicalNoteVersion.update({ where: { id: v1.id }, data: { amendmentReason: 'tamper' } })).rejects.toThrow();
    });

    it('logs record access in the audit trail', async () => {
      await as(ctx, A.doctor).get(`/clinical-notes/${noteId}`).expect(200);
      const log = await as(ctx, A.admin).get(`/patients/${patient.id}/access-log`).expect(200);
      const actions = log.body.data.map((l: { action: string }) => l.action);
      expect(actions).toEqual(expect.arrayContaining(['clinical_note.viewed', 'clinical_note.signed', 'clinical_note.amended']));
      // Audit metadata never contains clinical text
      const rows = await ctx.prisma.auditLog.findMany({ where: { entityId: noteId } });
      expect(JSON.stringify(rows)).not.toMatch(/Cough|Review in/);
    });

    it('clinical summary is encrypted and care-gated', async () => {
      await as(ctx, A.doctor).put(`/patients/${patient.id}/record`, { allergies: 'Penicillin', bloodGroup: 'O+' }).expect(200);
      const rec = await ctx.prisma.patientRecord.findUniqueOrThrow({ where: { patientId: patient.id } });
      expect(rec.allergiesEnc).not.toContain('Penicillin');
      const r = await as(ctx, A.doctor).get(`/patients/${patient.id}/record`).expect(200);
      expect(r.body.data.allergies).toBe('Penicillin');
    });
  });

  describe('AI documentation assistant', () => {
    it('produces a labelled AI draft, redacts identifiers, flags invented values, and requires review before signing', async () => {
      stub.requests = [];
      stub.next = JSON.stringify({
        chiefComplaint: 'Cough for three days',
        history: '[PATIENT] reports productive cough.',
        examination: 'Temperature 37.9. Heart rate 104.',
        assessment: '',
        plan: 'Review in one week.',
        additionalNotes: '',
        missingInformation: ['Duration of fever not documented'],
      });
      const r = await as(ctx, A.doctor)
        .post('/ai/clinical-draft', {
          patientId: patient.id,
          rawNotes: 'Almaz Tesfaye, phone 0911223344, cough 3 days productive, temp 37.9, review 1 week',
          language: 'en',
        })
        .expect(200);

      // Nothing identifying left the platform.
      const sent = stub.requests[0]!.messages.map((m) => m.content).join('\n');
      expect(sent).not.toMatch(/Almaz|Tesfaye|0911223344/);
      expect(sent).toContain('[PATIENT]');

      expect(r.body.data.label).toMatch(/AI-generated draft/);
      expect(r.body.data.note.status).toBe('DRAFT');
      expect(r.body.data.note.source).toBe('AI_ASSISTED');
      expect(r.body.data.safetyFlags).toContain('UNSUPPORTED_NUMBERS');
      expect(r.body.data.warnings.join(' ')).toMatch(/104/);
      expect(r.body.data.warnings).toContain('Duration of fever not documented');

      const noteId = r.body.data.note.id;
      const sign1 = await as(ctx, A.doctor).post(`/clinical-notes/${noteId}/sign`, { attestation: true });
      expect(sign1.status).toBe(422);
      expect(sign1.body.error.code).toBe('AI_REVIEW_REQUIRED');

      await as(ctx, A.doctor).post('/ai/reviews', { interactionId: r.body.data.interactionId, decision: 'EDITED' }).expect(201);
      await as(ctx, A.doctor).post(`/clinical-notes/${noteId}/sign`, { attestation: true }).expect(200);

      const interaction = await ctx.prisma.aIInteraction.findUniqueOrThrow({ where: { id: r.body.data.interactionId } });
      expect(interaction.model).toBe('stub-model-1');
      expect(interaction.promptHash).toMatch(/^[a-f0-9]{64}$/);
      expect(interaction.redactionCount).toBeGreaterThanOrEqual(3);
    });

    it('rejects malformed model output instead of saving it', async () => {
      stub.next = 'not json at all';
      const r = await as(ctx, A.doctor).post('/ai/clinical-draft', { patientId: patient.id, rawNotes: 'cough three days, mild', language: 'en' });
      expect(r.status).toBe(503);
      expect(r.body.error.code).toBe('AI_INVALID_OUTPUT');
    });

    it('respects patient refusal of AI-assisted documentation', async () => {
      const p2 = await registerPatient(ctx, A.receptionist);
      await as(ctx, A.receptionist).post(`/patients/${p2.id}/care-team`, { doctorId: A.doctor.doctorId }).expect(201);
      await as(ctx, A.receptionist).post(`/patients/${p2.id}/consents`, { type: 'AI_ASSISTED_DOCUMENTATION', granted: false }).expect(201);
      await as(ctx, A.doctor).post('/ai/clinical-draft', { patientId: p2.id, rawNotes: 'headache since morning', language: 'en' }).expect(403);
    });

    it('receptionists cannot use the clinical AI', async () => {
      await as(ctx, A.receptionist).post('/ai/clinical-draft', { patientId: patient.id, rawNotes: 'some notes here', language: 'en' }).expect(403);
    });

    it('admin assistant answers workflow questions and blocks unsafe output', async () => {
      stub.next = 'Go to Appointments > New and choose a slot.';
      const ok = await as(ctx, A.receptionist).post('/ai/assistant', { message: 'How do I book?', language: 'en' }).expect(200);
      expect(ok.body.data.answer).toContain('Appointments');
      expect(ok.body.data.aiGenerated).toBe(true);

      stub.next = 'You have a bacterial infection; take 500 mg amoxicillin three times daily.';
      const blocked = await as(ctx, A.receptionist).post('/ai/assistant', { message: 'what is wrong with me', language: 'en' }).expect(200);
      expect(blocked.body.data.aiGenerated).toBe(false);
      expect(blocked.body.data.answer).not.toMatch(/amoxicillin/);
    });

    it('health info: emergency short-circuits without calling the model', async () => {
      stub.requests = [];
      const r = await as(ctx, A.receptionist).post('/ai/health-info', { question: 'my mother has chest pain and cannot breathe', language: 'en' }).expect(200);
      expect(r.body.data.emergency).toBe(true);
      expect(r.body.data.answer).toMatch(/emergency/i);
      expect(stub.requests).toHaveLength(0);
    });

    it('health info: answers only from approved sources', async () => {
      stub.requests = [];
      const none = await as(ctx, A.receptionist).post('/ai/health-info', { question: 'What is hypertension?', language: 'en' }).expect(200);
      expect(none.body.data.sources).toEqual([]);
      expect(stub.requests).toHaveLength(0);

      await ctx.prisma.healthContent.create({
        data: {
          title: 'Understanding hypertension',
          body: 'Hypertension means blood pressure that stays higher than normal over time. It is measured with a cuff.',
          language: 'en',
          sourceName: 'Synthetic test source',
          tags: [],
          status: 'APPROVED',
        },
      });
      stub.next = 'Hypertension means blood pressure is higher than normal over time. A health worker can measure it.';
      const r = await as(ctx, A.receptionist).post('/ai/health-info', { question: 'What is hypertension?', language: 'en' }).expect(200);
      expect(r.body.data.sources[0].title).toBe('Understanding hypertension');
      expect(r.body.data.disclaimer).toMatch(/not medical advice/);
      expect(stub.requests[0]!.messages[0]!.content).toContain('APPROVED SOURCES');
    });
  });

  describe('laboratory workflow', () => {
    it('doctor orders, lab staff records result, admin cannot read the result text', async () => {
      const lab = await as(ctx, A.admin).post('/lab/laboratories', { name: 'Main lab' }).expect(201);
      const order = await as(ctx, A.doctor).post('/lab/orders', { patientId: patient.id, laboratoryId: lab.body.data.id, testName: 'Full blood count' }).expect(201);

      // Lab staff
      const inv = await as(ctx, A.admin).post('/staff', { email: 'lab1@test.local', firstName: 'Lab', lastName: 'Tech', role: 'LABORATORY_STAFF' }).expect(201);
      const token = new URL(inv.body.data.activationUrl).searchParams.get('token');
      const act = await ctx.http().post('/api/v1/auth/activate').send({ token, password: 'Test-password-2026' }).expect(200);
      const labStaff = { token: act.body.data.accessToken, userId: act.body.data.user.id, clinicId: A.clinicId };

      await as(ctx, labStaff).get(`/patients/${patient.id}`).expect(403); // no general patient access
      await as(ctx, labStaff).post(`/lab/orders/${order.body.data.id}/result`, { resultText: 'Hb 12.1 g/dL' }).expect(409); // sample first
      await as(ctx, labStaff).patch(`/lab/orders/${order.body.data.id}/status`, { status: 'SAMPLE_COLLECTED' }).expect(200);
      await as(ctx, labStaff).post(`/lab/orders/${order.body.data.id}/result`, { resultText: 'Hb 12.1 g/dL', unit: 'g/dL' }).expect(201);

      const adminView = await as(ctx, A.admin).get('/lab/orders').expect(200);
      expect(adminView.body.data[0].result.restricted).toBe(true);
      expect(JSON.stringify(adminView.body.data)).not.toContain('12.1');
      const doctorView = await as(ctx, A.doctor).get('/lab/orders').expect(200);
      expect(doctorView.body.data[0].result.resultText).toBe('Hb 12.1 g/dL');

      const notif = await as(ctx, A.doctor).get('/notifications').expect(200);
      expect(notif.body.data.some((n: { type: string }) => n.type === 'LAB_RESULT_READY')).toBe(true);
    });
  });
});
