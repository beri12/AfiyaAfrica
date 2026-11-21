'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { AppointmentSlot } from '@afyalink/shared';
import { api, apiPage, errorMessage, qs } from '@/lib/api';
import { formatTime, fullName, localDateString } from '@/lib/format';
import type { ClinicService, Doctor, PatientSummary } from '@/lib/types';
import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { Alert, Spinner } from '@/components/ui/states';

export function PatientPicker({ value, onChange }: { value: PatientSummary | null; onChange: (p: PatientSummary | null) => void }) {
  const [q, setQ] = useState('');
  const search = useDebounced(q, 250);
  const res = useQuery({ queryKey: ['patients', 'picker', search], queryFn: () => apiPage<PatientSummary>(`/patients${qs({ q: search, pageSize: 6 })}`), enabled: !value && search.length >= 2 });
  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm">
        <span><strong>{fullName(value)}</strong> <span className="text-muted">· {value.medicalRecordNumber}</span></span>
        <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => onChange(null)}>Change</button>
      </div>
    );
  }
  return (
    <div>
      <Input placeholder="Type at least 2 characters of name, phone or MRN" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search patient" />
      {search.length >= 2 && (
        <ul className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-line" role="listbox" aria-label="Matching patients">
          {res.isLoading && <li className="px-3 py-2 text-sm text-muted">Searching…</li>}
          {res.data?.items.length === 0 && <li className="px-3 py-2 text-sm text-muted">No patients found</li>}
          {res.data?.items.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-brand-50" onClick={() => onChange(p)}>
                {fullName(p)} <span className="text-muted">· {p.medicalRecordNumber} · {p.phone ?? 'no phone'}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function BookAppointmentDialog({ open, onOpenChange, patient: initialPatient }: { open: boolean; onOpenChange: (o: boolean) => void; patient?: PatientSummary | null }) {
  const qc = useQueryClient();
  const [patient, setPatient] = useState<PatientSummary | null>(initialPatient ?? null);
  const [serviceId, setServiceId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [date, setDate] = useState(localDateString());
  const [slot, setSlot] = useState<AppointmentSlot | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setPatient(initialPatient ?? null);
      setSlot(null);
    }
  }, [open, initialPatient]);

  const services = useQuery({ queryKey: ['services'], queryFn: () => api<ClinicService[]>('/services'), enabled: open });
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => api<Doctor[]>('/doctors'), enabled: open });
  const slots = useQuery({
    queryKey: ['slots', doctorId, date, serviceId],
    queryFn: () => api<AppointmentSlot[]>(`/doctors/${doctorId}/slots${qs({ date, serviceId })}`),
    enabled: open && !!doctorId && !!serviceId && !!date,
  });

  const book = useMutation({
    mutationFn: () => api('/appointments', { method: 'POST', body: { patientId: patient!.id, doctorId, serviceId, startAt: slot!.startAt, reason: reason || undefined } }),
    onSuccess: async () => {
      toast.success('Appointment booked and confirmed');
      await qc.invalidateQueries({ queryKey: ['appointments'] });
      await qc.invalidateQueries({ queryKey: ['slots'] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New appointment" description="Times are shown in clinic time (Addis Ababa)." size="lg"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!patient || !slot} loading={book.isPending} onClick={() => book.mutate()}>Book appointment</Button></>}>
      <div className="space-y-5">
        <Field label="Patient" required><div><PatientPicker value={patient} onChange={setPatient} /></div></Field>
        <FormGrid>
          <Field label="Service" required>
            <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setSlot(null); }}>
              <option value="">Select service…</option>
              {services.data?.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.durationMinutes} min)</option>)}
            </Select>
          </Field>
          <Field label="Doctor" required>
            <Select value={doctorId} onChange={(e) => { setDoctorId(e.target.value); setSlot(null); }}>
              <option value="">Select doctor…</option>
              {doctors.data?.map((d) => <option key={d.id} value={d.id}>Dr {d.membership.user.firstName} {d.membership.user.lastName}{d.specialty ? ` · ${d.specialty}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Date" required><Input type="date" min={localDateString()} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); }} /></Field>
          <Field label="Reason (administrative)" hint="Avoid clinical details"><Input maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
        </FormGrid>
        <div>
          <p className="mb-2 text-sm font-medium">Available times</p>
          {!doctorId || !serviceId ? <p className="text-sm text-muted">Choose a service and doctor to see availability.</p>
            : slots.isLoading ? <Spinner label="Checking availability" />
            : slots.isError ? <Alert tone="danger">{errorMessage(slots.error)}</Alert>
            : slots.data?.length ? (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="radiogroup" aria-label="Available times">
                {slots.data.map((s) => (
                  <button key={s.startAt} type="button" role="radio" aria-checked={slot?.startAt === s.startAt} onClick={() => setSlot(s)}
                    className={cn('rounded-lg border px-2 py-2 text-sm font-medium tabular-nums transition-colors', slot?.startAt === s.startAt ? 'border-brand-700 bg-brand-700 text-white' : 'border-line hover:border-brand-300 hover:bg-brand-50')}>
                    {formatTime(s.startAt)}
                  </button>
                ))}
              </div>
            ) : <p className="text-sm text-muted">No free times on this date. Try another day or doctor.</p>}
        </div>
      </div>
    </Dialog>
  );
}
