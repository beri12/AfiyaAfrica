# AfyaLink AI

**Smarter Healthcare. Better Connected.** — an AI-assisted healthcare operations platform connecting private
clinics, healthcare professionals and patients. Built for a controlled pilot in Ethiopia.

> AfyaLink AI is **not** a diagnostic system. It never diagnoses, prescribes or makes treatment decisions.
> AI output is limited to administrative help, clearly-labelled documentation drafts that clinicians must review
> and sign, and general health education from approved sources.

## What's in the MVP

| Area | Highlights |
|---|---|
| Multi-tenant SaaS | Every clinic is a tenant; membership re-validated in the DB on **every** request; deny-by-default route guard |
| Auth | Argon2id, 15-min JWT access tokens (memory only), httpOnly rotating refresh cookie with **reuse detection**, optional TOTP MFA, lockout |
| Roles | Platform admin, clinic admin, doctor, receptionist, lab staff, patient — enforced server-side |
| Patients | Registration with consent ledger, MRN, search, care-team assignment, record-access history |
| Appointments | Availability windows, live slots, **DB-level double-booking prevention**, reschedule/cancel/complete/no-show, history |
| Clinical notes | Draft → review → signed → amended; immutable versions; **AES-256-GCM encrypted**; care-relationship gated |
| AI assistant | Provider-agnostic, PII redaction, emergency detection (EN/AM), output safety filters, invented-number detection, mandatory review before signing |
| Notifications | In-app/SMS/email, BullMQ delivery and reminders, consent & preference aware, never fakes delivery |
| Analytics | Real SQL aggregates (timezone-aware): volumes, completion, cancellation, no-show, registrations, service use |
| Billing | Starter $25 / Professional $60 / Enterprise $150+, trials, limits, invoices, **sandbox** payments |
| Labs, follow-ups, support, patient portal, platform admin | Included |
| Public site | 11-section homepage + 9 pages, GSAP SplitText/ScrollTrigger motion, reduced-motion aware |

## Repository layout

```
apps/api            NestJS 11 REST API (/api/v1, Swagger at /api/docs), Prisma 6, BullMQ workers
apps/web            Next.js 15 App Router, Tailwind 4, Radix/shadcn-style UI, TanStack Query, GSAP
packages/shared     Zod schemas, enums, permission matrix, plans — shared by API and web
packages/config     tsconfig / ESLint presets
infrastructure/     Dockerfiles (distroless runtime), Nginx (TLS, rate limits, headers)
scripts/            Dev certificates, encrypted backup & restore
docs/               Architecture, PRD, API, security, privacy, AI safety, deployment
.github/workflows   CI: typecheck, lint, unit+integration, Docker E2E, dependency audit
```

## Quick start (local development)

