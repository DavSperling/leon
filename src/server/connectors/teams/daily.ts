import { z } from 'zod';
import { logError } from '@/server/log';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { Audience, ConnectorItem, SyncPage } from '../types';

// La règle de Microsoft (https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview, « Polling
// requirements », lue le 05/11/2026) : une appli qui interroge une ressource pour voir si elle a changé ne peut le faire
// qu'une fois par jour ; plus souvent, il faut s'abonner à des notifications. Ne pas la suivre va contre les conditions
// des API Microsoft. La relève de Leon repasse toutes les 15 minutes : c'est ce module qui tient la règle. La liste
// des lieux (équipes et canaux, ou conversations) et chaque lieu sont lus au plus une fois par 24 h ; entre deux, un
// passage ne lit que ce que Microsoft a signalé par une notification (0098) : un lieu signalé est relu tout de suite,
// depuis sa dernière lecture ; un lieu signalé que la liste ne connaît pas (une conversation créée depuis) la fait
// relire, une fois par heure au plus ; « * » (des notifications perdues) fait tout relire. Une lecture coupée par la
// limite d'un passage reprend à sa page suivante : c'est la même lecture, pas une nouvelle interrogation. La liste du
// jour dit aussi qui est dans chaque lieu (0097) : tout ce qui en a été relevé prend l'accès de ses membres du jour,
// une fois par jour, même sans message nouveau.

export const DAY = 86_400_000;
const HOUR = 3_600_000;
const MARGIN = 5 * 60_000; // l'écart d'horloge entre Leon et Microsoft
const AUDIENCES_PER_PAGE = 50; // lieux alignés par transaction
// Les clés que signale une notification, en plus d'une conversation ou d'un canal (microsoft-notifications.ts).
export const EVERYWHERE = '*';
export const MEETINGS_KEY = 'reunions'; // aucune conversation n'a cette clé (les leurs commencent par « 19: »)

// Un canal (`parent` : son équipe) ou une conversation.
const PlaceSchema = z.object({
  key: z.string(),
  parent: z.string().nullable(),
  name: z.string(),
  origin: z.record(z.string(), z.string()),
});
// `read` : pour chaque lieu, le début de sa dernière lecture complète. `pending` : la lecture en cours. `signaled` :
// les lieux signalés pas encore relus.
const CursorSchema = z.object({
  listedAt: z.iso.datetime().nullable(),
  places: z.array(PlaceSchema),
  read: z.record(z.string(), z.iso.datetime()),
  pending: z.object({ key: z.string(), link: z.string(), startedAt: z.iso.datetime() }).nullable(),
  signaled: z.array(z.string()).default([]),
});

export type Place = z.infer<typeof PlaceSchema>;
type Cursor = z.infer<typeof CursorSchema>;
export type Step = { items: ConnectorItem[]; removedTurns: string[]; audiences?: Audience[] };
// Les lieux du jour, et qui est dans chacun (les réunions disent les leurs à la lecture, une par transcription).
export type Listing = { places: Place[]; audiences: Audience[] };
// Une page lue, et l'adresse de la suivante (null : le lieu est lu jusqu'au bout).
export type Reader = (
  place: Place,
  link: string | null,
  after: Date,
) => AsyncIterable<Step & { next: string | null }>;

// Un curseur illisible repart de zéro : l'ingestion ne recrée rien de connu.
function readCursor(text: string | null): Cursor {
  const fresh: Cursor = { listedAt: null, places: [], read: {}, pending: null, signaled: [] };
  if (text === null) return fresh;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : fresh;
  } catch {
    return fresh;
  }
}

// Les lieux de la liste du jour (les canaux que Teams fait suivre, microsoft-notifications.ts).
export const placesOf = (cursor: string | null): Place[] => readCursor(cursor).places;

