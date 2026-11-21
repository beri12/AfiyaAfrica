import type { ReactNode } from 'react';
import { Container } from './blocks';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <section className="bg-white pb-24 pt-36">
      <Container className="max-w-3xl">
        <h1 className="text-4xl font-bold text-brand-950">{title}</h1>
        <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
        <div className="mt-6 rounded-xl border border-amber-200 bg-warning-soft px-4 py-3 text-sm text-amber-900">
          Pilot draft. This document is pending review by qualified Ethiopian legal counsel and may change before general availability.
        </div>
        <div className="prose-legal mt-10 space-y-6 text-[15px] leading-relaxed text-ink [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-brand-950 [&_li]:ml-5 [&_li]:list-disc [&_li]:text-muted [&_p]:text-muted [&_ul]:space-y-1.5">
          {children}
        </div>
      </Container>
    </section>
  );
}
