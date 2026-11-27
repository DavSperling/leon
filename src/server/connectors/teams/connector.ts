import { z } from 'zod';
import { logError } from '@/server/log';
import { ConnectorAuthError, type ConnectorHttp } from '../http';
import type { Audience, Connector, ConnectorItem } from '../types';
import { type TeamsClient, teamsClient } from './client';
import { DAY, daily, gone, type Listing, type Place, type Reader } from './daily';
import {
  changedAt,
  chatDays,
  deletedTurns,
  memberOf,
  threadItem,
  transcriptAudience,
  transcriptItem,
} from './map';
import { teamsChatsOAuth, teamsOAuth } from './oauth';
import type { Channel, Event, Root } from './schemas';

// Deux outils : « Teams », les canaux des équipes ; « Teams Chat », les conversations de la personne et les
// transcriptions de ses réunions. Dans les deux, chaque canal, conversation ou réunion est visible dans Leon des
// collègues qui en sont membres, comme dans Teams, même s'ils n'ont pas branché Teams, et n'y existe qu'une fois
// (0097, choix de David du 27/11/2026) ; un canal standard d'une équipe publique, de toute l'équipe. La liste du jour
// dit qui est dans chaque lieu (daily.ts). Doc lue le 05/11/2026 :
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
// Et le 27/11/2026, pour les canaux privés et partagés et les membres :
//   https://learn.microsoft.com/en-us/graph/api/associatedteaminfo-list (/me/teamwork/associatedTeams, Team.ReadBasic.All :
//     les équipes de la personne et celles qui hébergent un canal partagé dont elle est membre directe)
//   https://learn.microsoft.com/en-us/graph/api/team-list-allchannels (les canaux de l'équipe et ceux partagés avec
//     elle ; `@odata.id` nomme l'équipe qui héberge le canal ; « pour un canal partagé d'une autre entreprise, retirer
//     /tenants/{id} de l'adresse » : Leon écrit ses adresses sans)
//   https://learn.microsoft.com/en-us/graph/api/channel-list-allmembers (tous types de canaux, membres indirects d'un
//     canal partagé compris, d'autres entreprises aussi ; ChannelMember.Read.All en délégué)
//   https://learn.microsoft.com/en-us/graph/api/chat-list (« $expand=members rend 25 membres au plus »)
//   https://learn.microsoft.com/en-us/graph/api/chat-list-members (visibleHistoryStartDateTime de chaque membre)
//
// Écarts à la demande, d'après la doc :
//   - Pas de lecture en delta. La page de Graph sur le delta des messages de canal a été supprimée en 09/2024 (il ne
//     reste que celui de chats/getAllMessages, en droits d'application seulement) ; aucun delta n'existe pour une
//     conversation en droits délégués. Les canaux se lisent par la liste, triée du fil le plus récemment animé au
//     moins récent, jusqu'au premier fil inchangé ; les conversations par le filtre sur lastModifiedDateTime.
//   - Un canal partagé hébergé dans une autre entreprise se lit avec le jeton de la personne, de notre annuaire : la doc
//     ne dit pas si cela suffit (seuls les droits d'application exigent l'annuaire hôte). Un canal, une équipe ou une
//     conversation refusés sont passés, le journal ne dit que le refus.
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
// Non vérifié non plus : qu'allMembers rende `email` et `userId` pour un membre d'une autre entreprise ; qu'un canal
// partagé d'une autre entreprise se lise ; la forme de `@odata.id` hors de l'exemple de la doc.
// shortcut: un fil de canal supprimé en entier, ou une conversation quittée, restent dans Leon (visibles de leurs
// membres du dernier jour où quelqu'un les a lus). Les retirer demande de comparer la liste du jour à celle de la veille.

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

// Une lecture refusée (403) ou disparue (404) : passée, le journal ne dit que le refus.
async function unlessGone<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (!gone(error)) throw error;
    logError('teams.place_skipped', error);
    return null;
  }
}

// L'équipe qui héberge un canal, lue dans son adresse (…/teams/{id}/channels/{id}) : un canal partagé avec l'équipe
// peut venir d'une autre, d'une autre entreprise comprise.
const hostOf = (channel: Channel): string | null =>
  /\/teams\/([^/]+)\/channels\//.exec(channel['@odata.id'] ?? '')?.[1] ?? null;

