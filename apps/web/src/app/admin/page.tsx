'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Activity, Building2, CalendarCheck2, Clock, LifeBuoy, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader, StatCard } from '@/components/ui/page-header';
import { ErrorState } from '@/components/ui/states';

interface Overview { clinics: number; pendingClinics: number; users: number; patients: number; appointmentsLast30Days: number; openTickets: number }

export default function AdminHome() {
  const q = useQuery({ queryKey: ['platform', 'overview'], queryFn: () => api<Overview>('/platform/overview', { clinic: null }) });
  const health = useQuery({ queryKey: ['health'], queryFn: () => api<{ status: string; checks: Record<string, string> }>('/health/ready', { clinic: null }), refetchInterval: 30_000, retry: false });
  const d = q.data;
  if (q.isError) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  return (
    <>
      <PageHeader title="Platform overview" actions={d?.pendingClinics ? <Button asChild><Link href="/admin/clinics">{d.pendingClinics} awaiting approval</Link></Button> : undefined} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Clinics" value={d?.clinics} icon={Building2} loading={q.isLoading} />
        <StatCard label="Pending approval" value={d?.pendingClinics} icon={Clock} tone="warning" loading={q.isLoading} />
        <StatCard label="Users" value={d?.users} icon={Users} loading={q.isLoading} />
        <StatCard label="Patients (all clinics)" value={d?.patients} icon={Users} tone="teal" loading={q.isLoading} hint="Count only — no patient data is visible to platform admins" />
        <StatCard label="Appointments (30 days)" value={d?.appointmentsLast30Days} icon={CalendarCheck2} tone="success" loading={q.isLoading} />
        <StatCard label="Open support tickets" value={d?.openTickets} icon={LifeBuoy} tone="warning" loading={q.isLoading} />
      </div>
      <Card className="mt-6">
        <CardHeader title="System health" action={<Activity className="size-4 text-muted" />} />
        <CardBody className="flex flex-wrap gap-6 text-sm">
          {health.data ? Object.entries(health.data.checks).map(([k, v]) => (
            <span key={k} className="flex items-center gap-2"><span className={`size-2.5 rounded-full ${v === 'up' ? 'bg-green-500' : 'bg-red-500'}`} />{k}: {v}</span>
          )) : <span className="text-muted">{health.isError ? 'Health check failed' : 'Checking…'}</span>}
        </CardBody>
      </Card>
    </>
  );
}
