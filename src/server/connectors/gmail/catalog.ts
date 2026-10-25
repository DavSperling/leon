import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const gmailCatalog: CatalogEntry = {
  id: 'gmail',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'La connexion passe par Pipedream, le service qui garde l’accès pour Leon : Google vous demande d’autoriser « Pipedream » à lire, écrire et envoyer vos courriers. Leon ne fait que lire (hors promotions, réseaux sociaux, brouillons et indésirables) ; il n’écrit et n’envoie rien.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: false,
  warning:
    'Le texte des courriers reste privé, comme une conversation : vous seul le voyez. L’accès est gardé par Pipedream, hébergé aux États-Unis.',
};
