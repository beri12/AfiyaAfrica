import { Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  activateAccountSchema,
  changePasswordSchema,
  loginSchema,
  mfaVerifySchema,
  type ActivateAccountInput,
  type AuthTokens,
  type ChangePasswordInput,
  type LoginInput,
  type MfaVerifyInput,
} from '@afyalink/shared';
import { Authenticated, CurrentUser, Public, type AuthUser } from '../../common/decorators/access';
import { ZodBody } from '../../common/pipes/zod';
import { Errors } from '../../common/http/errors';
import { AppConfig } from '../../config/config.module';
import { AuthService, type IssuedSession } from './auth.service';

export const REFRESH_COOKIE = 'afy_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
/** Custom header required on cookie-authenticated endpoints; cross-site forms cannot set it (CSRF defence). */
export const CSRF_HEADER = 'x-requested-with';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Sign in with email + password (+ TOTP code when MFA is enabled)' })
  async login(@ZodBody(loginSchema) body: LoginInput, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(body);
    if ('mfaRequired' in result) return result;
    return this.respondWithSession(res, result);
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Rotate the refresh-token cookie and issue a new access token' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    this.assertCsrfHeader(req);
    try {
      const session = await this.auth.refresh(this.readCookie(req));
      return this.respondWithSession(res, session);
    } catch (e) {
      this.clearCookie(res);
      throw e;
    }
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertCsrfHeader(req);
    await this.auth.logout(this.readCookie(req));
    this.clearCookie(res);
  }

  @Post('activate')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Activate an invited account by setting a password' })
  async activate(@ZodBody(activateAccountSchema) body: ActivateAccountInput, @Res({ passthrough: true }) res: Response) {
    return this.respondWithSession(res, await this.auth.activate(body));
  }

  @Get('me')
  @Authenticated()
  me(@CurrentUser() user: AuthUser) {
    return this.auth.getCurrentUser(user.id);
  }

  @Post('change-password')
  @Authenticated()
  @HttpCode(204)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @ZodBody(changePasswordSchema) body: ChangePasswordInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user.id, body);
    this.clearCookie(res);
  }

  @Post('mfa/setup')
  @Authenticated()
  @HttpCode(200)
  mfaSetup(@CurrentUser() user: AuthUser) {
    return this.auth.beginMfaSetup(user.id);
  }

  @Post('mfa/enable')
  @Authenticated()
  @HttpCode(204)
  async mfaEnable(@CurrentUser() user: AuthUser, @ZodBody(mfaVerifySchema) body: MfaVerifyInput): Promise<void> {
    await this.auth.enableMfa(user.id, body.code);
  }

  @Post('mfa/disable')
  @Authenticated()
  @HttpCode(204)
  async mfaDisable(@CurrentUser() user: AuthUser, @ZodBody(mfaVerifySchema) body: MfaVerifyInput): Promise<void> {
    await this.auth.disableMfa(user.id, body.code);
  }

  private respondWithSession(res: Response, session: IssuedSession): AuthTokens {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, expiresIn: session.expiresIn, user: session.user };
  }

  private clearCookie(res: Response): void {
    res.clearCookie(REFRESH_COOKIE, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
    });
  }

  private readCookie(req: Request): string | undefined {
    const v = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    return typeof v === 'string' && v.length > 0 && v.length < 200 ? v : undefined;
  }

  private assertCsrfHeader(req: Request): void {
    if (req.header(CSRF_HEADER) !== 'afyalink') {
      throw Errors.forbidden('Missing anti-CSRF header');
    }
  }
}
