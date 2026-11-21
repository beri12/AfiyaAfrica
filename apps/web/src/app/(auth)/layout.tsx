import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { Logo } from '@/components/ui/logo';
import { EcgLine } from '@/components/motion/ecg-line';
import { PageTransition } from '@/components/motion/page-transition';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <aside className="relative hidden overflow-hidden bg-brand-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="bg-grid absolute inset-0 opacity-25" aria-hidden />
        <div className="absolute -right-32 top-1/4 size-96 rounded-full bg-teal-500/25 blur-3xl" aria-hidden />
        <Link href="/" className="relative" aria-label="AfyaLink AI home"><Logo light /></Link>
        <div className="relative">
          <h2 className="font-display text-4xl font-bold leading-tight">Smarter Healthcare.<br /><span className="text-teal-300">Better Connected.</span></h2>
          <p className="mt-4 max-w-sm text-white/70">Secure, role-based access to your clinic&apos;s patients, schedules and records.</p>
          <EcgLine className="mt-10 h-16" />
        </div>
        <p className="relative flex items-center gap-2 text-xs text-white/55"><ShieldCheck className="size-4 text-teal-300" aria-hidden /> Sessions are encrypted and every record access is audited.</p>
      </aside>
      <main id="main" className="flex flex-col bg-canvas">
        <div className="flex items-center justify-between p-5 lg:hidden">
          <Link href="/"><Logo /></Link>
        </div>
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-xl"><PageTransition>{children}</PageTransition></div>
        </div>
      </main>
    </div>
  );
}
