'use client';

import { useRef, type ReactNode } from 'react';
import { ensureGsap, gsap, MOTION_OK, useGSAP } from './gsap';

/**
 * Route-change transition. Used from a `template.tsx`, which remounts on every navigation, so each page
 * enters with a soft fade/rise. A teal progress sweep marks the transition at the top of the viewport.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useGSAP(() => {
    ensureGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      gsap.fromTo(ref.current, { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'power2.out', clearProps: 'transform' });
      gsap.fromTo(bar.current, { scaleX: 0, autoAlpha: 1 }, { scaleX: 1, duration: 0.6, ease: 'power2.inOut', transformOrigin: 'left' });
      gsap.to(bar.current, { autoAlpha: 0, duration: 0.3, delay: 0.6 });
    });
    return () => mm.revert();
  });
  return (
    <>
      <div ref={bar} className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 origin-left bg-gradient-to-r from-teal-400 to-brand-500 opacity-0" aria-hidden />
      <div ref={ref}>{children}</div>
    </>
  );
}
