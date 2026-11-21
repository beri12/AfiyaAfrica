import { z } from 'zod';

const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => v === true || v === 'true' || v === '1');

const optional = z
  .string()
  .optional()
  .transform((v) => (v ? v : undefined));

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(4000),
    APP_ORIGIN: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    DATA_ENCRYPTION_KEY: z
      .string()
      .refine((v) => Buffer.from(v, 'base64').length === 32, 'DATA_ENCRYPTION_KEY must be 32 bytes, base64 encoded'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(60).default(14),
    COOKIE_SECURE: bool.default(true),
    TRUST_PROXY: bool.default(false),
    WORKERS_ENABLED: bool.default(true),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    AI_BASE_URL: optional,
    AI_API_KEY: optional,
    AI_MODEL: optional,
    AI_TIMEOUT_MS: z.coerce.number().int().default(30000),
    SMTP_HOST: optional,
    SMTP_PORT: z.coerce.number().int().default(587),
    SMTP_USER: optional,
    SMTP_PASSWORD: optional,
    SMTP_FROM: z.string().default('AfyaLink AI <no-reply@example.com>'),
    SMS_PROVIDER: z.enum(['africastalking', '']).optional().transform((v) => v || undefined),
    SMS_API_KEY: optional,
    SMS_USERNAME: optional,
    SMS_SENDER_ID: optional,
    PAYMENT_PROVIDER: z.enum(['sandbox']).default('sandbox'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && !env.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
    }
    const ai = [env.AI_BASE_URL, env.AI_API_KEY, env.AI_MODEL].filter(Boolean).length;
    if (ai !== 0 && ai !== 3) {
      ctx.addIssue({ code: 'custom', path: ['AI_BASE_URL'], message: 'Set all of AI_BASE_URL, AI_API_KEY, AI_MODEL or none' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}
