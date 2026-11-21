# AI Safety

## Boundaries (enforced by product design, prompts and code)

AfyaLink AI **never** diagnoses, prescribes, decides treatment, invents history or results, or presents generated
content as clinician-approved.

## Features

| Feature | Who | Input | Output |
|---|---|---|---|
| Workflow assistant | Staff (`ai:admin`) | Workflow question (no patient data) | Short answer grounded in a platform guide |
| Documentation assistant | Doctors in a care relationship (`ai:clinical`) | Doctor's own free-text notes | Structured **DRAFT** note + missing-information list |
| Health information | Any signed-in user | General question | Answer from **approved sources only**, with citations and disclaimer |

## Pipeline

```
input ─► emergency detection (EN + AM) ──yes──► fixed escalation guidance (no model call)
      └► PII redaction (names, phones, emails, MRNs, dates)
      └► strict system prompt (+ approved sources for health info)
      └► provider call (OpenAI-compatible, store:false, timeout)
      └► output validation
           • schema check (drafts must be valid JSON sections) → reject if invalid
           • unsafe-pattern filter (diagnosis, dosage, medication instructions) → safe fallback
           • unsupported-number check (values not in clinician input) → flagged warning
      └► labelling ("AI-generated draft — not reviewed")
      └► AIInteraction log (model, outcome, flags, redaction count, latency, prompt hash)
```

## Human review gate

AI-assisted notes are saved as `DRAFT` with `source = AI_ASSISTED`. Signing is blocked (`422 AI_REVIEW_REQUIRED`)
until the doctor records a review (`ACCEPTED` / `EDITED` / `REJECTED`) and attests to the content. Reviews are
auditable and analysable (`GET /ai/usage`).

## Consent & privacy

- Patients may decline AI-assisted documentation (consent ledger); the API then refuses drafts for that patient.
- Names are removed before external processing unless the clinic has formally approved external processing.
- Patient data is not used for training; raw prompts are not retained.

## Configuration

Set `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (all or none). Without them, AI endpoints return
`503 AI_NOT_CONFIGURED` — the system never fabricates AI output. Emergency guidance works regardless.

## Emergency guidance

Detection covers common English and Amharic phrasings (chest pain, breathing difficulty, unconsciousness, severe
bleeding, suicidal intent, seizures, poisoning, stroke signs, obstetric and paediatric red flags). The message
directs users to emergency departments and the Ethiopian ambulance number **907**. **Each pilot clinic must verify
local emergency numbers** and the Amharic phrasing with clinicians before launch.

## Languages

English and Amharic supported for AI responses and emergency guidance. Afaan Oromo (`om`) and Tigrinya (`ti`) are
defined in the language model of the platform but disabled until translations and safety patterns are reviewed.

## Evaluation before pilot (required)

1. Clinician review of 50+ synthetic note-structuring cases per language.
2. Red-team prompts attempting to elicit diagnoses/prescriptions.
3. Emergency phrase recall testing with native speakers.
4. Review of approved health content by qualified clinicians.

Unit tests: `apps/api/src/modules/ai/safety.spec.ts`. Integration tests: `apps/api/test/clinical.int-spec.ts`.
