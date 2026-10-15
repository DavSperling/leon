import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type Person, type ShortcutClient, type Story, shortcutClient, stampOf } from './client';
import { advance, isDone, type Mark, readCursor } from './cursor';
import { toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developer.shortcut.com/api/rest/v3   (authentification par l'en-tête Shortcut-Token, 401,
//     limite de 200 requêtes par minute et 429, « Query Stories » POST /stories/search, « Search
//     Stories » GET /search/stories, Get Current Member Info, List Members, List Story Comment,
//     schémas StorySlim, StorySearchResult, StoryComment, Member, MemberInfo)
//   https://www.shortcut.com/help/fields-and-features/search-operators  (opérateurs de la recherche)
//   https://www.shortcut.com/release-notes/      (« Search Stories (Old) » renommé « Query Stories »
//     le 19/08/2025 ; jetons en lecture seule ou en lecture et écriture depuis le 20/01/2026)
//   https://help.shortcut.com/hc/en-us/articles/205701199  (création d'un jeton : lu seulement par
//     le résumé d'une recherche, la page elle-même renvoie vers l'accueil de l'aide)
// Choix qui diffèrent du plan, d'après la doc : « Search Stories » (GET /search/stories) classe par
// pertinence, filtre à la journée (`updated:AAAA-MM-JJ..*`) et ne rend que les 1000 premiers
// résultats : impossible de lire dans l'ordre des modifications et de reprendre. On lit donc
// « Query Stories » (`updated_at_start`, `updated_at_end` à la seconde, `includes_description`), qui
// rend la liste entière sans pagination : le connecteur lit des fenêtres de sept jours (pour ne pas
// dépasser les 10 Mo d'une réponse sur un premier passage de 365 jours), trie lui-même et rend
// cinquante histoires par page. Cette recherche ne rend pas les commentaires, seulement leurs
// numéros : une requête par histoire qui en a. La personne qui a demandé l'histoire (`requested_by_id`)
// est l'auteur du tour `document` : Shortcut ne donne pas d'autre créateur. Les dates sont de l'ISO
// 8601 en UTC (« Z »), sans conversion à faire. Les épics et les projets ne sont connus que par
// leur numéro (`origin`). Un 403 sur les commentaires ou sur la liste des membres est attrapé :
// l'histoire sort sans ses commentaires, ou sans nom d'auteur. Une histoire sans texte sort sans
// tours (le socle l'écarte) pour que le curseur avance. `verify` essaie aussi la recherche, pour
// refuser dès le test un jeton qui ne pourrait pas la faire.
//
// Non vérifié :
//   - si un jeton en lecture seule est accepté par la recherche, qui est une requête POST (la doc
//     ne le dit pas) ;
//   - si `updated_at_start` et `updated_at_end` incluent leurs bornes (on relit une seconde avant
//     le curseur et on écarte ce qui est déjà lu) ;
//   - si la recherche rend les histoires archivées ou non par défaut (on ne passe pas `archived`),
//     et si elle plafonne le nombre de résultats (la doc n'en dit rien ; si elle rend alors les
//     plus anciennes d'abord, rien n'est perdu : la fenêtre suivante repart de la dernière rendue) ;
//   - si une histoire jamais modifiée (`updated_at` nul) est rendue par un filtre sur `updated_at` ;
//   - que la liste des commentaires est complète sans pagination (la doc n'en montre aucune) ;
//   - si ajouter ou modifier un commentaire change la date de modification de l'histoire (sinon le
//     commentaire n'est lu qu'à la prochaine modification de l'histoire : c'est le point à
//     essayer en premier en réel) ;
//   - le délai avant une reprise après un 429 (la doc ne donne pas d'en-tête Retry-After).

const WINDOW_MS = 7 * 24 * 3600 * 1000;
const OVERLAP_MS = 1000;
const PAGE_SIZE = 50;

const ConfigSchema = z.object({ token: z.string().trim().min(1).max(500) });
type Config = z.infer<typeof ConfigSchema>;

async function readItem(
  shortcut: ShortcutClient,
  story: Story,
  people: Map<string, Person>,
): Promise<ConnectorItem> {
  let comments: Awaited<ReturnType<ShortcutClient['comments']>> = [];
  if (story.comment_ids?.length !== 0) {
    try {
      comments = await shortcut.comments(story.id);
    } catch (error) {
      // Seul un 401 remonte : un 403 sur les commentaires laisse l'histoire sans eux.
      if (!(error instanceof ConnectorAuthError && error.status === 403)) throw error;
    }
  }
  return toItem(story, comments, people);
}

async function readPeople(shortcut: ShortcutClient): Promise<Map<string, Person>> {
  try {
    return await shortcut.people();
  } catch (error) {
    if (error instanceof ConnectorAuthError && error.status === 403) return new Map();
    throw error;
  }
}

// Fenêtre après fenêtre, depuis le curseur (ou since). La dernière, celle qui atteint maintenant,
// n'a pas de borne de fin. Une fenêtre vide fait avancer le départ de la suivante ; une fenêtre
// qui rend des histoires repart de la dernière rendue, ce qui ne perd rien si Shortcut en
// plafonne le nombre.
async function* syncStories(shortcut: ShortcutClient, state: SyncState): AsyncGenerator<SyncPage> {
  let mark: Mark = readCursor(state.cursor) ?? { at: state.since.toISOString(), seen: [] };
  let people: Map<string, Person> | null = null;
  for (;;) {
    const from = new Date(Date.parse(mark.at) - OVERLAP_MS);
    const last = from.getTime() + WINDOW_MS > Date.now();
    const until = last ? undefined : new Date(from.getTime() + WINDOW_MS);
    const fresh = (await shortcut.stories(from, until))
      .map((story) => ({ story, id: story.id, stamp: stampOf(story) }))
      .filter((row) => !isDone(mark, row))
      .sort((a, b) => Date.parse(a.stamp) - Date.parse(b.stamp) || a.id - b.id);
    for (let start = 0; start < fresh.length; start += PAGE_SIZE) {
      people ??= await readPeople(shortcut);
      const items: ConnectorItem[] = [];
      for (const row of fresh.slice(start, start + PAGE_SIZE)) {
        items.push(await readItem(shortcut, row.story, people));
        mark = advance(mark, row);
      }
      yield { items, cursor: JSON.stringify(mark) };
    }
    if (until === undefined) return;
    if (fresh.length === 0) mark = { at: until.toISOString(), seen: [] };
  }
}

export const shortcutConnector: Connector<Config> = {
  id: 'shortcut',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.app.shortcut.com'],
  minIntervalMs: 300, // 200 requêtes par minute

  async verify(config: Config, http: ConnectorHttp) {
    const shortcut = shortcutClient(config.token, http);
    const account = await shortcut.account();
    await shortcut.stories(new Date(Date.now() - 60_000));
    return { account };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncStories(shortcutClient(config.token, http), state);
  },
};
