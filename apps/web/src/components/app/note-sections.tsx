'use client';

import { NOTE_SECTION_LABELS } from '@afyalink/shared';
import type { NoteSectionsT } from '@/lib/types';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/input';

export const SECTION_KEYS = Object.keys(NOTE_SECTION_LABELS) as (keyof NoteSectionsT)[];

export function NoteSectionsEditor({ value, onChange, disabled }: { value: NoteSectionsT; onChange: (v: NoteSectionsT) => void; disabled?: boolean }) {
  return (
    <div className="space-y-4">
      {SECTION_KEYS.map((k) => (
        <Field key={k} label={NOTE_SECTION_LABELS[k]}>
          <Textarea rows={k === 'chiefComplaint' ? 2 : 4} disabled={disabled} value={value[k] ?? ''} onChange={(e) => onChange({ ...value, [k]: e.target.value })} />
        </Field>
      ))}
    </div>
  );
}

export function NoteSectionsView({ sections }: { sections: NoteSectionsT }) {
  const filled = SECTION_KEYS.filter((k) => sections[k]);
  if (!filled.length) return <p className="text-sm text-muted">This note is empty.</p>;
  return (
    <dl className="space-y-5">
      {filled.map((k) => (
        <div key={k}>
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{NOTE_SECTION_LABELS[k]}</dt>
          <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">{sections[k]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Strip empty strings so optional sections are omitted rather than sent blank. */
export function cleanSections(s: NoteSectionsT): NoteSectionsT {
  return Object.fromEntries(Object.entries(s).filter(([, v]) => typeof v === 'string' && v.trim())) as NoteSectionsT;
}
