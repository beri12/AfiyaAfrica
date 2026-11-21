import type { Metadata } from 'next';
import { Reveal } from '@/components/motion/reveal';
import { Container, CtaBand, PageHero, PricingCards } from '@/components/marketing/blocks';

export const metadata: Metadata = { title: 'Pricing' };

const FAQ = [
  ['Is there a free trial?', 'Yes. Every plan starts with a 30-day trial. Your clinic is activated after our team verifies your registration.'],
  ['How do payments work during the pilot?', 'Billing runs in sandbox mode while we finalise local payment partners. No real charges are made until a live provider is approved and announced.'],
  ['Can we change plans?', 'Yes, at any time from Billing. Downgrades are allowed when your staff and patient counts fit the new plan.'],
  ['Is AI included?', 'AI features are included in Professional and Enterprise. They require a configured AI provider and work as assistants only — clinicians review all clinical drafts.'],
  ['What does Enterprise include?', 'Unlimited staff and patients, laboratory workflows and priority support. Pricing starts at $150/month depending on size — contact us.'],
];

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="Pricing" title="Plans for every stage of your clinic" description="Clear monthly pricing in USD. Start with a 30-day trial — no commitment." />
      <section className="py-24">
        <Container><PricingCards /></Container>
      </section>
      <section className="bg-white py-24">
        <Container className="max-w-3xl">
          <h2 className="text-center text-3xl font-bold text-brand-950">Frequently asked questions</h2>
          <Reveal className="mt-10 divide-y divide-line rounded-2xl border border-line">
            {FAQ.map(([q, a]) => (
              <details key={q} data-reveal className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-semibold text-ink">
                  {q}<span className="ml-4 text-teal-600 transition-transform group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </Reveal>
        </Container>
      </section>
      <CtaBand />
    </>
  );
}
