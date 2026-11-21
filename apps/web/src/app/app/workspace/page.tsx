'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, CalendarCheck2, ClipboardPen, FileText, ListChecks, Users } from 'lucide-react';
import { api, apiPage, errorMessage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCalendarDate, formatTime, localDateString } from '@/lib/format';
import type { Appointment, FollowUp, NoteMeta, PatientSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { PageHeader, StatCard } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';

export default function WorkspacePage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const today = localDateString();
  const from = new Date(`${today}T00:00:00+03:00`).toISOString();
  const to = new Date(new Date(from).getTime() + 86_400_000).toISOString();
  const appts = useQuery({ queryKey: ['appointments', 'today', from], queryFn: () => apiPage<Appointment>(`/appointments${qs({ from, to, pageSize: 50 })}`) });
  const patients = useQuery({ queryKey: ['patients', 'care-count'], queryFn: () => apiPage<PatientSummary>('/patients?pageSize=1') });
  const drafts = useQuery({ queryKey: ['notes', 'my-drafts'], queryFn: () => apiPage<NoteMeta>('/clinical-notes?mine=true&status=DRAFT&pageSize=5') });
  const followUps = useQuery({ queryKey: ['follow-ups', 'mine-open'], queryFn: () => apiPage<FollowUp>('/follow-ups?mine=true&status=OPEN&pageSize=5') });
  const complete = useMutation({
    mutationFn: (id: string) => api(`/appointments/${id}/complete`, { method: 'POST' }),
    onSuccess: async () => { toast.success('Marked completed'); await qc.invalidateQueries({ queryKey: ['appointments'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const now = new Date();
  return (
    <>
      <PageHeader title={`Dr ${user?.lastName ?? ''}'s workspace`} description={new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Addis_Ababa' })}
        actions={<Button asChild variant="secondary"><Link href="/app/ai"><Bot /> Documentation assistant</Link></Button>} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today's appointments" value={appts.data?.items.filter((a) => a.status !== 'CANCELLED').length} icon={CalendarCheck2} loading={appts.isLoading} />
        <StatCard label="Patients in my care" value={patients.data?.meta.total} icon={Users} tone="teal" loading={patients.isLoading} />
        <StatCard label="My draft notes" value={drafts.data?.meta.total} icon={ClipboardPen} tone="warning" loading={drafts.isLoading} />
        <StatCard label="My open follow-ups" value={followUps.data?.meta.total} icon={ListChecks} tone="success" loading={followUps.isLoading} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader title="Today's schedule" action={<Button size="sm" variant="ghost" asChild><Link href="/app/appointments">Full calendar</Link></Button>} />
          {appts.isLoading ? <LoadingRows /> : appts.isError ? <ErrorState error={appts.error} /> : appts.data?.items.length ? (
            <ul className="divide-y divide-line">
              {appts.data.items.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className="w-24 font-semibold tabular-nums">{formatTime(a.startAt)}</span>
                  <span className="min-w-0 flex-1">
                    <Link href={`/app/patients/${a.patient.id}`} className="font-medium text-brand-800 hover:underline">{a.patient.firstName} {a.patient.lastName}</Link>
                    <span className="block text-xs text-muted">{a.service.name} · {a.patient.medicalRecordNumber}</span>
                  </span>
                  <StatusBadge status={a.status} />
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" asChild><Link href={`/app/clinical/notes/new?patientId=${a.patient.id}`}><FileText /> Note</Link></Button>
                    {a.status === 'CONFIRMED' && new Date(a.startAt) <= now && <Button size="sm" variant="ghost" onClick={() => complete.mutate(a.id)}>Complete</Button>}
                  </span>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CalendarCheck2} title="No appointments today" />}
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Drafts awaiting signature" />
            {drafts.data?.items.length ? <ul className="divide-y divide-line">{drafts.data.items.map((n) => (
              <li key={n.id}><Link href={`/app/clinical/notes/${n.id}`} className="block px-5 py-3 hover:bg-brand-50/40"><p className="text-sm font-semibold text-brand-800">{n.title}</p><p className="text-xs text-muted">{n.patient.firstName} {n.patient.lastName}{n.source === 'AI_ASSISTED' ? ' · AI-assisted' : ''}</p></Link></li>
            ))}</ul> : <p className="px-5 py-6 text-sm text-muted">No drafts — you&apos;re up to date.</p>}
          </Card>
          <Card>
            <CardHeader title="My follow-ups" action={<Button size="sm" variant="ghost" asChild><Link href="/app/follow-ups">All</Link></Button>} />
            {followUps.data?.items.length ? <ul className="divide-y divide-line">{followUps.data.items.map((f) => (
              <li key={f.id} className="px-5 py-3"><p className="text-sm font-semibold">{f.title}</p><p className="text-xs text-muted">{f.patient.firstName} {f.patient.lastName} · due {formatCalendarDate(f.dueDate)}{f.dueDate.slice(0, 10) < today ? ' · overdue' : ''}</p></li>
            ))}</ul> : <p className="px-5 py-6 text-sm text-muted">No open follow-ups.</p>}
          </Card>
        </div>
      </div>
    </>
  );
}
