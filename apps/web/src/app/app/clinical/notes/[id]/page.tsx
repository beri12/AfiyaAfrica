'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, FilePen, History, Lock, Send, ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, humanize } from '@/lib/format';
import type { NoteDetail, NoteSectionsT } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Checkbox, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, ErrorState, Spinner } from '@/components/ui/states';
import { cleanSections, NoteSectionsEditor, NoteSectionsView } from '@/components/app/note-sections';

export default function NotePage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['note', id], queryFn: () => api<NoteDetail>(`/clinical-notes/${id}`) });
  const [draft, setDraft] = useState<NoteSectionsT>({});
  const [signOpen, setSignOpen] = useState(false);
  const [attest, setAttest] = useState(false);
  const [amendOpen, setAmendOpen] = useState(false);
  const [amend, setAmend] = useState<NoteSectionsT>({});
  const [reason, setReason] = useState('');
  const [reviewDecision, setReviewDecision] = useState('ACCEPTED');
  const [reviewComment, setReviewComment] = useState('');

  useEffect(() => { if (q.data) { setDraft(q.data.current.sections); setAmend(q.data.current.sections); } }, [q.data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['note', id] });
  const call = (path: string, body?: object, method: 'POST' | 'PATCH' = 'POST') => api<NoteDetail>(`/clinical-notes/${id}${path}`, { method, body: body ?? {} });
  const saveDraft = useMutation({ mutationFn: () => call('', { sections: cleanSections(draft) }, 'PATCH'), onSuccess: () => { toast.success('Draft saved'); return refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const submit = useMutation({ mutationFn: () => call('/submit'), onSuccess: () => { toast.success('Submitted for review'); return refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const sign = useMutation({ mutationFn: () => call('/sign', { attestation: true }), onSuccess: () => { toast.success('Note signed'); setSignOpen(false); return refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const amendM = useMutation({ mutationFn: () => call('/amend', { sections: cleanSections(amend), reason, attestation: true }), onSuccess: () => { toast.success('Amendment signed'); setAmendOpen(false); setReason(''); return refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const review = useMutation({
    mutationFn: (interactionId: string) => api('/ai/reviews', { method: 'POST', body: { interactionId, decision: reviewDecision, comment: reviewComment || undefined } }),
    onSuccess: () => { toast.success('AI draft review recorded'); return refresh(); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Spinner label="Loading note" />;
  if (q.isError || !q.data) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const n = q.data;
  const editable = (n.status === 'DRAFT' || n.status === 'IN_REVIEW') && n.author.id === user?.id;
  const locked = n.status === 'SIGNED' || n.status === 'AMENDED';
  const aiVersion = n.versions.find((v) => v.aiInteractionId);
  const needsAiReview = n.source === 'AI_ASSISTED' && !n.aiReviews.some((r) => r.decision !== 'REJECTED');

  return (
    <>
      <PageHeader
        title={n.title}
        description={<>
          <Link href={`/app/patients/${n.patient.id}`} className="font-medium text-brand-700 hover:underline">{n.patient.firstName} {n.patient.lastName}</Link> · {n.patient.medicalRecordNumber} · Version {n.currentVersion}
        </>}
        actions={<>
          <StatusBadge status={n.status} className="self-center" />
          {n.source === 'AI_ASSISTED' && <Badge tone="ai" className="self-center"><Bot className="size-3" /> AI-assisted</Badge>}
          {n.status === 'DRAFT' && <Button variant="secondary" loading={submit.isPending} onClick={() => submit.mutate()}><Send /> Submit for review</Button>}
          {!locked && <Button onClick={() => setSignOpen(true)}><ShieldCheck /> Review & sign</Button>}
          {locked && <Button variant="secondary" onClick={() => setAmendOpen(true)}><FilePen /> Amend</Button>}
        </>}
      />

      {needsAiReview && aiVersion && (
        <Card className="mb-6 border-violet-200">
          <CardBody className="space-y-4">
            <Alert tone="ai" title="AI-generated draft — not reviewed">
              This draft was structured by AI from your notes. Check every section against your own findings, correct or remove anything inaccurate, then record your review. You cannot sign until a review is recorded.
            </Alert>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Field label="Review outcome" className="sm:w-56">
                <Select value={reviewDecision} onChange={(e) => setReviewDecision(e.target.value)}>
                  <option value="ACCEPTED">Accepted as drafted</option>
                  <option value="EDITED">Accepted after my edits</option>
                  <option value="REJECTED">Rejected</option>
                </Select>
              </Field>
              <Field label="Comment (optional)" className="flex-1"><Textarea rows={1} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} /></Field>
              <Button loading={review.isPending} onClick={() => review.mutate(aiVersion.aiInteractionId!)}>Record review</Button>
            </div>
          </CardBody>
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card>
          <CardHeader title={editable ? 'Edit draft' : 'Current version'} description={locked ? `Signed ${n.signedAt ? formatDateTime(n.signedAt) : ''} · read-only` : undefined} action={locked ? <Lock className="size-4 text-muted" aria-label="Locked" /> : undefined} />
          <CardBody>
            {editable ? (
              <>
                <NoteSectionsEditor value={draft} onChange={setDraft} />
                <div className="mt-5 flex justify-end"><Button variant="secondary" loading={saveDraft.isPending} onClick={() => saveDraft.mutate()}>Save draft</Button></div>
              </>
            ) : <NoteSectionsView sections={n.current.sections} />}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Version history" action={<History className="size-4 text-muted" />} />
          <ol className="divide-y divide-line">
            {n.versions.map((v) => (
              <li key={v.id} className="px-5 py-3.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Version {v.version}</p>
                  <StatusBadge status={v.status} />
                </div>
                <p className="mt-0.5 text-xs text-muted">{v.author.firstName} {v.author.lastName} · {formatDateTime(v.createdAt)} · {humanize(v.source)}</p>
                {v.amendmentReason && <p className="mt-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-xs">Reason: {v.amendmentReason}</p>}
              </li>
            ))}
          </ol>
          {n.aiReviews.length > 0 && (
            <div className="border-t border-line px-5 py-3.5 text-xs text-muted">
              {n.aiReviews.map((r, i) => <p key={i}>AI draft {humanize(r.decision)} by {r.reviewer.firstName} {r.reviewer.lastName} · {formatDateTime(r.createdAt)}</p>)}
            </div>
          )}
        </Card>
      </div>

      <Dialog open={signOpen} onOpenChange={setSignOpen} title="Sign clinical note" description="Signing locks this version. Later changes require an amendment with a reason."
        footer={<><Button variant="secondary" onClick={() => setSignOpen(false)}>Cancel</Button><Button disabled={!attest} loading={sign.isPending} onClick={() => sign.mutate()}>Sign note</Button></>}>
        <NoteSectionsView sections={editable ? cleanSections(draft) : n.current.sections} />
        {editable && JSON.stringify(cleanSections(draft)) !== JSON.stringify(n.current.sections) && <Alert tone="warning" className="mt-4">You have unsaved edits. Save the draft before signing.</Alert>}
        <label className="mt-5 flex items-start gap-3 rounded-xl border border-line p-3 text-sm">
          <Checkbox className="mt-0.5" checked={attest} onChange={(e) => setAttest(e.target.checked)} />
          <span>I have reviewed this note{n.source === 'AI_ASSISTED' ? ', including all AI-assisted content,' : ''} and confirm it accurately reflects my clinical findings and decisions.</span>
        </label>
      </Dialog>

      <Dialog open={amendOpen} onOpenChange={setAmendOpen} size="xl" title="Amend signed note" description="The signed version is preserved. Your amendment becomes a new signed version."
        footer={<><Button variant="secondary" onClick={() => setAmendOpen(false)}>Cancel</Button><Button disabled={reason.trim().length < 5} loading={amendM.isPending} onClick={() => amendM.mutate()}>Sign amendment</Button></>}>
        <div className="space-y-5">
          <Field label="Reason for amendment" required hint="Minimum 5 characters, e.g. 'Corrected follow-up interval'"><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
          <NoteSectionsEditor value={amend} onChange={setAmend} />
          <p className="text-xs text-muted">By signing you attest that you reviewed this amendment.</p>
        </div>
      </Dialog>
    </>
  );
}
