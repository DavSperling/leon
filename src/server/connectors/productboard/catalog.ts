import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const productboardCatalog: CatalogEntry = {
  id: 'productboard',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Productboard vous demande d’autoriser Leon à lire les notes de votre espace. Leon ne demande que la lecture. Seul un Maker administrateur peut accepter, et l’accès à l’API demande un plan Pro ou supérieur.',
  docsUrl: 'https://developer.productboard.com/reference/oauth-authorization-code',
  triedForReal: false,
  warning: 'Seul un Maker administrateur peut autoriser Leon.',
};
