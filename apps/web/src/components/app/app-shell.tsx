'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import { useQuery } from '@tanstack/react-query';
import { Bell, Building2, ChevronsUpDown, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { navFor } from '@/lib/nav';
import { apiPage } from '@/lib/api';
import { humanize, initials } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/ui/logo';
import { Alert, Spinner } from '@/components/ui/states';

function UserMenu() {
  const { user, logout } = useAuth();
  const router = useRouter();
  if (!user) return null;
  return (
    <DM.Root>
      <DM.Trigger className="flex items-center gap-2 rounded-xl p-1 pr-2 hover:bg-canvas" aria-label="Account menu">
        <span className="flex size-8 items-center justify-center rounded-full bg-brand-700 text-xs font-bold text-white">{initials(user.firstName, user.lastName)}</span>
        <span className="hidden text-sm font-medium text-ink sm:block">{user.firstName}</span>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content align="end" sideOffset={8} className="z-50 min-w-56 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold">{user.firstName} {user.lastName}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
          </div>
          <DM.Separator className="my-1 h-px bg-line" />
          <DM.Item onSelect={() => router.push('/app/settings?tab=security')} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-brand-50">
            <ShieldCheck className="size-4" /> Security settings
          </DM.Item>
          <DM.Item onSelect={async () => { await logout(); router.replace('/sign-in'); }} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-danger-soft">
            <LogOut className="size-4" /> Sign out
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function ClinicSwitcher() {
  const { user, membership, selectClinic } = useAuth();
  const staff = user?.memberships.filter((m) => m.role !== 'PATIENT') ?? [];
  if (!membership) return null;
  return (
    <DM.Root>
      <DM.Trigger className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left hover:bg-white/10" disabled={staff.length < 2}>
        <Building2 className="size-4 shrink-0 text-teal-300" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{membership.clinicName}</span>
          <span className="block text-xs text-white/55">{humanize(membership.role)}</span>
        </span>
        {staff.length > 1 && <ChevronsUpDown className="size-4 text-white/50" aria-hidden />}
      </DM.Trigger>
      <DM.Portal>
        <DM.Content sideOffset={6} className="z-50 min-w-60 rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
          {staff.map((m) => (
            <DM.Item key={m.clinicId} onSelect={() => selectClinic(m.clinicId)} className="cursor-pointer rounded-lg px-3 py-2 text-sm outline-none data-[highlighted]:bg-brand-50">
              <p className="font-medium">{m.clinicName}</p>
              <p className="text-xs text-muted">{humanize(m.role)}</p>
            </DM.Item>
          ))}
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

function NotificationBell() {
  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => fetchUnread(),
    refetchInterval: 60_000,
  });
  return (
    <Link href="/app/notifications" className="relative rounded-xl p-2 text-muted hover:bg-canvas hover:text-ink" aria-label={`Notifications${data ? `, ${data} unread` : ''}`}>
      <Bell className="size-5" />
      {!!data && <span className="absolute right-1 top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{data > 9 ? '9+' : data}</span>}
    </Link>
  );
}

async function fetchUnread(): Promise<number> {
  const r = await apiPage<unknown>('/notifications?pageSize=1&unreadOnly=true', { clinic: null });
  return r.meta.unread ?? 0;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { status, user, role, membership } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === 'anonymous') router.replace(`/sign-in?next=${encodeURIComponent(pathname)}`);
    else if (status === 'authenticated' && user && !membership) router.replace(user.platformRoles.includes('PLATFORM_ADMIN') ? '/admin' : '/portal');
  }, [status, user, membership, router, pathname]);
  useEffect(() => setMobileOpen(false), [pathname]);

  if (status !== 'authenticated' || !membership) return <div className="flex min-h-screen items-center justify-center"><Spinner label="Loading your workspace" /></div>;

  const nav = navFor(role);
  const allowed = pathname === '/app' || nav.some((i) => pathname.startsWith(i.href)) || pathname.startsWith('/app/settings');

  const sidebar = (
    <div className="flex h-full flex-col bg-brand-950 px-4 py-5">
      <Link href="/" className="mb-6 px-2"><Logo light /></Link>
      <ClinicSwitcher />
      <nav className="mt-6 flex-1 space-y-0.5 overflow-y-auto" aria-label="App">
        {nav.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined}
              className={cn('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all', active ? 'bg-white text-brand-900 shadow-sm' : 'text-white/70 hover:bg-white/8 hover:text-white')}>
              <item.icon className={cn('size-4.5 shrink-0', active ? 'text-teal-600' : 'text-white/50 group-hover:text-teal-300')} aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p className="mt-4 px-2 text-[11px] leading-snug text-white/40">AfyaLink AI supports — never replaces — clinical judgement.</p>
    </div>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 lg:block">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-brand-950/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72">{sidebar}</div>
          <button className="absolute right-4 top-4 rounded-lg bg-white p-2" onClick={() => setMobileOpen(false)} aria-label="Close navigation"><X className="size-5" /></button>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-white/90 px-4 backdrop-blur sm:px-6">
        <button className="rounded-lg p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></button>
        <p className="hidden text-sm text-muted lg:block">{membership.clinicName}</p>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <UserMenu />
        </div>
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {membership.clinicStatus === 'PENDING_APPROVAL' && (
          <Alert tone="warning" title="Clinic awaiting approval" className="mb-6">
            Your registration is being reviewed. You can review settings and billing; patient and appointment features unlock once approved.
          </Alert>
        )}
        {allowed ? children : <Alert tone="danger" title="No access">Your role ({humanize(role ?? '')}) cannot open this page.</Alert>}
      </main>
    </div>
  );
}
