import type { CatalogEntry } from '../types';

export const fathomCatalog: CatalogEntry = {
  id: 'fathom',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      help: 'La clé ne voit que les réunions enregistrées par son propriétaire ou partagées avec lui.',
    },
  ],
  keyHelp:
    'Dans Fathom : User Settings › API Access, puis générer une clé (Paramètres › Accès à l’API).',
  docsUrl: 'https://developers.fathom.ai/quickstart',
  triedForReal: false,
  warning: 'Conditions de Fathom à faire confirmer avant usage client',
};
