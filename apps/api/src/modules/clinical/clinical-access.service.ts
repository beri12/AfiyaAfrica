import { Injectable } from '@nestjs/common';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { Errors } from '../../common/http/errors';
import type { TenantContext } from '../../common/decorators/access';

/**
 * Clinical data is gated twice: by permission (role) and by an active care relationship between the doctor
 * and the patient. Receptionists and clinic admins never reach clinical content.
 */
@Injectable()
export class ClinicalAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async doctorIdFor(t: TenantContext, tx?: Tx): Promise<string> {
    if (t.role !== 'DOCTOR') throw Errors.forbidden('Clinical records are restricted to treating clinicians');
    const doctor = await (tx ?? this.prisma).doctorProfile.findUnique({ where: { membershipId: t.membershipId }, select: { id: true } });
    if (!doctor) throw Errors.forbidden('Doctor profile not found');
    return doctor.id;
  }

  /** Throws 404 (not 403) when the patient is outside the doctor's care, to avoid confirming existence. */
  async assertCareAccess(t: TenantContext, patientId: string, tx?: Tx): Promise<string> {
    const doctorId = await this.doctorIdFor(t, tx);
    const care = await (tx ?? this.prisma).careAssignment.findFirst({
      where: { clinicId: t.clinicId, patientId, doctorId, endedAt: null, patient: { deletedAt: null } },
      select: { id: true },
    });
    if (!care) throw Errors.notFound('Patient');
    return doctorId;
  }

  async careDoctorPatientIds(t: TenantContext): Promise<string[]> {
    const doctorId = await this.doctorIdFor(t);
    const rows = await this.prisma.careAssignment.findMany({
      where: { clinicId: t.clinicId, doctorId, endedAt: null },
      select: { patientId: true },
    });
    return rows.map((r) => r.patientId);
  }
}
