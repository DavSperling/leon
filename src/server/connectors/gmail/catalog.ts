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
  triedForReal: true,
  warning:
    'Le texte des courriers est lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. L’accès est gardé par Pipedream, hébergé aux États-Unis.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'The connection goes through Pipedream, the service that holds the access for Leon: Google asks you to authorize “Pipedream” to read, write, and send your email. Leon only reads (excluding Promotions, Social, drafts, and spam); it writes and sends nothing.',
    warning:
      'The text of emails is read, like a conversation, by you and, on the Leon website, by the managers above you. The access is held by Pipedream, hosted in the United States.',
  },
};
