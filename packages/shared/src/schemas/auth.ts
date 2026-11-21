import { z } from 'zod';
import { emailSchema, passwordSchema, text } from './common';
import type { ClinicRole, ClinicStatus, Role } from '../enums';

export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    mfaCode: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const activateAccountSchema = z
  .object({
    token: text(200, 20),
    password: passwordSchema,
    firstName: text(80).optional(),
    lastName: text(80).optional(),
  })
  .strict();
export type ActivateAccountInput = z.infer<typeof activateAccountSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const mfaVerifySchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

export interface MembershipSummary {
  clinicId: string;
  clinicName: string;
  clinicStatus: ClinicStatus;
  role: ClinicRole;
}

export interface CurrentUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  preferredLanguage: string;
  platformRoles: Role[];
  mfaEnabled: boolean;
  memberships: MembershipSummary[];
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
  user: CurrentUser;
}
