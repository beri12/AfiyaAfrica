'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, Bot, BookOpen, FileText, Send, Siren } from 'lucide-react';
import { api, apiPage, errorMessage, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/nav';
import { fullName } from '@/lib/format';
import type { NoteSectionsT, PatientSummary } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, FormGrid } from '@/components/ui/field';
import { Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { Alert } from '@/components/ui/states';
import { NoteSectionsView } from '@/components/app/note-sections';

interface AiStatus { configured: boolean; provider: string; model: string | null }
interface ChatMsg { role: 'user' | 'assistant'; text: string; emergency?: boolean; aiGenerated?: boolean }

function LanguageSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select aria-label="Response language" className="w-40" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="en">English</option>
      <option value="am">አማርኛ (Amharic)</option>
    </Select>
  );
}

function AdminAssistant() {
  const [lang, setLang] = useState('en');
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState<ChatMsg[]>([]);
  const ask = useMutation({
    mutationFn: (message: string) => api<{ answer: string; emergency: boolean; aiGenerated: boolean }>('/ai/assistant', { method: 'POST', body: { message, language: lang } }),
    onSuccess: (r) => setLog((l) => [...l, { role: 'assistant', text: r.answer, emergency: r.emergency, aiGenerated: r.aiGenerated }]),
    onError: (e) => setLog((l) => [...l, { role: 'assistant', text: errorMessage(e) }]),
  });
  const send = () => {
    if (!msg.trim()) return;
    setLog((l) => [...l, { role: 'user', text: msg }]);
    ask.mutate(msg);
    setMsg('');
  };
  return (
    <div className="space-y-4">
      <Alert tone="info">Ask about using AfyaLink AI or clinic workflows. Do not enter patient details — this assistant has no access to records.</Alert>
      <div className="min-h-64 space-y-3 rounded-2xl border border-line bg-canvas p-4" aria-live="polite">
        {log.length === 0 && <p className="py-16 text-center text-sm text-muted">Try: “How do I reschedule an appointment?” or “How do patient requests work?”</p>}
        {log.map((m, i) => (
          <div key={i} className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed', m.role === 'user' ? 'ml-auto bg-brand-700 text-white' : m.emergency ? 'border border-red-200 bg-danger-soft text-red-900' : 'bg-white shadow-sm')}>
            {m.role === 'assistant' && m.aiGenerated && <Badge tone="ai" className="mb-1.5"><Bot className="size-3" /> AI-generated</Badge>}
            {m.emergency && <p className="mb-1 flex items-center gap-1.5 font-semibold"><Siren className="size-4" /> Emergency guidance</p>}
            <p className="whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
        {ask.isPending && <p className="text-sm text-muted">Thinking…</p>}
      </div>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <Textarea aria-label="Message" rows={1} className="min-h-10 flex-1" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Ask a workflow question…" maxLength={2000} />
        <LanguageSelect value={lang} onChange={setLang} />
        <Button type="submit" loading={ask.isPending}><Send /> Send</Button>
      </form>
    </div>
  );
}

function ClinicalDraft() {
  const [patientId, setPatientId] = useState('');
  const [raw, setRaw] = useState('');
  const [lang, setLang] = useState('en');
  const patients = useQuery({ queryKey: ['patients', 'care'], queryFn: () => apiPage<PatientSummary>('/patients?pageSize=100') });
  const draft = useMutation({
    mutationFn: () => api<{ label: string; note: { id: string }; sections: NoteSectionsT; warnings: string[]; safetyFlags: string[] }>('/ai/clinical-draft', { method: 'POST', body: { patientId, rawNotes: raw, language: lang } }),
  });
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-4">
        <Alert tone="ai" title="How this works">
          Paste your own consultation notes. AI will organise them into sections, fix grammar and list missing information. It will not diagnose, prescribe or add findings. Patient identifiers are removed before processing. The result is saved as a <strong>draft</strong> that you must review and sign.
        </Alert>
        <FormGrid>
          <Field label="Patient (in your care)" required>
            <Select value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">Select patient…</option>
              {patients.data?.items.map((p) => <option key={p.id} value={p.id}>{fullName(p)} · {p.medicalRecordNumber}</option>)}
            </Select>
          </Field>
          <Field label="Draft language"><div><LanguageSelect value={lang} onChange={setLang} /></div></Field>
        </FormGrid>
        <Field label="Your notes" required hint="At least 10 characters"><Textarea rows={10} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="e.g. cough 3 days productive, temp 37.9, chest clear, review 1 week" /></Field>
        <Button disabled={!patientId || raw.trim().length < 10} loading={draft.isPending} onClick={() => draft.mutate()}><Bot /> Generate draft</Button>
        {draft.isError && <Alert tone="danger">{errorMessage(draft.error)}</Alert>}
      </div>
      <Card className={cn(draft.data && 'border-violet-200')}>
        <CardHeader title="Draft" description={draft.data ? draft.data.label : 'Your structured draft appears here.'} action={draft.data && <Badge tone="ai">Not reviewed</Badge>} />
        <CardBody>
          {draft.data ? (
            <div className="space-y-5">
              {draft.data.warnings.length > 0 && (
                <Alert tone="warning" title="Check before signing">
                  <ul className="mt-1 list-disc space-y-0.5 pl-4">{draft.data.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                </Alert>
              )}
              <NoteSectionsView sections={draft.data.sections} />
              <Button asChild><Link href={`/app/clinical/notes/${draft.data.note.id}`}>Open draft to review & sign <ArrowRight /></Link></Button>
            </div>
          ) : <div className="py-16 text-center text-sm text-muted"><FileText className="mx-auto mb-3 size-8 text-line" />No draft yet</div>}
        </CardBody>
      </Card>
    </div>
  );
}

function HealthInfo() {
  const [question, setQuestion] = useState('');
  const [lang, setLang] = useState('en');
  const ask = useMutation({
    mutationFn: () => api<{ answer: string; emergency: boolean; aiGenerated: boolean; sources: { id: string; title: string; sourceName: string; sourceUrl: string | null }[]; disclaimer: string }>('/ai/health-info', { method: 'POST', body: { question, language: lang }, clinic: null }),
  });
  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted">General health education for explaining terminology. Answers use only platform-approved sources.</p>
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (question.trim().length >= 3) ask.mutate(); }}>
        <Textarea aria-label="Question" rows={1} className="min-h-10 flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. What does hypertension mean?" />
        <LanguageSelect value={lang} onChange={setLang} />
        <Button type="submit" loading={ask.isPending}><BookOpen /> Ask</Button>
      </form>
      {ask.isError && <Alert tone="danger">{errorMessage(ask.error)}</Alert>}
      {ask.data && (
        <Card className={ask.data.emergency ? 'border-red-200' : undefined}>
          <CardBody className="space-y-3">
            {ask.data.emergency ? <p className="flex items-center gap-2 font-semibold text-danger"><Siren className="size-5" /> Emergency guidance</p> : ask.data.aiGenerated && <Badge tone="ai"><Bot className="size-3" /> AI-generated from approved sources</Badge>}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{ask.data.answer}</p>
            {ask.data.sources.length > 0 && (
              <div className="border-t border-line pt-3 text-xs text-muted">
                Sources: {ask.data.sources.map((s, i) => <span key={s.id}>{i > 0 && '; '}{s.sourceUrl ? <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="underline">{s.title}</a> : s.title} ({s.sourceName})</span>)}
              </div>
            )}
            <p className="text-xs text-muted">{ask.data.disclaimer}</p>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default function AiPage() {
  const { role } = useAuth();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<AiStatus>('/ai/status', { clinic: null }) });
  const tabs = [
    ...(can(role, 'ai:clinical') ? [{ value: 'clinical', label: 'Documentation assistant', content: <ClinicalDraft /> }] : []),
    { value: 'assistant', label: 'Workflow assistant', content: <AdminAssistant /> },
    { value: 'health', label: 'Health information', content: <HealthInfo /> },
  ];
  return (
    <>
      <PageHeader title="AI Assistant" description="Assists with administration and documentation. Never diagnoses, prescribes or decides treatment." />
      {status.data && !status.data.configured && (
        <Alert tone="warning" title="AI provider not configured" className="mb-6">
          <span className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" />An administrator must configure an approved AI provider (AI_BASE_URL, AI_API_KEY, AI_MODEL) before AI features work. Emergency guidance still functions.</span>
        </Alert>
      )}
      {status.error instanceof ApiError && <Alert tone="danger" className="mb-6">{status.error.message}</Alert>}
      <Card><CardBody><Tabs tabs={tabs} /></CardBody></Card>
    </>
  );
}
