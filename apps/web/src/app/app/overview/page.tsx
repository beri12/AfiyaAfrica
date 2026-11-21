'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, CalendarCheck2, CalendarClock, CheckCircle2, ListChecks, Stethoscope, UserPlus, Users } from 'lucide-react';
import type { OverviewMetrics } from '@afyalink/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader, StatCard } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { TrendChart } from '@/components/app/charts';

export default function OverviewPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ['analytics', 'overview'], queryFn: () => api<OverviewMetrics>('/analytics/overview') });
  const m = q.data;
  const loading = q.isLoading;

  return (
    <>
      <PageHeader
        title={`Good day, ${user?.firstName ?? ''}`}
        description="Live operational overview of your clinic."
        actions={
          <>
            <Button asChild variant="secondary"><Link href="/app/patients/new"><UserPlus /> Register patient</Link></Button>
            <Button asChild><Link href="/app/appointments?new=1"><CalendarClock /> New appointment</Link></Button>
          </>
        }
      />
      {q.isError ? (
        <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Registered patients" value={m?.totalPatients.toLocaleString()} hint={m ? `${m.newPatientsThisMonth} new this month` : undefined} icon={Users} loading={loading} />
            <StatCard label="Today's appointments" value={m?.todaysAppointments} icon={CalendarCheck2} tone="teal" loading={loading} />
            <StatCard label="Completed today" value={m?.completedToday} icon={CheckCircle2} tone="success" loading={loading} />
            <StatCard label="Pending requests" value={m?.pendingAppointments} hint="Awaiting confirmation" icon={CalendarClock} tone="warning" loading={loading} />
            <StatCard label="Active doctors" value={m?.activeDoctors} icon={Stethoscope} loading={loading} />
            <StatCard label="Open follow-ups" value={m?.openFollowUps} hint={m ? `${m.overdueFollowUps} overdue` : undefined} icon={ListChecks} tone={m?.overdueFollowUps ? 'warning' : 'teal'} loading={loading} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
            <Card>
              <CardHeader title="Appointment trend" description="Last 14 days · all statuses vs completed" />
              <CardBody>
                {loading ? <LoadingRows rows={4} /> : (
                  <TrendChart data={(m?.appointmentTrend ?? []) as never} series={[{ key: 'total', label: 'Booked', color: '#1f56a3' }, { key: 'completed', label: 'Completed', color: '#1e9e95' }]} />
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Recent activity" description="From the clinic audit log" action={<Activity className="size-4 text-muted" />} />
              {loading ? <LoadingRows rows={5} /> : m?.recentActivity.length ? (
                <ul className="divide-y divide-line">
                  {m.recentActivity.map((a) => (
                    <li key={a.id} className="px-5 py-3">
                      <p className="text-sm font-medium text-ink">{humanize(a.action.replace('.', ' '))}</p>
                      <p className="text-xs text-muted">{a.actorName} · {formatDateTime(a.createdAt)}</p>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No activity yet" description="Actions taken by your team will appear here." />}
            </Card>
          </div>
          <p className="mt-6 text-xs text-muted">Operational metrics only — these figures do not measure clinical outcomes.</p>
        </>
      )}
    </>
  );
}
