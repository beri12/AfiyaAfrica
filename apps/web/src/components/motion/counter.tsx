'use client';

import { useRef } from 'react';
import { ensureGsap, gsap, MOTION_OK, useGSAP } from './gsap';

/** Counts up to `value` when scrolled into view. Renders the final value without JS/motion. */
export function Counter({ value, suffix = '', prefix = '', decimals = 0 }: { value: number; suffix?: string; prefix?: string; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number) => `${prefix}${n.toFixed(decimals)}${suffix}`;
  useGSAP(() => {
    ensureGsap();
    const mm = gsap.matchMedia();
    mm.add(MOTION_OK, () => {
      const obj = { n: 0 };
      gsap.to(obj, {
        n: value,
        duration: 1.6,
        ease: 'power2.out',
        scrollTrigger: { trigger: ref.current, start: 'top 90%', once: true },
        onUpdate: () => {
          if (ref.current) ref.current.textContent = format(obj.n);
        },
      });
    });
    return () => mm.revert();
  });
  return (
    <span ref={ref} className="tabular-nums">
      {format(value)}
    </span>
  );
}
