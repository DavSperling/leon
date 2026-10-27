import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const trelloCatalog: CatalogEntry = {
  id: 'trello',
  fields: [
    {
      name: 'apiKey',
      label: 'Clé d’API',
      kind: 'text',
      placeholder: 'Clé de votre Power-Up',
      help: 'La clé seule ne donne accès à rien : c’est le jeton qui ouvre les tableaux.',
    },
    {
      name: 'token',
      label: 'Jeton',
      kind: 'secret',
      help: 'Ouvrez https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key= suivi de votre clé d’API, puis autorisez : la page affiche le jeton (lecture seule, sans expiration). Il donne accès à tous vos tableaux ouverts.',
    },
  ],
  keyHelp:
    'Sur trello.com/apps/admin : créez un Power-Up, générez sa clé d’API (onglet d’authentification), puis obtenez un jeton en lecture seule avec le lien indiqué sous le champ « Jeton ».',
  docsUrl: 'https://developer.atlassian.com/cloud/trello/guides/rest-api/authorization/',
  triedForReal: false,
  en: {
    fields: {
      apiKey: {
        label: 'API key',
        placeholder: 'Your Power-Up’s key',
        help: 'The key alone gives access to nothing: the token is what opens the boards.',
      },
      token: {
        label: 'Token',
        help: 'Open https://trello.com/1/authorize?expiration=never&scope=read&response_type=token&key= followed by your API key, then authorize: the page shows the token (read-only, no expiration). It gives access to all your open boards.',
      },
    },
    keyHelp:
      'At trello.com/apps/admin: create a Power-Up, generate its API key (authentication tab), then get a read-only token with the link shown under the “Token” field.',
  },
};
