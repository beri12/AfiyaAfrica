'use client';

import { useRef, type ReactNode } from 'react';
import { ensureGsap, gsap, MOTION_OK, useGSAP } from './gsap';

/** Scrubbed vertical parallax for decorative layers. */
export function Parallax({ children, speed = 0.15, className }: { children: ReactNode; speed?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    ensureGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.to(ref.current, {
        yPercent: -100 * speed,
        ease: 'none',
        scrollTrigger: { trigger: ref.current, start: 'top bottom', end: 'bottom top', scrub: true },
      });
    });
    return () => mm.revert();
  });
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
