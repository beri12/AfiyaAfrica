/**
 * Seed script.
 *  - Always: roles, permissions and plans (reference data, no personal data).
 *  - Platform admin: created from SEED_PLATFORM_ADMIN_EMAIL / SEED_PLATFORM_ADMIN_PASSWORD if set.
 *  - Demo clinic: SYNTHETIC data only, for development/staging. Refuses to run when NODE_ENV=production
 *    unless SEED_DEMO=true is explicitly set. No real patient information is ever used.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { seedReferenceData } from '../src/common/seed/reference-data';

const prisma = new PrismaClient();
const hash = (p: string) => argon2.hash(p, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'Demo-password-2026';

/** Obviously synthetic names (generated, not real people). */
const SYNTHETIC_PATIENTS: [string, string, string, 'FEMALE' | 'MALE'][] = [
  ['Demo', 'Patient-Alpha', '1988-04-12', 'FEMALE'],
  ['Demo', 'Patient-Bravo', '1975-09-30', 'MALE'],
  ['Demo', 'Patient-Charlie', '1995-01-21', 'FEMALE'],
  ['Demo', 'Patient-Delta', '2001-07-08', 'MALE'],
  ['Demo', 'Patient-Echo', '1969-11-02', 'FEMALE'],
  ['Demo', 'Patient-Foxtrot', '1990-03-15', 'MALE'],
  ['Demo', 'Patient-Golf', '1983-06-27', 'FEMALE'],
  ['Demo', 'Patient-Hotel', '2010-12-05', 'MALE'],
];

async function seedPlatformAdmin() {
  const email = process.env.SEED_PLATFORM_ADMIN_EMAIL;
  const password = process.env.SEED_PLATFORM_ADMIN_PASSWORD;
  if (!email || !password) {
    console.warn('SEED_PLATFORM_ADMIN_EMAIL/PASSWORD not set — skipping platform admin.');
    return;
  }
  const role = await prisma.role.findUniqueOrThrow({ where: { key: 'PLATFORM_ADMIN' } });
  const user = await prisma.user.upsert({
    where: { email },
    create: { email, passwordHash: await hash(password), firstName: 'Platform', lastName: 'Administrator', emailVerifiedAt: new Date() },
    update: {},
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, create: { userId: user.id, roleId: role.id }, update: {} });
  console.warn(`Platform admin ready: ${email}`);
}

