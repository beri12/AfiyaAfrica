'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Clock, Plus, Stethoscope, Trash2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Doctor } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0); };

type Window = { dayOfWeek: number; start: string; end: string };

function AvailabilityEditor({ doctor, onClose }: { doctor: Doctor; onClose: () => void }) {
  const qc = useQueryClient();
  const [windows, setWindows] = useState<Window[]>(doctor.availability.map((w) => ({ dayOfWeek: w.dayOfWeek, start: toTime(w.startMinute), end: toTime(w.endMinute) })));
  const save = useMutation({
    mutationFn: () => api(`/doctors/${doctor.id}/availability`, { method: 'PUT', body: { windows: windows.map((w) => ({ dayOfWeek: w.dayOfWeek, startMinute: toMin(w.start), endMinute: toMin(w.end) })) } }),
    onSuccess: async () => { toast.success('Availability saved'); await qc.invalidateQueries({ queryKey: ['doctors'] }); onClose(); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const update = (i: number, patch: Partial<Window>) => setWindows((ws) => ws.map((w, j) => (i === j ? { ...w, ...patch } : w)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} size="lg" title={`Weekly availability · Dr ${doctor.membership.user.lastName}`} description="Clinic local time. Bookings must fit inside these windows."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => save.mutate()}>Save availability</Button></>}>
      <div className="space-y-2">
        {windows.map((w, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select aria-label="Day" value={w.dayOfWeek} onChange={(e) => update(i, { dayOfWeek: Number(e.target.value) })} className="w-40">
              {DAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}
            </Select>
            <Input aria-label="Start time" type="time" step={900} value={w.start} onChange={(e) => update(i, { start: e.target.value })} className="w-32" />
            <span className="text-muted">to</span>
            <Input aria-label="End time" type="time" step={900} value={w.end} onChange={(e) => update(i, { end: e.target.value })} className="w-32" />
            <Button size="icon" variant="ghost" aria-label="Remove window" onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}><Trash2 /></Button>
          </div>
        ))}
        {!windows.length && <p className="text-sm text-muted">No availability — this doctor cannot be booked.</p>}
        <Button variant="secondary" size="sm" onClick={() => setWindows((ws) => [...ws, { dayOfWeek: 1, start: '08:30', end: '17:00' }])}><Plus /> Add window</Button>
      </div>
    </Dialog>
  );
}

export default function DoctorsPage() {
  const { role, user } = useAuth();
  const [editing, setEditing] = useState<Doctor | null>(null);
  const q = useQuery({ queryKey: ['doctors'], queryFn: () => api<Doctor[]>('/doctors') });
  const canEdit = (d: Doctor) => role === 'CLINIC_ADMIN' || (role === 'DOCTOR' && d.membership.user.id === user?.id);
  return (
    <>
      <PageHeader title="Doctors" description="Active doctors and their weekly availability." />
      {role === 'CLINIC_ADMIN' && <Alert tone="info" className="mb-6">Add doctors from <strong>Staff → Invite</strong> with the Doctor role.</Alert>}
      {q.isLoading ? <Card><LoadingRows /></Card> : q.isError ? <Card><ErrorState error={q.error} onRetry={() => q.refetch()} /></Card> : q.data?.length ? (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {q.data.map((d) => (
            <Card key={d.id}>
              <CardHeader title={`Dr ${d.membership.user.firstName} ${d.membership.user.lastName}`} description={d.specialty ?? 'General'} action={<Stethoscope className="size-5 text-teal-600" />} />
              <CardBody>
                {d.availability.length ? (
                  <ul className="space-y-1.5 text-sm">
                    {d.availability.map((w, i) => <li key={i} className="flex justify-between"><span className="text-muted">{DAYS[w.dayOfWeek]}</span><span className="tabular-nums">{toTime(w.startMinute)}–{toTime(w.endMinute)}</span></li>)}
                  </ul>
                ) : <p className="text-sm text-muted">No availability set.</p>}
                {canEdit(d) && <Button size="sm" variant="secondary" className="mt-4" onClick={() => setEditing(d)}><Clock /> Edit availability</Button>}
              </CardBody>
            </Card>
          ))}
        </div>
      ) : <Card><EmptyState icon={Stethoscope} title="No doctors yet" description="Invite doctors from the Staff page." /></Card>}
      {editing && <AvailabilityEditor doctor={editing} onClose={() => setEditing(null)} />}
    </>
  );
}
