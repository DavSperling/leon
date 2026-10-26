import { z } from 'zod';
import { ConnectorHttpError } from '../http';
import { type PipedreamConfig, PipedreamConfigSchema } from '../pipedream';
import type { Connector, SyncPage } from '../types';
import { BATCH_SIZE, gmailClient } from './client';
import { threadsOf } from './map';

// Gmail, par Pipedream Connect (pipedream.ts) : l'appli Google est celle de Pipedream, déjà validée pour
// gmail.modify ; chaque requête passe par son proxy et coûte 1 crédit. Doc lue le 25/10/2026 :
//   https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list (q, du plus
//     récent au plus ancien, 500 au plus par page, nextPageToken ; spam et corbeille exclus par défaut)
//   https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/get (format=full)
//   https://developers.google.com/workspace/gmail/api/guides/batch (100 requêtes au plus par lot)
//   https://support.google.com/mail/answer/7190 (after:, before:, in:, category:)
//
// Le relevé se fait par fenêtres : une fenêtre va de la fin de la précédente (moins une heure de marge,
// l'ingestion ne crée aucun doublon) à l'instant de son ouverture. Gmail rend ses messages du plus récent
// au plus ancien ; le curseur garde la page en cours et le nombre de messages déjà lus dans cette page,
// pour reprendre au même endroit après la limite d'un passage. Quand la liste est vide, un passage coûte
// un seul crédit.
//
// Non vérifié : que `after:` et `before:` en secondes depuis 1970 suivent la date de réception exacte
// (la marge d'une heure couvre un écart) ; qu'un nextPageToken reste valable entre deux passages (s'il
// est refusé, la fenêtre repart de zéro) ; le lien vers le fil (premier compte Google du navigateur).

// Les promotions, les réseaux sociaux, les brouillons et les discussions Chat ne disent rien de l'équipe.
const FILTER = '-in:chats -in:drafts -category:promotions -category:social';
const OVERLAP_S = 3600;

const CursorSchema = z.object({
  done: z.number().int(), // secondes : la fenêtre précédente s'arrêtait là
  window: z
    .object({
      before: z.number().int(),
      pageToken: z.string().nullable(), // la page en cours (null : la première)
      skip: z.number().int().min(0), // messages déjà lus dans cette page
    })
    .nullable(),
});
type Cursor = z.infer<typeof CursorSchema>;

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
function readCursor(text: string | null, since: Date): Cursor {
  const fresh: Cursor = { done: seconds(since), window: null };
  if (text === null) return fresh;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : fresh;
  } catch {
    return fresh;
  }
}

export const gmailConnector: Connector<PipedreamConfig> = {
  id: 'gmail',
  configSchema: PipedreamConfigSchema,
  secretFields: [],
  hosts: () => ['gmail.googleapis.com'],
  pipedream: { app: 'gmail' },
  privateRaw: true, // une boîte mail est personnelle

  async verify(_config, http) {
    const { emailAddress } = await gmailClient(http).profile();
    return { account: emailAddress, accountKey: emailAddress.toLowerCase(), email: emailAddress };
  },

  async *sync(_config, { cursor, since }, http): AsyncGenerator<SyncPage> {
    const client = gmailClient(http);
    const { done, window: kept } = readCursor(cursor, since);
    let window = kept ?? { before: seconds(new Date()), pageToken: null, skip: 0 };
    const q = `after:${done - OVERLAP_S} before:${window.before} ${FILTER}`;
    const save = (next: Cursor) => JSON.stringify(next);
    let restarted = false;
    for (;;) {
      let page: Awaited<ReturnType<typeof client.list>>;
      try {
        page = await client.list(q, window.pageToken);
      } catch (error) {
        // Une page gardée que Gmail ne reconnaît plus : la fenêtre repart de sa première page, une
        // fois par passage (un 400 qui revient n'est plus une page périmée).
        const stale = error instanceof ConnectorHttpError && error.status === 400;
        if (!stale || window.pageToken === null || restarted) throw error;
        restarted = true;
        window = { ...window, pageToken: null, skip: 0 };
        continue;
      }
      const ids = (page.messages ?? []).map((message) => message.id);
      for (let start = window.skip; start < ids.length; start += BATCH_SIZE) {
        const slice = ids.slice(start, start + BATCH_SIZE);
        const items = threadsOf(await client.messages(slice));
        window = { ...window, skip: start + slice.length };
        yield { items, cursor: save({ done, window }) };
      }
      if (!page.nextPageToken) break;
      window = { before: window.before, pageToken: page.nextPageToken, skip: 0 };
    }
    // Fenêtre lue jusqu'au bout : la suivante partira de son ouverture.
    yield { items: [], cursor: save({ done: window.before, window: null }) };
  },
};
