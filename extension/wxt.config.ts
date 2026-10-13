import { defineConfig } from 'wxt';
import { hostPermissionsFor, serverUrlFromEnv } from './lib/permissions';

const serverUrl = serverUrlFromEnv(process.env.WXT_PUBLIC_LEON_URL);

export default defineConfig({
  manifest: {
    name: 'Leon',
    description:
      'Capte vos conversations sur claude.ai et chatgpt.com pour la mémoire de votre équipe.',
    permissions: ['storage', 'alarms'],
    host_permissions: hostPermissionsFor(serverUrl),
    incognito: 'not_allowed',
  },
  // Le code partagé vit dans ../src/capture (décision D1).
  vite: () => ({ server: { fs: { allow: ['..'] } } }),
});
