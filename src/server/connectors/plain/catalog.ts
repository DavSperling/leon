import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const plainCatalog: CatalogEntry = {
  id: 'plain',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'secret',
      placeholder: 'plainApiKey_…',
      help: 'La clé n’est montrée qu’une fois à sa création. Donnez-lui des droits de lecture seulement.',
    },
  ],
  keyHelp:
    'Dans Plain : Settings › Machine users, créez un utilisateur machine puis ajoutez-lui une clé d’API avec les droits de lecture des fils (thread:read), de leurs messages (timeline:read) et des clients (customer:read).',
  docsUrl: 'https://www.plain.com/docs/graphql/authentication',
  triedForReal: false,
};
