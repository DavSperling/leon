import type { Metadata } from 'next';
import { Geist_Mono, Instrument_Serif, Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-jakarta',
});
// Les titres seulement : la voix éditoriale de Leon.
const serif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-instrument',
});
// Réservée au code, aux identifiants et à la syntaxe de recherche.
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-geist-mono',
});

export const metadata: Metadata = { title: { default: 'Leon', template: '%s · Leon' } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${serif.variable} ${geistMono.variable}`}>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
