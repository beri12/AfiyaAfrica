import type { Metadata } from 'next';
import Link from 'next/link';
import { BarChart3, CalendarCheck2, CreditCard, ShieldCheck, UserCog, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { CheckList, Container, CtaBand, FeatureGrid, PageHero, SectionHeading } from '@/components/marketing/blocks';

export const metadata: Metadata = { title: 'For Clinics' };

export default function ForClinicsPage() {
  return (
    <>
      <PageHero eyebrow="For clinics" title="Run a calmer, better-organised clinic" description="Give your team one shared system for patients, schedules and follow-ups — and see how your clinic is performing in real time.">
        <Button asChild size="lg" variant="inverse"><Link href="/register-clinic">Start your 30-day trial</Link></Button>
      </PageHero>
      <section className="py-24">
        <Container>
          <Reveal><SectionHeading eyebrow="For clinic administrators" title="Control without the paperwork" /></Reveal>
          <div className="mt-14">
            <FeatureGrid features={[
              { icon: UserCog, title: 'Staff & roles', description: 'Invite doctors, receptionists and lab staff with secure one-time activation links. Disable access instantly.' },
              { icon: CalendarCheck2, title: 'Schedules that hold', description: 'Doctor availability and service durations drive booking. Double-booking is prevented at the database level.' },
              { icon: Users, title: 'Patient registry', description: 'One record per patient with consent history, contact details and appointment timeline.' },
              { icon: BarChart3, title: 'Live dashboard', description: "Today's appointments, completion, pending requests, follow-ups and trends — from real data." },
              { icon: ShieldCheck, title: 'Audit & accountability', description: 'See who viewed or changed records, with a tamper-resistant audit log.' },
              { icon: CreditCard, title: 'Transparent billing', description: 'Know your plan limits and usage. Upgrade or change plans as you grow.' },
            ]} />
          </div>
        </Container>
      </section>
      <section className="bg-white py-24">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal><SectionHeading align="left" eyebrow="For reception" title="A front desk that keeps moving" description="Register a patient in under a minute, find any record by name, phone or MRN, and book into the next free slot." /></Reveal>
          <Reveal><CheckList items={['Ethiopian phone numbers normalised automatically', 'Consent captured at registration', 'Patient appointment requests arrive for confirmation', 'Reminders sent only with patient consent', 'No access to clinical notes — by design']} /></Reveal>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
