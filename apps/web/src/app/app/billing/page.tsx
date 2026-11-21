'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CreditCard, FlaskRound } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/nav';
import { formatDate, money } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';

interface Plan { id: string; code: string; name: string; monthlyPriceUsdCents: number; priceIsFrom: boolean; maxStaff: number | null; maxPatients: number | null; aiEnabled: boolean; smsReminders: boolean; features: string[] }
interface Sub { current: { status: string; trialEndsAt: string | null; currentPeriodEnd: string; plan: Plan } | null; history: { id: string; status: string; createdAt: string; cancelledAt: string | null; plan: { code: string; name: string } }[]; usage: { staff: number; patients: number }; paymentMode: string }
interface Invoice { id: string; number: string; amountUsdCents: number; status: string; periodStart: string; periodEnd: string; dueDate: string; payments: { status: string; sandbox: boolean; createdAt: string }[] }

function Usage({ label, used, max }: { label: string; used: number; max: number | null }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-muted">{used.toLocaleString()} / {max ? max.toLocaleString() : 'Unlimited'}</span></div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${label} usage`}>
        <div className={cn('h-full rounded-full', pct > 90 ? 'bg-danger' : pct > 70 ? 'bg-amber-500' : 'bg-teal-500')} style={{ width: `${max ? pct : 4}%` }} />
      </div>
    </div>
  );
}

export default function BillingPage() {
  const { role, membership } = useAuth();
  const qc = useQueryClient();
  const pending = membership?.clinicStatus !== 'ACTIVE';
  const sub = useQuery({ queryKey: ['subscription'], queryFn: () => api<Sub>('/billing/subscription') });
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api<Plan[]>('/billing/plans', { clinic: null }) });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: () => api<Invoice[]>('/billing/invoices'), enabled: !pending });
  const change = useMutation({
    mutationFn: (planCode: string) => api('/billing/subscription/change-plan', { method: 'POST', body: { planCode } }),
    onSuccess: async () => { toast.success('Plan changed'); await qc.invalidateQueries({ queryKey: ['subscription'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const pay = useMutation({
    mutationFn: (id: string) => api(`/billing/invoices/${id}/pay`, { method: 'POST' }),
    onSuccess: async () => { toast.success('Sandbox payment recorded'); await qc.invalidateQueries({ queryKey: ['invoices'] }); await qc.invalidateQueries({ queryKey: ['subscription'] }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (sub.isLoading) return <Spinner />;
  if (sub.isError || !sub.data) return <Card><ErrorState error={sub.error} onRetry={() => sub.refetch()} /></Card>;
  const cur = sub.data.current;
  const manage = can(role, 'billing:manage') && !pending;
  return (
    <>
      <PageHeader title="Billing & subscription" />
      {sub.data.paymentMode === 'sandbox' && <Alert tone="warning" className="mb-6" title="Sandbox mode"><span className="flex gap-2"><FlaskRound className="size-4 shrink-0" />Payments are simulated during the pilot. No money is charged.</span></Alert>}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <CardHeader title="Current plan" action={cur && <StatusBadge status={cur.status} />} />
          <CardBody className="space-y-5">
            {cur ? (
              <>
                <div>
                  <p className="font-display text-3xl font-bold">{cur.plan.name}</p>
                  <p className="text-muted">{cur.plan.priceIsFrom ? 'from ' : ''}{money(cur.plan.monthlyPriceUsdCents)} / month</p>
                  <p className="mt-2 text-sm">{cur.status === 'TRIALING' && cur.trialEndsAt ? `Trial ends ${formatDate(cur.trialEndsAt)}` : `Current period ends ${formatDate(cur.currentPeriodEnd)}`}</p>
                </div>
                <Usage label="Staff accounts" used={sub.data.usage.staff} max={cur.plan.maxStaff} />
                <Usage label="Patients" used={sub.data.usage.patients} max={cur.plan.maxPatients} />
              </>
            ) : <p className="text-sm text-muted">No subscription.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Plans" />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {plans.data?.map((p) => {
              const isCurrent = cur?.plan.code === p.code;
              return (
                <div key={p.code} className={cn('flex flex-col rounded-xl border p-4', isCurrent ? 'border-brand-600 bg-brand-50' : 'border-line')}>
                  <p className="font-semibold">{p.name}</p>
                  <p className="text-sm text-muted">{p.priceIsFrom ? 'from ' : ''}{money(p.monthlyPriceUsdCents)}/mo</p>
                  <ul className="mt-3 flex-1 space-y-1 text-xs text-muted">{p.features.map((f) => <li key={f}>· {f}</li>)}</ul>
                  {manage && !isCurrent && <Button size="sm" variant="secondary" className="mt-4" loading={change.isPending && change.variables === p.code} onClick={() => confirm(`Switch to ${p.name}?`) && change.mutate(p.code)}>Switch</Button>}
                  {isCurrent && <p className="mt-4 text-xs font-semibold text-brand-700">Current plan</p>}
                </div>
              );
            })}
          </CardBody>
        </Card>
      </div>
      <Card className="mt-6">
        <CardHeader title="Invoices" />
        {pending ? <p className="p-5 text-sm text-muted">Invoices are available once your clinic is approved.</p> : invoices.data?.length ? (
          <Table caption="Invoices">
            <THead><tr><Th>Invoice</Th><Th>Period</Th><Th>Amount</Th><Th>Due</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr></THead>
            <TBody>{invoices.data.map((i) => (
              <Tr key={i.id}>
                <Td className="font-mono text-xs">{i.number}</Td>
                <Td className="text-sm">{formatDate(i.periodStart)} – {formatDate(i.periodEnd)}</Td>
                <Td>{money(i.amountUsdCents)}</Td>
                <Td className="text-sm">{formatDate(i.dueDate)}</Td>
                <Td><StatusBadge status={i.status} />{i.payments[0]?.sandbox && <span className="ml-1 text-xs text-muted">(sandbox)</span>}</Td>
                <Td className="text-right">{manage && i.status === 'OPEN' && <Button size="sm" loading={pay.isPending && pay.variables === i.id} onClick={() => pay.mutate(i.id)}><CreditCard /> Pay (sandbox)</Button>}</Td>
              </Tr>
            ))}</TBody>
          </Table>
        ) : <EmptyState icon={CreditCard} title="No invoices yet" description="Your first invoice is issued when the trial ends." />}
      </Card>
      {sub.data.history.length > 1 && (
        <Card className="mt-6"><CardHeader title="Subscription history" />
          <ul className="divide-y divide-line">{sub.data.history.map((h) => <li key={h.id} className="flex justify-between px-5 py-3 text-sm"><span>{h.plan.name}</span><span className="text-muted">{formatDate(h.createdAt)}{h.cancelledAt ? ` – ${formatDate(h.cancelledAt)}` : ' – current'}</span></li>)}</ul>
        </Card>
      )}
    </>
  );
}
