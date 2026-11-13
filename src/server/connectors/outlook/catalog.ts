import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const outlookCatalog: CatalogEntry = {
  id: 'outlook',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon sur votre courrier et votre agenda. Leon ne lit que la boîte de réception, les éléments envoyés et l’agenda ; l’accès permet aussi d’écrire (jamais d’envoyer), Leon ne s’en sert pas encore. L’administrateur Microsoft de votre entreprise doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise : sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/auth-v2-user',
  triedForReal: false,
  warning:
    'Le texte des courriers et de l’agenda est lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. Les événements personnels, privés ou confidentiels ne sont pas lus.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to authorize Leon on your mail and calendar. Leon only reads the inbox, sent items, and calendar; the access also allows writing (never sending), but Leon doesn’t use it yet. Your company’s Microsoft admin must first have approved Leon, once for the whole company: without that, Microsoft refuses the connection.',
    warning:
      'The text of emails and of the calendar is read, like a conversation, by you and, on the Leon website, by the managers above you. Personal, private, or confidential events are not read.',
  },
};
