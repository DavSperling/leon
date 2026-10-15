import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const basecampCatalog: CatalogEntry = {
  id: 'basecamp',
  fields: [],
  keyHelp: '',
  oauthHelp:
    'Basecamp vous demande d’autoriser Leon à accéder à votre compte. Si vous avez plusieurs comptes Basecamp, Leon prend le premier.',
  docsUrl: 'https://github.com/basecamp/bc3-api/blob/master/sections/authentication.md',
  triedForReal: false,
  keyAccepted: false,
  warning:
    'Basecamp n’a pas de droit en lecture seule : l’autorisation couvre tout votre compte, mais Leon ne fait que lire les messages, les documents et les commentaires.',
};
