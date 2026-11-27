import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp } from '../http';
import type { Connector, ConnectorItem } from '../types';
import { type TeamsClient, teamsClient } from './client';
import { DAY, daily, gone, type Place, type Reader } from './daily';
import { changedAt, chatDays, deletedTurns, threadItem, transcriptItem } from './map';
import { teamsChatsOAuth, teamsOAuth } from './oauth';
import type { Event, Root } from './schemas';

// Deux outils, parce que la règle de visibilité de Leon se fixe par outil (`privateRaw`) : « Teams », les canaux
// d'équipe, visibles de toute l'équipe Leon ; « Teams Chat », les conversations privées de la personne et les
// transcriptions de ses réunions, privées à qui branche, comme Outlook. Doc lue le 05/11/2026 :
//   https://learn.microsoft.com/en-us/graph/api/user-list-joinedteams (seuls id, displayName… sont remplis : la
//     visibilité de l'équipe se lit par https://learn.microsoft.com/en-us/graph/api/team-get)
//   https://learn.microsoft.com/en-us/graph/api/channel-list (« les membres ne voient pas les canaux privés ou partagés
//     dont ils ne sont pas membres » ; membershipType standard, private, shared)
//   https://learn.microsoft.com/en-us/graph/api/channel-list-messages (messages sans leurs réponses ; $top ≤ 50 ;
//     $expand=replies ; « triés par la date de dernière modification de tout le fil » ; aucun autre paramètre)
//   https://learn.microsoft.com/en-us/graph/api/chatmessage-list-replies (les réponses suivantes, $top ≤ 50)
//   https://learn.microsoft.com/en-us/graph/api/chat-list et .../chat-list-messages ($orderby et $filter sur
//     lastModifiedDateTime, gt ou lt, ensemble seulement ; $top ≤ 50)
//   https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview (une interrogation par jour : daily.ts)
//   https://learn.microsoft.com/en-us/graph/throttling-limits (messages : 1 requête par seconde par canal ou
//     conversation, 20 par seconde par appli et par client ; d'où MIN_INTERVAL_MS)
//   Conditions des API Microsoft, § 5(b) : refléter les suppressions faites chez Microsoft.
// Et le 27/11/2026, pour les transcriptions :
//   https://learn.microsoft.com/en-us/graph/api/onlinemeeting-list-transcripts (/me/onlineMeetings/{id}/transcripts,
//     OnlineMeetingTranscript.Read.All en délégué, comptes personnels exclus ; 403 GraphAccessToTranscriptsDisabled
//     quand l'administrateur n'a pas ouvert les transcriptions à Graph ; seulement une réunion liée à un événement de
//     l'agenda, et pas encore expirée)
//   https://learn.microsoft.com/en-us/graph/api/calltranscript-get (…/transcripts/{id}/content : text/vtt avec le nom
//     de qui parle ; « aussi pour les invités de la réunion » ; 403 SpeakerAttributionNotAllowed quand
//     l'administrateur a retiré les noms : « réessayer avec Accept application/vnd.microsoft.graph.transcript+text »)
//   https://learn.microsoft.com/en-us/graph/api/onlinemeeting-get (/me/onlineMeetings?$filter=JoinWebUrl eq '…', lien
//     encodé ; une liste d'une réunion)
//   https://learn.microsoft.com/en-us/graph/api/resources/event (isOnlineMeeting, onlineMeeting.joinUrl,
//     onlineMeetingProvider « teamsForBusiness »)
//
// Écarts à la demande, d'après la doc :
//   - Pas de lecture en delta. La page de Graph sur le delta des messages de canal a été supprimée en 09/2024 (il ne
//     reste que celui de chats/getAllMessages, en droits d'application seulement) ; aucun delta n'existe pour une
//     conversation en droits délégués. Les canaux se lisent par la liste, triée du fil le plus récemment animé au
//     moins récent, jusqu'au premier fil inchangé ; les conversations par le filtre sur lastModifiedDateTime.
//   - Seuls les canaux standard des équipes publiques sont lus. Le contenu des canaux devient visible de toute
//     l'équipe Leon : une équipe privée, un canal privé ou partagé (où peuvent se trouver des personnes d'une autre
//     entreprise) ne sont lisibles chez Microsoft que de leurs membres, et ne sont pas relevés.
//   - Une fois par jour et par lieu au plus (daily.ts) : plus souvent, il faudrait des abonnements de Graph, qui
//     demandent une adresse publique en https pour les recevoir.
//   - Les transcriptions : getAllTranscripts (toutes les réunions d'un coup) n'existe qu'en droits d'application, et
//     Leon agit toujours au nom de la personne. Les réunions se trouvent donc dans l'agenda, par le lien Teams de
//     chaque événement, une fois par jour comme un lieu de plus ; une réunion personnelle, privée ou confidentielle
//     n'est pas lue, comme dans Outlook.
//
// Non vérifié (aucun annuaire Microsoft réel) : le sens du tri des messages de canal (l'exemple de la doc est du plus
// récent au moins récent) ; la forme d'un message supprimé (deletedDateTime rempli, corps vide) dans la liste d'un
// canal et dans le filtre d'une conversation ; que /teams/{id} rende `visibility` avec Team.ReadBasic.All ; que
// $expand=members passe sur /me/chats ; la forme exacte de la réponse au filtre JoinWebUrl (la doc dit une liste, un
// de ses exemples montre un objet seul) ; qu'un invité qui n'organise pas la réunion retrouve la réunion par son
// lien ; le format sans nom des transcriptions (gardé d'un bloc s'il n'est pas en WebVTT).
// shortcut: un fil de canal supprimé en entier, ou une conversation quittée, restent dans Leon ; une équipe devenue
// privée garde visible ce qui a été lu avant. Les retirer demande de comparer la liste du jour à celle de la veille.

