'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/logo';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/states';

/** Top-nav shell for the patient portal and platform admin areas. */
export function SimpleShell({ nav, allowed, children, label }: { nav: { href: string; label: string }[]; allowed: (u: NonNullable<ReturnType<typeof useAuth>['user']>) => boolean; children: ReactNode; label: string }) {
  const { status, user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => {
    if (status === 'anonymous') router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (status === 'authenticated' && user && !allowed(user)) router.replace('/app');
  }, [status, user, router, pathname, allowed]);
  if (status !== 'authenticated' || !user || !allowed(user)) return <div className="flex min-h-screen items-center justify-center"><Spinner /></div>;
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Home"><Logo /></Link>
          <span className="hidden rounded-full bg-teal-50 px-2.5 py-0.5 text-xs font-semibold text-teal-700 sm:inline">{label}</span>
          <nav className="flex flex-1 gap-1 overflow-x-auto" aria-label={label}>
            {nav.map((n) => (
              <Link key={n.href} href={n.href} aria-current={pathname === n.href ? 'page' : undefined}
                className={cn('whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium', pathname === n.href ? 'bg-brand-50 text-brand-800' : 'text-muted hover:text-ink')}>{n.label}</Link>
            ))}
          </nav>
          <Button variant="ghost" size="sm" onClick={async () => { await logout(); router.replace('/sign-in'); }}><LogOut /> <span className="hidden sm:inline">Sign out</span></Button>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
