'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FlaskConical, Lock, Plus } from 'lucide-react';
import { PRIORITIES } from '@afyalink/shared';
import { api, apiPage, errorMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/nav';
import { formatDateTime, fullName, humanize } from '@/lib/format';
import type { LabOrder, PatientSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

interface Lab { id: string; name: string }

function OrderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const labs = useQuery({ queryKey: ['labs'], queryFn: () => api<Lab[]>('/lab/laboratories'), enabled: open });
  const patients = useQuery({ queryKey: ['patients', 'care'], queryFn: () => apiPage<PatientSummary>('/patients?pageSize=100'), enabled: open });
  const [f, setF] = useState({ patientId: '', laboratoryId: '', testName: '', priority: 'NORMAL', instructions: '' });
  const m = useMutation({
    mutationFn: () => api('/lab/orders', { method: 'POST', body: { ...f, instructions: f.instructions || undefined } }),
    onSuccess: async () => { toast.success('Lab order placed'); await qc.invalidateQueries({ queryKey: ['lab-orders'] }); onOpenChange(false); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New lab order" footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!f.patientId || !f.laboratoryId || !f.testName} loading={m.isPending} onClick={() => m.mutate()}>Place order</Button></>}>
      <div className="space-y-4">
        <Field label="Patient (in your care)" required><Select value={f.patientId} onChange={(e) => setF({ ...f, patientId: e.target.value })}><option value="">Select…</option>{patients.data?.items.map((p) => <option key={p.id} value={p.id}>{fullName(p)} · {p.medicalRecordNumber}</option>)}</Select></Field>
        <FormGrid>
          <Field label="Laboratory" required><Select value={f.laboratoryId} onChange={(e) => setF({ ...f, laboratoryId: e.target.value })}><option value="">Select…</option>{labs.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</Select></Field>
          <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select></Field>
        </FormGrid>
        <Field label="Test" required><Input value={f.testName} onChange={(e) => setF({ ...f, testName: e.target.value })} placeholder="e.g. Full blood count" /></Field>
        <Field label="Instructions"><Textarea rows={2} value={f.instructions} onChange={(e) => setF({ ...f, instructions: e.target.value })} /></Field>
      </div>
    </Dialog>
  );
}

function ResultDialog({ order, onClose }: { order: LabOrder | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ resultText: '', unit: '', referenceRange: '', abnormal: false });
  const m = useMutation({
    mutationFn: () => api(`/lab/orders/${order!.id}/result`, { method: 'POST', body: { resultText: f.resultText, unit: f.unit || undefined, referenceRange: f.referenceRange || undefined, abnormal: f.abnormal } }),
    onSuccess: async () => { toast.success('Result recorded; ordering doctor notified'); await qc.invalidateQueries({ queryKey: ['lab-orders'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={!!order} onOpenChange={(o) => !o && onClose()} title="Record result" description={order ? `${order.testName} · ${order.patient.firstName} ${order.patient.lastName} (${order.patient.medicalRecordNumber})` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!f.resultText} loading={m.isPending} onClick={() => m.mutate()}>Save result</Button></>}>
      <div className="space-y-4">
        <Field label="Result" required><Textarea rows={3} value={f.resultText} onChange={(e) => setF({ ...f, resultText: e.target.value })} /></Field>
        <FormGrid>
          <Field label="Unit"><Input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></Field>
          <Field label="Reference range"><Input value={f.referenceRange} onChange={(e) => setF({ ...f, referenceRange: e.target.value })} /></Field>
        </FormGrid>
        <label className="flex items-center gap-2 text-sm"><Checkbox checked={f.abnormal} onChange={(e) => setF({ ...f, abnormal: e.target.checked })} /> Outside reference range</label>
      </div>
    </Dialog>
  );
}

export default function LabPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [order, setOrder] = useState(false);
  const [resultFor, setResultFor] = useState<LabOrder | null>(null);
  const [labName, setLabName] = useState('');
  const labs = useQuery({ queryKey: ['labs'], queryFn: () => api<Lab[]>('/lab/laboratories') });
  const q = useQuery({ queryKey: ['lab-orders', status, page], queryFn: () => apiPage<LabOrder>(`/lab/orders${qs({ status, page })}`), placeholderData: keepPreviousData });
  const setStatusM = useMutation({
    mutationFn: ({ id, s }: { id: string; s: string }) => api(`/lab/orders/${id}/status`, { method: 'PATCH', body: { status: s } }),
    onSuccess: async () => { toast.success('Order updated'); await qc.invalidateQueries({ queryKey: ['lab-orders'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const addLab = useMutation({
    mutationFn: () => api('/lab/laboratories', { method: 'POST', body: { name: labName } }),
    onSuccess: async () => { toast.success('Laboratory added'); setLabName(''); await qc.invalidateQueries({ queryKey: ['labs'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const isLab = role === 'LABORATORY_STAFF';
  return (
    <>
      <PageHeader title="Laboratory" description={isLab ? 'Orders assigned to your laboratory. Only the information needed to process samples is shown.' : 'Laboratory orders and results.'}
        actions={can(role, 'lab:order') && <Button onClick={() => setOrder(true)}><Plus /> New order</Button>} />
      {role === 'CLINIC_ADMIN' && (
        <Card className="mb-6 p-4">
          <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={(e) => { e.preventDefault(); if (labName) addLab.mutate(); }}>
            <p className="text-sm text-muted sm:mr-auto">Laboratories: {labs.data?.map((l) => l.name).join(', ') || 'none yet'}</p>
            <Input aria-label="New laboratory name" className="sm:w-64" placeholder="Laboratory name" value={labName} onChange={(e) => setLabName(e.target.value)} />
            <Button type="submit" variant="secondary" loading={addLab.isPending}>Add laboratory</Button>
          </form>
        </Card>
      )}
      <Card>
        <div className="border-b border-line p-4">
          <Select aria-label="Status" className="w-48" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['ORDERED', 'SAMPLE_COLLECTED', 'IN_PROGRESS', 'RESULTED', 'CANCELLED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        </div>
        {q.isLoading ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length ? (
          <>
            <Table caption="Laboratory orders">
              <THead><tr><Th>Test</Th><Th>Patient</Th><Th>Ordered</Th><Th>Status</Th><Th>Result</Th><Th><span className="sr-only">Actions</span></Th></tr></THead>
              <TBody>{q.data.items.map((o) => (
                <Tr key={o.id}>
                  <Td><p className="font-semibold">{o.testName}</p><p className="text-xs text-muted">{o.laboratory.name}{o.priority !== 'NORMAL' && <> · <StatusBadge status={o.priority} /></>}</p>{o.instructions && <p className="text-xs text-muted">{o.instructions}</p>}</Td>
                  <Td>{o.patient.firstName} {o.patient.lastName}<p className="font-mono text-xs text-muted">{o.patient.medicalRecordNumber}</p></Td>
                  <Td className="text-sm">{formatDateTime(o.createdAt)}<p className="text-xs text-muted">Dr {o.orderedBy.lastName}</p></Td>
                  <Td><StatusBadge status={o.status} /></Td>
                  <Td className="max-w-64 text-sm">
                    {!o.result ? '—' : o.result.restricted ? <span className="inline-flex items-center gap-1 text-muted"><Lock className="size-3.5" /> Restricted</span> : (
                      <span>{o.result.resultText} {o.result.unit}{o.result.referenceRange && <span className="block text-xs text-muted">Ref: {o.result.referenceRange}</span>}{o.result.abnormal && <Badge tone="warning" className="mt-1">Outside range</Badge>}</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    {isLab && o.status === 'ORDERED' && <Button size="sm" variant="ghost" onClick={() => setStatusM.mutate({ id: o.id, s: 'SAMPLE_COLLECTED' })}>Sample collected</Button>}
                    {isLab && o.status === 'SAMPLE_COLLECTED' && <Button size="sm" variant="ghost" onClick={() => setStatusM.mutate({ id: o.id, s: 'IN_PROGRESS' })}>Start</Button>}
                    {isLab && ['SAMPLE_COLLECTED', 'IN_PROGRESS'].includes(o.status) && <Button size="sm" onClick={() => setResultFor(o)}>Record result</Button>}
                  </Td>
                </Tr>
              ))}</TBody>
            </Table>
            <Pagination page={page} totalPages={q.data.meta.totalPages} onPage={setPage} />
          </>
        ) : <EmptyState icon={FlaskConical} title="No lab orders" />}
      </Card>
      <OrderDialog open={order} onOpenChange={setOrder} />
      <ResultDialog order={resultFor} onClose={() => setResultFor(null)} />
    </>
  );
}
