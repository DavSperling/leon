import { z } from 'zod';
import type { ConnectorHttp } from '../http';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { type Activity, type CloseClient, closeClient } from './client';
import { advance, isDone, type Mark, readCursor } from './cursor';
import { dateOf, isReadType, toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developer.close.com/api/overview/api-key-authentication (clé créée dans Réglages ›
//     Développeur › Clés d'API ; authentification Basic, la clé en nom d'utilisateur et un mot de
//     passe vide ; base https://api.close.com/api/v1)
//   https://developer.close.com/api/resources/users/get-me (GET /me/ : prénom, nom, e-mail, organisations)
//   https://developer.close.com/api/resources/activities/list (GET /activity/ : _limit 100 par défaut,
//     _skip, _fields, date_created__gt/gte/lt/lte, activity_at__*, réponse { data, has_more })
//   https://developer.close.com/api/resources/activities/notes, .../calls (transcriptions : champs
//     recording_transcript et voicemail_transcript, absents sauf demande dans _fields), .../emails,
//     .../sms/list, .../whatsapp/list (types Note, Call, Email, SMS, WhatsAppMessage)
//   https://developer.close.com/api/resources/leads/get (display_name d'une fiche)
//   https://developer.close.com/api/overview/pagination (offset _skip/_limit ; le maximum de
//     _limit et de _skip « varie selon la ressource » : dépassé, Close répond 400)
//   https://developer.close.com/api/overview/rate-limits (429 avec Retry-After, limites par groupe
//     de points d'accès)
//
// Écarts au plan, d'après la doc :
// - Seuls `date_created__*` et `activity_at__*` filtrent GET /activity/, et l'ordre croissant n'y
//   est pas documenté (`_order_by` n'a de valeur documentée que pour -activity_at, réservée à une
//   seule fiche ; l'exemple de la doc est en ordre décroissant). On ne s'y fie pas : on lit toutes
//   les activités créées depuis le curseur (100 par requête, de la plus récente à la plus
//   ancienne), on les trie ici et on les rend par pages de 100 éléments. Chaque passage relit donc
//   la liste depuis le curseur : un très gros premier passage en coûte plusieurs, et un volume
//   au-delà du plafond de `_skip` de Close ferait échouer la lecture (400).
// - Le curseur est { at, seen } (instant de création en ms et identifiants vus à cet instant), comme
//   celui de folk, et non { dateCreated, skip } : il ne dépend pas de l'ordre de Close. Il avance
//   aussi sur les activités ignorées, très nombreuses chez Close (créations, changements de statut).
// - Le filtre sur le type (`_type`) ne vaut que pour une seule fiche : les types sont filtrés ici.
//   Lus : Note, Call (note, résumé et transcription), Email, SMS, WhatsAppMessage. Les e-mails et
//   SMS en brouillon, programmés ou en échec ne sont pas lus. Les réunions ne le sont pas.
// - Seuls les champs utiles sont demandés (`_fields`) : pas de HTML, pas de pièces jointes, et les
//   transcriptions seulement parce qu'on les demande par leur nom.
// - Une activité modifiée après sa création n'est pas relue (comme les notes de folk). La date de
//   l'élément est `activity_at` (quand l'activité a eu lieu), à défaut `date_created`.
// - Une activité sans texte (appel sans note ni transcription, note vide) n'est pas rendue.
// - Close n'a pas de lien vers une activité : `url` est la fiche du prospect. Le nom du prospect
//   vient de GET /lead/{id}/?_fields=display_name, une fois par fiche et par passage ; une fiche
//   supprimée (404) ou non lisible (403) laisse le titre « Prospect Close ».
//
// Non vérifié (aucune clé réelle) : que `date_created__gte` accepte un instant ISO en « Z » ;
// que `_fields` fait bien rendre les transcriptions sur GET /activity/ (la doc ne le dit que pour
// GET /activity/call/) ; que le maximum de `_limit` est 100 ; le plafond de `_skip` ; la forme de
// `voicemail_transcript` (la doc ne donne que celle de `recording_transcript`) ; que la limite par
// clé est tenue au rythme choisi (100 ms entre deux requêtes) ; que `_order_by=date_created`
// (croissant) est accepté : il simplifierait la lecture ; le statut HTTP d'une clé refusée (401
// attendu).

const ConfigSchema = z.object({ apiKey: z.string().trim().min(1).max(500) });
type Config = z.infer<typeof ConfigSchema>;

const PAGE_SIZE = 100;

type Row = { activity: Activity; at: number };

// Les activités à lire, dans l'ordre croissant de leur création. Celles dont la date n'a pas de
// fuseau ne peuvent pas être placées : écartées.
function rowsAfter(activities: Activity[], mark: Mark | null): Row[] {
  return activities
    .flatMap((activity) => {
      const created = dateOf(activity.date_created);
      return created ? [{ activity, at: created.getTime() }] : [];
    })
    .filter(({ activity, at }) => !isDone(mark, at, activity.id))
    .sort((a, b) => a.at - b.at || a.activity.id.localeCompare(b.activity.id));
}

async function toPage(close: CloseClient, rows: Row[], mark: Mark): Promise<SyncPage> {
  const items: ConnectorItem[] = [];
  for (const { activity } of rows) {
    const item = await toItem(activity, (id) => close.leadName(id));
    if (item) items.push(item);
  }
  return { items, cursor: JSON.stringify(mark) };
}

async function* syncActivities(
  close: CloseClient,
  since: Date,
  rawCursor: string | null,
): AsyncGenerator<SyncPage> {
  let mark = readCursor(rawCursor);
  const activities = await close.activitiesSince(mark ? new Date(mark.at) : since);
  let pending: Row[] = [];
  let unsaved: Mark | null = null; // le curseur d'une avancée pas encore rendue
  for (const row of rowsAfter(activities, mark)) {
    mark = advance(mark, row.at, row.activity.id);
    unsaved = mark;
    if (isReadType(row.activity._type)) pending.push(row);
    if (pending.length === PAGE_SIZE) {
      yield await toPage(close, pending, mark);
      pending = [];
      unsaved = null;
    }
  }
  // Le reste, ou seulement des activités ignorées : le curseur avance quand même.
  if (unsaved) yield await toPage(close, pending, unsaved);
}

export const closeConnector: Connector<Config> = {
  id: 'close',
  configSchema: ConfigSchema,
  secretFields: ['apiKey'],
  hosts: () => ['api.close.com'],
  minIntervalMs: 100, // une requête par fiche pour son nom, après les pages d'activités

  async verify(config: Config, http: ConnectorHttp) {
    const me = await closeClient(config.apiKey, http).me();
    const where = me.organization ?? me.email;
    return { account: where ? `${me.name} (${where})` : me.name };
  },

  sync(config: Config, state, http: ConnectorHttp) {
    return syncActivities(closeClient(config.apiKey, http), state.since, state.cursor);
  },
};
