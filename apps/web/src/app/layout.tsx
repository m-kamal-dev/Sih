import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppShell } from '@/components/features/AppShell';
import { QueryProvider } from '@/components/QueryProvider';
import { MotionProvider } from '@/components/motion/MotionProvider';
import { PREPAINT_SCRIPT } from '@/store/effects-store';

export const metadata: Metadata = {
  title: 'EvidenceGraph · AICTE application checks',
  description: 'AI reads and explains. Rules raise signals. A human officer decides. A prototype for SIH26261.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#070A14' },
    { media: '(prefers-color-scheme: light)', color: '#F5F6FB' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning data-theme="dark" data-effects="full">
      <head>
        {/* Applied pre-paint: dark theme by default, effects tier from device hints. */}
        <script dangerouslySetInnerHTML={{ __html: PREPAINT_SCRIPT }} />
      </head>
      <body>
        <QueryProvider>
          <MotionProvider>
            <AppShell>{children}</AppShell>
          </MotionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
