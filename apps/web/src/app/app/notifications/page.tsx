'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, CheckCheck } from 'lucide-react';
import { NOTIFICATION_TYPES } from '@afyalink/shared';
import { api, apiPage, errorMessage } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { Alert, EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';

interface Prefs { defaults: Record<string, boolean>; preferences: { type: string; channel: string; enabled: boolean }[]; channelsConfigured: Record<string, boolean> }

function Inbox() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notifications', page], queryFn: () => apiPage<NotificationItem>(`/notifications?page=${page}`, { clinic: null }) });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['notifications'] });
  const read = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'POST', clinic: null }), onSuccess: invalidate });
  const readAll = useMutation({ mutationFn: () => api('/notifications/read-all', { method: 'POST', clinic: null }), onSuccess: invalidate });
  if (q.isLoading) return <LoadingRows />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data?.items.length) return <EmptyState icon={Bell} title="You're all caught up" />;
  return (
    <>
      <div className="mb-3 flex justify-end"><Button size="sm" variant="secondary" loading={readAll.isPending} onClick={() => readAll.mutate()}><CheckCheck /> Mark all read</Button></div>
      <ul className="divide-y divide-line rounded-xl border border-line">
        {q.data.items.map((n) => (
          <li key={n.id} className={cn('flex items-start gap-3 px-4 py-3.5', !n.readAt && 'bg-brand-50/50')}>
            <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-teal-500')} aria-label={n.readAt ? undefined : 'Unread'} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="text-sm text-muted">{n.body}</p>
              <p className="mt-1 text-xs text-muted">{formatDateTime(n.createdAt)} · {humanize(n.type)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              {n.link && <Button size="sm" variant="ghost" asChild><Link href={n.link} onClick={() => !n.readAt && read.mutate(n.id)}>Open</Link></Button>}
              {!n.readAt && <Button size="sm" variant="ghost" onClick={() => read.mutate(n.id)}>Mark read</Button>}
            </div>
          </li>
        ))}
      </ul>
      <Pagination page={page} totalPages={q.data.meta.totalPages} onPage={setPage} />
    </>
  );
}

function Preferences() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['notification-prefs'], queryFn: () => api<Prefs>('/notifications/preferences', { clinic: null }) });
  const save = useMutation({
    mutationFn: (p: { type: string; channel: string; enabled: boolean }) => api('/notifications/preferences', { method: 'PUT', body: { preferences: [p] }, clinic: null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-prefs'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!q.data) return <LoadingRows />;
  const enabled = (type: string, channel: string) => q.data.preferences.find((p) => p.type === type && p.channel === channel)?.enabled ?? q.data.defaults[channel];
  return (
    <div className="space-y-4">
      {(!q.data.channelsConfigured.EMAIL || !q.data.channelsConfigured.SMS) && (
        <Alert tone="warning">{[!q.data.channelsConfigured.EMAIL && 'Email', !q.data.channelsConfigured.SMS && 'SMS'].filter(Boolean).join(' and ')} delivery is not configured on this deployment; those messages are recorded but not sent.</Alert>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-muted"><th className="py-2">Notification</th>{['IN_APP', 'EMAIL', 'SMS'].map((c) => <th key={c} className="py-2 text-center">{humanize(c)}</th>)}</tr></thead>
          <tbody className="divide-y divide-line">
            {NOTIFICATION_TYPES.map((t) => (
              <tr key={t}>
                <td className="py-2.5">{humanize(t)}</td>
                {['IN_APP', 'EMAIL', 'SMS'].map((c) => (
                  <td key={c} className="py-2.5 text-center">
                    <Checkbox aria-label={`${humanize(t)} via ${humanize(c)}`} checked={!!enabled(t, c)} onChange={(e) => save.mutate({ type: t, channel: c, enabled: e.target.checked })} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <>
      <PageHeader title="Notifications" description="Messages never include clinical details." />
      <Card><CardHeader title="Your notifications" /><CardBody><Tabs tabs={[{ value: 'inbox', label: 'Inbox', content: <Inbox /> }, { value: 'prefs', label: 'Preferences', content: <Preferences /> }]} /></CardBody></Card>
    </>
  );
}