// Où Teams a changé, d'après la notification : la conversation ou le canal (« chats('…')/messages('…') »,
// « teams('…')/channels('…')/messages('…') »), les réunions pour une transcription
// (« users/…/onlineMeetings('…')/transcripts('…') »), tout après des notifications perdues ou un abonnement retiré.
// null : rien à relire de plus (un mail, ou le jeton à renouveler).
export function changedPlace(
  resource: string | null | undefined,
  lifecycle: string | null | undefined,
) {
  if (lifecycle === 'missed' || lifecycle === 'subscriptionRemoved') return EVERYWHERE;
  if (lifecycle || !resource) return null;
  if (/\/transcripts\(/i.test(resource)) return MEETINGS_KEY;
  const key = /(?:channels|chats)\('([^']{1,200})'\)/i.exec(resource)?.[1];
  if (!key) return null;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

// Un lieu supprimé, ou fermé à la personne, depuis la liste du jour.
export const gone = (error: unknown) =>
  (error instanceof ConnectorHttpError && error.status === 404) ||
  (error instanceof ConnectorAuthError && error.status === 403);

export async function* daily(
  text: string | null,
  since: Date,
  list: () => Promise<Listing>,
  read: Reader,
  signaled: readonly string[] = [],
): AsyncGenerator<SyncPage> {
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const within = (at: string | null | undefined, span: number) =>
    at != null && now - Date.parse(at) < span;
  const recent = (at: string | null | undefined) => within(at, DAY);
  let state = readCursor(text);
  const page = ({ items, removedTurns, audiences }: Step): SyncPage => ({
    items,
    cursor: JSON.stringify(state),
    ...(removedTurns.length > 0 ? { removedTurns } : {}),
    ...(audiences?.length ? { audiences } : {}),
  });

  // Les lieux signalés sont gardés dès la première page : un passage qui échoue plus loin ne les perd pas.
  const added = signaled.filter((key) => !state.signaled.includes(key));
  if (added.length > 0) {
    state = { ...state, signaled: [...state.signaled, ...added] };
    yield page({ items: [], removedTurns: [] });
  }

  // Un lieu quitté sort de la liste : il n'est plus lu. Qui est dans chaque lieu passe par paquets, une transaction
  // chacun ; la liste ne compte comme faite qu'après le dernier : un passage coupé avant la refait.
  // shortcut: une conversation inconnue fait relire toute la liste, membres compris (une requête par conversation de
  // groupe), une fois par heure au plus ; ne lire qu'elle si les personnes à centaines de conversations se multiplient.
  const everywhere = state.signaled.includes(EVERYWHERE);
  const known = new Set(state.places.map((place) => place.key));
  const unknown = state.signaled.some((key) => key !== EVERYWHERE && !known.has(key));
  if (!recent(state.listedAt) || everywhere || (unknown && !within(state.listedAt, HOUR))) {
    const { places, audiences } = await list();
    const keys = new Set(places.map((place) => place.key));
    for (let at = 0; at < audiences.length; at += AUDIENCES_PER_PAGE) {
      const batch = audiences.slice(at, at + AUDIENCES_PER_PAGE);
      yield page({ items: [], removedTurns: [], audiences: batch });
    }
    state = {
      listedAt: stamp,
      places,
      read: Object.fromEntries(Object.entries(state.read).filter(([key]) => keys.has(key))),
      pending: state.pending && keys.has(state.pending.key) ? state.pending : null,
      // « * » devient chaque lieu de la liste ; un lieu signalé qu'elle ne connaît pas est oublié.
      signaled: everywhere ? [...keys] : state.signaled.filter((key) => keys.has(key)),
    };
    yield page({ items: [], removedTurns: [] });
  }

  // La lecture reprise d'abord, puis les lieux signalés, puis ceux dont c'est le jour.
  const resumed = state.pending;
  const wanted = new Set(state.signaled);
  const rank = (place: Place) => (place.key === resumed?.key ? 0 : wanted.has(place.key) ? 1 : 2);
  const due = state.places
    .filter((place) => rank(place) < 2 || !recent(state.read[place.key]))
    .sort((a, b) => rank(a) - rank(b));
  for (const place of due) {
    const resume = place.key === resumed?.key ? resumed : null;
    const startedAt = resume?.startedAt ?? stamp;
    const last = state.read[place.key];
    const after = new Date(last ? Date.parse(last) - MARGIN : since.getTime());
    // Une lecture reprise a commencé avant le signal, peut-être : le lieu reste signalé pour le passage suivant.
    const done = () => ({
      ...state,
      pending: null,
      read: { ...state.read, [place.key]: startedAt },
      signaled: resume ? state.signaled : state.signaled.filter((key) => key !== place.key),
    });
    try {
      for await (const step of read(place, resume?.link ?? null, after)) {
        state = step.next
          ? { ...state, pending: { key: place.key, link: step.next, startedAt } }
          : done();
        yield page(step);
      }
    } catch (error) {
      if (!gone(error)) throw error;
      // Relu demain, ou retiré de la liste du jour. Le journal ne dit que le refus, rien du lieu.
      logError('teams.place_skipped', error);
      state = done();
      yield page({ items: [], removedTurns: [] });
    }
  }
}
