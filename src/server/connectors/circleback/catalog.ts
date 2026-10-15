import type { CatalogEntry } from '../types';

export const circlebackCatalog: CatalogEntry = {
  id: 'circleback',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      placeholder: 'cb_…',
      help: 'Leon lit les réunions du propriétaire de la clé, pas celles qu’on lui a seulement partagées.',
    },
  ],
  keyHelp:
    'Dans Circleback : Settings › API keys, puis créer une clé (elle commence par cb_ et ne s’affiche qu’une seule fois).',
  docsUrl: 'https://circleback.ai/docs/api',
  triedForReal: false,
};
