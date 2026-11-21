import { cn } from '@/lib/utils';

/** AfyaLink mark: a link/cross shape with a pulse line. */
export function Logo({ className, light = false, compact = false }: { className?: string; light?: boolean; compact?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 40 40" className="size-9 shrink-0" aria-hidden>
        <rect width="40" height="40" rx="11" className={light ? 'fill-white/12' : 'fill-brand-800'} />
        <path d="M16 9h8v7h7v8h-7v7h-8v-7H9v-8h7z" className={light ? 'fill-white/90' : 'fill-white'} opacity=".18" />
        <path d="M7 21h7l2.6-5.5 4.2 10 3.2-7 1.6 2.5H33" fill="none" stroke="#3bbab0" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {!compact && (
        <span className={cn('font-display text-lg font-bold tracking-tight', light ? 'text-white' : 'text-brand-900')}>
          AfyaLink<span className="text-teal-500"> AI</span>
        </span>
      )}
    </span>
  );
}
