import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const teamsCatalog: CatalogEntry = {
  id: 'teams',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon à accéder à vos équipes Teams : lire les équipes, leurs canaux et leurs messages, et écrire dans les canaux. Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il ne lit que les canaux standard des équipes publiques, une fois par jour, et n’écrit rien. Teams se branche avec un compte d’entreprise : l’administrateur Microsoft doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise ; sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
  triedForReal: false,
  warning:
    'Les messages des canaux deviennent visibles de toute l’équipe. Les équipes privées, les canaux privés ou partagés et les conversations ne sont pas lus. Microsoft n’autorise qu’une lecture par jour : un message met jusqu’à un jour à arriver dans Leon.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to allow Leon access to your Teams teams: read the teams, their channels, and their messages, and post in channels. Leon asks for these permissions up front so it won’t need to ask you again later; today it only reads the standard channels of public teams, once a day, and posts nothing. Teams connects with a work account: your company’s Microsoft admin must first have approved Leon, once for the whole company; without that, Microsoft refuses the connection.',
    warning:
      'Channel messages become visible to the whole team. Private teams, private or shared channels, and chats are not read. Microsoft allows only one read a day: a message can take up to a day to reach Leon.',
  },
};

export const teamsChatsCatalog: CatalogEntry = {
  id: 'teamschats',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon à accéder à vos conversations Teams (les lire et y écrire), à votre agenda, et à vos réunions Teams avec leurs transcriptions et leurs enregistrements. Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il lit vos conversations (en tête-à-tête, de groupe et de réunion) et les transcriptions des réunions Teams de votre agenda, une fois par jour, et n’écrit rien. Teams se branche avec un compte d’entreprise : l’administrateur Microsoft doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise ; sans lui, Microsoft refuse la connexion. Pour les transcriptions, il doit aussi en avoir ouvert l’accès aux applications.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
  triedForReal: false,
  warning:
    'Le texte des conversations et des transcriptions peut être lu, comme une conversation, par vous et, sur le site de Leon, par vos managers en remontant. Les réunions personnelles, privées ou confidentielles ne sont pas lues. Microsoft n’autorise qu’une lecture par jour : un message met jusqu’à un jour à arriver dans Leon.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to allow Leon access to your Teams chats (read them and post in them), your calendar, and your Teams meetings with their transcripts and recordings. Leon asks for these permissions up front so it won’t need to ask you again later; today it reads your chats (one-on-one, group, and meeting chats) and the transcripts of the Teams meetings in your calendar, once a day, and posts nothing. Teams connects with a work account: your company’s Microsoft admin must first have approved Leon, once for the whole company; without that, Microsoft refuses the connection. For transcripts, the admin must also have opened their access to apps.',
    warning:
      'The text of chats and transcripts can be read, like a conversation, by you and, on the Leon website, by the managers above you. Personal, private, or confidential meetings are not read. Microsoft allows only one read a day: a message can take up to a day to reach Leon.',
  },
};
