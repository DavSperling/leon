import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const airtableCatalog: CatalogEntry = {
  id: 'airtable',
  fields: [
    {
      name: 'token',
      label: 'Jeton d’accès personnel',
      kind: 'secret',
      placeholder: 'pat…',
      help: 'Donnez-lui seulement les portées de lecture data.records:read, data.recordComments:read et schema.bases:read, et ajoutez-y les bases à lire. Sans la deuxième portée, les commentaires ne sont pas lus.',
    },
    {
      name: 'bases',
      label: 'Bases',
      kind: 'list',
      placeholder: 'appXXXXXXXXXXXXXX',
      help: 'Une base par ligne (20 au plus), par son identifiant : il commence par app et se trouve dans l’adresse de la base, airtable.com/appXXXXXXXXXXXXXX/… Toutes ses tables sont lues, enregistrement par enregistrement ; les pièces jointes sont ignorées.',
    },
  ],
  keyHelp:
    'Sur airtable.com/create/tokens : Create new token, cochez les portées data.records:read, data.recordComments:read et schema.bases:read, ajoutez les bases à lire, puis copiez le jeton (il commence par pat).',
  oauthHelp:
    'Airtable vous fait choisir les bases que Leon peut lire. L’accès permet aussi d’y écrire ; Leon ne s’en sert pas encore.',
  docsUrl: 'https://airtable.com/developers/web/api/authentication',
  triedForReal: false,
};
