import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, Bell, Bot, CalendarClock, CreditCard, FileText, FlaskConical, ListChecks, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { Container, CtaBand, FeatureGrid, PageHero, SectionHeading } from '@/components/marketing/blocks';

export const metadata: Metadata = { title: 'Healthcare Solutions' };

const MODULES = [
  { icon: Users, title: 'Patient registry', description: 'Registration with consent capture, MRN generation, search, patient status and access history.' },
  { icon: CalendarClock, title: 'Appointments', description: 'Calendar and list views, availability-aware slots, rescheduling, cancellations and no-show tracking.' },
  { icon: FileText, title: 'Clinical records', description: 'SOAP-structured notes, version history, signing and amendments with reasons — encrypted at rest.' },
  { icon: Bot, title: 'AI assistant', description: 'Workflow help for staff, documentation drafts for doctors and approved-source health education.' },
  { icon: ListChecks, title: 'Follow-ups', description: 'Tasks with due dates, priorities and assignees, plus daily reminders for what is due.' },
  { icon: FlaskConical, title: 'Laboratory', description: 'Order tests, track sample status and record results, visible only to the ordering care team.' },
  { icon: Bell, title: 'Notifications', description: 'In-app, SMS and email channels with per-user preferences and patient consent checks.' },
  { icon: BarChart3, title: 'Analytics', description: 'Operational dashboards on appointment volumes, completion, cancellations and service use.' },
  { icon: CreditCard, title: 'Billing', description: 'Plan management, usage limits, invoices and payment history for each clinic.' },
];

export default function SolutionsPage() {
  return (
    <>
      <PageHero eyebrow="Healthcare solutions" title="A complete operating system for private clinics" description="Modular tools that cover the full clinic day — from the front desk to the consulting room to the lab.">
        <Button asChild size="lg" variant="inverse"><Link href="/register-clinic">Register your clinic</Link></Button>
        <Button asChild size="lg" variant="outlineLight"><Link href="/pricing">See pricing</Link></Button>
      </PageHero>
      <section className="py-24">
        <Container>
          <Reveal><SectionHeading eyebrow="Modules" title="Everything works together" description="Each module shares one secure data model, so information entered once is available wherever it is needed — to the people allowed to see it." /></Reveal>
          <div className="mt-14"><FeatureGrid features={MODULES} /></div>
        </Container>
      </section>
      <section className="bg-white py-24">
        <Container className="grid gap-10 lg:grid-cols-3">
          {[
            ['Multi-tenant by design', 'Every clinic is its own tenant. Data never crosses clinic boundaries, and access is verified on every request.'],
            ['Works on everyday devices', 'Responsive interface for desktops, tablets and phones. No installation required.'],
            ['Open, documented API', 'A versioned REST API with OpenAPI documentation for future integrations.'],
          ].map(([t, d]) => (
            <Reveal key={t}><div data-reveal className="rounded-2xl border border-line p-7"><ShieldCheck className="size-6 text-teal-600" aria-hidden /><h3 className="mt-4 text-lg font-semibold">{t}</h3><p className="mt-2 text-sm leading-relaxed text-muted">{d}</p></div></Reveal>
          ))}
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
