'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClipboardList, Pencil, Plus } from 'lucide-react';
import { clinicServiceSchema } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { useZodForm } from '@/lib/form';
import type { ClinicService } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Checkbox, Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

function ServiceDialog({ service, onClose }: { service: ClinicService | 'new'; onClose: () => void }) {
  const qc = useQueryClient();
  const existing = service === 'new' ? null : service;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useZodForm(clinicServiceSchema, {
    defaultValues: existing ? { name: existing.name, description: existing.description ?? undefined, durationMinutes: existing.durationMinutes, priceEtb: existing.priceEtbCents != null ? existing.priceEtbCents / 100 : undefined, active: existing.active } : { durationMinutes: 30, active: true },
  });
  const submit = handleSubmit(async (v) => {
    try {
      await api(existing ? `/services/${existing.id}` : '/services', { method: existing ? 'PATCH' : 'POST', body: v });
      toast.success(existing ? 'Service updated' : 'Service added');
      await qc.invalidateQueries({ queryKey: ['services'] });
      onClose();
    } catch (e) { toast.error(errorMessage(e)); }
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={existing ? 'Edit service' : 'Add service'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={submit}>Save</Button></>}>
      <div className="space-y-4">
        <Field label="Name" required error={errors.name?.message}><Input {...register('name')} /></Field>
        <Field label="Description" error={errors.description?.message}><Textarea rows={2} {...register('description')} /></Field>
        <FormGrid>
          <Field label="Duration (minutes)" required error={errors.durationMinutes?.message}><Input type="number" min={5} step={5} {...register('durationMinutes', { valueAsNumber: true })} /></Field>
          <Field label="Price (ETB)" error={errors.priceEtb?.message}><Input type="number" min={0} step="0.01" {...register('priceEtb', { setValueAs: (v: string) => (v === '' ? undefined : Number(v)) })} /></Field>
        </FormGrid>
        <label className="flex items-center gap-2 text-sm"><Checkbox {...register('active')} /> Available for booking</label>
      </div>
    </Dialog>
  );
}

export default function ServicesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ClinicService | 'new' | null>(null);
  const q = useQuery({ queryKey: ['services', 'all'], queryFn: () => api<ClinicService[]>('/services?includeInactive=true') });
  const archive = useMutation({
    mutationFn: (id: string) => api(`/services/${id}`, { method: 'DELETE' }),
    onSuccess: async () => { toast.success('Service archived'); await qc.invalidateQueries({ queryKey: ['services'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Services" description="Services patients can book, with durations used for scheduling." actions={<Button onClick={() => setEditing('new')}><Plus /> Add service</Button>} />
      <Card>
        {q.isLoading ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? (
          <Table caption="Clinic services">
            <THead><tr><Th>Service</Th><Th>Duration</Th><Th>Price</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></THead>
            <TBody>
              {q.data.map((s) => (
                <Tr key={s.id}>
                  <Td><p className="font-semibold">{s.name}</p>{s.description && <p className="text-xs text-muted">{s.description}</p>}</Td>
                  <Td>{s.durationMinutes} min</Td>
                  <Td>{s.priceEtbCents != null ? `${(s.priceEtbCents / 100).toLocaleString()} ETB` : '—'}</Td>
                  <Td><StatusBadge status={s.active ? 'ACTIVE' : 'INACTIVE'} /></Td>
                  <Td className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil /> Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => confirm(`Archive ${s.name}?`) && archive.mutate(s.id)}>Archive</Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={ClipboardList} title="No services yet" description="Add at least one service so appointments can be booked." action={<Button onClick={() => setEditing('new')}>Add service</Button>} />}
      </Card>
      {editing && <ServiceDialog service={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
