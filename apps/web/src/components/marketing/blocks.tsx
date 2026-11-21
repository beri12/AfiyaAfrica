import Link from 'next/link';
import { ArrowRight, Check, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { DEFAULT_PLANS } from '@afyalink/shared';
import { Button } from '@/components/ui/button';
import { Reveal } from '@/components/motion/reveal';
import { SplitHeadline } from '@/components/motion/split-headline';
import { EcgLine } from '@/components/motion/ecg-line';
import { money } from '@/lib/format';
import { cn } from '@/lib/utils';

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto max-w-7xl px-4 sm:px-6 lg:px-8', className)}>{children}</div>;
}

/** Dark gradient hero used on inner marketing pages. */
export function PageHero({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-brand-950 pb-20 pt-36 text-white sm:pb-24 sm:pt-44">
      <div className="bg-grid absolute inset-0 opacity-[0.35] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" aria-hidden />
      <div className="absolute -right-40 -top-40 size-[520px] rounded-full bg-teal-500/20 blur-3xl" aria-hidden />
      <div className="absolute -left-32 bottom-0 size-[420px] rounded-full bg-brand-500/25 blur-3xl" aria-hidden />
      <Container className="relative">
        <Reveal immediate className="max-w-3xl">
          <p data-reveal className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-200 ring-1 ring-white/15">
            <span className="size-1.5 rounded-full bg-teal-300" /> {eyebrow}
          </p>
          <SplitHeadline className="text-4xl font-bold leading-[1.08] sm:text-5xl lg:text-6xl">{title}</SplitHeadline>
          <p data-reveal className="mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
            {description}
          </p>
          {children && (
            <div data-reveal className="mt-8 flex flex-wrap gap-3">
              {children}
            </div>
          )}
        </Reveal>
      </Container>
      <EcgLine className="absolute inset-x-0 bottom-6 h-14 opacity-50" />
    </section>
  );
}

export function SectionHeading({ eyebrow, title, description, align = 'center', light = false }: { eyebrow: string; title: string; description?: string; align?: 'center' | 'left'; light?: boolean }) {
  return (
    <div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
      <p data-reveal className={cn('text-sm font-semibold uppercase tracking-[0.14em]', light ? 'text-teal-300' : 'text-teal-600')}>
        {eyebrow}
      </p>
      <SplitHeadline as="h2" onScroll className={cn('mt-3 text-3xl font-bold leading-tight sm:text-4xl', light ? 'text-white' : 'text-brand-950')}>
        {title}
      </SplitHeadline>
      {description && (
        <p data-reveal className={cn('mt-4 text-lg leading-relaxed', light ? 'text-white/70' : 'text-muted')}>
          {description}
        </p>
      )}
    </div>
  );
}

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
}

export function FeatureGrid({ features, columns = 3 }: { features: Feature[]; columns?: 2 | 3 | 4 }) {
  return (
    <Reveal className={cn('grid gap-5 sm:grid-cols-2', { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3', 4: 'lg:grid-cols-4' }[columns])} stagger={0.06}>
      {features.map((f) => (
        <div
          key={f.title}
          data-reveal
          className="group relative rounded-2xl border border-line bg-white p-6 shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-brand-200 hover:shadow-[var(--shadow-lift)]"
        >
          <div className="mb-4 inline-flex rounded-xl bg-gradient-to-br from-brand-50 to-teal-50 p-2.5 text-brand-700 ring-1 ring-brand-100 transition-colors group-hover:text-teal-700">
            <f.icon className="size-5" aria-hidden />
          </div>
          <h3 className="text-base font-semibold text-ink">{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{f.description}</p>
        </div>
      ))}
    </Reveal>
  );
}

export function CheckList({ items, light = false }: { items: string[]; light?: boolean }) {
  return (
    <ul className="space-y-3">
      {items.map((i) => (
        <li key={i} data-reveal className={cn('flex gap-3 text-sm leading-relaxed', light ? 'text-white/80' : 'text-ink')}>
          <span className={cn('mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full', light ? 'bg-teal-400/20 text-teal-300' : 'bg-teal-50 text-teal-600')}>
            <Check className="size-3.5" aria-hidden />
          </span>
          {i}
        </li>
      ))}
    </ul>
  );
}

export function CtaBand({ title = 'Bring your clinic onto AfyaLink AI', description = 'Join the Ethiopia pilot programme. Register your clinic and our team will review and activate your account.' }: { title?: string; description?: string }) {
  return (
    <section className="py-20">
      <Container>
        <Reveal className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-800 via-brand-900 to-brand-950 px-6 py-14 text-center text-white shadow-[var(--shadow-lift)] sm:px-12">
          <div className="bg-grid absolute inset-0 opacity-20" aria-hidden />
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-teal-400/25 blur-3xl" aria-hidden />
          <div className="relative mx-auto max-w-2xl">
            <h2 data-reveal className="text-3xl font-bold sm:text-4xl">
              {title}
            </h2>
            <p data-reveal className="mt-4 text-lg text-white/75">
              {description}
            </p>
            <div data-reveal className="mt-8 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg" variant="inverse">
                <Link href="/register-clinic">
                  Register your clinic <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outlineLight">
                <Link href="/contact">Talk to our team</Link>
              </Button>
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

export function PricingCards() {
  return (
    <Reveal className="grid gap-6 lg:grid-cols-3" stagger={0.1}>
      {DEFAULT_PLANS.map((plan) => {
        const featured = plan.code === 'PROFESSIONAL';
        return (
          <div
            key={plan.code}
            data-reveal
            className={cn(
              'relative flex flex-col rounded-3xl border p-8 transition-transform duration-300 hover:-translate-y-1',
              featured ? 'border-brand-700 bg-brand-900 text-white shadow-[var(--shadow-lift)]' : 'border-line bg-white shadow-[var(--shadow-card)]',
            )}
          >
            {featured && (
              <span className="absolute -top-3 left-8 rounded-full bg-teal-400 px-3 py-1 text-xs font-bold text-brand-950">Most popular</span>
            )}
            <h3 className={cn('text-lg font-semibold', featured ? 'text-white' : 'text-ink')}>{plan.name}</h3>
            <p className="mt-4 flex items-baseline gap-1">
              {plan.priceIsFrom && <span className={cn('text-sm', featured ? 'text-white/70' : 'text-muted')}>from</span>}
              <span className="font-display text-4xl font-bold">{money(plan.monthlyPriceUsdCents)}</span>
              <span className={cn('text-sm', featured ? 'text-white/70' : 'text-muted')}>/month</span>
            </p>
            <p className={cn('mt-2 text-sm', featured ? 'text-white/70' : 'text-muted')}>
              {plan.maxStaff ? `Up to ${plan.maxStaff} staff · ${plan.maxPatients?.toLocaleString()} patients` : 'Unlimited staff and patients'}
            </p>
            <div className="my-6 h-px bg-current opacity-10" />
            <CheckList items={plan.features} light={featured} />
            <Button asChild className="mt-8" variant={featured ? 'inverse' : 'primary'} size="lg">
              <Link href={`/register-clinic?plan=${plan.code}`}>Start 30-day trial</Link>
            </Button>
          </div>
        );
      })}
    </Reveal>
  );
}
