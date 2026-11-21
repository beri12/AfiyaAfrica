'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Copy, ShieldCheck, UserPlus, UserCog } from 'lucide-react';
import { inviteStaffSchema, STAFF_ROLES } from '@afyalink/shared';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useZodForm } from '@/lib/form';
import { formatDateTime, humanize } from '@/lib/format';
import type { StaffMember } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field, FormGrid } from '@/components/ui/field';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

function InviteDialog({ open, onOpenChange, onLink }: { open: boolean; onOpenChange: (o: boolean) => void; onLink: (url: string) => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, watch, reset, formState: { errors, isSubmitting } } = useZodForm(inviteStaffSchema, { defaultValues: { role: 'RECEPTIONIST' } });
  const submit = handleSubmit(async (v) => {
    try {
      const r = await api<{ activationUrl?: string }>('/staff', { method: 'POST', body: v });
      await qc.invalidateQueries({ queryKey: ['staff'] });
      toast.success('Staff member invited');
      reset();
      onOpenChange(false);
      if (r.activationUrl) onLink(r.activationUrl);
    } catch (e) { toast.error(errorMessage(e)); }
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Invite staff member" description="They will receive a one-time activation link." size="lg"
      footer={<><Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button><Button loading={isSubmitting} onClick={submit}>Send invitation</Button></>}>
      <FormGrid>
        <Field label="First name" required error={errors.firstName?.message}><Input {...register('firstName')} /></Field>
        <Field label="Last name" required error={errors.lastName?.message}><Input {...register('lastName')} /></Field>
        <Field label="Email" required error={errors.email?.message}><Input type="email" {...register('email')} /></Field>
        <Field label="Phone" error={errors.phone?.message}><Input type="tel" {...register('phone', { setValueAs: (v: string) => v || undefined })} /></Field>
        <Field label="Role" required error={errors.role?.message}><Select {...register('role')}>{STAFF_ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}</Select></Field>
        {watch('role') === 'DOCTOR' && <Field label="Specialty" error={errors.specialty?.message}><Input {...register('specialty')} /></Field>}
        {watch('role') === 'DOCTOR' && <Field label="License number" error={errors.licenseNumber?.message}><Input {...register('licenseNumber')} /></Field>}
      </FormGrid>
    </Dialog>
  );
}

export default function StaffPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [invite, setInvite] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['staff'], queryFn: () => api<StaffMember[]>('/staff') });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: object }) => api(`/staff/${id}`, { method: 'PATCH', body }),
    onSuccess: async () => { toast.success('Staff member updated'); await qc.invalidateQueries({ queryKey: ['staff'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const resend = useMutation({
    mutationFn: (id: string) => api<{ activationUrl: string }>(`/staff/${id}/resend-invite`, { method: 'POST' }),
    onSuccess: (r) => setLink(r.activationUrl),
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <>
      <PageHeader title="Staff" description="Manage who can access your clinic and what they can do." actions={<Button onClick={() => setInvite(true)}><UserPlus /> Invite staff</Button>} />
      <Card>
        {q.isLoading ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.length ? (
          <Table caption="Staff members">
            <THead><tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Last sign-in</Th><Th>Actions</Th></tr></THead>
            <TBody>
              {q.data.map((m) => (
                <Tr key={m.id}>
                  <Td>
                    <p className="font-semibold">{m.user.firstName} {m.user.lastName} {m.user.id === user?.id && <Badge tone="brand">You</Badge>}</p>
                    <p className="text-xs text-muted">{m.user.email}{m.doctor?.specialty ? ` · ${m.doctor.specialty}` : ''}</p>
                  </Td>
                  <Td>
                    <Select aria-label={`Role for ${m.user.firstName}`} className="h-9 w-44" value={m.role} onChange={(e) => update.mutate({ id: m.id, body: { role: e.target.value } })}>
                      {STAFF_ROLES.map((r) => <option key={r} value={r}>{humanize(r)}</option>)}
                    </Select>
                  </Td>
                  <Td><span className="flex items-center gap-1.5"><StatusBadge status={m.status} />{m.user.mfaEnabled && <ShieldCheck className="size-4 text-teal-600" aria-label="MFA enabled" />}</span></Td>
                  <Td className="text-sm text-muted">{m.user.lastLoginAt ? formatDateTime(m.user.lastLoginAt) : 'Never'}</Td>
                  <Td>
                    {m.status === 'INVITED' && <Button size="sm" variant="ghost" loading={resend.isPending && resend.variables === m.id} onClick={() => resend.mutate(m.id)}>Resend link</Button>}
                    {m.status === 'ACTIVE' && m.user.id !== user?.id && <Button size="sm" variant="ghost" onClick={() => confirm(`Disable ${m.user.firstName}'s access?`) && update.mutate({ id: m.id, body: { status: 'DISABLED' } })}>Disable</Button>}
                    {m.status === 'DISABLED' && <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: m.id, body: { status: 'ACTIVE' } })}>Re-enable</Button>}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : <EmptyState icon={UserCog} title="No staff yet" />}
      </Card>
      <InviteDialog open={invite} onOpenChange={setInvite} onLink={setLink} />
      <Dialog open={!!link} onOpenChange={() => setLink(null)} title="Activation link" description="Share securely with the staff member. Single use, expires in 72 hours."
        footer={<Button onClick={() => { void navigator.clipboard.writeText(link ?? ''); toast.success('Link copied'); }}><Copy /> Copy link</Button>}>
        <p className="break-all rounded-xl bg-canvas p-3 font-mono text-xs">{link}</p>
      </Dialog>
    </>
  );
}
