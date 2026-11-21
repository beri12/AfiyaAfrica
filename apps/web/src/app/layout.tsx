import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/inter';
import '@fontsource-variable/plus-jakarta-sans';
import '@fontsource/noto-sans-ethiopic/400.css';
import '@fontsource/noto-sans-ethiopic/600.css';
import './globals.css';
import { Providers } from '@/lib/providers';
import { MotionProvider, MOTION_BOOTSTRAP } from '@/components/motion/motion-provider';

export const metadata: Metadata = {
  title: { default: 'AfyaLink AI — Smarter Healthcare. Better Connected.', template: '%s · AfyaLink AI' },
  description:
    'AfyaLink AI helps healthcare facilities manage patients, appointments, communication and administrative workflows through intelligent digital tools.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#0d2a55', width: 'device-width', initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: MOTION_BOOTSTRAP }} />
      </head>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow-lg">
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <MotionProvider />
      </body>
    </html>
  );
}
