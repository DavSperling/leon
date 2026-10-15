import type { CatalogEntry } from '../types';

export const claapCatalog: CatalogEntry = {
  id: 'claap',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      placeholder: 'cla_…',
      help: 'N’activez pas « Full access » sur la clé : les enregistrements privés deviendraient lisibles par toute l’équipe dans Leon.',
    },
  ],
  keyHelp:
    'Dans Claap, avec un compte administrateur : nom de l’espace › Settings › API & Webhooks › API, puis Create API key (la clé n’est affichée qu’une fois).',
  docsUrl: 'https://docs.claap.io/api-reference/overview',
  triedForReal: false,
  warning:
    'L’API de Claap est limitée à 3 000 requêtes par jour pour tout l’espace, toutes clés confondues : Leon lit au plus 100 transcriptions par passage.',
};
