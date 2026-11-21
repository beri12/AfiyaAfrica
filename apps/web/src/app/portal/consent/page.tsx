'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, errorMessage } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, Spinner } from '@/components/ui/states';
import { useProfiles } from '../use-profiles';

const SELF = [
  { type: 'SMS_REMINDERS', text: 'Receive appointment reminders by SMS (no medical details).' },
  { type: 'EMAIL_REMINDERS', text: 'Receive appointment reminders by email (no medical details).' },
  { type: 'PORTAL_RECORD_ACCESS', text: 'See signed visit summaries shared by my doctors in this portal.' },
  { type: 'AI_ASSISTED_DOCUMENTATION', text: 'Allow my doctor to use the AI documentation assistant (identifiers removed; doctor reviews everything).' },
];

export default function PortalConsent() {
  const qc = useQueryClient();
  const profiles = useProfiles();
  const m = useMutation({
    mutationFn: ({ patientId, type, granted }: { patientId: string; type: string; granted: boolean }) => api(`/me/patient-profiles/${patientId}/consents`, { method: 'POST', body: { type, granted }, clinic: null }),
    onSuccess: async () => { toast.success('Preference saved'); await qc.invalidateQueries({ queryKey: ['portal'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (profiles.isLoading) return <Spinner />;
  return (
    <>
      <PageHeader title="Privacy & consent" description="You can change these choices at any time." />
      <Alert tone="info" className="mb-6">To withdraw consent for your clinic to hold your health information, please contact the clinic directly — they will explain what must be retained by law.</Alert>
      <div className="space-y-6">
        {profiles.data?.map((p) => (
          <Card key={p.id}>
            <CardHeader title={p.clinic.name} description={`MRN ${p.medicalRecordNumber}`} />
            <CardBody className="divide-y divide-line p-0">
              {SELF.map((c) => {
                const granted = p.consents.find((x) => x.type === c.type)?.granted ?? false;
                return (
                  <label key={c.type} className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
                    <span><span className="block text-sm font-semibold">{humanize(c.type)}</span><span className="text-sm text-muted">{c.text}</span></span>
                    <input type="checkbox" role="switch" aria-checked={granted} checked={granted} className="peer sr-only" onChange={(e) => m.mutate({ patientId: p.id, type: c.type, granted: e.target.checked })} />
                    <span aria-hidden className="relative h-6 w-11 shrink-0 rounded-full bg-slate-300 transition-colors peer-checked:bg-teal-600 peer-focus-visible:outline-2 peer-focus-visible:outline-brand-500 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5" />
                  </label>
                );
              })}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}