Prerequisites: Node 22, pnpm 10, PostgreSQL 16, Redis 7 (or `docker compose up -d postgres redis`).

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env   # then set JWT_ACCESS_SECRET, DATA_ENCRYPTION_KEY, DATABASE_URL
```

```bash
pnpm build:shared && pnpm db:migrate && pnpm db:seed
```

```bash
pnpm dev:api   # http://localhost:4000/api/docs
```

```bash
pnpm dev:web   # http://localhost:3000 (proxies /api to the API)
```

The seed creates reference data (roles, permissions, plans), a platform admin from
`SEED_PLATFORM_ADMIN_EMAIL`/`SEED_PLATFORM_ADMIN_PASSWORD`, and — outside production — a **synthetic** demo
clinic. Demo users (password `SEED_DEMO_PASSWORD`, default `Demo-password-2026`):
`admin@`, `doctor@`, `doctor2@`, `reception@`, `lab@demo.afyalink.local`. No real patient data is ever seeded.

## Docker (staging / pilot)

```bash
cp .env.example .env    # fill in all secrets (see comments)
```

```bash
./scripts/generate-dev-certs.sh your.domain   # staging only; use real certificates in production
```

```bash
docker compose up -d --build --wait
```

Services: `postgres`, `redis`, `migrate` (one-shot migrations + seed), `api` (with workers), `web`, `nginx`.
See [docs/deployment.md](docs/deployment.md) for production hardening, backups and monitoring.

## Testing

| Command | What it runs |
|---|---|
| `pnpm typecheck` | Strict TypeScript across all packages |
| `pnpm lint` | ESLint |
| `pnpm test` | Shared unit tests, web component tests (RTL), API unit + integration tests (real Postgres/Redis) |
| `pnpm test:e2e` | Playwright critical journeys against a running stack (`E2E_BASE_URL`) |

API integration tests use a dedicated database (`TEST_DATABASE_URL`, default `afyalink_test`) and cover auth
(rotation/reuse/lockout/MFA), tenant isolation, RBAC, appointments (incl. concurrent double-booking), clinical
notes, AI safety (with a test-only provider stub), portal, analytics, billing, notifications, retention.

## MVP acceptance status

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Clinic can register | ✅ | E2E `clinic administrator journey`, int `clinic lifecycle` |
| 2 | Admin creates staff accounts | ✅ | E2E `invites staff`, int `staff` tests |
| 3 | Doctor accesses authorised patient info | ✅ | E2E doctor journey; int care-gating tests |
| 4 | Receptionist registers patients | ✅ | E2E receptionist journey |
| 5 | Patients book appointments | ✅ | E2E patient booking journey; int portal tests |
| 6 | Clinics manage schedules | ✅ | int appointments suite |
| 7 | Doctors create & review clinical notes | ✅ | E2E sign note; int note lifecycle |
| 8 | AI generates labelled drafts | ✅ (stub-verified) | int AI suite — **needs a real provider configured** |
| 9 | Staff manage follow-ups | ✅ | int follow-ups |
| 10 | Users receive notifications | ✅ in-app / ⚠️ SMS & email need provider credentials | int notification tests |
| 11 | Dashboards show real DB metrics | ✅ | int analytics accuracy test |
| 12 | Tenant isolation verified | ✅ | int tenancy suite, E2E cross-tenant |
| 13 | Unauthorised access tests pass | ✅ | int RBAC, route-policy test, E2E |
| 14 | API documentation available | ✅ | `/api/docs`, `/api/docs/openapi.json` |
| 15 | Database migrations work | ✅ | Applied in CI, tests and Docker `migrate` |
| 16 | Backup & restore documented | ✅ | Round-trip verified; `docs/deployment.md` |
| 17 | Deployment works with Docker | ✅ | Compose stack healthy; E2E passes through Nginx/TLS |
| 18 | Critical journeys pass E2E | ✅ | 11/11 Playwright journeys |

## Not yet production-ready — requires action

- **AI provider**: set `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL` only after privacy, legal and contractual review. Without them AI endpoints return `503 AI_NOT_CONFIGURED` (emergency guidance still works).
- **SMS/Email**: Africa's Talking and SMTP adapters exist but are **unverified against live services**. Until configured, messages are recorded as `SKIPPED`.
- **Payments**: sandbox only. A real provider (e.g. Chapa/Telebirr) must be integrated and tested.
- **Legal**: privacy policy and terms are drafts pending review against Proclamation No. 1321/2024.
- **Dependency advisory**: `zod@3` has a high advisory (GHSA-mrhx-c7xc-m3w5, memory exhaustion on oversized collections). Mitigated by 256 KB body limits and bounded arrays; fix requires migrating to zod 4. CI's audit job reports it until resolved.
- **Clinical content**: approved health-information sources must be authored/reviewed by clinicians; none are pre-approved.
- **Translations**: UI is English; AI responses support Amharic; full Amharic UI, Afaan Oromo and Tigrinya are designed for but not translated.

## Documentation

[Architecture plan](docs/01-architecture-plan.md) · [Product requirements](docs/02-prd.md) · [API](docs/api.md) ·
[Security](docs/security.md) · [Privacy](docs/privacy.md) · [AI safety](docs/ai-safety.md) · [Deployment](docs/deployment.md)
