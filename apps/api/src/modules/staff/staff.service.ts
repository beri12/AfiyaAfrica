import { Injectable } from '@nestjs/common';
import type { Prisma, RoleKey } from '@prisma/client';
import type {
  ClinicServiceInput,
  InviteStaffInput,
  SetAvailabilityInput,
  UpdateClinicServiceInput,
  UpdateStaffInput,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import { AppConfig } from '../../config/config.module';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { BillingService } from '../billing/billing.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { TenantContext } from '../../common/decorators/access';

const STAFF_SELECT = {
  id: true,
  role: true,
  status: true,
  createdAt: true,
  user: { select: { id: true, email: true, firstName: true, lastName: true, phone: true, lastLoginAt: true, mfaEnabled: true } },
  doctor: { select: { id: true, specialty: true, licenseNumber: true } },
} satisfies Prisma.ClinicMembershipSelect;

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly billing: BillingService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly config: AppConfig,
  ) {}

  async list(clinicId: string) {
    return this.prisma.clinicMembership.findMany({
      where: { clinicId, deletedAt: null, role: { not: 'PATIENT' } },
      select: STAFF_SELECT,
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * Invites a staff member. New users receive a single-use activation link; it is returned once to the inviting
   * admin so it can be handed over even when email delivery is not configured.
   */
  async invite(t: TenantContext, input: InviteStaffInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.billing.assertStaffCapacity(t.clinicId, tx);
      let user = await tx.user.findUnique({ where: { email: input.email } });
      if (user?.deletedAt) throw Errors.conflict('USER_DELETED', 'This account has been deleted');
      const isNewUser = !user || !user.passwordHash;
      if (!user) {
        user = await tx.user.create({
          data: { email: input.email, firstName: input.firstName, lastName: input.lastName, phone: input.phone },
        });
      }
      const existing = await tx.clinicMembership.findUnique({
        where: { clinicId_userId: { clinicId: t.clinicId, userId: user.id } },
      });
      if (existing && !existing.deletedAt) {
        throw Errors.conflict('ALREADY_MEMBER', 'This person is already a member of the clinic');
      }
      const membership = existing
        ? await tx.clinicMembership.update({
            where: { id: existing.id },
            data: { role: input.role, status: isNewUser ? 'INVITED' : 'ACTIVE', deletedAt: null },
          })
        : await tx.clinicMembership.create({
            data: { clinicId: t.clinicId, userId: user.id, role: input.role, status: isNewUser ? 'INVITED' : 'ACTIVE' },
          });
      if (input.role === 'DOCTOR') {
        await tx.doctorProfile.upsert({
          where: { membershipId: membership.id },
          create: { clinicId: t.clinicId, membershipId: membership.id, specialty: input.specialty, licenseNumber: input.licenseNumber },
          update: { specialty: input.specialty, licenseNumber: input.licenseNumber },
        });
      }
      const token = isNewUser ? await this.auth.createActivationToken(user.id, tx) : undefined;
      await this.audit.log(
        {
          clinicId: t.clinicId,
          actorUserId: t.userId,
          action: 'staff.invited',
          entityType: 'ClinicMembership',
          entityId: membership.id,
          metadata: { role: input.role, newUser: isNewUser },
        },
        tx,
      );
      const member = await tx.clinicMembership.findUniqueOrThrow({ where: { id: membership.id }, select: STAFF_SELECT });
      return { member, activationUrl: token ? this.activationUrl(token) : undefined, userId: user.id };
    }).then(async (res) => {
      await this.notifications.notifyUsers([res.userId], {
        clinicId: t.clinicId,
        type: 'STAFF_INVITED',
        title: 'You have been added to a clinic on AfyaLink AI',
        body: res.activationUrl
          ? `Activate your account to get started: ${res.activationUrl}`
          : 'Sign in to AfyaLink AI to access your new clinic.',
        link: '/app',
      });
      return { member: res.member, activationUrl: res.activationUrl };
    });
  }

  async resendInvite(t: TenantContext, membershipId: string) {
    const m = await this.prisma.clinicMembership.findFirst({
      where: { id: membershipId, clinicId: t.clinicId, deletedAt: null, status: 'INVITED' },
      include: { user: true },
    });
    if (!m) throw Errors.notFound('Pending invitation');
    const token = await this.auth.createActivationToken(m.userId);
    await this.audit.log({
      clinicId: t.clinicId,
      actorUserId: t.userId,
      action: 'staff.invite_resent',
      entityType: 'ClinicMembership',
      entityId: m.id,
    });
    return { activationUrl: this.activationUrl(token) };
  }

  async update(t: TenantContext, membershipId: string, input: UpdateStaffInput) {
    const m = await this.prisma.clinicMembership.findFirst({
      where: { id: membershipId, clinicId: t.clinicId, deletedAt: null, role: { not: 'PATIENT' } },
    });
    if (!m) throw Errors.notFound('Staff member');

    const demotingAdmin = m.role === 'CLINIC_ADMIN' && ((input.role && input.role !== 'CLINIC_ADMIN') || input.status === 'DISABLED');
    if (demotingAdmin) {
      const admins = await this.prisma.clinicMembership.count({
        where: { clinicId: t.clinicId, role: 'CLINIC_ADMIN', status: 'ACTIVE', deletedAt: null },
      });
      if (admins <= 1) throw Errors.conflict('LAST_ADMIN', 'A clinic must keep at least one active administrator');
    }
    if (m.userId === t.userId && input.status === 'DISABLED') {
      throw Errors.conflict('SELF_DISABLE', 'You cannot disable your own account');
    }
    if (input.status === 'ACTIVE' && m.status === 'INVITED') {
      throw Errors.conflict('INVITE_PENDING', 'The invited person must activate their account first');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.clinicMembership.update({
        where: { id: m.id },
        data: { ...(input.role ? { role: input.role as RoleKey } : {}), ...(input.status ? { status: input.status } : {}) },
      });
      const role = input.role ?? m.role;
      if (role === 'DOCTOR') {
        await tx.doctorProfile.upsert({
          where: { membershipId: m.id },
          create: { clinicId: t.clinicId, membershipId: m.id, specialty: input.specialty },
          update: input.specialty !== undefined ? { specialty: input.specialty } : {},
        });
      }
      if (input.status === 'DISABLED') {
        // Disabled staff lose access immediately: tenant guard checks membership on every request; also end sessions.
        await tx.session.updateMany({
          where: { userId: m.userId, revokedAt: null },
          data: { revokedAt: new Date(), revokeReason: 'membership_disabled' },
        });
      }
      await this.audit.log(
        {
          clinicId: t.clinicId,
          actorUserId: t.userId,
          action: 'staff.updated',
          entityType: 'ClinicMembership',
          entityId: m.id,
          metadata: { role: input.role, status: input.status },
        },
        tx,
      );
    });
    return this.prisma.clinicMembership.findUniqueOrThrow({ where: { id: m.id }, select: STAFF_SELECT });
  }

  private activationUrl(token: string): string {
    return `${this.config.get('APP_ORIGIN')}/activate?token=${encodeURIComponent(token)}`;
  }

  // ───────── Services ─────────

  listServices(clinicId: string, includeInactive: boolean) {
    return this.prisma.clinicService.findMany({
      where: { clinicId, deletedAt: null, ...(includeInactive ? {} : { active: true }) },
      orderBy: { name: 'asc' },
    });
  }

  async createService(t: TenantContext, input: ClinicServiceInput) {
    const { priceEtb, ...rest } = input;
    const service = await this.prisma.clinicService.create({
      data: { ...rest, clinicId: t.clinicId, priceEtbCents: priceEtb !== undefined ? Math.round(priceEtb * 100) : null },
    });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'service.created', entityType: 'ClinicService', entityId: service.id });
    return service;
  }

  async updateService(t: TenantContext, id: string, input: UpdateClinicServiceInput) {
    const existing = await this.prisma.clinicService.findFirst({ where: { id, clinicId: t.clinicId, deletedAt: null } });
    if (!existing) throw Errors.notFound('Service');
    const { priceEtb, ...rest } = input;
    const service = await this.prisma.clinicService.update({
      where: { id },
      data: { ...rest, ...(priceEtb !== undefined ? { priceEtbCents: Math.round(priceEtb * 100) } : {}) },
    });
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'service.updated', entityType: 'ClinicService', entityId: id });
    return service;
  }

  async archiveService(t: TenantContext, id: string): Promise<void> {
    const res = await this.prisma.clinicService.updateMany({
      where: { id, clinicId: t.clinicId, deletedAt: null },
      data: { deletedAt: new Date(), active: false },
    });
    if (res.count === 0) throw Errors.notFound('Service');
    await this.audit.log({ clinicId: t.clinicId, actorUserId: t.userId, action: 'service.archived', entityType: 'ClinicService', entityId: id });
  }

  // ───────── Doctors ─────────

  listDoctors(clinicId: string) {
    return this.prisma.doctorProfile.findMany({
      where: { clinicId, membership: { status: 'ACTIVE', deletedAt: null, role: 'DOCTOR' } },
      select: {
        id: true,
        specialty: true,
        membership: { select: { user: { select: { id: true, firstName: true, lastName: true } } } },
        availability: { select: { dayOfWeek: true, startMinute: true, endMinute: true }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] },
      },
    });
  }

  async setAvailability(t: TenantContext, doctorId: string, input: SetAvailabilityInput) {
    const doctor = await this.prisma.doctorProfile.findFirst({
      where: { id: doctorId, clinicId: t.clinicId },
      include: { membership: true },
    });
    if (!doctor) throw Errors.notFound('Doctor');
    // Doctors may only edit their own schedule; admins may edit any.
    if (t.role === 'DOCTOR' && doctor.membership.userId !== t.userId) throw Errors.forbidden();
    if (t.role !== 'DOCTOR' && t.role !== 'CLINIC_ADMIN') throw Errors.forbidden();

    await this.prisma.$transaction([
      this.prisma.doctorAvailability.deleteMany({ where: { doctorId } }),
      this.prisma.doctorAvailability.createMany({ data: input.windows.map((w) => ({ ...w, doctorId })) }),
    ]);
    await this.audit.log({
      clinicId: t.clinicId,
      actorUserId: t.userId,
      action: 'doctor.availability_updated',
      entityType: 'DoctorProfile',
      entityId: doctorId,
      metadata: { windows: input.windows.length },
    });
    return this.prisma.doctorAvailability.findMany({ where: { doctorId }, orderBy: [{ dayOfWeek: 'asc' }, { startMinute: 'asc' }] });
  }
}
