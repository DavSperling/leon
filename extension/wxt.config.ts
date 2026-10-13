import { defineConfig } from 'wxt';
import { hostPermissionsFor, serverUrlFromEnv } from './lib/permissions';

export default defineConfig({
  // Manifeste en fonction : WXT ne le résout qu'après avoir chargé .env.local,
  // si bien que host_permissions suit la même URL que SERVER_URL.
  manifest: () => ({
    name: 'Leon',
    description:
      'Capte vos conversations sur claude.ai et chatgpt.com pour la mémoire de votre équipe.',
    permissions: ['storage', 'alarms'],
    host_permissions: hostPermissionsFor(serverUrlFromEnv(process.env.WXT_PUBLIC_LEON_URL)),
    incognito: 'not_allowed',
  }),
  // Le code partagé vit dans ../src/capture (décision D1).
  vite: () => ({ server: { fs: { allow: ['..'] } } }),
});
