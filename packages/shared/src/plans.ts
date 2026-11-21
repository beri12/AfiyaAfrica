import type { PlanCode } from './enums';

export interface PlanDefinition {
  code: PlanCode;
  name: string;
  /** Monthly price in USD cents. Enterprise is "from" pricing. */
  monthlyPriceUsdCents: number;
  priceIsFrom: boolean;
  maxStaff: number | null;
  maxPatients: number | null;
  aiEnabled: boolean;
  smsReminders: boolean;
  features: string[];
}

/** Default plan catalogue. Seeded into the `Plan` table; the DB copy is authoritative at runtime. */
export const DEFAULT_PLANS: readonly PlanDefinition[] = [
  {
    code: 'STARTER',
    name: 'Starter',
    monthlyPriceUsdCents: 2500,
    priceIsFrom: false,
    maxStaff: 5,
    maxPatients: 1000,
    aiEnabled: false,
    smsReminders: false,
    features: ['Patient registration', 'Appointment scheduling', 'In-app notifications', 'Operational dashboard'],
  },
  {
    code: 'PROFESSIONAL',
    name: 'Professional',
    monthlyPriceUsdCents: 6000,
    priceIsFrom: false,
    maxStaff: 20,
    maxPatients: 10000,
    aiEnabled: true,
    smsReminders: true,
    features: [
      'Everything in Starter',
      'Clinical documentation with versioning',
      'AI documentation drafts (clinician-reviewed)',
      'SMS & email reminders',
      'Analytics',
    ],
  },
  {
    code: 'ENTERPRISE',
    name: 'Enterprise',
    monthlyPriceUsdCents: 15000,
    priceIsFrom: true,
    maxStaff: null,
    maxPatients: null,
    aiEnabled: true,
    smsReminders: true,
    features: ['Everything in Professional', 'Laboratory workflows', 'Unlimited staff & patients', 'Priority support'],
  },
];

export const TRIAL_DAYS = 30;
