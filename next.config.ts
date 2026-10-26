import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: '12mb' } },
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

export default withNextIntl(nextConfig);
