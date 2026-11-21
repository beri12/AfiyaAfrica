import {
  Activity,
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileText,
  FlaskConical,
  LayoutDashboard,
  ListChecks,
  Settings,
  Stethoscope,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { roleHasPermission, type ClinicRole, type Permission } from '@afyalink/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown when the role has ANY of these permissions (UX only — the API enforces access). */
  anyOf: Permission[];
  roles?: ClinicRole[];
}

export const APP_NAV: NavItem[] = [
  { href: '/app/overview', label: 'Overview', icon: LayoutDashboard, anyOf: ['analytics:read'] },
  { href: '/app/workspace', label: 'My workspace', icon: Activity, anyOf: ['clinical:read'] },
  { href: '/app/patients', label: 'Patients', icon: Users, anyOf: ['patient:read'] },
  { href: '/app/appointments', label: 'Appointments', icon: CalendarDays, anyOf: ['appointment:read'] },
  { href: '/app/doctors', label: 'Doctors', icon: Stethoscope, anyOf: ['staff:read'], roles: ['CLINIC_ADMIN', 'RECEPTIONIST', 'DOCTOR'] },
  { href: '/app/staff', label: 'Staff', icon: UserCog, anyOf: ['staff:manage'] },
  { href: '/app/services', label: 'Services', icon: ClipboardList, anyOf: ['service:manage'] },
  { href: '/app/clinical', label: 'Clinical records', icon: FileText, anyOf: ['clinical:read'] },
  { href: '/app/follow-ups', label: 'Follow-ups', icon: ListChecks, anyOf: ['followup:read'] },
  { href: '/app/lab', label: 'Laboratory', icon: FlaskConical, anyOf: ['lab:read'] },
  { href: '/app/ai', label: 'AI Assistant', icon: Bot, anyOf: ['ai:admin', 'ai:clinical'] },
  { href: '/app/notifications', label: 'Notifications', icon: Bell, anyOf: ['notification:read'] },
  { href: '/app/analytics', label: 'Analytics', icon: BarChart3, anyOf: ['analytics:read'] },
  { href: '/app/billing', label: 'Billing', icon: CreditCard, anyOf: ['billing:read'] },
  { href: '/app/settings', label: 'Settings', icon: Settings, anyOf: ['clinic:read'] },
];

export function navFor(role: ClinicRole | null): NavItem[] {
  if (!role) return [];
  return APP_NAV.filter((i) => i.anyOf.some((p) => roleHasPermission(role, p)) && (!i.roles || i.roles.includes(role)));
}

export function can(role: ClinicRole | null, permission: Permission): boolean {
  return !!role && roleHasPermission(role, permission);
}
