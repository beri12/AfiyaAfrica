# Security

This document describes the controls implemented in the MVP, how they are verified, and known gaps.

## Authentication

| Control | Implementation | Verified by |
|---|---|---|
| Password hashing | Argon2id (19 MiB, t=2, p=1); timing-equalised for unknown users | `auth.int-spec` |
| Password policy | ≥10 chars with letters and digits (shared Zod schema) | `schemas.test` |
| Lockout | 5 failures → 15-minute lock; audited | `auth.int-spec` |
| Access tokens | HS256 JWT, 15 min, held in browser memory only | `auth.int-spec` (tamper test) |
| Refresh tokens | 256-bit random, SHA-256 hashed at rest, httpOnly + Secure + SameSite=Strict cookie scoped to `/api/v1/auth` | `auth.int-spec` |
| Rotation & reuse detection | Each refresh rotates; replay of a rotated token revokes the whole session family | `auth.int-spec` |
| CSRF | Cookie endpoints require `X-Requested-With: afyalink` (cannot be sent cross-site without CORS preflight, which is restricted to `APP_ORIGIN`); all other endpoints use bearer tokens | `auth.int-spec` |
| MFA | Optional TOTP (RFC 6238), secret AES-256-GCM encrypted | `auth.int-spec` |
| Activation links | Single-use, hashed, 72 h expiry | `auth.int-spec` |
| Session revocation | Password change and staff disablement revoke sessions | `tenancy.int-spec` |

## Authorisation & tenancy

- **Deny by default**: a global guard rejects any route without an explicit policy; a test enumerates every route.
- **Tenant context** comes only from a DB-verified active membership for the `X-Clinic-Id` header — never from
  request bodies (Zod `.strict()` rejects unknown fields such as `clinicId`).
- **Permission matrix** (`packages/shared/src/permissions.ts`) is the single source; UI navigation uses it only for UX.
- **Clinical data** additionally requires an active doctor–patient care assignment; other roles get 403/404.
- **Platform admins** cannot read tenant data.
- Cross-tenant ids return 404 (no existence oracle).

## Data protection

- TLS 1.2/1.3 at Nginx; HSTS; HTTP→HTTPS redirect.
- Application-layer AES-256-GCM for clinical note versions, patient clinical summaries, lab results and MFA secrets
  (`DATA_ENCRYPTION_KEY`, versioned ciphertext format for future rotation).
- Signed note versions are immutable (DB trigger); audit log is append-only (DB trigger).
- Logs redact authorization headers and cookies; request bodies are never logged; Nginx logs omit query strings.

## Input & output handling

- All inputs validated with shared Zod schemas; body limit 256 KB; paginated lists capped at 100.
- Centralised error filter: no stack traces or internals in responses; each error carries a request id.
- React escaping; no user content rendered as HTML.
- **CSP**: per-request nonce with `strict-dynamic` for scripts; `frame-ancestors 'none'`; `object-src 'none'`.
  Inline styles are allowed (required by GSAP/Recharts runtime styles).
- Helmet headers on the API; `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` on the web app.

## Abuse protection

- Nginx: 20 r/s per IP on the API, 10 r/min on credential endpoints (login, activation, registration, contact).
- API throttler: global 300/min, stricter per-route limits on auth, registration and AI.
- Concurrency-safe booking via PostgreSQL exclusion constraint; optimistic status transitions.

## Infrastructure

- Distroless, non-root runtime images (no shell); read-only API filesystem; `init` for signal handling.
- Secrets only via environment (`.env` never committed; `.env.example` documents each one).
- Postgres and Redis on an internal network; Redis password-protected, AOF persistence, `noeviction`.
- Encrypted backups (AES-256, PBKDF2) with checksums; restore procedure tested.
- CI: typecheck, lint, tests, Docker E2E, `pnpm audit`; Dependabot for npm, Docker and Actions.

## Security event monitoring

Audit events to alert on (query `AuditLog` or ship logs to a SIEM):
`auth.refresh_reuse_detected`, `auth.account_locked`, spikes of `auth.login_failed`, `staff.updated` with
`DISABLED`, `clinic.suspend`, unusual volumes of `clinical_note.viewed` per user.

## Known gaps / follow-ups

| Item | Risk | Plan |
|---|---|---|
| `zod@3` advisory GHSA-mrhx-c7xc-m3w5 | Memory exhaustion on oversized collections | Mitigated by body-size limits and bounded arrays; migrate to zod 4 |
| In-memory API throttler | Limits are per instance | Use Redis throttler storage when scaling horizontally |
| Key rotation | Manual | Add re-encryption job using the ciphertext version prefix |
| File uploads | Not in MVP | When added: type sniffing, size limits, AV scanning, private object storage |
| MFA enforcement | Optional | Make mandatory for clinic admins and doctors after pilot feedback |
| Penetration test | Not yet performed | Commission before general availability |
