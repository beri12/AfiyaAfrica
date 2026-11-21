'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { fullName } from '@/lib/format';
import type { NoteSectionsT, PatientDetail } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Checkbox, Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, Spinner } from '@/components/ui/states';
import { cleanSections, NoteSectionsEditor } from '@/components/app/note-sections';

function NewNote() {
  const patientId = useSearchParams().get('patientId') ?? '';
  const router = useRouter();
  const [title, setTitle] = useState('Consultation note');
  const [sections, setSections] = useState<NoteSectionsT>({});
  const [share, setShare] = useState(false);
  const [saving, setSaving] = useState(false);
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: () => api<PatientDetail>(`/patients/${patientId}`), enabled: !!patientId });

  if (!patientId) return <Alert tone="warning">Open a patient and choose “New note”.</Alert>;
  if (patient.isLoading) return <Spinner />;
  if (patient.isError) return <Alert tone="danger">{errorMessage(patient.error)}</Alert>;

  const save = async () => {
    setSaving(true);
    try {
      const n = await api<{ id: string }>('/clinical-notes', { method: 'POST', body: { patientId, title, sections: cleanSections(sections), shareWithPatient: share } });
      toast.success('Draft saved');
      router.replace(`/app/clinical/notes/${n.id}`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setSaving(false); }
  };
  return (
    <>
      <PageHeader title="New clinical note" description={patient.data ? `${fullName(patient.data)} · ${patient.data.medicalRecordNumber}` : ''} />
      <Card>
        <CardHeader title="Draft" description="Saved as a draft. You can review and sign it afterwards." />
        <CardBody className="space-y-5">
          <Field label="Title"><Input value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} /></Field>
          <NoteSectionsEditor value={sections} onChange={setSections} />
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={share} onChange={(e) => setShare(e.target.checked)} /> Share with patient in the portal once signed</label>
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => router.back()}>Cancel</Button><Button loading={saving} onClick={save}>Save draft</Button></div>
        </CardBody>
      </Card>
    </>
  );
}

export default function NewNotePage() {
  return <Suspense><NewNote /></Suspense>;
}