const ConfigSchema = z.object({
  authMode: z.literal('oauth'),
  accessToken: z.string().min(1),
  refreshToken: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});
type Config = z.infer<typeof ConfigSchema>;

const MIN_INTERVAL_MS = 100;

async function verify(config: Config, http: ConnectorHttp) {
  const me = await teamsClient(config, http).me();
  const address = me.mail || me.userPrincipalName;
  const key = me.id ? { accountKey: me.id } : {};
  if (me.displayName)
    return { account: address ? `${me.displayName} (${address})` : me.displayName, ...key };
  return { account: address || 'Teams account', ...key };
}

// Les canaux standard des équipes publiques de la personne.
async function channelPlaces(client: TeamsClient): Promise<Place[]> {
  const places: Place[] = [];
  for (const team of await client.teams()) {
    if ((await client.visibility(team.id)) !== 'public') continue;
    for (const channel of await client.channels(team.id)) {
      if (channel.membershipType !== 'standard') continue;
      const name = channel.displayName ?? '';
      const origin = { team: team.displayName ?? '', channel: name };
      places.push({ key: channel.id, parent: team.id, name, origin });
    }
  }
  return places;
}

// Les réponses au-delà de la première page dépliée.
async function repliesOf(client: TeamsClient, root: Root) {
  const replies = [...(root.replies ?? [])];
  for (let link = root['replies@odata.nextLink']; link; ) {
    const page = await client.replies(link);
    replies.push(...page.value);
    link = page['@odata.nextLink'];
  }
  return replies;
}

// Les fils d'un canal changés depuis `after` : la liste va du plus récemment animé au moins récent, elle s'arrête au
// premier fil plus ancien. La page dépliée porte les réponses les plus récentes : elle suffit à dater le fil.
const threads = (client: TeamsClient): Reader =>
  async function* (place, link, after) {
    let next = link;
    do {
      const page = await client.roots(next, place.parent ?? '', place.key);
      const items: ConnectorItem[] = [];
      const removedTurns: string[] = [];
      let older = false;
      for (const root of page.value) {
        const seen = [root, ...(root.replies ?? [])];
        if (Math.max(...seen.map(changedAt)) < after.getTime()) {
          older = true;
          break;
        }
        const replies = await repliesOf(client, root);
        const item = threadItem(place, root, replies);
        if (item) items.push(item);
        removedTurns.push(...deletedTurns(place.key, [root, ...replies]));
      }
      next = older ? null : (page['@odata.nextLink'] ?? null);
      yield { items, removedTurns, next };
    } while (next);
  };

// Les réunions de l'agenda : un lieu de plus, à côté des conversations, lu une fois par jour comme elles. Aucune
// conversation n'a cette clé (les leurs commencent par « 19: »).
const MEETINGS: Place = { key: 'reunions', parent: null, name: 'Réunions Teams', origin: {} };

const chatPlaces = async (client: TeamsClient): Promise<Place[]> => [
  ...(await client.chats()).map((chat) => {
    const members = (chat.members ?? []).flatMap((member) => member.displayName || []);
    const name = chat.topic?.trim() || members.join(', ') || 'Conversation Teams';
    return { key: chat.id, parent: null, name, origin: { chat: name } };
  }),
  MEETINGS,
];

