'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, Copy, FilePlus2, Mail, Pencil, Phone, ShieldCheck, Stethoscope, UserMinus } from 'lucide-react';
import { CONSENT_TYPES, PATIENT_STATUSES, updatePatientRecordSchema, updatePatientSchema } from '@afyalink/shared';
import { api, apiPage, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useZodForm } from '@/lib/form';
import { can } from '@/lib/nav';
import { ageFrom, formatCalendarDate, formatDateTime, fullName, humanize } from '@/lib/format';
import type { Appointment, Doctor, NoteMeta, PatientDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Tabs } from '@/components/ui/tabs';
import { Alert, EmptyState, ErrorState, LoadingRows, Spinner } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { BookAppointmentDialog } from '@/components/app/book-appointment';

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-1 text-sm text-ink">{value || '—'}</dd>
    </div>
  );
}

function EditPatientDialog({ patient, open, onOpenChange }: { patient: PatientDetail; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useZodForm(updatePatientSchema, {
    values: {
      firstName: patient.firstName, middleName: patient.middleName ?? undefined, lastName: patient.lastName,
      phone: patient.phone ?? undefined, email: patient.email ?? undefined, city: patient.city ?? undefined,
      subCity: patient.subCity ?? undefined, emergencyContactName: patient.emergencyContactName ?? undefined,
      emergencyContactPhone: patient.emergencyContactPhone ?? undefined, status: patient.status as never,
    },
  });
  const submit = handleSubmit(async (v) => {
    try {
      await api(`/patients/${patient.id}`, { method: 'PATCH', body: v });
      toast.success('Patient updated');
      await qc.invalidateQueries({ queryKey: ['patient', patient.id] });
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });
  const opt = { setValueAs: (v: string) => v || undefined };
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Edit patient" size="lg"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={isSubmitting} onClick={submit}>Save changes</Button></>}>
      <FormGrid>
        <Field label="First name" error={errors.firstName?.message}><Input {...register('firstName')} /></Field>
        <Field label="Last name" error={errors.lastName?.message}><Input {...register('lastName')} /></Field>
        <Field label="Phone" error={errors.phone?.message}><Input {...register('phone', opt)} /></Field>
        <Field label="Email" error={errors.email?.message}><Input {...register('email', opt)} /></Field>
        <Field label="City" error={errors.city?.message}><Input {...register('city')} /></Field>
        <Field label="Sub-city" error={errors.subCity?.message}><Input {...register('subCity')} /></Field>
        <Field label="Emergency contact" error={errors.emergencyContactName?.message}><Input {...register('emergencyContactName')} /></Field>
        <Field label="Emergency phone" error={errors.emergencyContactPhone?.message}><Input {...register('emergencyContactPhone', opt)} /></Field>
        <Field label="Status" error={errors.status?.message}><Select {...register('status')}>{PATIENT_STATUSES.map((s) => <option key={s} value={s}>{humanize(s)}</option>)}</Select></Field>
      </FormGrid>
    </Dialog>
  );
}

function AppointmentsTab({ patient }: { patient: PatientDetail }) {
  const q = useQuery({ queryKey: ['appointments', 'patient', patient.id], queryFn: () => apiPage<Appointment>(`/appointments?patientId=${patient.id}&pageSize=50`) });
  if (q.isLoading) return <LoadingRows />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState title="No appointments yet" />;
  return (
    <Table caption="Appointment history">
      <THead><tr><Th>Date & time</Th><Th>Service</Th><Th>Doctor</Th><Th>Status</Th></tr></THead>
      <TBody>
        {[...q.data.items].reverse().map((a) => (
          <Tr key={a.id}><Td>{formatDateTime(a.startAt)}</Td><Td>{a.service.name}</Td><Td>Dr {a.doctor.membership.user.lastName}</Td><Td><StatusBadge status={a.status} /></Td></Tr>
        ))}
      </TBody>
    </Table>
  );
}

function ConsentTab({ patient }: { patient: PatientDetail }) {
  const qc = useQueryClient();
  const history = useQuery({ queryKey: ['consents', patient.id], queryFn: () => api<{ id: string; type: string; granted: boolean; method: string; createdAt: string; recordedBy: { firstName: string; lastName: string } | null }[]>(`/patients/${patient.id}/consents`) });
  const record = useMutation({
    mutationFn: (b: { type: string; granted: boolean }) => api(`/patients/${patient.id}/consents`, { method: 'POST', body: { ...b, method: 'IN_PERSON_VERBAL' } }),
    onSuccess: async () => { toast.success('Consent recorded'); await qc.invalidateQueries({ queryKey: ['consents', patient.id] }); await qc.invalidateQueries({ queryKey: ['patient', patient.id] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const current = new Map(patient.consents.map((c) => [c.type, c.granted]));
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {CONSENT_TYPES.map((t) => {
          const granted = current.get(t);
          return (
            <div key={t} className="flex items-center justify-between rounded-xl border border-line p-4">
              <div>
                <p className="text-sm font-semibold">{humanize(t)}</p>
                <p className="mt-0.5 text-xs">{granted === undefined ? <span className="text-muted">Not recorded</span> : granted ? <span className="text-success">Granted</span> : <span className="text-danger">Withdrawn / declined</span>}</p>
              </div>
              <Button size="sm" variant="secondary" loading={record.isPending && record.variables?.type === t} onClick={() => {
                if (t === 'DATA_PROCESSING' && granted && !confirm('Withdrawing data-processing consent will mark the patient inactive. Continue?')) return;
                record.mutate({ type: t, granted: !granted });
              }}>{granted ? 'Record withdrawal' : 'Record consent'}</Button>
            </div>
          );
        })}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Consent history</h3>
        {history.data?.length ? (
          <Table caption="Consent history">
            <THead><tr><Th>When</Th><Th>Consent</Th><Th>Decision</Th><Th>Method</Th><Th>Recorded by</Th></tr></THead>
            <TBody>{history.data.map((c) => (
              <Tr key={c.id}><Td>{formatDateTime(c.createdAt)}</Td><Td>{humanize(c.type)}</Td><Td>{c.granted ? 'Granted' : 'Withdrawn'}</Td><Td>{humanize(c.method)}</Td><Td>{c.recordedBy ? `${c.recordedBy.firstName} ${c.recordedBy.lastName}` : '—'}</Td></Tr>
            ))}</TBody>
          </Table>
        ) : history.isLoading ? <LoadingRows rows={2} /> : <p className="text-sm text-muted">No history.</p>}
      </div>
    </div>
  );
}

function CareTeamTab({ patient }: { patient: PatientDetail }) {
  const { role } = useAuth();
  const qc = useQueryClient();
  const [doctorId, setDoctorId] = useState('');
  const doctors = useQuery({ queryKey: ['doctors'], queryFn: () => api<Doctor[]>('/doctors') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['patient', patient.id] });
  const assign = useMutation({ mutationFn: () => api(`/patients/${patient.id}/care-team`, { method: 'POST', body: { doctorId } }), onSuccess: () => { toast.success('Doctor assigned'); setDoctorId(''); return refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const end = useMutation({ mutationFn: (id: string) => api(`/patients/${patient.id}/care-team/${id}`, { method: 'DELETE' }), onSuccess: () => { toast.success('Care assignment ended'); return refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  const manage = can(role, 'appointment:manage') && can(role, 'patient:update') && role !== 'DOCTOR';
  return (
    <div className="space-y-5">
      <Alert tone="info">Only doctors on the care team can view this patient&apos;s clinical records. Booking an appointment adds the doctor automatically.</Alert>
      {patient.careAssignments.length ? (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {patient.careAssignments.map((c) => (
            <li key={c.id} className="flex items-center justify-between px-4 py-3">
              <span className="flex items-center gap-3 text-sm"><Stethoscope className="size-4 text-teal-600" aria-hidden />Dr {c.doctor.membership.user.firstName} {c.doctor.membership.user.lastName}<span className="text-muted">{c.doctor.specialty}</span></span>
              {manage && <Button size="sm" variant="ghost" onClick={() => end.mutate(c.doctor.id)}><UserMinus /> End</Button>}
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No doctors assigned.</p>}
      {manage && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select aria-label="Doctor to assign" value={doctorId} onChange={(e) => setDoctorId(e.target.value)} className="sm:max-w-xs">
            <option value="">Select a doctor…</option>
            {doctors.data?.map((d) => <option key={d.id} value={d.id}>Dr {d.membership.user.firstName} {d.membership.user.lastName}</option>)}
          </Select>
          <Button disabled={!doctorId} loading={assign.isPending} onClick={() => assign.mutate()}>Assign to care team</Button>
        </div>
      )}
    </div>
  );
}

function ClinicalTab({ patient }: { patient: PatientDetail }) {
  const qc = useQueryClient();
  const record = useQuery({ queryKey: ['record', patient.id], queryFn: () => api<{ allergies: string | null; chronicConditions: string | null; currentMedications: string | null; bloodGroup: string | null; updatedAt: string | null }>(`/patients/${patient.id}/record`) });
  const notes = useQuery({ queryKey: ['notes', 'patient', patient.id], queryFn: () => apiPage<NoteMeta>(`/clinical-notes?patientId=${patient.id}&pageSize=50`) });
  const [editing, setEditing] = useState(false);
  const form = useZodForm(updatePatientRecordSchema, { values: { allergies: record.data?.allergies ?? undefined, chronicConditions: record.data?.chronicConditions ?? undefined, currentMedications: record.data?.currentMedications ?? undefined, bloodGroup: (record.data?.bloodGroup ?? undefined) as never } });
  const save = form.handleSubmit(async (v) => {
    try {
      await api(`/patients/${patient.id}/record`, { method: 'PUT', body: v });
      toast.success('Clinical summary saved');
      setEditing(false);
      await qc.invalidateQueries({ queryKey: ['record', patient.id] });
    } catch (e) { toast.error(errorMessage(e)); }
  });
  if (record.isError) return <ErrorState error={record.error} />;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Clinical summary" description="Encrypted · visible to the care team only" action={<Button size="sm" variant="secondary" onClick={() => setEditing((e) => !e)}><Pencil /> {editing ? 'Cancel' : 'Edit'}</Button>} />
        <CardBody>
          {record.isLoading ? <Spinner /> : editing ? (
            <form className="space-y-4" onSubmit={save}>
              <Field label="Allergies"><Textarea rows={2} {...form.register('allergies')} /></Field>
              <Field label="Chronic conditions"><Textarea rows={2} {...form.register('chronicConditions')} /></Field>
              <Field label="Current medications"><Textarea rows={2} {...form.register('currentMedications')} /></Field>
              <Field label="Blood group"><Select {...form.register('bloodGroup')}>{['UNKNOWN', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</Select></Field>
              <Button type="submit" loading={form.formState.isSubmitting}>Save summary</Button>
            </form>
          ) : (
            <dl className="grid gap-4">
              <Info label="Allergies" value={record.data?.allergies} />
              <Info label="Chronic conditions" value={record.data?.chronicConditions} />
              <Info label="Current medications" value={record.data?.currentMedications} />
              <Info label="Blood group" value={record.data?.bloodGroup} />
            </dl>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Clinical notes" action={<Button size="sm" asChild><Link href={`/app/clinical/notes/new?patientId=${patient.id}`}><FilePlus2 /> New note</Link></Button>} />
        {notes.isLoading ? <LoadingRows rows={3} /> : notes.data?.items.length ? (
          <ul className="divide-y divide-line">
            {notes.data.items.map((n) => (
              <li key={n.id}>
                <Link href={`/app/clinical/notes/${n.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-brand-50/40">
                  <span><span className="block text-sm font-semibold text-brand-800">{n.title}</span><span className="text-xs text-muted">{formatDateTime(n.updatedAt)} · v{n.currentVersion}</span></span>
                  <span className="flex gap-1.5">{n.source === 'AI_ASSISTED' && <Badge tone="ai">AI-assisted</Badge>}<StatusBadge status={n.status} /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <EmptyState title="No notes yet" />}
      </Card>
    </div>
  );
}

function AccessLogTab({ patientId }: { patientId: string }) {
  const q = useQuery({ queryKey: ['access-log', patientId], queryFn: () => api<{ id: string; action: string; entityType: string; createdAt: string; ipAddress: string | null; actor: { firstName: string; lastName: string } | null }[]>(`/patients/${patientId}/access-log`) });
  if (q.isLoading) return <LoadingRows />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <Table caption="Record access history">
      <THead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>IP address</Th></tr></THead>
      <TBody>{q.data?.map((l) => (
        <Tr key={l.id}><Td>{formatDateTime(l.createdAt)}</Td><Td>{l.actor ? `${l.actor.firstName} ${l.actor.lastName}` : 'System'}</Td><Td>{humanize(l.action.replace('.', ' '))}</Td><Td className="font-mono text-xs">{l.ipAddress ?? '—'}</Td></Tr>
      ))}</TBody>
    </Table>
  );
}

export default function PatientPage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useAuth();
  const [edit, setEdit] = useState(false);
  const [book, setBook] = useState(false);
  const [invite, setInvite] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['patient', id], queryFn: () => api<PatientDetail>(`/patients/${id}`) });
  const inviteM = useMutation({
    mutationFn: () => api<{ activationUrl?: string; alreadyActive: boolean }>(`/patients/${id}/invite`, { method: 'POST' }),
    onSuccess: (r) => (r.activationUrl ? setInvite(r.activationUrl) : toast.success('Patient already has an active portal account')),
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (q.isLoading) return <Spinner label="Loading patient" />;
  if (q.isError || !q.data) return <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card>;
  const p = q.data;

  const tabs = [
    { value: 'appointments', label: 'Appointments', content: <AppointmentsTab patient={p} /> },
    ...(can(role, 'clinical:read') ? [{ value: 'clinical', label: 'Clinical', content: <ClinicalTab patient={p} /> }] : []),
    ...(can(role, 'consent:manage') ? [{ value: 'consent', label: 'Consent', content: <ConsentTab patient={p} /> }] : []),
    { value: 'care', label: 'Care team', content: <CareTeamTab patient={p} /> },
    ...(can(role, 'audit:read') ? [{ value: 'access', label: 'Access history', content: <AccessLogTab patientId={p.id} /> }] : []),
  ];

  return (
    <>
      <Card className="mb-6 overflow-hidden">
        <div className="bg-gradient-to-r from-brand-900 to-brand-700 px-6 py-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-mono text-xs text-white/60">{p.medicalRecordNumber}</p>
              <h1 className="mt-1 text-2xl font-bold">{fullName(p)}</h1>
              <p className="mt-1 text-sm text-white/75">{ageFrom(p.dateOfBirth)} years · {humanize(p.sex)} · Born {formatCalendarDate(p.dateOfBirth)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {can(role, 'appointment:create') && <Button variant="inverse" onClick={() => setBook(true)}><CalendarPlus /> Book</Button>}
              {can(role, 'patient:update') && <Button variant="outlineLight" onClick={() => setEdit(true)}><Pencil /> Edit</Button>}
              {can(role, 'patient:invite') && !p.hasPortalAccount && <Button variant="outlineLight" loading={inviteM.isPending} onClick={() => inviteM.mutate()}><Mail /> Invite to portal</Button>}
            </div>
          </div>
        </div>
        <dl className="grid gap-5 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Status" value={<StatusBadge status={p.status} />} />
          <Info label="Phone" value={p.phone && <span className="inline-flex items-center gap-1.5"><Phone className="size-3.5 text-muted" />{p.phone}</span>} />
          <Info label="Email" value={p.email} />
          <Info label="Location" value={[p.subCity, p.city].filter(Boolean).join(', ')} />
          <Info label="Language" value={p.preferredLanguage.toUpperCase()} />
          <Info label="Emergency contact" value={p.emergencyContactName && `${p.emergencyContactName} ${p.emergencyContactPhone ?? ''}`} />
          <Info label="Portal" value={p.hasPortalAccount ? <Badge tone="success"><ShieldCheck className="size-3" /> Linked</Badge> : 'Not invited'} />
          <Info label="Registered" value={formatCalendarDate(p.createdAt)} />
        </dl>
      </Card>
      <Card><CardBody><Tabs tabs={tabs} /></CardBody></Card>
      {edit && <EditPatientDialog patient={p} open={edit} onOpenChange={setEdit} />}
      <BookAppointmentDialog open={book} onOpenChange={setBook} patient={p} />
      <Dialog open={!!invite} onOpenChange={() => setInvite(null)} title="Portal invitation created" description="Share this one-time link with the patient. It expires in 72 hours."
        footer={<Button onClick={() => { void navigator.clipboard.writeText(invite ?? ''); toast.success('Link copied'); }}><Copy /> Copy link</Button>}>
        <p className="break-all rounded-xl bg-canvas p-3 font-mono text-xs">{invite}</p>
        <p className="mt-3 text-xs text-muted">If email delivery is configured the patient also receives it by email. Treat this link like a password.</p>
      </Dialog>
    </>
  );
}
