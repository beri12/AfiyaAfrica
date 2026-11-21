import type { Metadata } from 'next';
import Link from 'next/link';
import { Bot, CalendarDays, FileSignature, FlaskConical, History, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { CheckList, Container, CtaBand, FeatureGrid, PageHero, SectionHeading } from '@/components/marketing/blocks';

export const metadata: Metadata = { title: 'For Doctors' };

export default function ForDoctorsPage() {
  return (
    <>
      <PageHero eyebrow="For doctors" title="More time with patients, less time on paperwork" description="A focused workspace for your day: today's list, your patients' history, and documentation help that keeps you in control.">
        <Button asChild size="lg" variant="inverse"><Link href="/sign-in">Sign in to your workspace</Link></Button>
      </PageHero>
      <section className="py-24">
        <Container>
          <Reveal><SectionHeading eyebrow="Your workspace" title="Everything for the consultation, in one place" /></Reveal>
          <div className="mt-14">
            <FeatureGrid features={[
              { icon: CalendarDays, title: "Today's appointments", description: 'Your schedule with status updates — confirm, complete or mark no-show in a click.' },
              { icon: History, title: 'Patient history', description: 'Visit history, clinical summary and prior notes for patients in your care.' },
              { icon: FileSignature, title: 'Notes you sign', description: 'Draft, review and sign. Amend with a reason — the original is always preserved.' },
              { icon: Bot, title: 'Documentation assistant', description: 'Paste rough notes; get a structured draft and a list of missing information to check.' },
              { icon: ListChecks, title: 'Follow-ups', description: 'Track the tasks assigned to you and get reminded when they are due.' },
              { icon: FlaskConical, title: 'Lab orders & results', description: 'Order tests and get notified when results are ready for review.' },
            ]} />
          </div>
        </Container>
      </section>
      <section className="bg-brand-950 py-24 text-white">
        <Container className="grid items-center gap-12 lg:grid-cols-2">
          <Reveal><SectionHeading light align="left" eyebrow="Clinical safety" title="The AI drafts. You decide." description="The documentation assistant only restructures what you wrote. It will not diagnose, prescribe or invent findings." /></Reveal>
          <Reveal><CheckList light items={['Drafts are labelled as AI-generated and unreviewed', 'Values not found in your notes are flagged for checking', 'A recorded review is required before an AI-assisted note can be signed', 'Patient identifiers are removed before external processing', 'Patients can decline AI-assisted documentation']} /></Reveal>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
