import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const sans = Geist({ variable: '--font-sans', subsets: ['latin'] });

export const metadata: Metadata = { title: 'Fernleaf Kitchen', description: 'Kitchen operations admin panel' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} bg-white font-sans text-stone-900 antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
