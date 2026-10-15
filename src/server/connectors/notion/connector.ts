import { z } from 'zod';
import type { Connector, ConnectorItem } from '../types';
import { type Api, fetchMe, type NotionPage, searchPages } from './client';
import { createAuthors, pageToItem } from './map';

// Notion : pages (texte des blocs) et commentaires.
//
// Doc lue le 15/10/2026 :
//   https://developers.notion.com/reference/post-search (recherche, filtre et tri)
//   https://developers.notion.com/reference/versioning (version 2026-03-11, la plus récente)
//   https://developers.notion.com/guides/get-started/upgrade-guide-2026-03-11 et ...-2025-09-03
//   https://developers.notion.com/reference/get-block-children (blocs, 100 par page)
//   https://developers.notion.com/reference/list-comments (commentaires de page)
//   https://developers.notion.com/reference/get-self et .../get-user (robot et personnes)
//   https://developers.notion.com/reference/block (types de blocs)
//   https://developers.notion.com/reference/request-limits (3 requêtes par seconde en moyenne)
//   https://developers.notion.com/reference/capabilities et .../guides/get-started/authorization
//
// Choix. La recherche n'a pas de filtre « modifié depuis » : on la lit de la plus récente à la plus
// ancienne et on s'arrête à la première page antérieure au curseur (ou à since), puis on rend les
// pages trouvées de la plus ancienne à la plus récente. La doc permet aussi le tri croissant, mais
// il faudrait relire tout l'espace à chaque passage, et une page éditée pendant la lecture passerait
// en fin de liste et décalerait les suivantes d'un cran (une page sautée, non vérifié) ; en
// décroissant, un tel décalage ne fait au pire que repasser deux fois sur une page. Le
// curseur est JSON : { at, ids } = date de la dernière page rendue, et les pages déjà rendues à
// cette date (plusieurs pages partagent la même minute ; sans leurs identifiants, un passage coupé à
// 200 éléments ne progresserait plus). Un curseur illisible repart de since : l'ingestion est
// idempotente. Une page sans texte ni commentaire n'est pas rendue. Une page retirée entre la
// recherche et sa lecture (404) est sautée. Sans la capacité « Lire les commentaires » ou « Lire les
// informations des utilisateurs » (403) : pas de commentaires, auteur inconnu (le commentaire garde
// le nom affiché que Notion donne).
//
// Non lu : les propriétés des lignes de base de données ; les commentaires résolus (la doc : seuls
// les non résolus sont rendus) et ceux d'un passage précis (ils sont sur le bloc, pas sur la page) ;
// les blocs de réunion (meeting_notes) autrement que par leurs enfants ; les blocs synchronisés.
// Non vérifié : un jeton d'accès personnel (la doc dit qu'il agit au nom de son créateur, sans
// partage de pages) ; l'arrondi à la minute de last_edited_time (non confirmé par la doc lue, le
// curseur le prévoit) ; une page modifiée deux fois dans la même minute, de part et d'autre de
// notre lecture, garde sa première version jusqu'à la modification suivante ; un résultat
// de recherche partiel (seulement id) sans la capacité « Lire le contenu » : il est refusé par le
// schéma, « Réponse inattendue » ; un essai en réel.

const ConfigSchema = z.object({ token: z.string().trim().min(1) });
type Config = z.infer<typeof ConfigSchema>;

// Pages lues avant d'enregistrer le curseur : un plantage refait au pire ce lot.
const PAGES_PER_BATCH = 10;

// Où reprendre : la date et les pages déjà rendues à cette date.
type Mark = { at: number; ids: Set<string> };
const CursorSchema = z.object({ at: z.iso.datetime(), ids: z.array(z.string()) });

function readMark(cursor: string | null, since: Date): Mark {
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(cursor ?? 'null'));
    if (parsed.success) return { at: Date.parse(parsed.data.at), ids: new Set(parsed.data.ids) };
  } catch {
    // Curseur illisible : on repart de since.
  }
  return { at: since.getTime(), ids: new Set() };
}

const editedAt = (page: NotionPage) => Date.parse(page.last_edited_time);

// Les pages modifiées depuis le repère, de la plus ancienne à la plus récente.
async function pagesSince(api: Api, mark: Mark): Promise<NotionPage[]> {
  const found = new Map<string, NotionPage>();
  let startCursor: string | undefined;
  for (;;) {
    const answer = await searchPages(api, startCursor);
    for (const page of answer.results) {
      if (editedAt(page) < mark.at) return sortedByDate(found);
      if (editedAt(page) > mark.at || !mark.ids.has(page.id)) found.set(page.id, page);
    }
    if (!answer.has_more || answer.next_cursor === null) return sortedByDate(found);
    startCursor = answer.next_cursor;
  }
}

function sortedByDate(found: Map<string, NotionPage>): NotionPage[] {
  return [...found.values()].sort((a, b) => editedAt(a) - editedAt(b) || a.id.localeCompare(b.id));
}

// Le repère après avoir lu `done`, qui commence à la plus ancienne page trouvée.
function markAfter(done: NotionPage[], previous: Mark): string {
  const last = done.at(-1);
  if (last === undefined) throw new Error('Aucune page lue');
  const at = editedAt(last);
  const ids = new Set(previous.at === at ? previous.ids : []);
  for (const page of done) if (editedAt(page) === at) ids.add(page.id);
  return JSON.stringify({ at: new Date(at).toISOString(), ids: [...ids] });
}

export const notionConnector: Connector<Config> = {
  id: 'notion',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.notion.com'],
  minIntervalMs: 350,

  async verify(config, http) {
    const me = await fetchMe({ http, token: config.token });
    const name = me.name ?? 'Intégration';
    const workspace = me.bot?.workspace_name;
    return { account: workspace ? `${name} (${workspace})` : name };
  },

  async *sync(config, state, http) {
    const api = { http, token: config.token };
    const previous = readMark(state.cursor, state.since);
    const pages = await pagesSince(api, previous);
    const authors = createAuthors(api);
    for (let start = 0; start < pages.length; start += PAGES_PER_BATCH) {
      const end = Math.min(start + PAGES_PER_BATCH, pages.length);
      const items: ConnectorItem[] = [];
      for (const page of pages.slice(start, end)) {
        const item = await pageToItem(api, authors, page);
        if (item !== null) items.push(item);
      }
      yield { items, cursor: markAfter(pages.slice(0, end), previous) };
    }
  },
};
