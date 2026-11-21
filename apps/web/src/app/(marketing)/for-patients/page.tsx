import type { Metadata } from 'next';
import Link from 'next/link';
import { BellRing, CalendarPlus, FileHeart, Lock, MessageCircleQuestion, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { Container, CtaBand, FeatureGrid, PageHero, SectionHeading } from '@/components/marketing/blocks';

export const metadata: Metadata = { title: 'For Patients' };

export default function ForPatientsPage() {
  return (
    <>
      <PageHero eyebrow="For patients" title="Your clinic, a little closer" description="If your clinic uses AfyaLink AI, they can invite you to the patient portal to request appointments, get reminders and see the visit summaries they share with you.">
        <Button asChild size="lg" variant="inverse"><Link href="/sign-in">Patient sign in</Link></Button>
      </PageHero>
      <section className="py-24">
        <Container>
          <Reveal><SectionHeading eyebrow="Patient portal" title="Simple, private and on your phone" /></Reveal>
          <div className="mt-14">
            <FeatureGrid features={[
              { icon: CalendarPlus, title: 'Request appointments', description: 'See available times and request a visit. The clinic confirms it for you.' },
              { icon: BellRing, title: 'Reminders', description: 'Get reminders by SMS or email — only if you agree to receive them.' },
              { icon: FileHeart, title: 'Visit summaries', description: 'Read the signed summaries your doctor chooses to share with you.' },
              { icon: ToggleRight, title: 'You control consent', description: 'Turn reminders, record access and AI-assisted documentation on or off at any time.' },
              { icon: MessageCircleQuestion, title: 'Health information', description: 'Plain-language explanations of health terms, from approved sources only.' },
              { icon: Lock, title: 'Private by default', description: 'Your information stays with your clinic and is never used to train AI models.' },
            ]} />
          </div>
          <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted">
            AfyaLink AI does not give medical advice. In an emergency, go to the nearest hospital or call an ambulance (Ethiopia: 907).
          </p>
        </Container>
      </section>
      <CtaBand title="Want your clinic on AfyaLink AI?" description="Share this page with your clinic, or ask them to contact our team." />
    </>
  );
}
