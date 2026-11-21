'use client';

import { useQuery } from '@tanstack/react-query';
import { FileHeart } from 'lucide-react';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { NoteSectionsT } from '@/lib/types';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { NoteSectionsView } from '@/components/app/note-sections';

interface PortalNote { id: string; title: string; signedAt: string | null; clinic: { name: string }; author: { firstName: string; lastName: string }; sections: NoteSectionsT }

export default function PortalRecords() {
  const q = useQuery({ queryKey: ['portal', 'records'], queryFn: () => api<{ notes: PortalNote[]; recordAccessEnabled: boolean }>('/me/records', { clinic: null }) });
  return (
    <>
      <PageHeader title="My records" description="Visit summaries your doctors have signed and chosen to share with you." />
      {q.isLoading ? <Spinner /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : !q.data?.recordAccessEnabled ? (
        <Alert tone="info">Record access is turned off. You can enable it under Privacy &amp; consent, or ask your clinic.</Alert>
      ) : q.data.notes.length ? (
        <div className="space-y-5">{q.data.notes.map((n) => (
          <Card key={n.id}>
            <CardHeader title={n.title} description={`${n.clinic.name} · Dr ${n.author.lastName} · ${n.signedAt ? formatDate(n.signedAt) : ''}`} />
            <CardBody><NoteSectionsView sections={n.sections} /></CardBody>
          </Card>
        ))}<p className="text-xs text-muted">If anything looks incorrect, contact your clinic. Do not change medication without speaking to your doctor.</p></div>
      ) : <Card><EmptyState icon={FileHeart} title="Nothing shared yet" description="Summaries appear here after your doctor signs and shares them." /></Card>}
    </>
  );
}
