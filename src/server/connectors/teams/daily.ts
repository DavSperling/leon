import { z } from 'zod';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { ConnectorItem, SyncPage } from '../types';

// La règle de Microsoft (https://learn.microsoft.com/en-us/graph/api/resources/teams-api-overview, « Polling
// requirements », lue le 05/11/2026) : une appli qui interroge une ressource pour voir si elle a changé ne peut le faire
// qu'une fois par jour ; plus souvent, il faut s'abonner à des notifications. Ne pas la suivre va contre les conditions
// des API Microsoft. La relève de Leon repasse toutes les 15 minutes : c'est ce module qui tient la règle. La liste
// des lieux (équipes et canaux, ou conversations) et chaque lieu sont lus au plus une fois par 24 h ; entre deux, un
// passage ne fait aucune requête. Une lecture coupée par la limite d'un passage reprend à sa page suivante : c'est la
// même lecture, pas une nouvelle interrogation.

export const DAY = 86_400_000;
const MARGIN = 5 * 60_000; // l'écart d'horloge entre Leon et Microsoft

// Un canal (`parent` : son équipe) ou une conversation.
const PlaceSchema = z.object({
  key: z.string(),
  parent: z.string().nullable(),
  name: z.string(),
  origin: z.record(z.string(), z.string()),
});
// `read` : pour chaque lieu, le début de sa dernière lecture complète. `pending` : la lecture en cours.
const CursorSchema = z.object({
  listedAt: z.iso.datetime().nullable(),
  places: z.array(PlaceSchema),
  read: z.record(z.string(), z.iso.datetime()),
  pending: z.object({ key: z.string(), link: z.string(), startedAt: z.iso.datetime() }).nullable(),
});

export type Place = z.infer<typeof PlaceSchema>;
type Cursor = z.infer<typeof CursorSchema>;
export type Step = { items: ConnectorItem[]; removedTurns: string[] };
// Une page lue, et l'adresse de la suivante (null : le lieu est lu jusqu'au bout).
export type Reader = (
  place: Place,
  link: string | null,
  after: Date,
) => AsyncIterable<Step & { next: string | null }>;

// Un curseur illisible repart de zéro : l'ingestion ne recrée rien de connu.
function readCursor(text: string | null): Cursor {
  const fresh: Cursor = { listedAt: null, places: [], read: {}, pending: null };
  if (text === null) return fresh;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : fresh;
  } catch {
    return fresh;
  }
}

// Un lieu supprimé, ou fermé à la personne, depuis la liste du jour.
export const gone = (error: unknown) =>
  (error instanceof ConnectorHttpError && error.status === 404) ||
  (error instanceof ConnectorAuthError && error.status === 403);

export async function* daily(
  text: string | null,
  since: Date,
  list: () => Promise<Place[]>,
  read: Reader,
): AsyncGenerator<SyncPage> {
  const now = Date.now();
  const stamp = new Date(now).toISOString();
  const recent = (at: string | null | undefined) => at != null && now - Date.parse(at) < DAY;
  let state = readCursor(text);
  const page = ({ items, removedTurns }: Step): SyncPage => ({
    items,
    cursor: JSON.stringify(state),
    ...(removedTurns.length > 0 ? { removedTurns } : {}),
  });

  // Un lieu quitté sort de la liste : il n'est plus lu.
  if (!recent(state.listedAt)) {
    const places = await list();
    const keys = new Set(places.map((place) => place.key));
    state = {
      listedAt: stamp,
      places,
      read: Object.fromEntries(Object.entries(state.read).filter(([key]) => keys.has(key))),
      pending: state.pending && keys.has(state.pending.key) ? state.pending : null,
    };
    yield page({ items: [], removedTurns: [] });
  }

  const resumed = state.pending;
  const due = state.places
    .filter((place) => place.key === resumed?.key || !recent(state.read[place.key]))
    .sort((a, b) => Number(b.key === resumed?.key) - Number(a.key === resumed?.key));
  for (const place of due) {
    const resume = place.key === resumed?.key ? resumed : null;
    const startedAt = resume?.startedAt ?? stamp;
    const last = state.read[place.key];
    const after = new Date(last ? Date.parse(last) - MARGIN : since.getTime());
    const done = () => ({
      ...state,
      pending: null,
      read: { ...state.read, [place.key]: startedAt },
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
      state = done(); // relu demain, ou retiré de la liste du jour
      yield page({ items: [], removedTurns: [] });
    }
  }
}
