import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const gmailCatalog: CatalogEntry = {
  id: 'gmail',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'La connexion passe par Pipedream, le service qui garde l’accès pour Leon : Google vous demande d’autoriser « Pipedream » à lire, écrire et envoyer vos courriers. Leon lit vos courriers (hors promotions, réseaux sociaux, brouillons et indésirables) et n’envoie rien. Il n’écrit dans votre boîte qu’après votre oui à l’agent « Brouillons de réponse » : un brouillon de réponse, jamais envoyé.',
  docsUrl: 'https://support.google.com/accounts/answer/3466521',
  triedForReal: true,
  warning:
    'Le texte des courriers peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. L’accès est gardé par Pipedream, hébergé aux États-Unis.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'The connection goes through Pipedream, the service that holds the access for Leon: Google asks you to authorize “Pipedream” to read, write, and send your email. Leon reads your email (excluding Promotions, Social, drafts, and spam) and sends nothing. It writes to your mailbox only after you say yes to the “Reply drafts” agent: a reply draft, never sent.',
    warning:
      'The text of emails can be read, like a conversation, by you and, on the Leon website, by the managers above you. The access is held by Pipedream, hosted in the United States.',
  },
};
