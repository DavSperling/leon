import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { MotionProvider } from '@/components/verre/motion-provider';
import { RouteTransition } from '@/components/verre/shell/route-transition';
import { TooltipProvider } from '@/components/verre/ui/menu';
import { Toaster } from '@/components/verre/ui/toast';
import './globals.css';

// Les polices sont dans le dépôt (src/app/fonts, licence SIL OFL 1.1) : next/font/google les téléchargeait à chaque
// build, et Google renvoyait parfois une adresse sans extension qui faisait échouer le build. Mêmes fichiers (latin).

// L'interface : trois graisses, 400, 500 et 600. Une graisse plus forte oubliée dans un composant se verra.
const schibsted = localFont({
  src: './fonts/schibsted-grotesk-latin.woff2',
  weight: '400 600',
  display: 'swap',
  variable: '--font-schibsted',
});
// Seulement pour les mots d'un document d'origine (OriginalSheet, src/components/verre/ui/original-sheet.tsx).
// Pas préchargée : elle n'est téléchargée que par la page qui l'écrit, pas par toutes.
const stix = localFont({
  src: [
    { path: './fonts/stix-two-text-latin.woff2', weight: '400', style: 'normal' },
    { path: './fonts/stix-two-text-italic-latin.woff2', weight: '400', style: 'italic' },
  ],
  display: 'swap',
  preload: false,
  variable: '--font-stix',
  adjustFontFallback: 'Times New Roman',
});
// Seulement pour du vrai code (commande, jeton, adresse). Sans police de repli calquée sur Arial : en attendant
// Geist Mono, du code s'écrit dans le mono du système (--mono, globals.css), jamais en sans.
const geistMono = localFont({
  src: './fonts/geist-mono-latin.woff2',
  weight: '400 500',
  display: 'swap',
  preload: false, // comme STIX : téléchargée par la page qui écrit du code
  variable: '--font-geist-mono',
  adjustFontFallback: false,
});
// Seulement pour le mot « Leon » du logo (src/components/verre/shell/brand.tsx).
const inter = localFont({
  src: './fonts/inter-500-latin.woff2',
  weight: '500',
  display: 'swap',
  variable: '--font-inter',
});

// Posé avant le premier rendu : un choix mémorisé l'emporte, sinon clair, quoi que dise le système (pas d'éclair du
// mauvais thème) ; et les animations restent coupées si la personne les a arrêtées (src/lib/verre/instant.ts).
const THEME_SCRIPT = `try{var d=document.documentElement;d.dataset.theme=localStorage.getItem('leon-theme')==='dark'?'dark':'light';if(localStorage.getItem('leon-motion')==='off')d.dataset.motion='off';else if((location.pathname==='/'||location.pathname==='/accueil')&&!matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('js-motion')}catch(e){}`;

export const metadata: Metadata = {
  title: { default: 'Leon', template: '%s · Leon' },
};

// La langue vient du cookie (src/i18n/request.ts) : le site, la connexion et l'app lisent les mêmes messages.
export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang={await getLocale()}
      data-theme="light"
      className={`${schibsted.variable} ${stix.variable} ${geistMono.variable} ${inter.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script constant, sans donnée externe */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        <NextIntlClientProvider>
          <MotionProvider>
            <TooltipProvider>
              {children}
              <RouteTransition />
              <Toaster />
            </TooltipProvider>
          </MotionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