// Les canaux que la personne lit, et qui est dans chacun : un canal standard d'une équipe publique, toute
// l'organisation ; un canal d'une équipe privée, un canal privé ou partagé, ses membres. D'une équipe qui ne fait
// qu'héberger un canal partagé dont la personne est membre, seuls les canaux partagés.
async function channelListing(client: TeamsClient): Promise<Listing> {
  const joined = await client.teams();
  const mine = new Set(joined.map((team) => team.id));
  const hosts = ((await unlessGone(() => client.associatedTeams())) ?? []).filter(
    (team) => !mine.has(team.id),
  );
  const listing: Listing = { places: [], audiences: [] };
  const seen = new Set<string>();
  for (const team of [...joined, ...hosts]) {
    const channels = await unlessGone(() => client.allChannels(team.id));
    if (!channels) continue;
    const open =
      mine.has(team.id) && (await unlessGone(() => client.visibility(team.id))) === 'public';
    for (const channel of channels) {
      const host = hostOf(channel) ?? team.id;
      const type = channel.membershipType;
      if (seen.has(channel.id) || (!mine.has(team.id) && type !== 'shared')) continue;
      const everyone = open && host === team.id && type === 'standard';
      const members = everyone
        ? []
        : await unlessGone(() => client.channelMembers(host, channel.id));
      if (!members) continue;
      seen.add(channel.id);
      const name = channel.displayName ?? '';
      const origin: Record<string, string> =
        host === team.id ? { team: team.displayName ?? '', channel: name } : { channel: name };
      const audience: Audience = everyone
        ? { key: channel.id, team: true }
        : { key: channel.id, members: members.map(memberOf) };
      listing.places.push({ key: channel.id, parent: host, name, origin });
      listing.audiences.push(audience);
    }
  }
  return listing;
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

// Les conversations de la personne, et qui est dans chacune. La liste ne rend que 25 membres par conversation, sans le
// début de leur historique : ils se lisent à part, sauf à deux (chacun y voit tout).
async function chatListing(client: TeamsClient): Promise<Listing> {
  const listing: Listing = { places: [], audiences: [] };
  for (const chat of await client.chats()) {
    const listed = chat.members ?? [];
    const members =
      chat.chatType === 'oneOnOne' ? listed : await unlessGone(() => client.chatMembers(chat.id));
    if (!members) continue;
    const names = listed.flatMap((member) => member.displayName || []);
    const name = chat.topic?.trim() || names.join(', ') || 'Conversation Teams';
    listing.places.push({ key: chat.id, parent: null, name, origin: { chat: name } });
    listing.audiences.push({ key: chat.id, members: members.map(memberOf) });
  }
  listing.places.push(MEETINGS);
  return listing;
}

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

// Les transcriptions d'une réunion faites depuis `start`, et qui les voit. Une réunion fermée à la personne, expirée,
// ou dont l'administrateur n'a pas ouvert les transcriptions à Graph (403), est passée : les autres sont lues.
async function transcriptsOf(client: TeamsClient, event: Event, joinUrl: string, start: Date) {
  const read = { items: [] as ConnectorItem[], audiences: [] as Audience[] };
  try {
    const meetingId = await client.meetingId(joinUrl);
    if (meetingId === null) return read;
    for (const transcript of await client.transcripts(meetingId)) {
      // Une série garde les transcriptions de toutes ses occurrences : les plus anciennes sont déjà lues.
      if (Date.parse(transcript.createdDateTime) < start.getTime()) continue;
      const content = await transcriptText(client, meetingId, transcript.id);
      const item = transcriptItem(event, transcript, content);
      if (!item) continue;
      read.items.push(item);
      read.audiences.push(transcriptAudience(event, transcript));
    }
  } catch (error) {
    if (!gone(error)) throw error;
    logError('teams.place_skipped', error);
  }
  return read;
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
      const step = { items: [] as ConnectorItem[], audiences: [] as Audience[] };
      for (const event of page.value) {
        const joinUrl = event.onlineMeeting?.joinUrl;
        if (!joinUrl || read.has(joinUrl) || !isTeamsMeeting(event)) continue;
        read.add(joinUrl);
        const meeting = await transcriptsOf(client, event, joinUrl, start);
        step.items.push(...meeting.items);
        step.audiences.push(...meeting.audiences);
      }
      next = page['@odata.nextLink'] ?? null;
      yield { ...step, removedTurns: [], next };
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
  memberAccess: true,
  verify,
  sync(config, { cursor, since }, http) {
    const client = teamsClient(config, http);
    return daily(cursor, since, () => channelListing(client), threads(client));
  },
};

export const teamsChatsConnector: Connector<Config> = {
  id: 'teamschats',
  configSchema: ConfigSchema,
  secretFields: [],
  hosts: () => ['graph.microsoft.com'],
  minIntervalMs: MIN_INTERVAL_MS,
  oauth: teamsChatsOAuth,
  privateRaw: true, // un élément sans lieu resterait à qui branche ; tous en ont un
  memberAccess: true,
  verify,
  sync(config, { cursor, since }, http) {
    const client = teamsClient(config, http);
    return daily(cursor, since, () => chatListing(client), chatsAndMeetings(client));
  },
};
