'use client';

import * as T from '@radix-ui/react-tabs';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Tabs({ tabs, defaultValue, className }: { tabs: { value: string; label: ReactNode; content: ReactNode }[]; defaultValue?: string; className?: string }) {
  return (
    <T.Root defaultValue={defaultValue ?? tabs[0]?.value} className={className}>
      <T.List className="flex gap-1 overflow-x-auto border-b border-line" aria-label="Sections">
        {tabs.map((t) => (
          <T.Trigger
            key={t.value}
            value={t.value}
            className="-mb-px whitespace-nowrap border-b-2 border-transparent px-3.5 py-2.5 text-sm font-medium text-muted transition-colors hover:text-ink data-[state=active]:border-brand-700 data-[state=active]:text-brand-800"
          >
            {t.label}
          </T.Trigger>
        ))}
      </T.List>
      {tabs.map((t) => (
        <T.Content key={t.value} value={t.value} className={cn('pt-5 focus:outline-none')}>
          {t.content}
        </T.Content>
      ))}
    </T.Root>
  );
}
