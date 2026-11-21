'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Plus } from 'lucide-react';
import { healthContentSchema } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/form';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, EmptyState, LoadingRows } from '@/components/ui/states';

interface Content { id: string; title: string; body: string; language: string; sourceName: string; sourceUrl: string | null; status: string; updatedAt: string }

export default function AdminContent() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['platform', 'content'], queryFn: () => api<Content[]>('/platform/health-content', { clinic: null }) });
  const f = useZodForm(healthContentSchema, { defaultValues: { language: 'en', tags: [] } });
  const create = f.handleSubmit(async (v) => {
    try { await api('/platform/health-content', { method: 'POST', body: v, clinic: null }); toast.success('Content submitted for review'); f.reset(); setOpen(false); await qc.invalidateQueries({ queryKey: ['platform', 'content'] }); } catch (e) { toast.error(errorMessage(e)); }
  });
  const review = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/platform/health-content/${id}`, { method: 'PATCH', body: { status }, clinic: null }),
    onSuccess: async () => { toast.success('Content updated'); await qc.invalidateQueries({ queryKey: ['platform', 'content'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Approved health content" description="The only sources the patient health-information assistant may use." actions={<Button onClick={() => setOpen(true)}><Plus /> Add content</Button>} />
      <Alert tone="warning" className="mb-6">Approve content only after review by a qualified clinician. Cite the original, authoritative source (e.g. Ministry of Health, WHO).</Alert>
      <div className="space-y-4">
        {q.isLoading ? <Card><LoadingRows /></Card> : q.data?.length ? q.data.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{c.title} <span className="ml-1 text-xs uppercase text-muted">{c.language}</span></p><p className="text-xs text-muted">{c.sourceName} · updated {formatDate(c.updatedAt)}</p></div>
              <div className="flex items-center gap-2">
                <StatusBadge status={c.status} />
                {c.status !== 'APPROVED' && <Button size="sm" onClick={() => review.mutate({ id: c.id, status: 'APPROVED' })}>Approve</Button>}
                {c.status !== 'RETIRED' && <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: c.id, status: 'RETIRED' })}>Retire</Button>}
              </div>
            </div>
            <p className="mt-3 line-clamp-3 text-sm text-muted">{c.body}</p>
          </Card>
        )) : <Card><EmptyState icon={BookOpen} title="No content yet" /></Card>}
      </div>
      <Dialog open={open} onOpenChange={setOpen} title="Add health content" size="lg" footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button loading={f.formState.isSubmitting} onClick={create}>Submit for review</Button></>}>
        <div className="space-y-4">
          <Field label="Title" error={f.formState.errors.title?.message}><Input {...f.register('title')} /></Field>
          <Field label="Body" error={f.formState.errors.body?.message}><Textarea rows={8} {...f.register('body')} /></Field>
          <FormGrid className="sm:grid-cols-3">
            <Field label="Language"><Select {...f.register('language')}><option value="en">English</option><option value="am">Amharic</option></Select></Field>
            <Field label="Source name" error={f.formState.errors.sourceName?.message}><Input {...f.register('sourceName')} /></Field>
            <Field label="Source URL" error={f.formState.errors.sourceUrl?.message}><Input {...f.register('sourceUrl', { setValueAs: (v: string) => v || undefined })} /></Field>
          </FormGrid>
        </div>
      </Dialog>
    </>
  );
}
