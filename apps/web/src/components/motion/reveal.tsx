'use client';

import { useRef, type ElementType, type ReactNode } from 'react';
import { ensureGsap, gsap, MOTION_OK, useGSAP } from './gsap';
import { cn } from '@/lib/utils';

interface RevealProps {
  children: ReactNode;
  className?: string;
  as?: ElementType;
  /** Stagger between `[data-reveal]` children. */
  stagger?: number;
  y?: number;
  delay?: number;
  /** Animate immediately instead of on scroll (above-the-fold content). */
  immediate?: boolean;
}

/** Fades/slides `[data-reveal]` descendants into view as the section scrolls in. */
export function Reveal({ children, className, as: Tag = 'div', stagger = 0.08, y = 28, delay = 0, immediate = false }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  useGSAP(
    () => {
      ensureGsap();
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const targets = ref.current?.querySelectorAll('[data-reveal]');
        if (!targets?.length) return;
        gsap.fromTo(
          targets,
          { autoAlpha: 0, y },
          {
            autoAlpha: 1,
            y: 0,
            stagger,
            delay,
            duration: 0.9,
            scrollTrigger: immediate ? undefined : { trigger: ref.current, start: 'top 82%', once: true },
          },
        );
      });
      return () => mm.revert();
    },
    { scope: ref },
  );
  return (
    <Tag ref={ref} className={cn(className)}>
      {children}
    </Tag>
  );
}
