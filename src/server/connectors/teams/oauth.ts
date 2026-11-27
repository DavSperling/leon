import { microsoftOAuth } from '../microsoft';

// Les boutons « Se connecter avec Teams » et « Se connecter avec Teams Chat » : l'appli Microsoft de Leon
// (microsoft.ts), comptes professionnels seulement (Teams n'existe pas pour un compte personnel). Tous les droits de
// Teams sont demandés d'avance (choix de David du 27/11/2026, comme pour Outlook) ; aujourd'hui Leon ne fait que lire.
// Chaque outil ne demande que les siens, et son lien d'accord de l'administrateur aussi : accepter les canaux ne donne
// pas, du même clic, les conversations privées de chacun.
//
// Droits délégués, d'après https://learn.microsoft.com/en-us/graph/permissions-reference et les tables « Permissions »
// des pages lues le 05/11/2026 (user-list-joinedteams, team-get, channel-list, channel-list-messages, chat-list,
// chat-list-messages) et le 27/11/2026 (user-list-calendarview, onlinemeeting-get, onlinemeeting-list-transcripts,
// calltranscript-get, associatedteaminfo-list, team-list-allchannels, channel-list-allmembers, chat-list-members) :
//   - Teams : Team.ReadBasic.All (les équipes de la personne, celles qui hébergent un canal partagé dont elle est
//     membre, et leur visibilité), Channel.ReadBasic.All (leurs canaux, et ceux partagés avec elles),
//     ChannelMember.Read.All (qui est dans un canal privé ou partagé, ou d'une équipe privée : ceux qui le voient dans
//     Leon ; accord de l'administrateur toujours exigé), ChannelMessage.Read.All (messages et réponses ; accord de
//     l'administrateur toujours exigé), ChannelMessage.Send (écrire dans un canal : pas encore servi).
//   - Teams Chat : Chat.ReadWrite (les conversations, leurs membres et leurs messages ; contient Chat.Read et
//     Chat.ReadBasic), ChatMessage.Send (pas encore servi) ; pour les transcriptions des réunions,
//     Calendars.ReadWrite (l'agenda, où Leon trouve les réunions Teams : le droit qu'Outlook demande déjà, déclaré
//     dans l'appli), OnlineMeetings.ReadWrite (retrouver une réunion
//     par son lien), OnlineMeetingTranscript.Read.All (ses transcriptions ; accord de l'administrateur toujours exigé),
//     OnlineMeetingRecording.Read.All et OnlineMeetingArtifact.Read.All (enregistrements et éléments de la réunion :
//     pas encore lus).
export const teamsOAuth = microsoftOAuth('teams', 'organizations', [
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMember.Read.All',
  'ChannelMessage.Read.All',
  'ChannelMessage.Send',
]);

export const teamsChatsOAuth = microsoftOAuth('teamschats', 'organizations', [
  'Chat.ReadWrite',
  'ChatMessage.Send',
  'Calendars.ReadWrite',
  'OnlineMeetings.ReadWrite',
  'OnlineMeetingTranscript.Read.All',
  'OnlineMeetingRecording.Read.All',
  'OnlineMeetingArtifact.Read.All',
]);
