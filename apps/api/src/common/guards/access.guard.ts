import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { roleHasAll, type ClinicRole, type Role } from '@afyalink/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_KEY, type AccessPolicy, type AuthedRequest } from '../decorators/access';
import { Errors } from '../http/errors';

export interface AccessTokenPayload {
  sub: string;
  roles: Role[];
  typ: 'access';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Global guard. Deny-by-default: a route without an access policy is rejected.
 * For tenant routes it re-validates membership + clinic status against the database on every request.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const policy = this.reflector.getAllAndOverride<AccessPolicy | undefined>(ACCESS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();

    if (!policy) {
      this.logger.error(`Route ${req.method} ${req.path} has no access policy — denied`);
      throw Errors.forbidden('Route is not accessible');
    }
    if (policy.kind === 'public') return true;

    const payload = await this.verifyToken(req);
    req.user = { id: payload.sub, platformRoles: payload.roles };

    if (policy.kind === 'authenticated') return true;

    if (policy.kind === 'platform') {
      if (!payload.roles.includes('PLATFORM_ADMIN')) throw Errors.forbidden();
      // Re-check DB so a revoked platform role takes effect immediately.
      const role = await this.prisma.userRole.findFirst({
        where: { userId: payload.sub, role: { key: 'PLATFORM_ADMIN' }, user: { deletedAt: null } },
        select: { id: true },
      });
      if (!role) throw Errors.forbidden();
      return true;
    }

    const clinicId = req.header('x-clinic-id');
    if (!clinicId || !UUID.test(clinicId)) {
      throw Errors.badRequest('CLINIC_CONTEXT_REQUIRED', 'A valid X-Clinic-Id header is required');
    }
    const membership = await this.prisma.clinicMembership.findFirst({
      where: { clinicId, userId: payload.sub, status: 'ACTIVE', deletedAt: null, user: { deletedAt: null } },
      select: { id: true, role: true, clinic: { select: { status: true, timezone: true, deletedAt: true } } },
    });
    // Same error whether the clinic doesn't exist or the user isn't a member: no tenant enumeration.
    if (!membership || membership.clinic.deletedAt) throw Errors.forbidden('You are not a member of this clinic');

    const clinicStatus = membership.clinic.status;
    if (clinicStatus !== 'ACTIVE' && !(policy.allowPendingClinic && clinicStatus === 'PENDING_APPROVAL')) {
      throw Errors.forbidden(
        clinicStatus === 'PENDING_APPROVAL' ? 'This clinic is awaiting approval' : 'This clinic is not active',
      );
    }

    const role = membership.role as ClinicRole;
    if (!roleHasAll(role, policy.permissions)) throw Errors.forbidden();

    req.tenant = {
      clinicId,
      clinicTimezone: membership.clinic.timezone,
      role,
      membershipId: membership.id,
      userId: payload.sub,
    };
    return true;
  }

  private async verifyToken(req: AuthedRequest): Promise<AccessTokenPayload> {
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw Errors.unauthorized();
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, { algorithms: ['HS256'] });
      if (payload.typ !== 'access' || typeof payload.sub !== 'string') throw new Error('bad token type');
      return { ...payload, roles: Array.isArray(payload.roles) ? payload.roles : [] };
    } catch {
      throw Errors.unauthorized('Session expired or invalid');
    }
  }
}
