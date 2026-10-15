import type { Metadata } from 'next';
import { IBM_Plex_Mono, IBM_Plex_Serif, Inter } from 'next/font/google';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { parseTheme, THEME_CLASS, THEME_COOKIE } from '@/lib/theme-cookie';
import { cn } from '@/lib/utils';
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

// Le thème vient du cookie, lu côté serveur : la classe est dans le HTML, sans flash au chargement.
export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);
  return (
    <html
      lang="fr"
      className={cn(inter.variable, plexSerif.variable, plexMono.variable, THEME_CLASS[theme])}
    >
      <body>
        {children}
        <Toaster theme={theme} />
      </body>
    </html>
  );
}
