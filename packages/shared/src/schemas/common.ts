import { z } from 'zod';

export const uuidSchema = z.string().uuid();

/** Trimmed, non-empty bounded string. */
export const text = (max: number, min = 1) => z.string().trim().min(min).max(max);

/** Optional free text; empty strings normalised to undefined. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === '' ? undefined : v));

/**
 * Phone numbers in E.164. Ethiopian local formats (09XXXXXXXX / 07XXXXXXXX) are normalised to +251.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s-()]/g, ''))
  .transform((v) => (/^0[79]\d{8}$/.test(v) ? `+251${v.slice(1)}` : v))
  .refine((v) => /^\+[1-9]\d{7,14}$/.test(v), { message: 'Enter a valid phone number, e.g. +251911234567' });

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128)
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Password must contain letters and numbers');

export const isoDateTimeSchema = z.string().datetime({ offset: true });
/** Calendar date YYYY-MM-DD. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: PageMeta;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
}
