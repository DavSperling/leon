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
      help: 'Une base par ligne (20 au plus), par son identifiant : il commence par app et se trouve dans l’adresse de la base, airtable.com/appXXXXXXXXXXXXXX/… Toutes ses tables sont lues, enregistrement par enregistrement ; les pièces jointes sont ignorées. Obligatoire avec une clé collée ; avec le bouton, laissez vide pour lire toutes les bases que vous autorisez chez Airtable.',
    },
  ],
  keyHelp:
    'Sur airtable.com/create/tokens : Create new token, cochez les portées data.records:read, data.recordComments:read et schema.bases:read, ajoutez les bases à lire, puis copiez le jeton (il commence par pat).',
  oauthHelp:
    'Airtable vous demande de choisir les bases que Leon peut lire (une par une, ou tout un espace de travail), puis d’autoriser trois droits en lecture seule : voir les enregistrements, voir les commentaires et voir la structure des bases. Leon ne modifie rien. Il lit toutes les bases que vous autorisez (20 au plus), sauf si vous en nommez quelques-unes ci-dessous. L’accès se retire à tout moment dans Airtable : Account › Integrations › Third-party integrations.',
  docsUrl: 'https://airtable.com/developers/web/api/authentication',
  triedForReal: false,
};
