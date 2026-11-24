import type { UserManifest } from 'wxt';
import { hostPermissionsFor } from './permissions';

// La même pour les deux cibles. Chez Mozilla, un numéro ne sert qu'une fois : on monte d'un cran à chaque envoi.
const VERSION = '0.9.0';

// L'identifiant de Leon chez Mozilla : à confirmer par Amos avant le premier envoi, il ne change plus ensuite.
const GECKO_ID = 'leon@leonmemory.com';

// Le manifeste d'une cible de WXT (-b chrome ou -b firefox), pour un serveur Leon donné.
export function manifestFor({
  serverUrl,
  browser,
}: {
  serverUrl: string;
  browser: string;
}): UserManifest {
  const manifest: UserManifest = {
    name: 'Leon',
    // En anglais, la langue de base : le manifeste n'a pas de traduction.
    description: 'Captures your claude.ai and chatgpt.com conversations into your team’s memory.',
    version: VERSION,
    permissions: ['storage', 'alarms'],
    host_permissions: hostPermissionsFor(serverUrl),
    incognito: 'not_allowed',
  };
  if (browser !== 'firefox') return manifest;
  return {
    ...manifest,
    browser_specific_settings: {
      gecko: {
        id: GECKO_ID,
        // L'écran des données de Firefox existe depuis la 140 (le monde MAIN depuis la 128).
        strict_min_version: '140.0',
        // Firefox les montre à l'installation : c'est un texte d'accord, validé par Amos. authenticationInfo : le
        // jeton Leon de la personne part vers le serveur à chaque appel (lib/api.ts).
        data_collection_permissions: {
          required: ['personalCommunications', 'websiteContent', 'authenticationInfo'],
        },
      },
    },
  };
}
