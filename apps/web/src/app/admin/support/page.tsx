'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { LifeBuoy } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState, LoadingRows } from '@/components/ui/states';

interface Ticket { id: string; subject: string; description: string; priority: string; status: string; createdAt: string; clinic: { name: string } | null; createdBy: { firstName: string; lastName: string; email: string } }

export default function AdminSupport() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['platform', 'tickets'], queryFn: () => api<Ticket[]>('/platform/support-tickets', { clinic: null }) });
  const m = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => {
      const resolution = status === 'RESOLVED' ? prompt('Resolution note for the clinic') ?? undefined : undefined;
      return api(`/platform/support-tickets/${id}`, { method: 'PATCH', body: { status, resolution }, clinic: null });
    },
    onSuccess: async () => { toast.success('Ticket updated'); await qc.invalidateQueries({ queryKey: ['platform', 'tickets'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader title="Support requests" />
      <div className="space-y-4">
        {q.isLoading ? <Card><LoadingRows /></Card> : q.data?.length ? q.data.map((t) => (
          <Card key={t.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><p className="font-semibold">{t.subject}</p><p className="text-xs text-muted">{t.clinic?.name ?? 'No clinic'} · {t.createdBy.firstName} {t.createdBy.lastName} ({t.createdBy.email}) · {formatDateTime(t.createdAt)}</p></div>
              <div className="flex items-center gap-2"><StatusBadge status={t.priority} /><StatusBadge status={t.status} /></div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-muted">{t.description}</p>
            <div className="mt-4 flex gap-2">
              {t.status === 'OPEN' && <Button size="sm" variant="secondary" onClick={() => m.mutate({ id: t.id, status: 'IN_PROGRESS' })}>Start</Button>}
              {['OPEN', 'IN_PROGRESS'].includes(t.status) && <Button size="sm" onClick={() => m.mutate({ id: t.id, status: 'RESOLVED' })}>Resolve</Button>}
              {t.status === 'RESOLVED' && <Button size="sm" variant="ghost" onClick={() => m.mutate({ id: t.id, status: 'CLOSED' })}>Close</Button>}
            </div>
          </Card>
        )) : <Card><EmptyState icon={LifeBuoy} title="No support requests" /></Card>}
      </div>
    </>
  );
}
