import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageHeader({ title, description, actions, className }: { title: string; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-[1.65rem]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon: Icon, hint, tone = 'brand', loading }: { label: string; value: ReactNode; icon: LucideIcon; hint?: string; tone?: 'brand' | 'teal' | 'warning' | 'success'; loading?: boolean }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-700',
    teal: 'bg-teal-50 text-teal-700',
    warning: 'bg-warning-soft text-warning',
    success: 'bg-success-soft text-success',
  };
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-white p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className={cn('rounded-xl p-2', tones[tone])}>
          <Icon className="size-4" aria-hidden />
        </span>
      </div>
      <p className="mt-3 font-display text-3xl font-bold tabular-nums text-ink">{loading ? <span className="inline-block h-8 w-16 animate-pulse-soft rounded bg-slate-200" /> : value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Pagination({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between border-t border-line px-5 py-3 text-sm" aria-label="Pagination">
      <span className="text-muted">
        Page {page} of {totalPages}
      </span>
      <div className="flex gap-2">
        <button className="rounded-lg px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="rounded-lg px-3 py-1.5 font-medium text-brand-700 hover:bg-brand-50 disabled:opacity-40" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </nav>
  );
}
