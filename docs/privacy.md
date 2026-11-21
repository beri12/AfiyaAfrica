# Privacy & Data Protection

Prepared for review against the **Ethiopian Personal Data Protection Proclamation No. 1321/2024** and any other
applicable requirements. This is an engineering description, **not legal advice**; legal review is required before
processing real patient data. AfyaLink AI does not claim any regulatory certification.

## Roles

- **Clinic** — controller of patient data it records.
- **AfyaLink AI** — processor for patient data; controller for clinic-user account and billing data.
- A data processing agreement (DPA) must be signed with each pilot clinic.

## Data inventory

| Category | Fields | Where | Protection |
|---|---|---|---|
| Staff accounts | name, email, phone, role, sign-in times | `User`, `ClinicMembership` | Access-controlled |
| Patient demographics | name, DOB, sex, phone, email, city/sub-city, language, optional emergency contact | `Patient` | Tenant-scoped, role-gated |
| Consent | type, decision, method, time, recorder | `PatientConsent` (append-only ledger) | Tenant-scoped |
| Clinical summary | allergies, chronic conditions, medications, blood group | `PatientRecord` | AES-256-GCM, care-team only |
| Clinical notes | structured note sections, versions | `ClinicalNoteVersion` | AES-256-GCM, care-team only, immutable when signed |
| Lab results | result text (+ unit, range) | `LaboratoryResult` | AES-256-GCM; ordering care team + lab staff |
| Appointments & follow-ups | times, service, status, short administrative reason | `Appointment`, `FollowUp` | Tenant-scoped |
| Notifications | title/body (non-clinical) | `Notification` | No clinical details by design |
| AI usage metadata | feature, model, timing, flags, prompt **hash** | `AIInteraction` | No prompt/response content stored |
| Audit trail | actor, action, entity id, IP, user agent | `AuditLog` | Append-only; metadata sanitiser drops content-like keys |

**Not collected:** national ID numbers, religion, ethnicity, income, photographs.

## Data minimisation

- Emergency contact is optional; patient email only needed for portal access.
- Search results and lists show demographics only — no clinical information.
- Lab staff see name, MRN, DOB and sex only.
- Notifications and SMS never include clinical details (enforced by templates).

## Consent management

- Data-processing consent is required to register a patient (UI and server).
- SMS/email reminders, portal record access and AI-assisted documentation are separate, revocable consents.
- Patients can change self-service consents in the portal; withdrawing processing consent is handled by the
  clinic (the patient becomes inactive; retention obligations still apply).
- Every change is a new ledger row (who, when, how).

## Retention (automated where operational)

| Data | Retention | Mechanism |
|---|---|---|
| Expired/revoked sessions, used activation tokens | 30 days | Daily `retention-purge` job |
| Read in-app notifications | 180 days | Daily job |
| AI usage metadata without reviews | 365 days | Daily job |
| Handled contact messages | 365 days | Daily job |
| Clinical records, consents, audit logs | Per clinic's legal/medical-record obligations | **Not** auto-deleted; deletion via documented request process |

## Data subject requests

Access/correction/deletion requests go to the clinic. Platform support assists via the clinic admin. Exports and
deletions must be logged. Deletion of clinical records must respect medical record retention law.

## AI & cross-border processing

- External AI receives only redacted text (names, phones, emails, MRNs, dates removed) unless the clinic has set
  **External AI processing approved** after privacy/legal/contract review of the provider.
- Provider contracts must prohibit training on submitted data and specify data location; requests set `store: false`.
- Hosting location, AI provider, SMS gateway and email provider (and their countries) must be listed in the DPA.
  Prefer in-country or regionally hosted infrastructure where feasible.

## Breach response (outline)

1. Contain (revoke sessions, rotate keys, isolate services). 2. Assess scope via audit logs.
3. Notify affected clinics and the regulator within legally required timelines. 4. Post-incident review.

## Open items for legal review

- Lawful bases and consent wording (English and Amharic).
- Retention periods for medical records in Ethiopia.
- Cross-border transfer conditions for chosen providers.
- DPA template, privacy notice, terms of service.
