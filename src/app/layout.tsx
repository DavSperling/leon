import type { Metadata } from 'next';
import { Geist_Mono, Manrope } from 'next/font/google';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
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

const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%23aabff2'/%3E%3Cstop offset='1' stop-color='%236db4a9'/%3E%3C/linearGradient%3E%3C/defs%3E%3Ccircle cx='16' cy='16' r='16' fill='url(%23g)'/%3E%3Ctext x='16' y='21.5' text-anchor='middle' font-family='system-ui' font-weight='800' font-size='16' fill='%230b1020'%3EL%3C/text%3E%3C/svg%3E";

export const metadata: Metadata = {
  title: { default: 'Leon', template: '%s · Leon' },
  icons: { icon: ICON },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="fr"
      data-theme="dark"
      className={`${manrope.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script constant, sans donnée externe */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
