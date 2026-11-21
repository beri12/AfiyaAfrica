'use client';

import { useRef } from 'react';
import { Building2, ClipboardCheck, HeartPulse, Stethoscope, UserPlus, Users } from 'lucide-react';
import { ensureGsap, gsap, MOTION_OK, useGSAP } from '@/components/motion/gsap';
import { cn } from '@/lib/utils';

/** Three-node diagram (patients · professionals · clinics) whose connecting lines draw on scroll. */
export function ConnectDiagram() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      ensureGsap();
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const lines = gsap.utils.toArray<SVGPathElement>('[data-link]');
        lines.forEach((l) => {
          const len = l.getTotalLength();
          gsap.set(l, { strokeDasharray: len, strokeDashoffset: len });
        });
        const tl = gsap.timeline({ scrollTrigger: { trigger: ref.current, start: 'top 75%', once: true } });
        tl.fromTo('[data-node]', { autoAlpha: 0, scale: 0.6 }, { autoAlpha: 1, scale: 1, stagger: 0.15, duration: 0.7, ease: 'back.out(1.8)' })
          .to(lines, { strokeDashoffset: 0, duration: 1, stagger: 0.15, ease: 'power2.inOut' }, '-=0.2')
          .fromTo('[data-hub]', { autoAlpha: 0, scale: 0.5 }, { autoAlpha: 1, scale: 1, duration: 0.7, ease: 'back.out(2)' }, '-=0.5');
        gsap.to('[data-pulse]', { scale: 1.5, opacity: 0, duration: 2, repeat: -1, ease: 'power1.out', transformOrigin: 'center' });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );

  const nodes = [
    { icon: Users, label: 'Patients', sub: 'Booking, reminders, records', pos: 'left-[4%] top-[8%]' },
    { icon: Stethoscope, label: 'Health professionals', sub: 'Schedules, notes, follow-ups', pos: 'right-[4%] top-[8%]' },
    { icon: Building2, label: 'Clinics', sub: 'Operations & analytics', pos: 'left-1/2 bottom-[2%] -translate-x-1/2' },
  ];
  return (
    <div ref={ref} className="relative mx-auto aspect-[4/3] w-full max-w-xl">
      <svg viewBox="0 0 400 300" className="absolute inset-0 size-full" fill="none" aria-hidden>
        <path data-link d="M90 70 Q200 40 200 150" stroke="url(#g)" strokeWidth="2.5" strokeLinecap="round" />
        <path data-link d="M310 70 Q200 40 200 150" stroke="url(#g)" strokeWidth="2.5" strokeLinecap="round" />
        <path data-link d="M200 250 L200 150" stroke="url(#g)" strokeWidth="2.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="g" x1="0" x2="1">
            <stop stopColor="#3bbab0" />
            <stop offset="1" stopColor="#528cd2" />
          </linearGradient>
        </defs>
      </svg>
      <div data-hub data-reveal className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span data-pulse className="absolute inset-0 rounded-full bg-teal-400/40" aria-hidden />
        <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-700 to-teal-600 text-white shadow-[var(--shadow-lift)]">
          <HeartPulse className="size-8" aria-hidden />
        </div>
      </div>
      {nodes.map((n) => (
        <div key={n.label} data-node data-reveal className={cn('absolute w-40 rounded-2xl border border-line bg-white p-3.5 text-center shadow-[var(--shadow-card)]', n.pos)}>
          <span className="mx-auto mb-2 inline-flex rounded-xl bg-brand-50 p-2 text-brand-700">
            <n.icon className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-ink">{n.label}</p>
          <p className="mt-0.5 text-xs text-muted">{n.sub}</p>
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  { icon: UserPlus, title: 'Register your clinic', text: 'Submit your clinic details. Our team verifies and activates your workspace, starting with a 30-day trial.' },
  { icon: Users, title: 'Invite your team', text: 'Add doctors, receptionists and lab staff. Each gets a role-based workspace with only the access they need.' },
  { icon: ClipboardCheck, title: 'Set services & schedules', text: 'Configure services, durations and doctor availability. Booking automatically prevents double-booking.' },
  { icon: HeartPulse, title: 'Run your clinic day', text: 'Register patients, manage appointments, document visits and follow up — with real-time operational insight.' },
];

/** Vertical timeline whose progress line fills as the user scrolls through the steps. */
export function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      ensureGsap();
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo('[data-progress]', { scaleY: 0 }, {
          scaleY: 1,
          ease: 'none',
          transformOrigin: 'top',
          scrollTrigger: { trigger: ref.current, start: 'top 65%', end: 'bottom 60%', scrub: 0.6 },
        });
        gsap.utils.toArray<HTMLElement>('[data-step]').forEach((el) => {
          gsap.fromTo(el, { autoAlpha: 0, x: -24 }, { autoAlpha: 1, x: 0, duration: 0.8, scrollTrigger: { trigger: el, start: 'top 78%', once: true } });
          const dot = el.querySelector('[data-dot]');
          gsap.fromTo(dot, { backgroundColor: '#ffffff', color: '#1f56a3' }, {
            backgroundColor: '#157f79',
            color: '#ffffff',
            scrollTrigger: { trigger: el, start: 'top 62%', end: 'top 50%', scrub: true },
          });
        });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <div ref={ref} className="relative mx-auto max-w-2xl">
      <div className="absolute bottom-6 left-[22px] top-6 w-0.5 bg-line" aria-hidden />
      <div data-progress className="absolute bottom-6 left-[22px] top-6 w-0.5 origin-top bg-gradient-to-b from-teal-500 to-brand-600" aria-hidden />
      <ol className="space-y-10">
        {STEPS.map((s, i) => (
          <li key={s.title} data-step data-reveal className="relative flex gap-6">
            <span data-dot className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-teal-600 bg-white text-brand-700 shadow-sm">
              <s.icon className="size-5" aria-hidden />
            </span>
            <div className="pt-1">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-600">Step {i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
