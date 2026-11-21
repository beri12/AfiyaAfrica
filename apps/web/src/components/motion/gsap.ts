'use client';

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import { useGSAP } from '@gsap/react';

let registered = false;
export function ensureGsap(): typeof gsap {
  if (!registered && typeof window !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger, SplitText, useGSAP);
    gsap.defaults({ ease: 'power3.out', duration: 0.8 });
    registered = true;
  }
  return gsap;
}

export const MOTION_OK = '(prefers-reduced-motion: no-preference)';
export { gsap, ScrollTrigger, SplitText, useGSAP };
