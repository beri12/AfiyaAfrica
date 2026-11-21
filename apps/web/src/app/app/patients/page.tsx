'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Search, UserPlus, Users } from 'lucide-react';
import { apiPage, qs } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/nav';
import { ageFrom, formatCalendarDate, fullName, humanize } from '@/lib/format';
import type { PatientSummary } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Select } from '@/components/ui/input';
import { PageHeader, Pagination } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/badge';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useDebounced } from '@/lib/use-debounced';

export default function PatientsPage() {
  const { role } = useAuth();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q, 300);
  const query = useQuery({
    queryKey: ['patients', search, status, page],
    queryFn: () => apiPage<PatientSummary>(`/patients${qs({ q: search, status, page, pageSize: 20 })}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Patients"
        description={role === 'DOCTOR' ? 'Patients currently in your care.' : 'Search and manage registered patients.'}
        actions={can(role, 'patient:create') && <Button asChild><Link href="/app/patients/new"><UserPlus /> Register patient</Link></Button>}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input aria-label="Search patients" placeholder="Search by name, phone or MRN" className="pl-9" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
          <Select aria-label="Filter by status" className="sm:w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All statuses</option>
            {['ACTIVE', 'INACTIVE', 'TRANSFERRED', 'DECEASED'].map((s) => <option key={s} value={s}>{humanize(s)}</option>)}
          </Select>
        </div>
        {query.isLoading ? <LoadingRows /> : query.isError ? <ErrorState error={query.error} onRetry={() => query.refetch()} /> : query.data?.items.length ? (
          <>
            <Table caption="Patients">
              <THead><tr><Th>Patient</Th><Th>MRN</Th><Th>Age / sex</Th><Th>Phone</Th><Th>Status</Th></tr></THead>
              <TBody>
                {query.data.items.map((p) => (
                  <Tr key={p.id}>
                    <Td><Link href={`/app/patients/${p.id}`} className="font-semibold text-brand-800 hover:underline">{fullName(p)}</Link></Td>
                    <Td className="font-mono text-xs">{p.medicalRecordNumber}</Td>
                    <Td>{ageFrom(p.dateOfBirth)} · {humanize(p.sex)}<span className="sr-only"> born {formatCalendarDate(p.dateOfBirth)}</span></Td>
                    <Td>{p.phone ?? '—'}</Td>
                    <Td><StatusBadge status={p.status} /></Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
            <Pagination page={page} totalPages={query.data.meta.totalPages} onPage={setPage} />
          </>
        ) : (
          <EmptyState icon={Users} title={search ? 'No matching patients' : 'No patients yet'} description={search ? 'Try a different name, phone number or MRN.' : 'Registered patients will appear here.'}
            action={can(role, 'patient:create') && !search ? <Button asChild><Link href="/app/patients/new">Register the first patient</Link></Button> : undefined} />
        )}
      </Card>
    </>
  );
}
