'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck2, CalendarX2, Percent, UserX } from 'lucide-react';
import type { AppointmentAnalytics } from '@afyalink/shared';
import { api, qs } from '@/lib/api';
import { localDateString } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PageHeader, StatCard } from '@/components/ui/page-header';
import { Alert, ErrorState, LoadingRows } from '@/components/ui/states';
import { BarsChart, TrendChart } from '@/components/app/charts';

const minusDays = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return localDateString(d); };

export default function AnalyticsPage() {
  const [from, setFrom] = useState(minusDays(29));
  const [to, setTo] = useState(localDateString());
  const range = qs({ from, to });
  const appts = useQuery({ queryKey: ['analytics', 'appts', from, to], queryFn: () => api<AppointmentAnalytics>(`/analytics/appointments${range}`) });
  const patients = useQuery({ queryKey: ['analytics', 'patients', from, to], queryFn: () => api<{ series: { date: string; registrations: number }[]; total: number }>(`/analytics/patients${range}`) });
  const services = useQuery({ queryKey: ['analytics', 'services', from, to], queryFn: () => api<{ services: { name: string; total: number; completed: number }[] }>(`/analytics/services${range}`) });
  const activity = useQuery({ queryKey: ['analytics', 'activity', from, to], queryFn: () => api<{ actions: { action: string; count: number }[] }>(`/analytics/activity${range}`) });
  const t = appts.data?.totals;
  return (
    <>
      <PageHeader title="Analytics" description="Operational analytics from live clinic data."
        actions={<div className="flex items-center gap-2"><Input type="date" aria-label="From" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-40" /><span className="text-muted">to</span><Input type="date" aria-label="To" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>} />
      <Alert tone="info" className="mb-6">These are operational measures (volumes and attendance). They do not measure clinical quality or health outcomes.</Alert>
      {appts.isError ? <Card><ErrorState error={appts.error} onRetry={() => appts.refetch()} /></Card> : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Appointments" value={t?.total} icon={CalendarCheck2} loading={appts.isLoading} hint={t ? `${t.pending} pending · ${t.confirmed} confirmed` : undefined} />
            <StatCard label="Completion rate" value={appts.data && `${appts.data.completionRate}%`} icon={Percent} tone="success" loading={appts.isLoading} hint="Completed ÷ (completed + no-show)" />
            <StatCard label="Cancellation rate" value={appts.data && `${appts.data.cancellationRate}%`} icon={CalendarX2} tone="warning" loading={appts.isLoading} hint="Cancelled ÷ all booked" />
            <StatCard label="No-show rate" value={appts.data && `${appts.data.noShowRate}%`} icon={UserX} tone="warning" loading={appts.isLoading} hint="No-show ÷ (completed + no-show)" />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Card><CardHeader title="Appointment volume" description="By day and outcome" /><CardBody>{appts.isLoading ? <LoadingRows rows={4} /> : <BarsChart data={(appts.data?.byDay ?? []) as never} xKey="date" series={[{ key: 'completed', label: 'Completed', color: '#1e9e95' }, { key: 'cancelled', label: 'Cancelled', color: '#94a3b8' }, { key: 'noShow', label: 'No-show', color: '#c62828' }]} />}</CardBody></Card>
            <Card><CardHeader title="Patient registrations" description={patients.data ? `${patients.data.total} new patients in range` : undefined} /><CardBody>{patients.isLoading ? <LoadingRows rows={4} /> : <TrendChart data={(patients.data?.series ?? []) as never} series={[{ key: 'registrations', label: 'Registrations', color: '#1f56a3' }]} />}</CardBody></Card>
            <Card><CardHeader title="Service utilisation" /><CardBody>{services.isLoading ? <LoadingRows rows={4} /> : <BarsChart horizontal data={(services.data?.services ?? []) as never} xKey="name" series={[{ key: 'total', label: 'Booked', color: '#1f56a3' }, { key: 'completed', label: 'Completed', color: '#1e9e95' }]} />}</CardBody></Card>
            <Card><CardHeader title="Operational activity" description="Most frequent recorded actions" /><CardBody>{activity.isLoading ? <LoadingRows rows={4} /> : <BarsChart horizontal data={(activity.data?.actions.slice(0, 8) ?? []) as never} xKey="action" series={[{ key: 'count', label: 'Events', color: '#2f6dbf' }]} />}</CardBody></Card>
          </div>
        </>
      )}
    </>
  );
}
