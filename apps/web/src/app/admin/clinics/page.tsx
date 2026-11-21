'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDate, humanize } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

interface PClinic { id: string; name: string; city: string; email: string; phone: string; licenseNumber: string | null; status: string; createdAt: string; _count: { patients: number; memberships: number }; subscriptions: { status: string; plan: { name: string } }[] }

export default function AdminClinics() {
  const qc = useQueryClient();
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const q = useQuery({ queryKey: ['platform', 'clinics', status], queryFn: () => api<PClinic[]>(`/platform/clinics${status ? `?status=${status}` : ''}`, { clinic: null }) });
  const review = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: string; reason?: string }) => api(`/platform/clinics/${id}/review`, { method: 'POST', body: { decision, reason }, clinic: null }),
    onSuccess: async (_d, v) => { toast.success(`Clinic ${humanize(v.decision).toLowerCase()}d`.replace('ed d', 'ed')); await qc.invalidateQueries({ queryKey: ['platform'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const act = (id: string, decision: string, ask = false) => {
    const reason = ask ? prompt('Reason (shared with the clinic admin)') ?? undefined : undefined;
    if (ask && reason === undefined) return;
    review.mutate({ id, decision, reason });
  };
  return (
    <>
      <PageHeader title="Clinics" description="Verify registrations before activation." actions={
        <Select aria-label="Status filter" className="w-52" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All clinics</option>
          {['PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
        </Select>} />
      <Card>
        {q.isLoading ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} /> : q.data?.length ? (
          <Table caption="Clinics">
            <THead><tr><Th>Clinic</Th><Th>Contact</Th><Th>Plan</Th><Th>Usage</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></THead>
            <TBody>{q.data.map((c) => (
              <Tr key={c.id}>
                <Td><p className="font-semibold">{c.name}</p><p className="text-xs text-muted">{c.city} · registered {formatDate(c.createdAt)}{c.licenseNumber ? ` · License ${c.licenseNumber}` : ''}</p></Td>
                <Td className="text-sm">{c.email}<p className="text-xs text-muted">{c.phone}</p></Td>
                <Td className="text-sm">{c.subscriptions[0]?.plan.name ?? '—'}<p className="text-xs text-muted">{c.subscriptions[0] ? humanize(c.subscriptions[0].status) : ''}</p></Td>
                <Td className="text-sm">{c._count.memberships} members · {c._count.patients} patients</Td>
                <Td><StatusBadge status={c.status} /></Td>
                <Td className="whitespace-nowrap text-right">
                  {c.status === 'PENDING_APPROVAL' && <><Button size="sm" onClick={() => act(c.id, 'APPROVE')}>Approve</Button> <Button size="sm" variant="ghost" onClick={() => act(c.id, 'REJECT', true)}>Reject</Button></>}
                  {c.status === 'ACTIVE' && <Button size="sm" variant="ghost" onClick={() => act(c.id, 'SUSPEND', true)}>Suspend</Button>}
                  {c.status === 'SUSPENDED' && <Button size="sm" variant="secondary" onClick={() => act(c.id, 'REACTIVATE')}>Reactivate</Button>}
                </Td>
              </Tr>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={Building2} title="No clinics in this view" />}
      </Card>
    </>
  );
}
