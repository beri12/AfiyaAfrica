'use client';

import { SimpleShell } from '@/components/app/simple-shell';

const NAV = [
  { href: '/portal', label: 'Home' },
  { href: '/portal/appointments', label: 'Appointments' },
  { href: '/portal/records', label: 'My records' },
  { href: '/portal/consent', label: 'Privacy & consent' },
];
const allowed = (u: { memberships: { role: string }[] }) => u.memberships.some((m) => m.role === 'PATIENT');

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <SimpleShell nav={NAV} allowed={allowed} label="Patient portal">{children}</SimpleShell>;
}
