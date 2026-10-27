import type { Metadata } from 'next';
import { Geist_Mono, Manrope } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { TooltipProvider } from '@/components/verre/ui/menu';
import { Toaster } from '@/components/verre/ui/toast';
import './globals.css';

// Police variable : couvre les graisses 400 à 800 de la maquette en un seul fichier.
const manrope = Manrope({ subsets: ['latin'], display: 'swap', variable: '--font-manrope' });
const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  variable: '--font-geist-mono',
});

// Posé avant le premier rendu : pas d'éclair du thème sombre quand le clair est mémorisé.
const THEME_SCRIPT = `try{var t=localStorage.getItem('leon-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;

export const metadata: Metadata = {
  title: { default: 'Leon', template: '%s · Leon' },
};

// La langue vient du cookie (src/i18n/request.ts) : le site, la connexion et l'app lisent les mêmes messages.
export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={await getLocale()}
      data-theme="dark"
      className={`${manrope.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script constant, sans donnée externe */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
