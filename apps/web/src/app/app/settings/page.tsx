'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LifeBuoy, ShieldCheck } from 'lucide-react';
import { changePasswordSchema, createSupportTicketSchema, PRIORITIES, updateClinicSchema } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useZodForm } from '@/lib/form';
import { can } from '@/lib/nav';
import { formatDateTime, humanize } from '@/lib/format';
import type { Clinic } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, FormGrid } from '@/components/ui/field';
import { Checkbox, Input, Select, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { Alert, Spinner } from '@/components/ui/states';

function ClinicSettings() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['clinic'], queryFn: () => api<Clinic>('/clinic') });
  const c = q.data;
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useZodForm(updateClinicSchema, {
    values: c ? { name: c.name, city: c.city, subCity: c.subCity ?? undefined, addressLine: c.addressLine ?? undefined, phone: c.phone, email: c.email, timezone: c.timezone, defaultAppointmentMinutes: c.defaultAppointmentMinutes, reminderHoursBefore: c.reminderHoursBefore, aiExternalProcessingApproved: c.aiExternalProcessingApproved } : undefined,
  });
  const editable = can(role, 'clinic:update');
  const submit = handleSubmit(async (v) => {
    try { await api('/clinic', { method: 'PATCH', body: v }); toast.success('Clinic settings saved'); await qc.invalidateQueries({ queryKey: ['clinic'] }); } catch (e) { toast.error(errorMessage(e)); }
  });
  if (!c) return <Spinner />;
  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      <div className="flex items-center gap-2 text-sm">Status: <StatusBadge status={c.status} />{c.statusReason && <span className="text-muted">— {c.statusReason}</span>}</div>
      <fieldset disabled={!editable} className="space-y-5">
        <FormGrid>
          <Field label="Clinic name" error={errors.name?.message}><Input {...register('name')} /></Field>
          <Field label="Email" error={errors.email?.message}><Input {...register('email')} /></Field>
          <Field label="Phone" error={errors.phone?.message}><Input {...register('phone')} /></Field>
          <Field label="City" error={errors.city?.message}><Input {...register('city')} /></Field>
          <Field label="Sub-city" error={errors.subCity?.message}><Input {...register('subCity')} /></Field>
          <Field label="Address" error={errors.addressLine?.message}><Input {...register('addressLine')} /></Field>
          <Field label="Timezone" error={errors.timezone?.message}><Input {...register('timezone')} /></Field>
          <Field label="Reminder lead time (hours)" error={errors.reminderHoursBefore?.message}><Input type="number" min={1} max={72} {...register('reminderHoursBefore', { valueAsNumber: true })} /></Field>
        </FormGrid>
        <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-warning-soft p-4 text-sm">
          <Checkbox className="mt-0.5" {...register('aiExternalProcessingApproved')} />
          <span><strong>External AI processing approved.</strong> Tick only after your clinic has completed privacy, legal and contractual review of the configured AI provider. When unticked, patient names are always removed before AI processing.</span>
        </label>
        {editable && <div className="flex justify-end"><Button type="submit" loading={isSubmitting}>Save settings</Button></div>}
      </fieldset>
    </form>
  );
}

