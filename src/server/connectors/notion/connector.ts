import { z } from 'zod';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { type Api, fetchMe, type NotionPage, searchPages } from './client';
import { createAuthors, pageToItem } from './map';
import { notionOAuth } from './oauth';

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
// 200 éléments ne progresserait plus). Le premier remplissage fait exception : il rend les pages dans
// l'ordre de la recherche et garde sa position (voir `fill`). Un curseur illisible repart de since,
// en remplissage : l'ingestion est idempotente. Une page sans texte ni commentaire n'est pas rendue. Une page retirée entre la
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

// Deux façons de se brancher : la clé collée (`token`), ou le bouton (`accessToken` et ce que
// `notionOAuth.toConfig` rend). Une connexion sans `authMode` est à clé. Les jetons du bouton
// ne sont pas dans `secretFields` : le socle les chiffre à part.
const ConfigSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    token: z.string().trim().min(1).optional(),
    accessToken: z.string().min(1).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    workspaceName: z.string().nullable().optional(),
    botId: z.string().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Requis' });
  });
type Config = z.infer<typeof ConfigSchema>;

// Le jeton qui part dans l'en-tête ; le schéma garantit qu'il est là.
const bearer = (config: Config) =>
  (config.authMode === 'oauth' ? config.accessToken : config.token) ?? '';

// Pages lues avant d'enregistrer le curseur : un plantage refait au pire ce lot.
const PAGES_PER_BATCH = 10;

// Où reprendre : la date et les pages déjà rendues à cette date.
type Mark = { at: number; ids: Set<string> };
const MarkSchema = z.object({ at: z.iso.datetime(), ids: z.array(z.string()) });
// Premier remplissage en cours (voir `fill`) : `after` est le début de la page de recherche en cours.
const FillSchema = z.object({
  fill: z.object({
    after: z.string().nullable(),
    upto: MarkSchema.nullable(),
    top: MarkSchema.nullable(),
  }),
});
type Fill = { after: string | null; upto: Mark | null; top: Mark | null };

const toMark = (mark: z.infer<typeof MarkSchema>): Mark => ({
  at: Date.parse(mark.at),
  ids: new Set(mark.ids),
});
const fromMark = (mark: Mark) => ({ at: new Date(mark.at).toISOString(), ids: [...mark.ids] });

// Un repère (passages suivants), un remplissage en cours, ou null : curseur absent ou illisible, le
// remplissage part de since.
function readCursor(cursor: string | null): Mark | Fill | null {
  let value: unknown = null;
  try {
    value = JSON.parse(cursor ?? 'null');
  } catch {
    // Curseur illisible : on repart de since.
  }
  const mark = MarkSchema.safeParse(value);
  if (mark.success) return toMark(mark.data);
  const fill = FillSchema.safeParse(value);
  if (!fill.success) return null;
  const { after, upto, top } = fill.data.fill;
  return { after, upto: upto && toMark(upto), top: top && toMark(top) };
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

// Le repère qui ajoute `page` : une date plus récente (`newer`) ou plus ancienne le remplace.
function extend(mark: Mark | null, page: NotionPage, newer: boolean): Mark {
  const at = editedAt(page);
  if (mark === null || (newer ? at > mark.at : at < mark.at))
    return { at, ids: new Set([page.id]) };
  return at === mark.at ? { at, ids: new Set([...mark.ids, page.id]) } : mark;
}

// Déjà rendue par ce remplissage : plus récente que la dernière page rendue, ou à sa date et nommée.
const alreadyDone = (page: NotionPage, upto: Mark | null) =>
  upto !== null &&
  (editedAt(page) > upto.at || (editedAt(page) === upto.at && upto.ids.has(page.id)));

// Le premier remplissage lit la recherche du plus récent au plus ancien et rend les pages dans cet
// ordre, comme Linear : le curseur garde sa position (`after`), la dernière page rendue (`upto`,
// pour reprendre une page de recherche entamée) et la plus récente (`top`). Sans cela, chaque
// passage de 200 éléments relisait toute la recherche. Une page modifiée pendant le remplissage
// remonte en tête : plus récente que `top`, le passage suivant la prend. À la fin, le curseur
// devient le repère de `top`. Non vérifié : la validité d'un `start_cursor` d'une relève à l'autre.
async function* fill(
  api: Api,
  authors: ReturnType<typeof createAuthors>,
  from: Fill,
  since: Date,
): AsyncGenerator<SyncPage> {
  let { after, upto, top } = from;
  const position = () =>
    JSON.stringify({
      fill: { after, upto: upto && fromMark(upto), top: top && fromMark(top) },
    });
  const finished = () => JSON.stringify(fromMark(top ?? { at: since.getTime(), ids: new Set() }));
  for (;;) {
    const answer = await searchPages(api, after ?? undefined);
    const fresh: NotionPage[] = [];
    let older = false;
    for (const page of answer.results) {
      if (editedAt(page) < since.getTime()) {
        older = true;
        break;
      }
      if (!alreadyDone(page, upto)) fresh.push(page);
    }
    const last = older || !answer.has_more || answer.next_cursor === null;
    if (fresh.length === 0 && last) yield { items: [], cursor: finished() };
    for (let start = 0; start < fresh.length; start += PAGES_PER_BATCH) {
      const end = Math.min(start + PAGES_PER_BATCH, fresh.length);
      const items: ConnectorItem[] = [];
      for (const page of fresh.slice(start, end)) {
        const item = await pageToItem(api, authors, page);
        if (item !== null) items.push(item);
        upto = extend(upto, page, false);
        top = extend(top, page, true);
      }
      yield { items, cursor: last && end === fresh.length ? finished() : position() };
    }
    if (last) return;
    after = answer.next_cursor;
  }
}

export const notionConnector: Connector<Config> = {
  id: 'notion',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.notion.com'],
  minIntervalMs: 350,
  oauth: notionOAuth,

  async verify(config, http) {
    const me = await fetchMe({ http, token: bearer(config) });
    const name = me.name ?? 'Intégration';
    const workspace = me.bot?.workspace_name;
    return { account: workspace ? `${name} (${workspace})` : name };
  },

  async *sync(config, state, http) {
    const api = { http, token: bearer(config) };
    const authors = createAuthors(api);
    const previous = readCursor(state.cursor);
    if (previous === null || 'after' in previous) {
      yield* fill(api, authors, previous ?? { after: null, upto: null, top: null }, state.since);
      return;
    }
    const pages = await pagesSince(api, previous);
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
