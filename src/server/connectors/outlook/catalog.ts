import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const outlookCatalog: CatalogEntry = {
  id: 'outlook',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon à accéder à tout votre courrier et à votre agenda : lire, écrire, envoyer et supprimer des courriers, gérer l’agenda, et lire les réglages de la boîte (fuseau horaire, heures de travail). Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il ne lit que la boîte de réception, les éléments envoyés et l’agenda, et n’écrit, n’envoie ni ne supprime rien. Un compte personnel (outlook.com, hotmail.fr) se branche directement. Pour un compte d’entreprise, l’administrateur Microsoft doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise : sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/auth-v2-user',
  triedForReal: false,
  warning:
    'Le texte des courriers et de l’agenda peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. Les événements personnels, privés ou confidentiels ne sont pas lus.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to allow Leon full access to your mail and calendar: read, write, send, and delete email, manage your calendar, and read your mailbox settings (time zone, working hours). Leon asks for these permissions up front so it won’t need to ask you again later; today it only reads the inbox, sent items, and calendar, and writes, sends, or deletes nothing. A personal account (outlook.com, hotmail.com) connects directly. For a work account, your company’s Microsoft admin must first have approved Leon, once for the whole company: without that, Microsoft refuses the connection.',
    warning:
      'The text of emails and of the calendar can be read, like a conversation, by you and, on the Leon website, by the managers above you. Personal, private, or confidential events are not read.',
  },
};