function SecuritySettings() {
  const { user, reload } = useAuth();
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [code, setCode] = useState('');
  const pw = useZodForm(changePasswordSchema);
  const changePw = pw.handleSubmit(async (v) => {
    try { await api('/auth/change-password', { method: 'POST', body: v, clinic: null }); toast.success('Password changed — other sessions were signed out'); pw.reset(); } catch (e) { toast.error(errorMessage(e)); }
  });
  const begin = useMutation({ mutationFn: () => api<{ secret: string; otpauthUri: string }>('/auth/mfa/setup', { method: 'POST', clinic: null }), onSuccess: setSetup, onError: (e) => toast.error(errorMessage(e)) });
  const enable = useMutation({ mutationFn: () => api(`/auth/mfa/${user?.mfaEnabled ? 'disable' : 'enable'}`, { method: 'POST', body: { code }, clinic: null }), onSuccess: async () => { toast.success(user?.mfaEnabled ? 'Two-step verification disabled' : 'Two-step verification enabled'); setSetup(null); setCode(''); await reload(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Change password" />
        <CardBody>
          <form onSubmit={changePw} className="space-y-4" noValidate>
            <Field label="Current password" error={pw.formState.errors.currentPassword?.message}><Input type="password" autoComplete="current-password" {...pw.register('currentPassword')} /></Field>
            <Field label="New password" error={pw.formState.errors.newPassword?.message}><Input type="password" autoComplete="new-password" {...pw.register('newPassword')} /></Field>
            <Button type="submit" loading={pw.formState.isSubmitting}>Update password</Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Two-step verification" description="Recommended for administrators and doctors." action={user?.mfaEnabled && <StatusBadge status="ACTIVE" />} />
        <CardBody className="space-y-4">
          {!user?.mfaEnabled && !setup && <Button variant="secondary" loading={begin.isPending} onClick={() => begin.mutate()}><ShieldCheck /> Set up authenticator app</Button>}
          {setup && (
            <div className="space-y-3 text-sm">
              <p>Add this key to an authenticator app (Google Authenticator, Microsoft Authenticator, etc.), then enter the 6-digit code.</p>
              <p className="break-all rounded-lg bg-canvas p-3 font-mono text-xs">{setup.secret}</p>
              <a href={setup.otpauthUri} className="text-xs font-semibold text-brand-700 underline">Open in authenticator app</a>
            </div>
          )}
          {(setup || user?.mfaEnabled) && (
            <div className="flex gap-2">
              <Input aria-label="Verification code" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value)} className="w-36" />
              <Button variant={user?.mfaEnabled ? 'danger' : 'primary'} disabled={code.length !== 6} loading={enable.isPending} onClick={() => enable.mutate()}>{user?.mfaEnabled ? 'Disable' : 'Verify & enable'}</Button>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Support() {
  const qc = useQueryClient();
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => api<{ id: string; subject: string; status: string; priority: string; createdAt: string; resolution: string | null }[]>('/support-tickets') });
  const f = useZodForm(createSupportTicketSchema, { defaultValues: { priority: 'NORMAL' } });
  const submit = f.handleSubmit(async (v) => {
    try { await api('/support-tickets', { method: 'POST', body: v }); toast.success('Support request sent'); f.reset(); await qc.invalidateQueries({ queryKey: ['tickets'] }); } catch (e) { toast.error(errorMessage(e)); }
  });
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card><CardHeader title="Contact support" description="Do not include patient information." /><CardBody>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Subject" error={f.formState.errors.subject?.message}><Input {...f.register('subject')} /></Field>
          <Field label="Description" error={f.formState.errors.description?.message}><Textarea rows={4} {...f.register('description')} /></Field>
          <Field label="Priority"><Select {...f.register('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{humanize(p)}</option>)}</Select></Field>
          <Button type="submit" loading={f.formState.isSubmitting}><LifeBuoy /> Send request</Button>
        </form>
      </CardBody></Card>
      <Card><CardHeader title="Your requests" />
        {tickets.data?.length ? <ul className="divide-y divide-line">{tickets.data.map((t) => (
          <li key={t.id} className="px-5 py-3"><div className="flex justify-between gap-2"><p className="text-sm font-semibold">{t.subject}</p><StatusBadge status={t.status} /></div><p className="text-xs text-muted">{formatDateTime(t.createdAt)}</p>{t.resolution && <p className="mt-1 text-sm">{t.resolution}</p>}</li>
        ))}</ul> : <p className="p-5 text-sm text-muted">No requests yet.</p>}
      </Card>
    </div>
  );
}

function SettingsInner() {
  const tab = useSearchParams().get('tab') ?? 'clinic';
  return (
    <>
      <PageHeader title="Settings" />
      <Alert tone="info" className="mb-6">Clinical records follow your clinic&apos;s retention obligations. Contact support for data access or deletion requests.</Alert>
      <Card><CardBody><Tabs defaultValue={tab} tabs={[
        { value: 'clinic', label: 'Clinic', content: <ClinicSettings /> },
        { value: 'security', label: 'Security', content: <SecuritySettings /> },
        { value: 'support', label: 'Support', content: <Support /> },
      ]} /></CardBody></Card>
    </>
  );
}

export default function SettingsPage() {
  return <Suspense><SettingsInner /></Suspense>;
}
