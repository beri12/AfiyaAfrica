import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';
import type { ClinicRole, Permission, Role } from '@afyalink/shared';
import type { Request } from 'express';

export const ACCESS_KEY = 'afyalink:access';

/**
 * Every route MUST declare exactly one access policy. Routes with none are rejected by AccessGuard
 * (deny-by-default), and a test enumerates routes to make sure.
 */
export type AccessPolicy =
  | { kind: 'public' }
  | { kind: 'authenticated' }
  | { kind: 'platform' }
  | { kind: 'tenant'; permissions: Permission[]; allowPendingClinic: boolean };

export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessPolicy);

/** Any signed-in user; no clinic context (e.g. /auth/me, patient portal). */
export const Authenticated = () =>
  applyDecorators(SetMetadata(ACCESS_KEY, { kind: 'authenticated' } satisfies AccessPolicy), ApiBearerAuth());

export const PlatformAdmin = () =>
  applyDecorators(SetMetadata(ACCESS_KEY, { kind: 'platform' } satisfies AccessPolicy), ApiBearerAuth());

/** Requires an active membership in the clinic named by `X-Clinic-Id` with all listed permissions. */
export const RequirePermissions = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(ACCESS_KEY, { kind: 'tenant', permissions, allowPendingClinic: false } satisfies AccessPolicy),
    ApiBearerAuth(),
    ApiHeader({ name: 'X-Clinic-Id', required: true, description: 'Active clinic (tenant) id' }),
  );

/** Like RequirePermissions but also usable while the clinic awaits platform approval. */
export const RequirePermissionsPendingOk = (...permissions: Permission[]) =>
  applyDecorators(
    SetMetadata(ACCESS_KEY, { kind: 'tenant', permissions, allowPendingClinic: true } satisfies AccessPolicy),
    ApiBearerAuth(),
    ApiHeader({ name: 'X-Clinic-Id', required: true }),
  );

export interface AuthUser {
  id: string;
  platformRoles: Role[];
}

export interface TenantContext {
  clinicId: string;
  clinicTimezone: string;
  role: ClinicRole;
  membershipId: string;
  userId: string;
}

export type AuthedRequest = Request & { user?: AuthUser; tenant?: TenantContext };

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.user) throw new Error('CurrentUser used on a route without authentication');
  return req.user;
});

export const Tenant = createParamDecorator((_: unknown, ctx: ExecutionContext): TenantContext => {
  const req = ctx.switchToHttp().getRequest<AuthedRequest>();
  if (!req.tenant) throw new Error('Tenant used on a route without tenant access policy');
  return req.tenant;
});
