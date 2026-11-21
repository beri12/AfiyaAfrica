# API Guide

Base path `/api/v1`. Interactive docs: `/api/docs` · OpenAPI JSON: `/api/docs/openapi.json`.

## Conventions

- **Success**: `{ "data": ... }` or `{ "data": [...], "meta": { page, pageSize, total, totalPages } }`.
- **Errors**: `{ "error": { "code", "message", "details"?, "requestId" } }`. Common codes: `VALIDATION_FAILED`,
  `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `APPOINTMENT_CONFLICT`, `PLAN_LIMIT_REACHED` (402), `RATE_LIMITED` (429),
  `AI_NOT_CONFIGURED` (503).
- Every response includes `X-Request-Id` (also accepted inbound).
- Pagination: `?page=1&pageSize=20` (max 100). Timestamps are ISO-8601 UTC; calendar dates `YYYY-MM-DD`.

## Authentication flow

1. `POST /auth/login` `{ email, password, mfaCode? }` → `{ accessToken, expiresIn, user }` + `afy_rt` httpOnly cookie.
   If MFA is enabled and no code is sent → `{ mfaRequired: true }`.
2. Send `Authorization: Bearer <accessToken>`.
3. `POST /auth/refresh` with header `X-Requested-With: afyalink` → new access token, rotated cookie.
4. `POST /auth/logout` (same header) revokes the session family.

## Tenancy

Clinic-scoped endpoints require `X-Clinic-Id: <clinic uuid>`. The API verifies an **active membership** for that
clinic on every request. Patient-portal endpoints (`/me/*`) are scoped to the signed-in user instead.

## Endpoint index

| Module | Endpoints |
|---|---|
| Health | `GET /health`, `GET /health/ready` |
| Auth | `POST /auth/login|refresh|logout|activate|change-password`, `GET /auth/me`, `POST /auth/mfa/setup|enable|disable` |
| Clinics | `POST /clinics/register`, `POST /contact`, `GET|PATCH /clinic` |
| Platform | `GET /platform/overview`, `GET /platform/clinics`, `POST /platform/clinics/:id/review`, `GET|POST|PATCH /platform/health-content`, `GET|PATCH /platform/support-tickets` |
| Staff | `GET|POST /staff`, `PATCH /staff/:id`, `POST /staff/:id/resend-invite` |
| Services | `GET|POST /services`, `PATCH|DELETE /services/:id` |
| Doctors | `GET /doctors`, `PUT /doctors/:id/availability`, `GET /doctors/:id/slots?date&serviceId` |
| Patients | `GET|POST /patients`, `GET|PATCH /patients/:id`, `GET|POST /patients/:id/consents`, `POST /patients/:id/invite`, `POST /patients/:id/care-team`, `DELETE /patients/:id/care-team/:doctorId`, `GET /patients/:id/access-log` |
| Appointments | `GET|POST /appointments`, `GET /appointments/:id`, `POST /appointments/:id/confirm|complete|no-show|cancel|reschedule` |
| Clinical | `GET|POST /clinical-notes`, `GET|PATCH /clinical-notes/:id`, `POST /clinical-notes/:id/submit|sign|amend`, `GET|PUT /patients/:id/record` |
| Follow-ups | `GET|POST /follow-ups`, `PATCH /follow-ups/:id` |
| Laboratory | `GET|POST /lab/laboratories`, `GET|POST /lab/orders`, `PATCH /lab/orders/:id/status`, `POST /lab/orders/:id/result` |
| AI | `GET /ai/status`, `POST /ai/assistant`, `POST /ai/clinical-draft`, `POST /ai/health-info`, `POST /ai/reviews`, `GET /ai/usage` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET|PUT /notifications/preferences` |
| Analytics | `GET /analytics/overview|appointments|patients|services|activity?from&to` |
| Billing | `GET /billing/plans` (public), `GET /billing/subscription`, `POST /billing/subscription/change-plan`, `GET /billing/invoices`, `POST /billing/invoices/:id/pay` |
| Portal | `GET /me/patient-profiles`, `GET /me/clinics/:id/booking-options`, `GET /me/clinics/:id/doctors/:doctorId/slots`, `GET|POST /me/appointments`, `POST /me/appointments/:id/cancel`, `GET /me/records`, `POST /me/patient-profiles/:id/consents` |
| Support | `GET|POST /support-tickets` |
| Audit | `GET /audit-logs` |

## Background jobs (BullMQ)

| Queue | Jobs |
|---|---|
| `notifications` | `deliver` (SMS/email with retries; `SKIPPED` if provider not configured) |
| `reminders` | `appointment-reminder` (delayed; re-validated at run time) |
| `maintenance` | `follow-up-reminders` (daily), `generate-invoices` (daily), `retention-purge` (daily), `requeue-notifications` (10 min) |

Workers run inside the API process when `WORKERS_ENABLED=true`; run a second API container with workers enabled
and others disabled to scale them independently.
