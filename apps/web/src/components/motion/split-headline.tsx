'use client';

import { useRef, type ReactNode } from 'react';
import { ensureGsap, gsap, MOTION_OK, SplitText, useGSAP } from './gsap';
import { cn } from '@/lib/utils';

/** Headline that reveals word-by-word from behind a mask (GSAP SplitText). */
export function SplitHeadline({ children, className, as: Tag = 'h1', delay = 0.1, onScroll = false }: { children: ReactNode; className?: string; as?: 'h1' | 'h2' | 'h3'; delay?: number; onScroll?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      ensureGsap();
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        if (!ref.current) return;
        const split = SplitText.create(ref.current, { type: 'lines,words', mask: 'lines', linesClass: 'pb-[0.08em]' });
        gsap.set(ref.current, { autoAlpha: 1 });
        gsap.from(split.words, {
          yPercent: 110,
          opacity: 0,
          duration: 1,
          stagger: 0.045,
          delay,
          ease: 'expo.out',
          scrollTrigger: onScroll ? { trigger: ref.current, start: 'top 85%', once: true } : undefined,
        });
        return () => split.revert();
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} data-reveal className={cn('text-balance', className)}>
      {children}
    </Tag>
  );
}
