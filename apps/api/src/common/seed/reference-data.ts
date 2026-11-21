import type { PrismaClient } from '@prisma/client';
import { DEFAULT_PLANS, PERMISSIONS, ROLE_PERMISSIONS, ROLES } from '@afyalink/shared';

const ROLE_DESCRIPTIONS: Record<(typeof ROLES)[number], string> = {
  PLATFORM_ADMIN: 'Platform operator: clinic approval, subscriptions, system health, support',
  CLINIC_ADMIN: 'Clinic administrator: settings, staff, services, appointments, analytics, billing',
  DOCTOR: 'Clinician: assigned patients, clinical documentation, appointments',
  RECEPTIONIST: 'Front desk: patient registration, contact details, appointments',
  PATIENT: 'Patient: own profile, appointment requests, permitted records, consent',
  LABORATORY_STAFF: 'Laboratory: assigned orders and results only',
};

/**
 * Idempotently seeds roles, permissions (mirroring the code-defined matrix) and plans.
 * Safe to run in every environment; contains no personal data.
 */
export async function seedReferenceData(prisma: PrismaClient): Promise<void> {
  for (const key of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key }, create: { key, description: key }, update: {} });
  }
  const permissions = await prisma.permission.findMany();
  for (const key of ROLES) {
    const role = await prisma.role.upsert({
      where: { key },
      create: { key, name: key.replace(/_/g, ' ').toLowerCase(), description: ROLE_DESCRIPTIONS[key] },
      update: { description: ROLE_DESCRIPTIONS[key] },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: ROLE_PERMISSIONS[key].map((p) => ({ roleId: role.id, permissionId: permissions.find((x) => x.key === p)!.id })),
    });
  }
  for (const plan of DEFAULT_PLANS) {
    const data = {
      name: plan.name,
      monthlyPriceUsdCents: plan.monthlyPriceUsdCents,
      priceIsFrom: plan.priceIsFrom,
      maxStaff: plan.maxStaff,
      maxPatients: plan.maxPatients,
      aiEnabled: plan.aiEnabled,
      smsReminders: plan.smsReminders,
      features: plan.features,
    };
    await prisma.plan.upsert({ where: { code: plan.code }, create: { code: plan.code, ...data }, update: data });
  }
}
