'use client';

import Link from 'next/link';
import { CalendarPlus, FileHeart, Phone, Siren } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Alert, EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { usePortalAppointments, useProfiles } from './use-profiles';

export default function PortalHome() {
  const { user } = useAuth();
  const profiles = useProfiles();
  const appts = usePortalAppointments();
  const upcoming = (appts.data ?? []).filter((a) => ['PENDING', 'CONFIRMED'].includes(a.status) && new Date(a.endAt) > new Date()).reverse();
  return (
    <>
      <div className="mb-8 rounded-3xl bg-gradient-to-br from-brand-800 to-brand-950 p-7 text-white">
        <h1 className="text-2xl font-bold">Hello, {user?.firstName}</h1>
        <p className="mt-1 text-white/75">Manage your appointments and see what your clinic has shared with you.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="inverse" asChild><Link href="/portal/appointments?new=1"><CalendarPlus /> Request appointment</Link></Button>
          <Button variant="outlineLight" asChild><Link href="/portal/records"><FileHeart /> My records</Link></Button>
        </div>
      </div>
      <Alert tone="danger" className="mb-6" title="In an emergency">
        <span className="flex items-center gap-2"><Siren className="size-4" /> Go to the nearest hospital emergency department or call an ambulance (Ethiopia: 907). Do not use this portal for urgent medical needs.</span>
      </Alert>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader title="Upcoming appointments" />
          {appts.isLoading ? <LoadingRows /> : appts.isError ? <ErrorState error={appts.error} /> : upcoming.length ? (
            <ul className="divide-y divide-line">{upcoming.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-5 py-4">
                <div><p className="font-semibold">{formatDateTime(a.startAt, a.clinic.timezone)}</p><p className="text-sm text-muted">{a.service.name} · Dr {a.doctor.membership.user.lastName} · {a.clinic.name}</p></div>
                <StatusBadge status={a.status} />
              </li>
            ))}</ul>
          ) : <EmptyState title="No upcoming appointments" action={<Button asChild><Link href="/portal/appointments?new=1">Request one</Link></Button>} />}
        </Card>
        <Card>
          <CardHeader title="My clinics" />
          <CardBody className="space-y-4">
            {profiles.data?.map((p) => (
              <div key={p.id} className="rounded-xl border border-line p-4">
                <p className="font-semibold">{p.clinic.name}</p>
                <p className="text-sm text-muted">{p.clinic.city} · MRN {p.medicalRecordNumber}</p>
                <a href={`tel:${p.clinic.phone}`} className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700"><Phone className="size-3.5" /> {p.clinic.phone}</a>
              </div>
            ))}
            {profiles.data?.length === 0 && <p className="text-sm text-muted">No linked clinics yet.</p>}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
