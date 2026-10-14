import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
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

export default nextConfig;
