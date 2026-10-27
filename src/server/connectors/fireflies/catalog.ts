import type { CatalogEntry } from '../types';

export const firefliesCatalog: CatalogEntry = {
  id: 'fireflies',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      help: 'La clé est personnelle : Leon ne lit que les réunions auxquelles son propriétaire a accès.',
    },
  ],
  keyHelp:
    'Sur fireflies.ai : Integrations (Intégrations) › Fireflies API, puis copiez la clé d’API.',
  docsUrl: 'https://docs.fireflies.ai/fundamentals/authorization',
  triedForReal: false,
  warning: 'Le plan gratuit limite l’API à 30 requêtes par minute et 500 par jour.',
  en: {
    fields: {
      apiKey: {
        label: 'API key',
        help: 'The key is personal: Leon only reads the meetings its owner has access to.',
      },
    },
    keyHelp: 'At fireflies.ai: Integrations › Fireflies API, then copy the API key.',
    warning: 'The free plan limits the API to 30 requests per minute and 500 per day.',
  },
};
