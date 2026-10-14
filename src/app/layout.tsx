import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Serif, Inter } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});
// Réservée aux citations littérales.
const plexSerif = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-plex-serif',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-plex-mono',
});

export const metadata: Metadata = { title: { default: 'Leon', template: '%s · Leon' } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${inter.variable} ${plexSerif.variable} ${plexMono.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
