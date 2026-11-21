'use client';

import { useRef } from 'react';
import { ensureGsap, gsap, MOTION_OK, useGSAP } from './gsap';
import { cn } from '@/lib/utils';

/** Decorative heartbeat line that draws itself, then pulses a glowing dot along the trace. */
export function EcgLine({ className, color = '#3bbab0' }: { className?: string; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useGSAP(
    () => {
      ensureGsap();
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const path = ref.current?.querySelector<SVGPathElement>('[data-trace]');
        const dot = ref.current?.querySelector<SVGCircleElement>('[data-dot]');
        if (!path || !dot) return;
        const len = path.getTotalLength();
        gsap.set(path, { strokeDasharray: len, strokeDashoffset: len });
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
        tl.to(path, { strokeDashoffset: 0, duration: 2.4, ease: 'none' })
          .to({ p: 0 }, {
            p: 1,
            duration: 2.4,
            ease: 'none',
            onUpdate() {
              const pt = path.getPointAtLength((this.targets()[0] as { p: number }).p * len);
              dot.setAttribute('cx', String(pt.x));
              dot.setAttribute('cy', String(pt.y));
            },
          }, 0)
          .to(path, { opacity: 0.15, duration: 0.6 }, '>-0.1')
          .set(path, { opacity: 1, strokeDashoffset: len });
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <svg ref={ref} viewBox="0 0 600 80" className={cn('w-full', className)} fill="none" aria-hidden preserveAspectRatio="none">
      <path
        data-trace
        d="M0 50 H140 L160 50 L172 30 L184 62 L198 8 L214 72 L228 44 L240 50 H360 L378 50 L388 36 L398 58 L410 50 H600"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle data-dot r="4.5" cx="-10" cy="-10" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
    </svg>
  );
}
