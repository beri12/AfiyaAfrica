import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', {
  variants: {
    tone: {
      neutral: 'bg-slate-50 text-slate-700 ring-slate-200',
      brand: 'bg-brand-50 text-brand-800 ring-brand-200',
      teal: 'bg-teal-50 text-teal-800 ring-teal-200',
      success: 'bg-success-soft text-success ring-green-200',
      warning: 'bg-warning-soft text-warning ring-amber-200',
      danger: 'bg-danger-soft text-danger ring-red-200',
      ai: 'bg-violet-50 text-violet-800 ring-violet-200',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

type Tone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;
const STATUS_TONES: Record<string, Tone> = {
  PENDING: 'warning',
  CONFIRMED: 'brand',
  COMPLETED: 'success',
  CANCELLED: 'neutral',
  NO_SHOW: 'danger',
  DRAFT: 'warning',
  IN_REVIEW: 'brand',
  SIGNED: 'success',
  AMENDED: 'teal',
  ACTIVE: 'success',
  INVITED: 'warning',
  DISABLED: 'neutral',
  INACTIVE: 'neutral',
  PENDING_APPROVAL: 'warning',
  SUSPENDED: 'danger',
  REJECTED: 'danger',
  OPEN: 'brand',
  IN_PROGRESS: 'teal',
  DONE: 'success',
  RESOLVED: 'success',
  CLOSED: 'neutral',
  ORDERED: 'brand',
  SAMPLE_COLLECTED: 'teal',
  RESULTED: 'success',
  TRIALING: 'teal',
  PAST_DUE: 'danger',
  PAID: 'success',
  URGENT: 'danger',
  HIGH: 'warning',
  NORMAL: 'neutral',
  LOW: 'neutral',
  APPROVED: 'success',
  PENDING_REVIEW: 'warning',
  RETIRED: 'neutral',
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} className={className}>
      {status.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
    </Badge>
  );
}
