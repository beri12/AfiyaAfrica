import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type {
  ActivateAccountInput,
  AuthTokens,
  ChangePasswordInput,
  ClinicRole,
  CurrentUser,
  LoginInput,
  Role,
} from '@afyalink/shared';
import { PrismaService, type Tx } from '../../common/prisma/prisma.service';
import { EncryptionService, randomToken, sha256 } from '../../common/crypto/encryption.service';
import { AppConfig } from '../../config/config.module';
import { Errors } from '../../common/http/errors';
import { RequestContext } from '../../common/context/request-context';
import { AuditService } from '../audit/audit.service';
import { PasswordService } from './password.service';
import { generateTotpSecret, totpUri, verifyTotp } from './totp';
import type { AccessTokenPayload } from '../../common/guards/access.guard';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
const ACTIVATION_TTL_HOURS = 72;

export interface IssuedSession extends AuthTokens {
  refreshToken: string;
  refreshExpiresAt: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
    private readonly passwords: PasswordService,
    private readonly crypto: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  // ───────── Login / sessions ─────────

  async login(input: LoginInput): Promise<IssuedSession | { mfaRequired: true }> {
    const user = await this.prisma.user.findFirst({ where: { email: input.email, deletedAt: null } });
    const invalid = () => Errors.unauthorized('Invalid email or password');

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      await this.passwords.verify(null, input.password); // keep timing uniform
      throw Errors.unauthorized('Account temporarily locked after repeated failed sign-ins. Try again later.');
    }

    const ok = await this.passwords.verify(user?.passwordHash, input.password);
    if (!user || !ok) {
      if (user) await this.recordFailedLogin(user.id, user.failedLoginCount);
      throw invalid();
    }

