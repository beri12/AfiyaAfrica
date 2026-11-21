import { as, createClinicWorld, createPlatformAdmin, createTestApp, login, PASSWORD, resetDb, type TestCtx } from './helpers';
import { ModulesContainer } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants';
import { hotp } from '../src/modules/auth/totp';
import { ACCESS_KEY } from '../src/common/decorators/access';

describe('Auth (integration)', () => {
  let ctx: TestCtx;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  beforeEach(async () => resetDb(ctx.prisma));
  afterAll(async () => ctx.app.close());

  const refreshCookie = (res: { headers: Record<string, unknown> }) =>
    ((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) => c.startsWith('afy_rt='))!.split(';')[0]!;

  it('rejects wrong passwords with a generic message and locks after repeated failures', async () => {
    const platform = await createPlatformAdmin(ctx);
    expect(platform.token).toBeTruthy();
    for (let i = 0; i < 4; i++) {
      const r = await ctx.http().post('/api/v1/auth/login').send({ email: 'platform@test.local', password: 'wrong-password-1' });
      expect(r.status).toBe(401);
      expect(r.body.error.message).toBe('Invalid email or password');
    }
    await ctx.http().post('/api/v1/auth/login').send({ email: 'platform@test.local', password: 'wrong-password-1' }).expect(401);
    // Locked: even the right password fails now.
    const locked = await ctx.http().post('/api/v1/auth/login').send({ email: 'platform@test.local', password: PASSWORD });
    expect(locked.status).toBe(401);
    expect(locked.body.error.message).toMatch(/locked/);
  });

  it('rate-limits login attempts', async () => {
    process.env.THROTTLE_IN_TESTS = 'true';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 12; i++) {
        const r = await ctx.http().post('/api/v1/auth/login').send({ email: 'rl@test.local', password: 'whatever-123' });
        statuses.push(r.status);
      }
      expect(statuses).toContain(429);
    } finally {
      process.env.THROTTLE_IN_TESTS = 'false';
    }
  });

  it('does not reveal whether an email exists', async () => {
    const r = await ctx.http().post('/api/v1/auth/login').send({ email: 'nobody@test.local', password: 'whatever-123' });
    expect(r.status).toBe(401);
    expect(r.body.error.message).toBe('Invalid email or password');
  });

  it('stores passwords as argon2id hashes', async () => {
    await createPlatformAdmin(ctx);
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'platform@test.local' } });
    expect(u.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rotates refresh tokens and revokes the family on reuse', async () => {
    await createPlatformAdmin(ctx);
    const loginRes = await ctx.http().post('/api/v1/auth/login').send({ email: 'platform@test.local', password: PASSWORD }).expect(200);
    const cookie1 = refreshCookie(loginRes);
    expect(loginRes.headers['set-cookie']![0]).toMatch(/HttpOnly/);
    expect(loginRes.headers['set-cookie']![0]).toMatch(/SameSite=Strict/);

    // Missing anti-CSRF header is rejected.
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookie1).expect(403);

    const r1 = await ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookie1).set('X-Requested-With', 'afyalink').expect(200);
    const cookie2 = refreshCookie(r1);
    expect(cookie2).not.toEqual(cookie1);

    // Reusing the old token → 401 and the whole family (including cookie2) is revoked.
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookie1).set('X-Requested-With', 'afyalink').expect(401);
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookie2).set('X-Requested-With', 'afyalink').expect(401);
  });

  it('logout revokes the session', async () => {
    await createPlatformAdmin(ctx);
    const loginRes = await ctx.http().post('/api/v1/auth/login').send({ email: 'platform@test.local', password: PASSWORD });
    const cookie = refreshCookie(loginRes);
    await ctx.http().post('/api/v1/auth/logout').set('Cookie', cookie).set('X-Requested-With', 'afyalink').expect(204);
    await ctx.http().post('/api/v1/auth/refresh').set('Cookie', cookie).set('X-Requested-With', 'afyalink').expect(401);
  });

  it('rejects tampered and missing access tokens', async () => {
    await ctx.http().get('/api/v1/auth/me').expect(401);
    const s = await createPlatformAdmin(ctx);
    const parts = s.token.split('.');
    const forged = `${parts[0]}.${Buffer.from(JSON.stringify({ sub: s.userId, roles: ['PLATFORM_ADMIN'], typ: 'access' })).toString('base64url')}.${parts[2]}`;
    await ctx.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${forged}`).expect(401);
    await ctx.http().get('/api/v1/auth/me').set('Authorization', `Bearer ${s.token}`).expect(200);
  });

  it('supports TOTP MFA enrolment and requires the code at login', async () => {
    const s = await createPlatformAdmin(ctx);
    const setup = await as(ctx, s).post('/auth/mfa/setup').expect(200);
    const secret: string = setup.body.data.secret;
    const code = () => hotp(secret, Math.floor(Date.now() / 30_000));
    await as(ctx, s).post('/auth/mfa/enable', { code: '000000' === code() ? '111111' : '000000' }).expect(400);
    await as(ctx, s).post('/auth/mfa/enable', { code: code() }).expect(204);

    const noCode = await ctx.http().post('/api/v1/auth/login').send({ email: 'platform@test.local', password: PASSWORD }).expect(200);
    expect(noCode.body.data).toEqual({ mfaRequired: true });
    const withCode = await ctx.http().post('/api/v1/auth/login').send({ email: 'platform@test.local', password: PASSWORD, mfaCode: code() }).expect(200);
    expect(withCode.body.data.accessToken).toBeTruthy();
    const u = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'platform@test.local' } });
    expect(u.mfaSecretEnc).toMatch(/^v1:/); // encrypted at rest
  });

  it('activation tokens are single-use', async () => {
    const platform = await createPlatformAdmin(ctx);
    const world = await createClinicWorld(ctx, platform);
    const res = await as(ctx, world.admin)
      .post('/staff', { email: 'single@test.local', firstName: 'Once', lastName: 'Only', role: 'RECEPTIONIST' })
      .expect(201);
    const token = new URL(res.body.data.activationUrl).searchParams.get('token');
    await ctx.http().post('/api/v1/auth/activate').send({ token, password: PASSWORD }).expect(200);
    await ctx.http().post('/api/v1/auth/activate').send({ token, password: PASSWORD }).expect(400);
    await login(ctx, 'single@test.local');
  });

  it('every route declares exactly one access policy (deny-by-default)', () => {
    const container = ctx.app.get(ModulesContainer);
    const missing: string[] = [];
    let routes = 0;
    for (const mod of container.values()) {
      for (const wrapper of mod.controllers.values()) {
        const cls = wrapper.metatype as (new (...a: unknown[]) => object) | null;
        if (!cls) continue;
        for (const name of Object.getOwnPropertyNames(cls.prototype)) {
          const handler = (cls.prototype as Record<string, unknown>)[name];
          if (name === 'constructor' || typeof handler !== 'function') continue;
          if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;
          routes++;
          const policy = Reflect.getMetadata(ACCESS_KEY, handler) ?? Reflect.getMetadata(ACCESS_KEY, cls);
          if (!policy) missing.push(`${cls.name}.${name}`);
        }
      }
    }
    expect(routes).toBeGreaterThan(30);
    expect(missing).toEqual([]);
  });
});
