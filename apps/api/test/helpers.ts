import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { seedReferenceData } from '../src/common/seed/reference-data';
import { PasswordService } from '../src/modules/auth/password.service';
import { QUEUES } from '../src/modules/jobs/queues';
import type { Type } from '@nestjs/common';

export const PASSWORD = 'Test-password-2026';

export interface TestCtx {
  app: INestApplication;
  prisma: PrismaService;
  http: () => ReturnType<typeof request>;
}

export async function createTestApp(overrides: { provide: unknown; useValue: unknown }[] = []): Promise<TestCtx> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  for (const o of overrides) builder = builder.overrideProvider(o.provide as Type).useValue(o.useValue);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  await app.init();
  const prisma = app.get(PrismaService);
  return { app, prisma, http: () => request(app.getHttpServer()) };
}

export async function resetDb(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  await seedReferenceData(prisma);
}

export async function clearQueues(app: INestApplication): Promise<void> {
  for (const name of Object.values(QUEUES)) {
    const q = app.get<Queue>(getQueueToken(name));
    await q.obliterate({ force: true }).catch(() => undefined);
  }
}

export interface Session {
  token: string;
  userId: string;
  clinicId?: string;
}

/** Authorised request helper: sets bearer token and clinic header. */
export function as(ctx: TestCtx, s: Session, clinicId = s.clinicId) {
  const withHeaders = (r: request.Test) => {
    r.set('Authorization', `Bearer ${s.token}`);
    if (clinicId) r.set('X-Clinic-Id', clinicId);
    return r;
  };
  return {
    get: (url: string) => withHeaders(ctx.http().get(`/api/v1${url}`)),
    post: (url: string, body?: object) => withHeaders(ctx.http().post(`/api/v1${url}`)).send(body ?? {}),
    patch: (url: string, body?: object) => withHeaders(ctx.http().patch(`/api/v1${url}`)).send(body ?? {}),
    put: (url: string, body?: object) => withHeaders(ctx.http().put(`/api/v1${url}`)).send(body ?? {}),
    delete: (url: string) => withHeaders(ctx.http().delete(`/api/v1${url}`)),
  };
}

export async function login(ctx: TestCtx, email: string, password = PASSWORD): Promise<Session> {
  const res = await ctx.http().post('/api/v1/auth/login').send({ email, password }).expect(200);
  return { token: res.body.data.accessToken, userId: res.body.data.user.id };
}

export async function createPlatformAdmin(ctx: TestCtx, email = 'platform@test.local'): Promise<Session> {
  const hash = await ctx.app.get(PasswordService).hash(PASSWORD);
  const role = await ctx.prisma.role.findUniqueOrThrow({ where: { key: 'PLATFORM_ADMIN' } });
  await ctx.prisma.user.create({
    data: { email, passwordHash: hash, firstName: 'Platform', lastName: 'Admin', roles: { create: { roleId: role.id } } },
  });
  return login(ctx, email);
}

let seq = 0;
export function uniq(prefix: string): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36)}${seq}`;
}

export interface ClinicWorld {
  clinicId: string;
  admin: Session;
  doctor: Session & { doctorId: string };
  receptionist: Session;
  serviceId: string;
}

/** Registers + approves a clinic, invites/activates a doctor and receptionist, sets availability and a service. */
export async function createClinicWorld(ctx: TestCtx, platform: Session, name = uniq('Clinic ')): Promise<ClinicWorld> {
  const adminEmail = `${uniq('admin')}@test.local`;
  const reg = await ctx
    .http()
    .post('/api/v1/clinics/register')
    .send({
      clinic: { name, city: 'Addis Ababa', phone: '0911000000', email: `${uniq('clinic')}@test.local`, planCode: 'PROFESSIONAL' },
      admin: { firstName: 'Ada', lastName: 'Admin', email: adminEmail, password: PASSWORD },
      acceptTerms: true,
    })
    .expect(201);
  const clinicId: string = reg.body.data.clinicId;
  await as(ctx, platform).post(`/platform/clinics/${clinicId}/review`, { decision: 'APPROVE' }).expect(200);
  const admin = { ...(await login(ctx, adminEmail)), clinicId };

  const invite = async (role: string, extra: object = {}) => {
    const email = `${uniq(role.toLowerCase())}@test.local`;
    const res = await as(ctx, admin)
      .post('/staff', { email, firstName: 'Test', lastName: role, role, ...extra })
      .expect(201);
    const token = new URL(res.body.data.activationUrl).searchParams.get('token');
    await ctx.http().post('/api/v1/auth/activate').send({ token, password: PASSWORD }).expect(200);
    return { ...(await login(ctx, email)), clinicId, membership: res.body.data.member };
  };

  const doc = await invite('DOCTOR', { specialty: 'General practice' });
  const receptionist = await invite('RECEPTIONIST');
  const doctorId: string = doc.membership.doctor.id;

  // Doctor works every day 08:00–17:00 clinic time, so tests don't depend on the weekday they run.
  await as(ctx, admin)
    .put(`/doctors/${doctorId}/availability`, {
      windows: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMinute: 8 * 60, endMinute: 17 * 60 })),
    })
    .expect(200);
  const svc = await as(ctx, admin).post('/services', { name: 'General consultation', durationMinutes: 30, priceEtb: 300 }).expect(201);

  return {
    clinicId,
    admin,
    doctor: { token: doc.token, userId: doc.userId, clinicId, doctorId },
    receptionist: { token: receptionist.token, userId: receptionist.userId, clinicId },
    serviceId: svc.body.data.id,
  };
}

export async function registerPatient(ctx: TestCtx, s: Session, overrides: object = {}) {
  const res = await as(ctx, s)
    .post('/patients', {
      firstName: 'Synthetic',
      lastName: uniq('Patient'),
      dateOfBirth: '1990-05-17',
      sex: 'FEMALE',
      phone: '0911223344',
      dataProcessingConsent: true,
      smsRemindersConsent: true,
      ...overrides,
    })
    .expect(201);
  return res.body.data as { id: string; medicalRecordNumber: string };
}

/** ISO string for clinic-local (Africa/Addis_Ababa, UTC+3) time `hh:mm` N days from today. */
export function addisTime(daysAhead: number, hh: number, mm = 0): string {
  const now = new Date();
  const local = new Date(now.getTime() + 3 * 3_600_000);
  local.setUTCDate(local.getUTCDate() + daysAhead);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh - 3, mm)).toISOString();
}
