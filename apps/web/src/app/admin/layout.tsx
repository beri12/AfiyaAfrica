'use client';

import { SimpleShell } from '@/components/app/simple-shell';

const NAV = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/clinics', label: 'Clinics' },
  { href: '/admin/content', label: 'Health content' },
  { href: '/admin/support', label: 'Support' },
];
const allowed = (u: { platformRoles: string[] }) => u.platformRoles.includes('PLATFORM_ADMIN');

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <SimpleShell nav={NAV} allowed={allowed} label="Platform admin">{children}</SimpleShell>;
}
