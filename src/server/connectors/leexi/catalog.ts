import type { CatalogEntry } from '../types';

export const leexiCatalog: CatalogEntry = {
  id: 'leexi',
  fields: [
    {
      name: 'keyId',
      label: 'Identifiant de la clé',
      kind: 'text',
      help: 'Affiché avec le secret à la création de la clé.',
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
};