async function seedDemoClinic() {
  if (await prisma.clinic.findUnique({ where: { slug: 'demo-health-clinic' } })) {
    console.warn('Demo clinic already exists — skipping.');
    return;
  }
  const pw = await hash(DEMO_PASSWORD);
  const plan = await prisma.plan.findUniqueOrThrow({ where: { code: 'PROFESSIONAL' } });
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Demo Health Clinic (synthetic data)',
      slug: 'demo-health-clinic',
      status: 'ACTIVE',
      approvedAt: new Date(),
      city: 'Addis Ababa',
      subCity: 'Bole',
      phone: '+251900000000',
      email: 'clinic@demo.afyalink.local',
      timezone: 'Africa/Addis_Ababa',
      subscriptions: {
        create: {
          planId: plan.id,
          status: 'TRIALING',
          trialEndsAt: new Date(Date.now() + 30 * 86_400_000),
          currentPeriodStart: new Date(),
          currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
        },
      },
    },
  });

  const mk = async (email: string, first: string, last: string, role: 'CLINIC_ADMIN' | 'DOCTOR' | 'RECEPTIONIST' | 'LABORATORY_STAFF') => {
    const user = await prisma.user.create({ data: { email, passwordHash: pw, firstName: first, lastName: last, emailVerifiedAt: new Date() } });
    const m = await prisma.clinicMembership.create({ data: { clinicId: clinic.id, userId: user.id, role, status: 'ACTIVE' } });
    return { user, m };
  };
  await mk('admin@demo.afyalink.local', 'Demo', 'Administrator', 'CLINIC_ADMIN');
  const doc = await mk('doctor@demo.afyalink.local', 'Demo', 'Doctor', 'DOCTOR');
  const doc2 = await mk('doctor2@demo.afyalink.local', 'Demo', 'Paediatrician', 'DOCTOR');
  const reception = await mk('reception@demo.afyalink.local', 'Demo', 'Receptionist', 'RECEPTIONIST');
  await mk('lab@demo.afyalink.local', 'Demo', 'Lab Technician', 'LABORATORY_STAFF');

  const doctors = [];
  for (const [d, specialty] of [[doc, 'General practice'], [doc2, 'Paediatrics']] as const) {
    doctors.push(
      await prisma.doctorProfile.create({
        data: {
          clinicId: clinic.id,
          membershipId: d.m.id,
          specialty,
          availability: {
            create: [1, 2, 3, 4, 5].map((day) => ({ dayOfWeek: day, startMinute: 8 * 60 + 30, endMinute: 17 * 60 + 30 })).concat([{ dayOfWeek: 6, startMinute: 9 * 60, endMinute: 13 * 60 }]),
          },
        },
      }),
    );
  }
  const services = await Promise.all(
    [
      ['General consultation', 30, 30000],
      ['Follow-up visit', 20, 20000],
      ['Child wellness check', 30, 25000],
      ['Blood pressure check', 15, 10000],
    ].map(([name, durationMinutes, priceEtbCents]) =>
      prisma.clinicService.create({ data: { clinicId: clinic.id, name: name as string, durationMinutes: durationMinutes as number, priceEtbCents: priceEtbCents as number } }),
    ),
  );
  await prisma.laboratory.create({ data: { clinicId: clinic.id, name: 'Demo in-house laboratory' } });

  let seq = 0;
  const patients = [];
  for (const [first, last, dob, sex] of SYNTHETIC_PATIENTS) {
    seq++;
    const p = await prisma.patient.create({
      data: {
        clinicId: clinic.id,
        medicalRecordNumber: `MRN-${String(seq).padStart(6, '0')}`,
        firstName: first,
        lastName: last,
        dateOfBirth: new Date(`${dob}T00:00:00Z`),
        sex,
        phone: `+2519000000${String(seq).padStart(2, '0')}`,
        city: 'Addis Ababa',
        createdAt: new Date(Date.now() - (40 - seq * 4) * 86_400_000),
        consents: {
          create: [
            { clinicId: clinic.id, type: 'DATA_PROCESSING', granted: true, method: 'IN_PERSON_WRITTEN', recordedById: reception.user.id },
            { clinicId: clinic.id, type: 'SMS_REMINDERS', granted: seq % 2 === 0, method: 'IN_PERSON_WRITTEN', recordedById: reception.user.id },
          ],
        },
      },
    });
    patients.push(p);
  }
  await prisma.clinic.update({ where: { id: clinic.id }, data: { mrnSequence: seq } });

  // Appointments: past (completed / no-show / cancelled) and upcoming, all within availability (Addis = UTC+3).
  const addis = (daysAhead: number, hh: number, mm = 0) => {
    const local = new Date(Date.now() + 3 * 3_600_000);
    local.setUTCDate(local.getUTCDate() + daysAhead);
    return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hh - 3, mm));
  };
  const plan2: [number, number, number, 'COMPLETED' | 'NO_SHOW' | 'CANCELLED' | 'CONFIRMED' | 'PENDING'][] = [];
  for (let d = -13; d <= 7; d++) {
    const date = addis(d, 12);
    const dow = new Date(date.getTime() + 3 * 3_600_000).getUTCDay();
    if (dow === 0) continue;
    const slots = dow === 6 ? [9, 10] : [9, 10, 11, 14, 15];
    slots.forEach((h, i) => {
      const status = d < 0 ? (i === 3 ? 'NO_SHOW' : i === 4 ? 'CANCELLED' : 'COMPLETED') : i === 0 && d > 0 ? 'PENDING' : 'CONFIRMED';
      plan2.push([d, h, i, status]);
    });
  }
  for (const [d, h, i, status] of plan2) {
    const startAt = addis(d, h);
    const doctor = doctors[i % 2]!;
    const service = services[i % services.length]!;
    const patient = patients[(i + d + 20) % patients.length]!;
    await prisma.appointment.create({
      data: {
        clinicId: clinic.id,
        patientId: patient.id,
        doctorId: doctor.id,
        serviceId: service.id,
        startAt,
        endAt: new Date(startAt.getTime() + service.durationMinutes * 60_000),
        status,
        bookedById: reception.user.id,
        statusHistory: { create: { toStatus: status, changedById: reception.user.id } },
      },
    });
    await prisma.careAssignment.upsert({
      where: { patientId_doctorId: { patientId: patient.id, doctorId: doctor.id } },
      create: { clinicId: clinic.id, patientId: patient.id, doctorId: doctor.id },
      update: {},
    });
  }

  const today = addis(0, 12).toISOString().slice(0, 10);
  await prisma.followUp.createMany({
    data: [
      { clinicId: clinic.id, patientId: patients[0]!.id, title: 'Call to schedule review visit', dueDate: new Date(`${today}T00:00:00Z`), priority: 'HIGH', createdById: reception.user.id, assignedToUserId: reception.user.id },
      { clinicId: clinic.id, patientId: patients[1]!.id, title: 'Confirm lab sample collection', dueDate: new Date(Date.now() + 2 * 86_400_000), priority: 'NORMAL', createdById: doc.user.id, assignedToUserId: doc.user.id },
    ],
  });
  console.warn(`Demo clinic seeded with synthetic data. Demo password: ${process.env.SEED_DEMO_PASSWORD ? '(from SEED_DEMO_PASSWORD)' : DEMO_PASSWORD}`);
}

async function main() {
  await seedReferenceData(prisma);
  console.warn('Reference data (roles, permissions, plans) seeded.');
  await seedPlatformAdmin();
  const isProd = process.env.NODE_ENV === 'production';
  if (process.env.SEED_DEMO === 'false' || (isProd && process.env.SEED_DEMO !== 'true')) {
    console.warn('Skipping synthetic demo clinic.');
    return;
  }
  await seedDemoClinic();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
