import { defineConfig } from 'wxt';
import { hostPermissionsFor, serverUrlFromEnv } from './lib/permissions';

export default defineConfig({
  // Manifeste en fonction : WXT ne le résout qu'après avoir chargé .env.local,
  // si bien que host_permissions suit la même URL que SERVER_URL.
  manifest: () => ({
    name: 'Leon',
    // En anglais, la langue de base : le manifeste n'a pas de traduction.
    description: 'Captures your claude.ai and chatgpt.com conversations into your team’s memory.',
    permissions: ['storage', 'alarms'],
    host_permissions: hostPermissionsFor(serverUrlFromEnv(process.env.WXT_PUBLIC_LEON_URL)),
    incognito: 'not_allowed',
  }),
  // Le code partagé vit dans ../src/capture (décision D1).
  vite: () => ({ server: { fs: { allow: ['..'] } } }),
});
