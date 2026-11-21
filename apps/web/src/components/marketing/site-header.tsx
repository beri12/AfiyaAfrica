'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const MARKETING_NAV = [
  { href: '/solutions', label: 'Solutions' },
  { href: '/for-clinics', label: 'For Clinics' },
  { href: '/for-doctors', label: 'For Doctors' },
  { href: '/for-patients', label: 'For Patients' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/about', label: 'About' },
];

/** Pages whose hero is dark, so the header starts transparent with light text. */
const DARK_HERO = new Set(['/', '/solutions', '/for-clinics', '/for-doctors', '/for-patients', '/about', '/pricing']);

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const overDark = DARK_HERO.has(pathname) && !scrolled && !open;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        overDark ? 'bg-transparent' : 'border-b border-line/80 bg-white/90 shadow-[0_1px_12px_rgb(13_42_85/0.06)] backdrop-blur-md',
      )}
    >
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" aria-label="AfyaLink AI home">
          <Logo light={overDark} />
        </Link>
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          {MARKETING_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                overDark ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-muted hover:text-brand-800 hover:bg-brand-50',
                pathname === item.href && (overDark ? 'text-white' : 'text-brand-800'),
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="hidden items-center gap-2 lg:flex">
          <Button asChild variant={overDark ? 'outlineLight' : 'ghost'} size="sm">
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button asChild variant={overDark ? 'inverse' : 'primary'} size="sm">
            <Link href="/register-clinic">Register clinic</Link>
          </Button>
        </div>
        <button
          className={cn('rounded-lg p-2 lg:hidden', overDark ? 'text-white' : 'text-ink')}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
        >
          {open ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </div>
      {open && (
        <nav id="mobile-nav" className="border-t border-line bg-white px-4 pb-6 pt-2 lg:hidden" aria-label="Mobile">
          {MARKETING_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="block rounded-lg px-3 py-3 text-base font-medium text-ink hover:bg-brand-50">
              {item.label}
            </Link>
          ))}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button asChild variant="secondary">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register-clinic">Register clinic</Link>
            </Button>
          </div>
        </nav>
      )}
    </header>
  );
}
