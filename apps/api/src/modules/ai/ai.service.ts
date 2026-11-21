import { Injectable, Logger } from '@nestjs/common';
import type { AiFeature, AiOutcome } from '@prisma/client';
import { z } from 'zod';
import {
  noteSectionsSchema,
  type AiAssistantInput,
  type AiClinicalDraftInput,
  type AiHealthInfoInput,
  type AiReviewInput,
  type HealthContentInput,
  type NoteSections,
  type ReviewHealthContentInput,
} from '@afyalink/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { sha256 } from '../../common/crypto/encryption.service';
import { Errors } from '../../common/http/errors';
import type { TenantContext } from '../../common/decorators/access';
import { AuditService } from '../audit/audit.service';
import { BillingService } from '../billing/billing.service';
import { ClinicalAccessService } from '../clinical/clinical-access.service';
import { ClinicalNotesService } from '../clinical/clinical-notes.service';
import { AiProvider, AiProviderError, type ChatMessage } from './ai.provider';
import { adminAssistantSystem, clinicalDraftSystem, healthInfoSystem } from './prompts';
import {
  AI_DRAFT_LABEL,
  detectEmergency,
  EMERGENCY_GUIDANCE,
  findUnsafeOutput,
  findUnsupportedNumbers,
  HEALTH_INFO_DISCLAIMER,
  NO_SOURCES_MESSAGE,
  redactPII,
  SAFE_FALLBACK,
} from './safety';

type Lang = 'en' | 'am';
const lang = (l: string): Lang => (l === 'am' ? 'am' : 'en');

const draftOutputSchema = noteSectionsSchema.extend({
  missingInformation: z.array(z.string().max(300)).max(30).default([]),
});

