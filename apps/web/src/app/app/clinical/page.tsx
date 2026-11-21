'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import { apiPage, qs } from '@/lib/api';
import { formatDateTime, humanize } from '@/lib/format';
import type { NoteMeta } from '@/lib/types';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox, Select } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/page-header';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

export default function ClinicalPage() {
  const [status, setStatus] = useState('');
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const q = useQuery({ queryKey: ['notes', status, mine, page], queryFn: () => apiPage<NoteMeta>(`/clinical-notes${qs({ status, mine: mine || undefined, page })}`), placeholderData: keepPreviousData });
  return (
    <>
      <PageHeader title="Clinical records" description="Notes for patients in your care. Open a patient to start a new note." />
      <Card>
        <div className="flex flex-wrap items-center gap-4 border-b border-line p-4">
          <Select aria-label="Status" className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['DRAFT', 'IN_REVIEW', 'SIGNED', 'AMENDED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} /> Authored by me</label>
        </div>
        {q.isLoading ? <LoadingRows /> : q.isError ? <ErrorState error={q.error} onRetry={() => q.refetch()} /> : q.data?.items.length ? (
          <>
            <Table caption="Clinical notes">
              <THead><tr><Th>Note</Th><Th>Patient</Th><Th>Author</Th><Th>Updated</Th><Th>Status</Th></tr></THead>
              <TBody>{q.data.items.map((n) => (
                <Tr key={n.id}>
                  <Td><Link href={`/app/clinical/notes/${n.id}`} className="font-semibold text-brand-800 hover:underline">{n.title}</Link>{n.source === 'AI_ASSISTED' && <Badge tone="ai" className="ml-2">AI-assisted</Badge>}</Td>
                  <Td>{n.patient.firstName} {n.patient.lastName}<p className="font-mono text-xs text-muted">{n.patient.medicalRecordNumber}</p></Td>
                  <Td>{n.author.firstName} {n.author.lastName}</Td>
                  <Td className="text-sm text-muted">{formatDateTime(n.updatedAt)}</Td>
                  <Td><StatusBadge status={n.status} /></Td>
                </Tr>
              ))}</TBody>
            </Table>
            <Pagination page={page} totalPages={q.data.meta.totalPages} onPage={setPage} />
          </>
        ) : <EmptyState icon={FileText} title="No notes" description="Notes you write for patients in your care appear here." />}
      </Card>
    </>
  );
}
