import Link from 'next/link';
import { Logo } from '@/components/ui/logo';

const COLUMNS = [
  { title: 'Product', links: [['Solutions', '/solutions'], ['Pricing', '/pricing'], ['Security & privacy', '/#security'], ['API documentation', '/api/docs']] },
  { title: 'Who it serves', links: [['For clinics', '/for-clinics'], ['For doctors', '/for-doctors'], ['For patients', '/for-patients']] },
  { title: 'Company', links: [['About', '/about'], ['Contact', '/contact'], ['Privacy policy', '/privacy'], ['Terms of service', '/terms']] },
] as const;

export function SiteFooter() {
  return (
    <footer className="bg-brand-950 text-white/70">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Logo light />
            <p className="mt-4 max-w-xs text-sm leading-relaxed">
              Connecting patients, healthcare professionals, and clinics through intelligent healthcare technology. Built in and for Ethiopia.
            </p>
            <p className="mt-6 text-xs text-white/45">
              AfyaLink AI supports administrative and documentation workflows. It does not diagnose, prescribe or make treatment decisions.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h2 className="text-sm font-semibold text-white">{col.title}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="transition-colors hover:text-teal-300">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} AfyaLink AI. All rights reserved.</p>
          <p>Addis Ababa, Ethiopia · Pilot programme</p>
        </div>
      </div>
    </footer>
  );
}