interface LogInput {
  clinicId?: string | null;
  userId: string;
  feature: AiFeature;
  outcome: AiOutcome;
  promptForHash: string;
  language: string;
  redactionCount?: number;
  safetyFlags?: string[];
  latencyMs?: number;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: AiProvider,
    private readonly billing: BillingService,
    private readonly access: ClinicalAccessService,
    private readonly notes: ClinicalNotesService,
    private readonly audit: AuditService,
  ) {}

  status() {
    return { configured: this.provider.configured, provider: this.provider.name, model: this.provider.configured ? this.provider.model : null };
  }

  private assertConfigured(): void {
    if (!this.provider.configured) {
      throw Errors.serviceUnavailable('AI_NOT_CONFIGURED', 'AI features are not configured for this deployment');
    }
  }

  private async assertPlan(clinicId: string): Promise<void> {
    if (!(await this.billing.assertFeature(clinicId, 'ai'))) {
      throw Errors.planLimit('AI features are not included in your current plan');
    }
  }

  /** Logs metadata only. The prompt is stored as a SHA-256 hash for correlation, never in plaintext. */
  private async log(i: LogInput): Promise<string> {
    const row = await this.prisma.aIInteraction.create({
      data: {
        clinicId: i.clinicId ?? null,
        userId: i.userId,
        feature: i.feature,
        outcome: i.outcome,
        provider: this.provider.name,
        model: i.model ?? this.provider.model,
        promptHash: sha256(i.promptForHash),
        language: i.language,
        redactionCount: i.redactionCount ?? 0,
        safetyFlags: i.safetyFlags ?? [],
        latencyMs: i.latencyMs,
        inputTokens: i.inputTokens,
        outputTokens: i.outputTokens,
      },
    });
    return row.id;
  }

  private async call(messages: ChatMessage[], json = false) {
    const started = Date.now();
    try {
      const r = await this.provider.complete({ messages, json });
      return { ...r, latencyMs: Date.now() - started };
    } catch (e) {
      if (e instanceof AiProviderError) {
        this.logger.warn(e.message);
        return { error: e.message, latencyMs: Date.now() - started } as const;
      }
      throw e;
    }
  }

  // ───────── A. Administrative assistant ─────────

  async adminAssistant(t: TenantContext, input: AiAssistantInput) {
    this.assertConfigured();
    await this.assertPlan(t.clinicId);
    const l = lang(input.language);
    // Staff should not paste patient data here; redact defensively anyway.
    const redacted = redactPII(input.message);
    if (detectEmergency(input.message)) {
      const id = await this.log({ clinicId: t.clinicId, userId: t.userId, feature: 'ADMIN_ASSISTANT', outcome: 'BLOCKED_EMERGENCY', promptForHash: redacted.text, language: l, safetyFlags: ['EMERGENCY'] });
      return { interactionId: id, answer: EMERGENCY_GUIDANCE[l], emergency: true, aiGenerated: false };
    }
    const r = await this.call([
      { role: 'system', content: adminAssistantSystem(l) },
      { role: 'user', content: redacted.text },
    ]);
    if ('error' in r) {
      await this.log({ clinicId: t.clinicId, userId: t.userId, feature: 'ADMIN_ASSISTANT', outcome: 'PROVIDER_ERROR', promptForHash: redacted.text, language: l, latencyMs: r.latencyMs });
      throw Errors.serviceUnavailable('AI_PROVIDER_ERROR', 'The AI service is temporarily unavailable');
    }
    const flags = findUnsafeOutput(r.text);
    const blocked = flags.length > 0;
    const id = await this.log({
      clinicId: t.clinicId,
      userId: t.userId,
      feature: 'ADMIN_ASSISTANT',
      outcome: blocked ? 'BLOCKED_UNSAFE_OUTPUT' : 'COMPLETED',
      promptForHash: redacted.text,
      language: l,
      redactionCount: redacted.count,
      safetyFlags: flags,
      latencyMs: r.latencyMs,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    });
    return { interactionId: id, answer: blocked ? SAFE_FALLBACK[l] : r.text, aiGenerated: !blocked, emergency: false, redactions: redacted.count };
  }

  // ───────── B. Clinical documentation assistant ─────────

  async clinicalDraft(t: TenantContext, input: AiClinicalDraftInput) {
    this.assertConfigured();
    await this.assertPlan(t.clinicId);
    await this.access.assertCareAccess(t, input.patientId);
    const l = lang(input.language);

    const [patient, clinic, consent] = await Promise.all([
      this.prisma.patient.findUniqueOrThrow({
        where: { id: input.patientId },
        select: { firstName: true, middleName: true, lastName: true },
      }),
      this.prisma.clinic.findUniqueOrThrow({ where: { id: t.clinicId }, select: { aiExternalProcessingApproved: true } }),
      this.prisma.patientConsent.findFirst({
        where: { patientId: input.patientId, type: 'AI_ASSISTED_DOCUMENTATION' },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    if (consent && !consent.granted) {
      throw Errors.forbidden('The patient has declined AI-assisted documentation');
    }

    // Identifiers are always redacted before leaving the platform unless the clinic has formally approved
    // external processing (privacy/legal/contract review). Contact details are redacted regardless.
    const names = clinic.aiExternalProcessingApproved ? [] : [patient.firstName, patient.middleName ?? '', patient.lastName];
    const redacted = redactPII(input.rawNotes, names);

    const r = await this.call(
      [
        { role: 'system', content: clinicalDraftSystem(l) },
        { role: 'user', content: redacted.text },
      ],
      true,
    );
    if ('error' in r) {
      await this.log({ clinicId: t.clinicId, userId: t.userId, feature: 'CLINICAL_DRAFT', outcome: 'PROVIDER_ERROR', promptForHash: redacted.text, language: l, redactionCount: redacted.count, latencyMs: r.latencyMs });
      throw Errors.serviceUnavailable('AI_PROVIDER_ERROR', 'The AI service is temporarily unavailable');
    }

    let parsed: z.infer<typeof draftOutputSchema>;
    try {
      parsed = draftOutputSchema.parse(JSON.parse(r.text));
    } catch {
      await this.log({ clinicId: t.clinicId, userId: t.userId, feature: 'CLINICAL_DRAFT', outcome: 'PROVIDER_ERROR', promptForHash: redacted.text, language: l, redactionCount: redacted.count, safetyFlags: ['INVALID_STRUCTURE'], latencyMs: r.latencyMs, model: r.model });
      throw Errors.serviceUnavailable('AI_INVALID_OUTPUT', 'The AI returned an unusable draft. Please try again or write the note manually.');
    }

    const { missingInformation, ...sections } = parsed;
    const generatedText = Object.values(sections).join('\n');
    const unsupported = findUnsupportedNumbers(redacted.text, generatedText);
    const unsafe = findUnsafeOutput(sections.plan ?? '');
    const flags = [...unsafe, ...(unsupported.length ? ['UNSUPPORTED_NUMBERS'] : [])];
    const warnings = [
      ...missingInformation,
      ...(unsupported.length ? [`Values not found in your notes — verify or remove: ${unsupported.join(', ')}`] : []),
      ...(unsafe.length ? ['The draft plan contains medication/dose wording — confirm it reflects your own instructions.'] : []),
    ];

    const interactionId = await this.log({
      clinicId: t.clinicId,
      userId: t.userId,
      feature: 'CLINICAL_DRAFT',
      outcome: 'COMPLETED',
      promptForHash: redacted.text,
      language: l,
      redactionCount: redacted.count,
      safetyFlags: flags,
      latencyMs: r.latencyMs,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    });

    const cleanSections: NoteSections = Object.fromEntries(
      Object.entries(sections).filter(([, v]) => typeof v === 'string' && v.trim().length > 0),
    ) as NoteSections;
    const note = await this.notes.create(
      t,
      { patientId: input.patientId, title: 'AI-assisted draft', sections: cleanSections, shareWithPatient: false },
      { source: 'AI_ASSISTED', aiInteractionId: interactionId },
    );
    return { interactionId, label: AI_DRAFT_LABEL, note, sections: cleanSections, warnings, safetyFlags: flags };
  }

  // ───────── C. Patient health information (RAG over approved content) ─────────

  private async retrieve(question: string, language: string) {
    const terms = [...new Set((question.toLowerCase().match(/[\p{L}]{3,}/gu) ?? []).slice(0, 12))];
    if (terms.length === 0) return [];
    const tsquery = terms.join(' | ');
    return this.prisma.$queryRaw<{ id: string; title: string; body: string; sourceName: string; sourceUrl: string | null; rank: number }[]>`
      SELECT id, title, body, "sourceName", "sourceUrl",
             ts_rank(to_tsvector('simple', title || ' ' || body), to_tsquery('simple', ${tsquery})) AS rank
      FROM "HealthContent"
      WHERE status = 'APPROVED' AND language = ${language}
        AND to_tsvector('simple', title || ' ' || body) @@ to_tsquery('simple', ${tsquery})
      ORDER BY rank DESC
      LIMIT 3`;
  }

  async healthInfo(userId: string, input: AiHealthInfoInput) {
    const l = lang(input.language);
    const redacted = redactPII(input.question);
    if (detectEmergency(input.question)) {
      const id = await this.log({ userId, feature: 'HEALTH_INFO', outcome: 'BLOCKED_EMERGENCY', promptForHash: redacted.text, language: l, safetyFlags: ['EMERGENCY'] });
      return { interactionId: id, answer: EMERGENCY_GUIDANCE[l], emergency: true, sources: [], aiGenerated: false, disclaimer: HEALTH_INFO_DISCLAIMER[l] };
    }
    this.assertConfigured();
    const sources = await this.retrieve(redacted.text, l);
    if (sources.length === 0) {
      const id = await this.log({ userId, feature: 'HEALTH_INFO', outcome: 'NO_APPROVED_SOURCES', promptForHash: redacted.text, language: l });
      return { interactionId: id, answer: NO_SOURCES_MESSAGE[l], emergency: false, sources: [], aiGenerated: false, disclaimer: HEALTH_INFO_DISCLAIMER[l] };
    }
    const context = sources.map((s, i) => `[Source ${i + 1}: ${s.title} — ${s.sourceName}]\n${s.body.slice(0, 3000)}`).join('\n\n');
    const r = await this.call([
      { role: 'system', content: `${healthInfoSystem(l)}\n\nAPPROVED SOURCES:\n${context}` },
      { role: 'user', content: redacted.text },
    ]);
    if ('error' in r) {
      await this.log({ userId, feature: 'HEALTH_INFO', outcome: 'PROVIDER_ERROR', promptForHash: redacted.text, language: l, latencyMs: r.latencyMs });
      throw Errors.serviceUnavailable('AI_PROVIDER_ERROR', 'The AI service is temporarily unavailable');
    }
    const flags = findUnsafeOutput(r.text);
    const blocked = flags.length > 0;
    const id = await this.log({
      userId,
      feature: 'HEALTH_INFO',
      outcome: blocked ? 'BLOCKED_UNSAFE_OUTPUT' : 'COMPLETED',
      promptForHash: redacted.text,
      language: l,
      redactionCount: redacted.count,
      safetyFlags: flags,
      latencyMs: r.latencyMs,
      model: r.model,
      inputTokens: r.inputTokens,
      outputTokens: r.outputTokens,
    });
    return {
      interactionId: id,
      answer: blocked ? SAFE_FALLBACK[l] : r.text,
      emergency: false,
      aiGenerated: !blocked,
      sources: sources.map((s) => ({ id: s.id, title: s.title, sourceName: s.sourceName, sourceUrl: s.sourceUrl })),
      disclaimer: HEALTH_INFO_DISCLAIMER[l],
    };
  }

  // ───────── Review ─────────

  async review(t: TenantContext, input: AiReviewInput) {
    const interaction = await this.prisma.aIInteraction.findFirst({
      where: { id: input.interactionId, clinicId: t.clinicId, feature: 'CLINICAL_DRAFT' },
    });
    if (!interaction) throw Errors.notFound('AI interaction');
    const version = await this.prisma.clinicalNoteVersion.findFirst({
      where: { aiInteractionId: interaction.id },
      select: { noteId: true, note: { select: { patientId: true } } },
    });
    if (version) await this.access.assertCareAccess(t, version.note.patientId);
    else await this.access.doctorIdFor(t);
    const review = await this.prisma.aIReview.create({
      data: { interactionId: interaction.id, noteId: version?.noteId, reviewerId: t.userId, decision: input.decision, comment: input.comment },
    });
    await this.audit.log({
      clinicId: t.clinicId,
      actorUserId: t.userId,
      action: 'ai_draft.reviewed',
      entityType: 'ClinicalNote',
      entityId: version?.noteId,
      metadata: { decision: input.decision, interactionId: interaction.id },
    });
    return review;
  }

  async usage(clinicId: string) {
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [byFeature, reviews] = await Promise.all([
      this.prisma.aIInteraction.groupBy({ by: ['feature', 'outcome'], where: { clinicId, createdAt: { gte: since } }, _count: true }),
      this.prisma.aIReview.groupBy({ by: ['decision'], where: { interaction: { clinicId }, createdAt: { gte: since } }, _count: true }),
    ]);
    return { since, byFeature, reviews, ...this.status() };
  }

  // ───────── Approved content management (platform) ─────────

  listContent(status?: string) {
    return this.prisma.healthContent.findMany({
      where: status ? { status: status as 'PENDING_REVIEW' | 'APPROVED' | 'RETIRED' } : {},
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async createContent(userId: string, input: HealthContentInput) {
    const c = await this.prisma.healthContent.create({ data: { ...input, status: 'PENDING_REVIEW' } });
    await this.audit.log({ actorUserId: userId, action: 'health_content.created', entityType: 'HealthContent', entityId: c.id });
    return c;
  }

  async reviewContent(userId: string, id: string, input: ReviewHealthContentInput) {
    const c = await this.prisma.healthContent.update({
      where: { id },
      data: { status: input.status, reviewedById: userId, reviewedAt: new Date() },
    });
    await this.audit.log({ actorUserId: userId, action: `health_content.${input.status.toLowerCase()}`, entityType: 'HealthContent', entityId: id });
    return c;
  }
}
