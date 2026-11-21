'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, ListChecks, Plus } from 'lucide-react';
import { PRIORITIES } from '@afyalink/shared';
import { api, apiPage, errorMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/nav';
import { formatCalendarDate, humanize, localDateString } from '@/lib/format';
import type { FollowUp, PatientSummary, StaffMember } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { PatientPicker } from '@/components/app/book-appointment';

function NewFollowUp({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { role } = useAuth();
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [form, setForm] = useState({ title: '', details: '', dueDate: localDateString(), priority: 'NORMAL', assignedToUserId: '' });
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<StaffMember[]>('/staff'), enabled: open && can(role, 'staff:read') });
  const m = useMutation({
    mutationFn: () => api('/follow-ups', { method: 'POST', body: { patientId: patient!.id, title: form.title, details: form.details || undefined, dueDate: form.dueDate, priority: form.priority, assignedToUserId: form.assignedToUserId || undefined } }),
    onSuccess: async () => { toast.success('Follow-up created'); await qc.invalidateQueries({ queryKey: ['follow-ups'] }); onOpenChange(false); setPatient(null); setForm((f) => ({ ...f, title: '', details: '' })); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New follow-up task" size="lg"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!patient || form.title.trim().length < 1} loading={m.isPending} onClick={() => m.mutate()}>Create task</Button></>}>
      <div className="space-y-4">
        <Field label="Patient" required><div><PatientPicker value={patient} onChange={setPatient} /></div></Field>
        <Field label="Task" required hint="Keep it administrative, e.g. “Call to book review visit”"><Input maxLength={160} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Details"><Textarea rows={2} value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} /></Field>
        <FormGrid className="sm:grid-cols-3">
          <Field label="Due date" required><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></Field>
          <Field label="Priority"><Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select></Field>
          <Field label="Assign to">
            <Select value={form.assignedToUserId} onChange={(e) => setForm({ ...form, assignedToUserId: e.target.value })}>
              <option value="">Unassigned</option>
              {staff.data?.filter((s) => s.status === 'ACTIVE').map((s) => <option key={s.user.id} value={s.user.id}>{s.user.firstName} {s.user.lastName}</option>)}
            </Select>
          </Field>
        </FormGrid>
      </div>
    </Dialog>
  );
}

export default function FollowUpsPage() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [status, setStatus] = useState('OPEN');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const q = useQuery({ queryKey: ['follow-ups', status, mine, page], queryFn: () => apiPage<FollowUp>(`/follow-ups${qs({ status, mine: mine || undefined, page })}`), placeholderData: keepPreviousData });
  const update = useMutation({
    mutationFn: ({ id, status: s }: { id: string; status: string }) => api(`/follow-ups/${id}`, { method: 'PATCH', body: { status: s } }),
    onSuccess: async () => { toast.success('Task updated'); await qc.invalidateQueries({ queryKey: ['follow-ups'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const today = localDateString();
  return (
    <>
      <PageHeader title="Follow-ups" description="Patient follow-up tasks for your team." actions={can(role, 'followup:manage') && <Button onClick={() => setCreate(true)}><Plus /> New task</Button>} />
      <Card>
        <div className="flex flex-wrap items-center gap-4 border-b border-line p-4">
          <Select aria-label="Status" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Assigned to me</label>
        </div>
        {q.isLoading ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length ? (
          <>
            <Table caption="Follow-up tasks">
              <THead><tr><Th>Task</Th><Th>Patient</Th><Th>Due</Th><Th>Priority</Th><Th>Assignee</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></THead>
              <TBody>{q.data.items.map((f) => {
                const overdue = ['OPEN', 'IN_PROGRESS'].includes(f.status) && f.dueDate.slice(0, 10) < today;
                return (
                  <Tr key={f.id}>
                    <Td><p className="font-semibold">{f.title}</p>{f.details && <p className="text-xs text-muted">{f.details}</p>}</Td>
                    <Td><Link className="text-brand-800 hover:underline" href={`/app/patients/${f.patient.id}`}>{f.patient.firstName} {f.patient.lastName}</Link></Td>
                    <Td className={cn(overdue && 'font-semibold text-danger')}>{formatCalendarDate(f.dueDate)}{overdue && ' · overdue'}</Td>
                    <Td><StatusBadge status={f.priority} /></Td>
                    <Td>{f.assignedTo ? `${f.assignedTo.firstName} ${f.assignedTo.lastName}` : '—'}</Td>
                    <Td><StatusBadge status={f.status} /></Td>
                    <Td className="whitespace-nowrap text-right">
                      {f.status === 'OPEN' && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: f.id, status: 'IN_PROGRESS' })}>Start</Button>}
                      {['OPEN', 'IN_PROGRESS'].includes(f.status) && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: f.id, status: 'DONE' })}><CheckCircle2 /> Done</Button>}
                    </Td>
                  </Tr>
                );
              })}</TBody>
            </Table>
            <Pagination page={page} totalPages={q.data.meta.totalPages} onPage={setPage} />
          </>
        ) : <EmptyState icon={ListChecks} title="No follow-up tasks" description="Nothing here for the selected filters." />}
      </Card>
      <NewFollowUp open={create} onOpenChange={setCreate} />
    </>
  );
}
