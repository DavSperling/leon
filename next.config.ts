import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
  // En développement, pas de badge Next : dans chaque coin il recouvre un contrôle (la ligne d'identité en bas à
  // gauche, le bouton du panneau en bas à droite, sa croix en haut). Une erreur de compilation s'affiche toujours.
  devIndicators: false,
  // Chargés depuis node_modules, pas empaquetés : officeparser trouve alors le worker de pdf.js sur le disque et
  // lit chaque PDF dans un processus à part, sous plafond de mémoire (server/documents/documents.ts).
  serverExternalPackages: ['officeparser', 'pdfjs-dist'],
  // Aucune page ne s'affiche dans un cadre : protège les boutons « Partager » et « Révoquer ».
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
        ],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

// Sans SENTRY_AUTH_TOKEN au build, aucune carte de sources n'est générée ni envoyée : le build passe, mais les piles
// de production restent illisibles (code empaqueté). Avec lui, les cartes sont envoyées puis supprimées du disque.
export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'cheron-inc',
  project: 'leon',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN, deleteSourcemapsAfterUpload: true },
  release: { name: process.env.RAILWAY_GIT_COMMIT_SHA },
  telemetry: false,
  silent: !process.env.CI,
});
