'use client';

import Link from 'next/link';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, CalendarPlus, Check, ChevronLeft, ChevronRight, List, MoreHorizontal, UserX, X } from 'lucide-react';
import * as DM from '@radix-ui/react-dropdown-menu';
import type { AppointmentSlot } from '@afyalink/shared';
import { api, apiPage, errorMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/nav';
import { DEFAULT_TZ, formatDate, formatTime, humanize, localDateString } from '@/lib/format';
import type { Appointment, Doctor } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows, Spinner } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { BookAppointmentDialog } from '@/components/app/book-appointment';

/** UTC instant for clinic-local midnight (Addis Ababa is UTC+3 with no DST). */
const addisMidnight = (date: string) => new Date(`${date}T00:00:00+03:00`);
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const weekStart = (date: string) => {
  const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
  return addDays(date, -((dow + 6) % 7)); // Monday
};

function RescheduleDialog({ appt, onClose }: { appt: Appointment | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [date, setDate] = useState(localDateString());
  const [slot, setSlot] = useState<string | null>(null);
  const slots = useQuery({
    queryKey: ['slots', appt?.doctor.id, date, appt?.service.id],
    queryFn: () => api<AppointmentSlot[]>(`/doctors/${appt!.doctor.id}/slots${qs({ date, serviceId: appt!.service.id })}`),
    enabled: !!appt,
  });
  const m = useMutation({
    mutationFn: () => api(`/appointments/${appt!.id}/reschedule`, { method: 'POST', body: { startAt: slot } }),
    onSuccess: async () => { toast.success('Appointment rescheduled'); await qc.invalidateQueries({ queryKey: ['appointments'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={!!appt} onOpenChange={(o) => !o && onClose()} title="Reschedule appointment" description={appt ? `${appt.patient.firstName} ${appt.patient.lastName} · ${appt.service.name}` : ''}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!slot} loading={m.isPending} onClick={() => m.mutate()}>Move appointment</Button></>}>
      <Field label="New date"><Input type="date" min={localDateString()} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} /></Field>
      <div className="mt-4">
        {slots.isLoading ? <Spinner /> : slots.data?.length ? (
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Available times">
            {slots.data.map((s) => (
              <button key={s.startAt} type="button" role="radio" aria-checked={slot === s.startAt} onClick={() => setSlot(s.startAt)}
                className={cn('rounded-lg border px-2 py-2 text-sm tabular-nums', slot === s.startAt ? 'border-brand-700 bg-brand-700 text-white' : 'border-line hover:bg-brand-50')}>{formatTime(s.startAt)}</button>
            ))}
          </div>
        ) : <p className="text-sm text-muted">No free times on this date.</p>}
      </div>
    </Dialog>
  );
}

function Actions({ a, onReschedule }: { a: Appointment; onReschedule: (a: Appointment) => void }) {
  const qc = useQueryClient();
  const run = useMutation({
    mutationFn: ({ action, body }: { action: string; body?: object }) => api(`/appointments/${a.id}/${action}`, { method: 'POST', body: body ?? {} }),
    onSuccess: async (_d, v) => { toast.success(`Appointment ${v.action === 'no-show' ? 'marked no-show' : `${v.action}ed`.replace('eed', 'ed')}`); await qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const started = new Date(a.startAt) <= new Date();
  const items = [
    a.status === 'PENDING' && { label: 'Confirm', icon: Check, run: () => run.mutate({ action: 'confirm' }) },
    a.status === 'CONFIRMED' && started && { label: 'Mark completed', icon: Check, run: () => run.mutate({ action: 'complete' }) },
    a.status === 'CONFIRMED' && started && { label: 'Mark no-show', icon: UserX, run: () => run.mutate({ action: 'no-show' }) },
    ['PENDING', 'CONFIRMED'].includes(a.status) && { label: 'Reschedule', icon: CalendarDays, run: () => onReschedule(a) },
    ['PENDING', 'CONFIRMED'].includes(a.status) && { label: 'Cancel', icon: X, danger: true, run: () => { const reason = prompt('Reason for cancellation (optional)') ?? undefined; run.mutate({ action: 'cancel', body: { reason } }); } },
  ].filter(Boolean) as { label: string; icon: typeof Check; danger?: boolean; run: () => void }[];
  if (!items.length) return null;
  return (
    <DM.Root>
      <DM.Trigger className="rounded-lg p-1.5 text-muted hover:bg-canvas hover:text-ink" aria-label={`Actions for ${a.patient.firstName} ${a.patient.lastName}`}><MoreHorizontal className="size-4" /></DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" className="z-50 min-w-44 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
          {items.map((i) => (
            <DM.Item key={i.label} onSelect={i.run} className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-brand-50', i.danger && 'text-danger data-[highlighted]:bg-danger-soft')}>
              <i.icon className="size-4" /> {i.label}
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function WeekCalendar({ start, items }: { start: string; items: Appointment[] }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = localDateString();
  return (
    <div className="grid grid-cols-1 divide-y divide-line md:grid-cols-7 md:divide-x md:divide-y-0">
      {days.map((d) => {
        const dayItems = items.filter((a) => localDateString(new Date(a.startAt), DEFAULT_TZ) === d);
        return (
          <div key={d} className="min-h-40 p-2.5">
            <p className={cn('mb-2 text-xs font-semibold uppercase tracking-wide', d === today ? 'text-teal-700' : 'text-muted')}>
              {new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })}
            </p>
            <ul className="space-y-1.5">
              {dayItems.map((a) => (
                <li key={a.id} className={cn('rounded-lg border-l-[3px] bg-canvas px-2 py-1.5 text-xs', { PENDING: 'border-amber-500', CONFIRMED: 'border-brand-600', COMPLETED: 'border-green-600', CANCELLED: 'border-slate-300 opacity-60', NO_SHOW: 'border-red-500' }[a.status])}>
                  <p className="font-semibold tabular-nums">{formatTime(a.startAt)}</p>
                  <Link href={`/app/patients/${a.patient.id}`} className="block truncate text-ink hover:underline">{a.patient.firstName} {a.patient.lastName}</Link>
                  <p className="truncate text-muted">Dr {a.doctor.membership.user.lastName}</p>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function AppointmentsInner() {
  const { role } = useAuth();
  const params = useSearchParams();
  const [view, setView] = useState<'list' | 'week'>('list');
  const [date, setDate] = useState(localDateString());
  const [status, setStatus] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [page, setPage] = useState(1);
  const [book, setBook] = useState(false);
  const [resched, setResched] = useState<Appointment | null>(null);

  useEffect(() => { if (params.get('new')) setBook(true); }, [params]);

  const range = useMemo(() => {
    const from = view === 'week' ? weekStart(date) : date;
    const to = addDays(from, view === 'week' ? 7 : 1);
    return { from: addisMidnight(from).toISOString(), to: addisMidnight(to).toISOString(), start: from };
  }, [view, date]);

  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => api<Doctor[]>('/doctors'), enabled: role !== 'DOCTOR' });
  const q = useQuery({
    queryKey: ['appointments', range.from, range.to, status, doctorId, page, view],
    queryFn: () => apiPage<Appointment>(`/appointments${qs({ from: range.from, to: range.to, status, doctorId, page: view === 'week' ? 1 : page, pageSize: view === 'week' ? 100 : 25 })}`),
    placeholderData: keepPreviousData,
  });

  const step = view === 'week' ? 7 : 1;
  return (
    <>
      <PageHeader title="Appointments" description="All times in clinic time (East Africa Time)."
        actions={can(role, 'appointment:create') && <Button onClick={() => setBook(true)}><CalendarPlus /> New appointment</Button>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <Button size="icon" variant="secondary" aria-label="Previous" onClick={() => { setDate(addDays(date, -step)); setPage(1); }}><ChevronLeft /></Button>
            <Input type="date" aria-label="Date" value={date} onChange={(e) => { setDate(e.target.value); setPage(1); }} className="w-40" />
            <Button size="icon" variant="secondary" aria-label="Next" onClick={() => { setDate(addDays(date, step)); setPage(1); }}><ChevronRight /></Button>
            <Button size="sm" variant="ghost" onClick={() => setDate(localDateString())}>Today</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {role !== 'DOCTOR' && (
              <Select aria-label="Doctor" className="w-48" value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setPage(1); }}>
                <option value="">All doctors</option>
                {doctors.data?.map((d) => <option key={d.id} value={d.id}>Dr {d.membership.user.lastName}</option>)}
              </Select>
            )}
            <Select aria-label="Status" className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All statuses</option>
              {['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
            </Select>
            <div className="flex rounded-xl border border-line p-0.5" role="group" aria-label="View">
              <button className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === 'list' && 'bg-brand-50 font-semibold text-brand-800')} aria-pressed={view === 'list'} onClick={() => setView('list')}><List className="size-4" />Day list</button>
              <button className={cn('flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm', view === 'week' && 'bg-brand-50 font-semibold text-brand-800')} aria-pressed={view === 'week'} onClick={() => setView('week')}><CalendarDays className="size-4" />Week</button>
            </div>
          </div>
        </div>
        {q.isLoading ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : view === 'week' ? (
          <WeekCalendar start={range.start} items={q.data?.items ?? []} />
        ) : q.data?.items.length ? (
          <>
            <p className="px-5 pt-4 text-sm font-medium text-muted">{formatDate(range.from)}</p>
            <Table caption="Appointments">
              <THead><tr><Th>Time</Th><Th>Patient</Th><Th>Service</Th><Th>Doctor</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></THead>
              <TBody>
                {q.data.items.map((a) => (
                  <Tr key={a.id}>
                    <Td className="font-semibold tabular-nums">{formatTime(a.startAt)}–{formatTime(a.endAt)}</Td>
                    <Td><Link href={`/app/patients/${a.patient.id}`} className="font-medium text-brand-800 hover:underline">{a.patient.firstName} {a.patient.lastName}</Link><p className="font-mono text-xs text-muted">{a.patient.medicalRecordNumber}</p></Td>
                    <Td>{a.service.name}{a.bookedByPatient && <p className="text-xs text-teal-700">Requested via portal</p>}</Td>
                    <Td>Dr {a.doctor.membership.user.firstName} {a.doctor.membership.user.lastName}</Td>
                    <Td><StatusBadge status={a.status} /></Td>
                    <Td className="text-right">{can(role, 'appointment:manage') && <Actions a={a} onReschedule={setResched} />}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={q.data.meta.totalPages} onPage={setPage} />
          </>
        ) : <EmptyState icon={CalendarDays} title="No appointments on this day" description="Use the arrows to move between days, or switch to week view." />}
      </Card>
      <BookAppointmentDialog open={book} onOpenChange={setBook} />
      <RescheduleDialog appt={resched} onClose={() => setResched(null)} />
    </>
  );
}

export default function AppointmentsPage() {
  return <Suspense><AppointmentsInner /></Suspense>;
}
