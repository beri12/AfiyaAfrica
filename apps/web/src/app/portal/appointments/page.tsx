'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus } from 'lucide-react';
import type { AppointmentSlot } from '@afyalink/shared';
import { api, errorMessage, qs } from '@/lib/api';
import { formatDateTime, formatTime, localDateString } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows, Spinner } from '@/components/ui/states';
import { usePortalAppointments, useProfiles } from '../use-profiles';

interface Options { services: { id: string; name: string; durationMinutes: number }[]; doctors: { id: string; specialty: string | null; membership: { user: { firstName: string; lastName: string } } }[] }

function RequestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const profiles = useProfiles();
  const [clinicId, setClinicId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(localDateString());
  const [slot, setSlot] = useState<string | null>(null);
  useEffect(() => { if (!clinicId && profiles.data?.[0]) setClinicId(profiles.data[0].clinicId); }, [profiles.data, clinicId]);
  const options = useQuery({ queryKey: ['portal', 'options', clinicId], queryFn: () => api<Options>(`/me/clinics/${clinicId}/booking-options`, { clinic: null }), enabled: open && !!clinicId });
  const slots = useQuery({
    queryKey: ['portal', 'slots', clinicId, doctorId, date, serviceId],
    queryFn: () => api<AppointmentSlot[]>(`/me/clinics/${clinicId}/doctors/${doctorId}/slots${qs({ date, serviceId })}`, { clinic: null }),
    enabled: open && !!doctorId && !!serviceId,
  });
  const m = useMutation({
    mutationFn: () => api('/me/appointments', { method: 'POST', body: { clinicId, doctorId, serviceId, startAt: slot }, clinic: null }),
    onSuccess: async () => { toast.success('Request sent. The clinic will confirm it.'); await qc.invalidateQueries({ queryKey: ['portal'] }); onOpenChange(false); setSlot(null); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} size="lg" title="Request an appointment" description="Your clinic reviews and confirms each request."
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!slot} loading={m.isPending} onClick={() => m.mutate()}>Send request</Button></>}>
      <div className="space-y-4">
        <FormGrid>
          {(profiles.data?.length ?? 0) > 1 && (
            <Field label="Clinic"><Select value={clinicId} onChange={(e) => { setClinicId(e.target.value); setSlot(null); setServiceId(''); setDoctorId(''); }}>{profiles.data?.map((p) => <option key={p.clinicId} value={p.clinicId}>{p.clinic.name}</option>)}</Select></Field>
          )}
          <Field label="Service"><Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlot(null); }}><option value="">Select…</option>{options.data?.services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Doctor"><Select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlot(null); }}><option value="">Select…</option>{options.data?.doctors.map((d) => <option key={d.id} value={d.id}>Dr {d.membership.user.firstName} {d.membership.user.lastName}{d.specialty ? ` · ${d.specialty}` : ''}</option>)}</Select></Field>
          <Field label="Date"><Input type="date" min={localDateString()} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} /></Field>
        </FormGrid>
        {doctorId && serviceId && (slots.isLoading ? <Spinner /> : slots.data?.length ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Available times">
            {slots.data.map((s) => <button key={s.startAt} type="button" role="radio" aria-checked={slot === s.startAt} onClick={() => setSlot(s.startAt)} className={cn('rounded-lg border py-2 text-sm tabular-nums', slot === s.startAt ? 'border-brand-700 bg-brand-700 text-white' : 'border-line hover:bg-brand-50')}>{formatTime(s.startAt)}</button>)}
          </div>
        ) : <p className="text-sm text-muted">No free times on this date.</p>)}
      </div>
    </Dialog>
  );
}

function Inner() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (params.get('new')) setOpen(true); }, [params]);
  const appts = usePortalAppointments();
  const cancel = useMutation({
    mutationFn: (id: string) => api(`/me/appointments/${id}/cancel`, { method: 'POST', body: {}, clinic: null }),
    onSuccess: async () => { toast.success('Appointment cancelled'); await qc.invalidateQueries({ queryKey: ['portal'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="My appointments" actions={<Button onClick={() => setOpen(true)}><CalendarPlus /> Request appointment</Button>} />
      <Card>
        <CardHeader title="All appointments" />
        {appts.isLoading ? <LoadingRows /> : appts.isError ? <ErrorState error={appts.error} /> : appts.data?.length ? (
          <ul className="divide-y divide-line">{appts.data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
              <div><p className="font-semibold">{formatDateTime(a.startAt, a.clinic.timezone)}</p><p className="text-sm text-muted">{a.service.name} · Dr {a.doctor.membership.user.lastName} · {a.clinic.name}</p></div>
              <div className="flex items-center gap-2"><StatusBadge status={a.status} />{['PENDING', 'CONFIRMED'].includes(a.status) && new Date(a.startAt) > new Date() && <Button size="sm" variant="ghost" onClick={() => confirm('Cancel this appointment?') && cancel.mutate(a.id)}>Cancel</Button>}</div>
            </li>
          ))}</ul>
        ) : <EmptyState title="No appointments yet" />}
      </Card>
      <RequestDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export default function PortalAppointments() {
  return <Suspense><Inner /></Suspense>;
}
