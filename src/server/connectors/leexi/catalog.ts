import type { CatalogEntry } from '../types';

export const leexiCatalog: CatalogEntry = {
  id: 'leexi',
  fields: [
    {
      name: 'keyId',
      label: 'Identifiant de la clé',
      kind: 'secret',
      help: 'Affiché avec le secret à la création de la clé. Une clé remplacée a un nouvel identifiant : il se saisit aussi.',
    },
    {
      name: 'keySecret',
      label: 'Secret de la clé',
      kind: 'secret',
      help: 'Affiché une seule fois, à la création de la clé : copiez-le tout de suite.',
    },
  ],
  keyHelp:
    'Dans Leexi : Paramètres › Avancé › Clés API, bouton « Ajouter » (compte administrateur requis), avec la permission « Lecture des appels ».',
  docsUrl: 'https://docs.leexi.ai/fr/guides/general-settings/api-keys',
  triedForReal: false,
  warning:
    'L’API demande le plan AI Meeting au minimum. Tous les appels que la clé voit (selon ses règles d’accès) deviennent visibles de toute l’équipe dans Leon.',
  en: {
    fields: {
      keyId: {
        label: 'Key ID',
        help: 'Shown with the secret when the key is created. A replaced key has a new ID: enter it too.',
      },
      keySecret: {
        label: 'Key secret',
        help: 'Shown only once, when the key is created: copy it right away.',
      },
    },
    keyHelp:
      'In Leexi: Settings › Advanced › API keys, “Add” button (admin account required), with the “Read calls” permission.',
    warning:
      'The API requires the AI Meeting plan at minimum. All the calls the key sees (according to its access rules) become visible to the whole team in Leon.',
  },
};
