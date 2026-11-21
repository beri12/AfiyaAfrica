import type { Metadata } from 'next';
import { Mail, MapPin, MessageSquareText } from 'lucide-react';
import { Container } from '@/components/marketing/blocks';
import { Reveal } from '@/components/motion/reveal';
import { ContactForm } from './contact-form';

export const metadata: Metadata = { title: 'Contact' };

export default function ContactPage() {
  return (
    <section className="bg-canvas pb-24 pt-36">
      <Container className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
        <Reveal immediate>
          <p data-reveal className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-600">Contact</p>
          <h1 data-reveal className="mt-3 text-4xl font-bold text-brand-950 sm:text-5xl">Let&apos;s talk about your clinic</h1>
          <p data-reveal className="mt-5 text-lg text-muted">Interested in the pilot, a demo or partnership? Send us a message and our team will get back to you.</p>
          <ul className="mt-10 space-y-5">
            {[
              [MapPin, 'Addis Ababa, Ethiopia'],
              [Mail, 'Replies by email within two working days'],
              [MessageSquareText, 'Please do not include patient information in this form'],
            ].map(([Icon, text]) => {
              const I = Icon as typeof MapPin;
              return (
                <li key={text as string} data-reveal className="flex items-center gap-3 text-sm text-ink">
                  <span className="rounded-xl bg-white p-2.5 text-brand-700 shadow-[var(--shadow-card)]"><I className="size-4" aria-hidden /></span>
                  {text as string}
                </li>
              );
            })}
          </ul>
        </Reveal>
        <ContactForm />
      </Container>
    </section>
  );
}
