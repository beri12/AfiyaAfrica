import type { Metadata } from 'next';
import { Compass, HeartHandshake, Scale, ShieldCheck } from 'lucide-react';
import { Reveal } from '@/components/motion/reveal';
import { Container, CtaBand, FeatureGrid, PageHero, SectionHeading } from '@/components/marketing/blocks';

export const metadata: Metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About AfyaLink AI" title="Connecting patients, professionals and clinics" description="'Afya' means health in Swahili. We are building practical healthcare technology for Ethiopia first, then East Africa and beyond." />
      <section className="py-24">
        <Container className="grid gap-14 lg:grid-cols-2">
          <Reveal><SectionHeading align="left" eyebrow="Our mission" title="Make every clinic visit better organised" /></Reveal>
          <Reveal className="space-y-5 text-base leading-relaxed text-muted">
            <p data-reveal>Private clinics are a backbone of healthcare in Ethiopia, yet many still depend on paper registers and phone calls. That costs clinicians time and patients continuity.</p>
            <p data-reveal>AfyaLink AI gives clinics modern, secure operational tools — scheduling, records, follow-ups and analytics — and uses AI carefully, to reduce administrative work while leaving every clinical decision with qualified professionals.</p>
            <p data-reveal>We are currently running a controlled pilot with selected clinics. We share what we learn openly and do not make claims about clinical outcomes we have not measured.</p>
          </Reveal>
        </Container>
      </section>
      <section className="bg-white py-24">
        <Container>
          <Reveal><SectionHeading eyebrow="Our principles" title="What guides how we build" /></Reveal>
          <div className="mt-14">
            <FeatureGrid columns={4} features={[
              { icon: HeartHandshake, title: 'Clinicians decide', description: 'Technology supports professional judgement — it never replaces it.' },
              { icon: ShieldCheck, title: 'Privacy first', description: 'Collect only what is needed, protect it rigorously, and respect consent.' },
              { icon: Scale, title: 'Honest claims', description: 'No unsupported promises about accuracy or health outcomes.' },
              { icon: Compass, title: 'Local by design', description: 'Built around Ethiopian clinics, languages, phone formats and time.' },
            ]} />
          </div>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
