'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ArrowRight, CalendarCheck2, CheckCircle2, FileText, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EcgLine } from '@/components/motion/ecg-line';
import { SplitHeadline } from '@/components/motion/split-headline';
import { ensureGsap, gsap, MOTION_OK, useGSAP } from '@/components/motion/gsap';
import { Container } from './blocks';

/**
 * Homepage hero. The product preview is an illustration of the interface with clearly-labelled sample data —
 * it does not present real usage figures.
 */
export function HomeHero() {
  const ref = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      ensureGsap();
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.fromTo('[data-hero-fade]', { autoAlpha: 0, y: 22 }, { autoAlpha: 1, y: 0, duration: 0.9, stagger: 0.1, delay: 0.55 })
          .fromTo('[data-preview]', { autoAlpha: 0, y: 60, rotateX: 12, scale: 0.96 }, { autoAlpha: 1, y: 0, rotateX: 0, scale: 1, duration: 1.3, ease: 'expo.out' }, 0.5)
          .fromTo('[data-float]', { autoAlpha: 0, scale: 0.85, y: 20 }, { autoAlpha: 1, scale: 1, y: 0, duration: 0.8, stagger: 0.18, ease: 'back.out(1.6)' }, 1.1)
          .fromTo('[data-bar]', { scaleY: 0 }, { scaleY: 1, duration: 0.9, stagger: 0.05, transformOrigin: 'bottom' }, 1.2);

        gsap.to('[data-float="a"]', { y: -10, duration: 3, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2 });
        gsap.to('[data-float="b"]', { y: 12, duration: 3.6, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 2.2 });

        // Scroll: preview drifts up and slightly scales as the hero leaves the viewport.
        gsap.to('[data-preview-wrap]', {
          yPercent: -8,
          scale: 0.97,
          ease: 'none',
          scrollTrigger: { trigger: ref.current, start: 'top top', end: 'bottom top', scrub: true },
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="relative overflow-hidden bg-brand-950 pb-24 pt-36 text-white sm:pt-44 lg:pb-32">
      <div className="bg-grid absolute inset-0 opacity-30 [mask-image:radial-gradient(ellipse_at_top,black,transparent_75%)]" aria-hidden />
      <div className="absolute -right-48 -top-48 size-[640px] rounded-full bg-teal-500/20 blur-3xl" aria-hidden />
      <div className="absolute -left-40 top-1/3 size-[520px] rounded-full bg-brand-500/25 blur-3xl" aria-hidden />

      <Container className="relative grid items-center gap-16 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <p data-hero-fade data-reveal className="mb-6 inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-teal-200 ring-1 ring-white/15">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal-300 opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-teal-300" />
            </span>
            Now piloting with clinics in Ethiopia
          </p>
          <SplitHeadline className="font-display text-5xl font-extrabold leading-[1.02] sm:text-6xl lg:text-7xl" delay={0.15}>
            Smarter Healthcare. <span className="text-teal-300">Better Connected.</span>
          </SplitHeadline>
          <p data-hero-fade data-reveal className="mt-7 max-w-xl text-lg leading-relaxed text-white/75">
            AfyaLink AI helps healthcare facilities manage patients, appointments, communication and administrative workflows through intelligent digital tools.
          </p>
          <div data-hero-fade data-reveal className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg" variant="inverse">
              <Link href="/register-clinic">
                Register your clinic <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outlineLight">
              <Link href="/solutions">Explore the platform</Link>
            </Button>
          </div>
          <ul data-hero-fade data-reveal className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/65">
            {['Clinician-reviewed AI', 'Tenant-isolated data', 'English & Amharic'].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-teal-300" aria-hidden /> {t}
              </li>
            ))}
          </ul>
        </div>

        <div data-preview-wrap className="relative [perspective:1200px]">
          <div data-preview data-reveal className="relative rounded-3xl border border-white/15 bg-white/[0.06] p-3 shadow-[0_40px_120px_-30px_rgb(0_0_0/0.6)] backdrop-blur-xl">
            <div className="overflow-hidden rounded-2xl bg-canvas text-ink">
              <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-red-300" />
                  <span className="size-2.5 rounded-full bg-amber-300" />
                  <span className="size-2.5 rounded-full bg-green-300" />
                </div>
                <span className="rounded-md bg-canvas px-2 py-0.5 text-[10px] font-medium text-muted">Product preview · sample data</span>
              </div>
              <div className="grid gap-3 p-4 sm:grid-cols-3">
                {[
                  { icon: Users, label: 'Registered patients', value: '1,248', tone: 'text-brand-700 bg-brand-50' },
                  { icon: CalendarCheck2, label: "Today's appointments", value: '36', tone: 'text-teal-700 bg-teal-50' },
                  { icon: FileText, label: 'Notes awaiting sign-off', value: '4', tone: 'text-amber-700 bg-amber-50' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-line bg-white p-3">
                    <span className={`inline-flex rounded-lg p-1.5 ${s.tone}`}>
                      <s.icon className="size-3.5" aria-hidden />
                    </span>
                    <p className="mt-2 font-display text-xl font-bold">{s.value}</p>
                    <p className="text-[11px] text-muted">{s.label}</p>
                  </div>
                ))}
                <div className="rounded-xl border border-line bg-white p-3 sm:col-span-3">
                  <p className="text-xs font-semibold">Appointment volume</p>
                  <div className="mt-3 flex h-24 items-end gap-1.5" aria-hidden>
                    {[38, 52, 44, 66, 58, 74, 62, 80, 70, 88, 76, 92, 84, 96].map((h, i) => (
                      <div key={i} data-bar className="flex-1 rounded-t-md bg-gradient-to-t from-brand-600 to-teal-400" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div data-float="a" data-reveal className="absolute -left-6 top-16 hidden w-60 rounded-2xl border border-line bg-white p-4 text-ink shadow-[var(--shadow-lift)] sm:block">
            <div className="flex items-center gap-2 text-xs font-semibold text-violet-700">
              <Sparkles className="size-4" aria-hidden /> AI draft ready for review
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted">Structured from the doctor&apos;s notes. Awaiting clinician sign-off.</p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-violet-100">
              <div className="h-full w-2/3 rounded-full bg-violet-500" />
            </div>
          </div>
          <div data-float="b" data-reveal className="absolute -bottom-6 -right-4 hidden w-56 rounded-2xl border border-line bg-white p-4 text-ink shadow-[var(--shadow-lift)] sm:block">
            <div className="flex items-center gap-2 text-xs font-semibold text-teal-700">
              <ShieldCheck className="size-4" aria-hidden /> Access logged
            </div>
            <p className="mt-1.5 text-xs text-muted">Every record view is recorded in the clinic&apos;s audit trail.</p>
          </div>
        </div>
      </Container>
      <EcgLine className="absolute inset-x-0 bottom-4 h-16 opacity-60" />
    </section>
  );
}
