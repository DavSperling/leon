import type { CatalogEntry } from '../types';

// Partie publique, lue par l'interface : pas de code serveur ici.
export const teamsCatalog: CatalogEntry = {
  id: 'teams',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon à accéder à vos équipes Teams : lire les équipes, leurs canaux, leurs membres et leurs messages, et écrire dans les canaux. Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il lit les canaux de vos équipes, privés et partagés compris, et n’écrit rien. Teams se branche avec un compte d’entreprise : l’administrateur Microsoft doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise ; sans lui, Microsoft refuse la connexion.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
  triedForReal: false,
  warning:
    'Comme dans Teams, chaque canal est visible des collègues qui en sont membres, même s’ils n’ont pas branché Teams, et, sur le site de Leon, de leurs managers en remontant ; un canal standard d’une équipe publique, de toute l’équipe. Un canal partagé peut compter des personnes d’une autre entreprise : leurs messages sont lus, elles ne voient rien dans Leon. Microsoft prévient Leon de chaque nouveau message : il arrive dans Leon en quelques minutes.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to allow Leon access to your Teams teams: read the teams, their channels, their members, and their messages, and post in channels. Leon asks for these permissions up front so it won’t need to ask you again later; today it reads the channels of your teams, private and shared ones included, and posts nothing. Teams connects with a work account: your company’s Microsoft admin must first have approved Leon, once for the whole company; without that, Microsoft refuses the connection.',
    warning:
      'As in Teams, each channel is visible to the colleagues who are members of it, even if they haven’t connected Teams, and, on the Leon website, to the managers above them; a standard channel of a public team, to the whole team. A shared channel can include people from another company: their messages are read, and they see nothing in Leon. Microsoft alerts Leon to every new message: it reaches Leon within minutes.',
  },
};

export const teamsChatsCatalog: CatalogEntry = {
  id: 'teamschats',
  fields: [],
  keyHelp: '',
  keyAccepted: false,
  oauthHelp:
    'Microsoft vous demande d’autoriser Leon à accéder à vos conversations Teams (les lire et y écrire), à votre agenda, et à vos réunions Teams avec leurs transcriptions et leurs enregistrements. Leon demande ces droits d’avance pour ne pas vous redemander votre accord plus tard ; aujourd’hui, il lit vos conversations (en tête-à-tête, de groupe et de réunion) et les transcriptions des réunions Teams de votre agenda, et n’écrit rien. Teams se branche avec un compte d’entreprise : l’administrateur Microsoft doit d’abord avoir donné son accord à Leon, une fois pour toute l’entreprise ; sans lui, Microsoft refuse la connexion. Pour les transcriptions, il doit aussi en avoir ouvert l’accès aux applications.',
  docsUrl: 'https://learn.microsoft.com/en-us/graph/permissions-reference',
  triedForReal: false,
  warning:
    'Comme dans Teams, chaque conversation est visible des collègues qui y participent, même s’ils n’ont pas branché Teams Chat, et chaque transcription, des collègues invités à la réunion ; sur le site de Leon, aussi de leurs managers en remontant. Les réunions personnelles, privées ou confidentielles ne sont pas lues. Microsoft prévient Leon de chaque nouveau message et de chaque transcription d’une réunion que vous organisez : ils arrivent dans Leon en quelques minutes ; les transcriptions des réunions auxquelles on vous invite, en un jour au plus.',
  en: {
    fields: {},
    keyHelp: '',
    oauthHelp:
      'Microsoft asks you to allow Leon access to your Teams chats (read them and post in them), your calendar, and your Teams meetings with their transcripts and recordings. Leon asks for these permissions up front so it won’t need to ask you again later; today it reads your chats (one-on-one, group, and meeting chats) and the transcripts of the Teams meetings in your calendar, and posts nothing. Teams connects with a work account: your company’s Microsoft admin must first have approved Leon, once for the whole company; without that, Microsoft refuses the connection. For transcripts, the admin must also have opened their access to apps.',
    warning:
      'As in Teams, each chat is visible to the colleagues in it, even if they haven’t connected Teams Chat, and each transcript, to the colleagues invited to the meeting; on the Leon website, also to the managers above them. Personal, private, or confidential meetings are not read. Microsoft alerts Leon to every new message and every transcript of a meeting you organize: they reach Leon within minutes; transcripts of meetings you’re invited to, within a day.',
  },
};