const chatPages = (client: TeamsClient): Reader =>
  async function* (place, link, after) {
    let next = link;
    do {
      const page = await client.chatMessages(next, place.key, after);
      next = page['@odata.nextLink'] ?? null;
      const removedTurns = deletedTurns(place.key, page.value);
      yield { items: chatDays(place, page.value), removedTurns, next };
    } while (next);
  };

// Le texte d'une transcription en WebVTT, avec le nom de qui parle ; sans le nom quand l'administrateur l'a retiré
// (403 SpeakerAttributionNotAllowed, que le client ne distingue pas d'un autre refus : un second refus passe la
// réunion).
const UNATTRIBUTED = 'application/vnd.microsoft.graph.transcript+text';
async function transcriptText(client: TeamsClient, meetingId: string, id: string) {
  try {
    return await client.transcript(meetingId, id, 'text/vtt');
  } catch (error) {
    if (!(error instanceof ConnectorAuthError && error.status === 403)) throw error;
    return client.transcript(meetingId, id, UNATTRIBUTED);
  }
}

// Les transcriptions d'une réunion faites depuis `start`. Une réunion fermée à la personne, expirée, ou dont
// l'administrateur n'a pas ouvert les transcriptions à Graph (403), est passée : les autres sont lues.
async function transcriptsOf(client: TeamsClient, event: Event, joinUrl: string, start: Date) {
  const items: ConnectorItem[] = [];
  try {
    const meetingId = await client.meetingId(joinUrl);
    if (meetingId === null) return items;
    for (const transcript of await client.transcripts(meetingId)) {
      // Une série garde les transcriptions de toutes ses occurrences : les plus anciennes sont déjà lues.
      if (Date.parse(transcript.createdDateTime) < start.getTime()) continue;
      const content = await transcriptText(client, meetingId, transcript.id);
      const item = transcriptItem(event, transcript, content);
      if (item) items.push(item);
    }
  } catch (error) {
    if (!gone(error)) throw error;
  }
  return items;
}

const isTeamsMeeting = (event: Event) =>
  event.isCancelled !== true &&
  event.onlineMeetingProvider === 'teamsForBusiness' &&
  (event.sensitivity ?? 'normal') === 'normal';

// Les réunions Teams de l'agenda depuis la lecture de la veille, moins un jour : une transcription prête après le
// passage du jour est lue le lendemain. Les occurrences d'une série partagent un lien : il est lu une fois.
const meetingPages = (client: TeamsClient): Reader =>
  async function* (_place, link, after) {
    const start = new Date(after.getTime() - DAY);
    const read = new Set<string>();
    let next = link;
    do {
      const page = await client.events(next, start, new Date());
      const items: ConnectorItem[] = [];
      for (const event of page.value) {
        const joinUrl = event.onlineMeeting?.joinUrl;
        if (!joinUrl || read.has(joinUrl) || !isTeamsMeeting(event)) continue;
        read.add(joinUrl);
        items.push(...(await transcriptsOf(client, event, joinUrl, start)));
      }
      next = page['@odata.nextLink'] ?? null;
      yield { items, removedTurns: [], next };
    } while (next);
  };

const chatsAndMeetings = (client: TeamsClient): Reader => {
  const chats = chatPages(client);
  const meetings = meetingPages(client);
  return (place, link, after) =>
    (place.key === MEETINGS.key ? meetings : chats)(place, link, after);
};

export const teamsConnector: Connector<Config> = {
  id: 'teams',
  configSchema: ConfigSchema,
  secretFields: [],
  hosts: () => ['graph.microsoft.com'],
  minIntervalMs: MIN_INTERVAL_MS,
  oauth: teamsOAuth,
  verify,
  sync(config, { cursor, since }, http) {
    const client = teamsClient(config, http);
    return daily(cursor, since, () => channelPlaces(client), threads(client));
  },
};

export const teamsChatsConnector: Connector<Config> = {
  id: 'teamschats',
  configSchema: ConfigSchema,
  secretFields: [],
  hosts: () => ['graph.microsoft.com'],
  minIntervalMs: MIN_INTERVAL_MS,
  oauth: teamsChatsOAuth,
  privateRaw: true, // les conversations privées de la personne et les transcriptions de ses réunions
  verify,
  sync(config, { cursor, since }, http) {
    const client = teamsClient(config, http);
    return daily(cursor, since, () => chatPlaces(client), chatsAndMeetings(client));
  },
};