    if (user.mfaEnabled) {
      if (!input.mfaCode) return { mfaRequired: true };
      const secret = this.crypto.decryptOptional(user.mfaSecretEnc);
      if (!secret || !verifyTotp(secret, input.mfaCode)) {
        await this.recordFailedLogin(user.id, user.failedLoginCount);
        throw Errors.unauthorized('Invalid verification code');
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.audit.log({ actorUserId: user.id, action: 'auth.login', entityType: 'User', entityId: user.id });
    return this.createSession(user.id, randomUUID());
  }

  private async recordFailedLogin(userId: string, current: number): Promise<void> {
    const count = current + 1;
    const lock = count >= MAX_FAILED_LOGINS;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: lock ? 0 : count,
        lockedUntil: lock ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000) : undefined,
      },
    });
    await this.audit.log({
      actorUserId: userId,
      action: lock ? 'auth.account_locked' : 'auth.login_failed',
      entityType: 'User',
      entityId: userId,
    });
  }

  /**
   * Rotates a refresh token. If a token that was already rotated/revoked is presented, the whole family is
   * revoked (likely theft) and the caller must sign in again.
   */
  async refresh(rawToken: string | undefined): Promise<IssuedSession> {
    if (!rawToken) throw Errors.unauthorized('No session');
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!session) throw Errors.unauthorized('Session invalid');

    if (session.rotatedAt || session.revokedAt) {
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'refresh_token_reuse' },
      });
      await this.audit.log({
        actorUserId: session.userId,
        action: 'auth.refresh_reuse_detected',
        entityType: 'Session',
        entityId: session.familyId,
      });
      this.logger.warn(`Refresh token reuse detected for family ${session.familyId}`);
      throw Errors.unauthorized('Session invalid');
    }
    if (session.expiresAt <= new Date()) throw Errors.unauthorized('Session expired');

    const user = await this.prisma.user.findFirst({ where: { id: session.userId, deletedAt: null } });
    if (!user) throw Errors.unauthorized('Session invalid');

    // Atomic claim: only one concurrent refresh can rotate this token.
    const claimed = await this.prisma.session.updateMany({
      where: { id: session.id, rotatedAt: null, revokedAt: null },
      data: { rotatedAt: new Date() },
    });
    if (claimed.count !== 1) throw Errors.unauthorized('Session invalid');

    return this.createSession(user.id, session.familyId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    const session = await this.prisma.session.findUnique({ where: { tokenHash: sha256(rawToken) } });
    if (!session) return;
    await this.prisma.session.updateMany({
      where: { familyId: session.familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: 'logout' },
    });
    await this.audit.log({ actorUserId: session.userId, action: 'auth.logout', entityType: 'User', entityId: session.userId });
  }

  private async createSession(userId: string, familyId: string): Promise<IssuedSession> {
    const refreshToken = randomToken(32);
    const refreshExpiresAt = new Date(Date.now() + this.config.get('REFRESH_TOKEN_TTL_DAYS') * 86_400_000);
    const ctx = RequestContext.get();
    await this.prisma.session.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ipAddress: ctx?.ipAddress,
        userAgent: ctx?.userAgent,
      },
    });
    const user = await this.getCurrentUser(userId);
    const payload: AccessTokenPayload = { sub: userId, roles: user.platformRoles, typ: 'access' };
    const expiresIn = this.config.get('ACCESS_TOKEN_TTL_SECONDS');
    const accessToken = await this.jwt.signAsync(payload, { expiresIn, algorithm: 'HS256' });
    return { accessToken, expiresIn, user, refreshToken, refreshExpiresAt };
  }

  async getCurrentUser(userId: string): Promise<CurrentUser> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: {
        roles: { include: { role: true } },
        memberships: {
          where: { status: 'ACTIVE', deletedAt: null, clinic: { deletedAt: null } },
          include: { clinic: { select: { id: true, name: true, status: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!user) throw Errors.unauthorized();
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      preferredLanguage: user.preferredLanguage,
      mfaEnabled: user.mfaEnabled,
      platformRoles: user.roles.map((r) => r.role.key as Role),
      memberships: user.memberships.map((m) => ({
        clinicId: m.clinic.id,
        clinicName: m.clinic.name,
        clinicStatus: m.clinic.status,
        role: m.role as ClinicRole,
      })),
    };
  }

  // ───────── Activation (invited staff & patients) ─────────

  /** Creates a single-use activation token. Returns the raw token (only time it exists in plaintext). */
  async createActivationToken(userId: string, tx?: Tx): Promise<string> {
    const token = randomToken(32);
    const db = tx ?? this.prisma;
    await db.actionToken.updateMany({
      where: { userId, type: 'ACCOUNT_ACTIVATION', consumedAt: null },
      data: { consumedAt: new Date() },
    });
    await db.actionToken.create({
      data: {
        userId,
        type: 'ACCOUNT_ACTIVATION',
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ACTIVATION_TTL_HOURS * 3_600_000),
      },
    });
    return token;
  }

  async activate(input: ActivateAccountInput): Promise<IssuedSession> {
    const record = await this.prisma.actionToken.findUnique({ where: { tokenHash: sha256(input.token) } });
    if (!record || record.type !== 'ACCOUNT_ACTIVATION' || record.consumedAt || record.expiresAt <= new Date()) {
      throw Errors.badRequest('INVALID_TOKEN', 'This activation link is invalid or has expired');
    }
    const passwordHash = await this.passwords.hash(input.password);
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.actionToken.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw Errors.badRequest('INVALID_TOKEN', 'This activation link was already used');
      await tx.user.update({
        where: { id: record.userId },
        data: {
          passwordHash,
          emailVerifiedAt: new Date(),
          ...(input.firstName ? { firstName: input.firstName } : {}),
          ...(input.lastName ? { lastName: input.lastName } : {}),
        },
      });
      await tx.clinicMembership.updateMany({
        where: { userId: record.userId, status: 'INVITED' },
        data: { status: 'ACTIVE' },
      });
      await this.audit.log(
        { actorUserId: record.userId, action: 'auth.account_activated', entityType: 'User', entityId: record.userId },
        tx,
      );
    });
    return this.createSession(record.userId, randomUUID());
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user || !(await this.passwords.verify(user.passwordHash, input.currentPassword))) {
      throw Errors.badRequest('INVALID_PASSWORD', 'Current password is incorrect');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.passwords.hash(input.newPassword) } }),
      this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: 'password_changed' },
      }),
    ]);
    await this.audit.log({ actorUserId: userId, action: 'auth.password_changed', entityType: 'User', entityId: userId });
  }

  // ───────── MFA (TOTP) ─────────

  async beginMfaSetup(userId: string): Promise<{ secret: string; otpauthUri: string }> {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
    if (user.mfaEnabled) throw Errors.conflict('MFA_ALREADY_ENABLED', 'MFA is already enabled');
    const secret = generateTotpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: this.crypto.encrypt(secret) } });
    return { secret, otpauthUri: totpUri(secret, user.email) };
  }

  async enableMfa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
    const secret = this.crypto.decryptOptional(user.mfaSecretEnc);
    if (!secret || !verifyTotp(secret, code)) throw Errors.badRequest('INVALID_CODE', 'Invalid verification code');
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.log({ actorUserId: userId, action: 'auth.mfa_enabled', entityType: 'User', entityId: userId });
  }

  async disableMfa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
    const secret = this.crypto.decryptOptional(user.mfaSecretEnc);
    if (!user.mfaEnabled || !secret || !verifyTotp(secret, code)) {
      throw Errors.badRequest('INVALID_CODE', 'Invalid verification code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: false, mfaSecretEnc: null } });
    await this.audit.log({ actorUserId: userId, action: 'auth.mfa_disabled', entityType: 'User', entityId: userId });
  }
}
