'use client';

import { useEffect } from 'react';
import { ensureGsap, ScrollTrigger } from './gsap';

/** Registers GSAP plugins and marks the document ready so the no-JS fallback timer stands down. */
export function MotionProvider() {
  useEffect(() => {
    ensureGsap();
    document.documentElement.classList.add('motion-ready');
    const onLoad = () => ScrollTrigger.refresh();
    window.addEventListener('load', onLoad);
    return () => window.removeEventListener('load', onLoad);
  }, []);
  return null;
}

/**
 * Inline bootstrap (rendered with the CSP nonce): hides reveal targets before first paint only when motion is
 * allowed, and un-hides them if GSAP hasn't initialised within 2.5s.
 */
export const MOTION_BOOTSTRAP = `(function(){try{var d=document.documentElement;if(window.matchMedia('(prefers-reduced-motion: no-preference)').matches){d.classList.add('js-motion');setTimeout(function(){if(!d.classList.contains('motion-ready'))d.classList.remove('js-motion')},2500)}}catch(e){}})();`;
