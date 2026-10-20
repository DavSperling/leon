import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const shortcutCatalog: CatalogEntry = {
  id: 'shortcut',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’API',
      kind: 'secret',
      help: 'Leon ne fait que lire. Si Shortcut refuse un jeton en lecture seule pour la recherche des histoires, créez-en un avec écriture.',
    },
  ],
  keyHelp:
    'Dans Shortcut : Settings › Your Account › API Tokens, donnez un nom au jeton puis cliquez sur Generate Token. Le jeton est propre à votre compte et à cet espace de travail.',
  docsUrl: 'https://developer.shortcut.com/api/rest/v3',
  triedForReal: false,
};
