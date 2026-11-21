# AfyaLink AI — MVP Product Requirements

Version 0.1 · Pilot scope · Market: Ethiopia (Addis Ababa first)

## 1. Problem

Private clinics in Ethiopia commonly run on paper registers, phone scheduling and handwritten notes. This causes
lost records, double-booked or missed appointments, poor follow-up, heavy administrative load on clinicians and
little visibility into clinic operations.

## 2. Vision & positioning

"Connecting patients, healthcare professionals, and clinics through intelligent healthcare technology."
AfyaLink AI is an **operations platform** with carefully bounded AI assistance. It is not a diagnostic tool and
makes no claims about clinical accuracy or health outcomes.

## 3. Users & jobs

| Persona | Primary jobs |
|---|---|
| Clinic administrator | Set up clinic, invite staff, configure services, monitor operations, manage billing |
| Receptionist | Register patients, record consent, book/reschedule appointments, confirm portal requests, follow-ups |
| Doctor | See today's list and patients in care, document visits, sign/amend notes, order labs, follow-ups |
| Lab staff | Process orders with minimal patient info, record results |
| Patient | Request appointments, receive reminders, see shared summaries, manage consent |
| Platform admin | Approve clinics, manage approved health content, monitor health, handle support |

## 4. MVP scope (in)

1. Clinic self-registration with platform approval and a 30-day trial.
2. Staff invitation by one-time activation link; role management; disable access instantly.
3. Patient registry with mandatory data-processing consent, MRN, search, status, care team.
4. Scheduling: services, weekly doctor availability, slot search, conflict prevention, status lifecycle.
5. Clinical documentation with versioning, signing attestation and amendments.
6. AI: workflow assistant, documentation drafts (review required), approved-source health information.
7. Notifications: in-app; SMS/email when configured; reminders via background jobs.
8. Follow-up tasks; laboratory orders/results.
9. Operational analytics.
10. Plans, limits, invoices, sandbox payments.
11. Patient portal; platform admin console; audit trail and record-access history.

## 5. Out of scope (pilot)

E-prescribing, insurance claims, inventory/pharmacy, telemedicine video, HL7/FHIR integrations, offline mode,
native mobile apps, real payment processing, Ethiopian-calendar display (planned), full Amharic UI (planned).

## 6. Key requirements

- **Security**: server-side authorisation on every endpoint; tenant isolation tested; encryption of clinical data.
- **Privacy**: data minimisation, consent ledger, retention schedule, no PHI in notifications or logs.
- **AI safety**: no diagnosis/prescription; labelled drafts; human sign-off; PII redaction; emergency escalation.
- **Usability**: mobile-responsive; WCAG-minded (labels, focus states, keyboard, reduced motion).
- **Reliability**: health/readiness endpoints, encrypted backups, retries for message delivery.

## 7. Success metrics for the pilot (to be measured, not claimed)

- Time to register a patient and book an appointment.
- Share of appointments booked through the system vs paper.
- No-show rate trend after reminders are enabled.
- Clinician time spent on documentation (self-reported) with/without AI drafts.
- AI draft review outcomes (accepted / edited / rejected).

## 8. Risks

| Risk | Mitigation |
|---|---|
| AI misuse / over-reliance | Hard product boundaries, review gate, labelling, safety filters, audit |
| Data protection non-compliance | Legal review pre-launch; DPA with clinics; cross-border controls |
| Connectivity constraints | Lightweight pages, server-side pagination; offline mode later |
| SMS provider reliability | Retries, delivery status tracking, in-app fallback |
