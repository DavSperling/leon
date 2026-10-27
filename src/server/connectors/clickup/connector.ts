import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage } from '../types';
import { type ClickupClient, type Comment, clickupClient, type Task } from './client';
import { toItem } from './map';
import { clickupOAuth } from './oauth';

// Doc lue le 15/10/2026 :
//   https://developer.clickup.com/docs/authentication (jeton personnel « pk_… », en-tête
//     Authorization sans « Bearer » ; menu : avatar › Settings › Apps › API Token ; il n'expire pas)
//   https://developer.clickup.com/reference/getauthorizeduser (GET /v2/user)
//   https://developer.clickup.com/reference/getauthorizedteams (GET /v2/team : les espaces)
//   https://developer.clickup.com/reference/getfilteredteamtasks (GET /v2/team/{id}/task : page à
//     partir de 0, 100 tâches au plus, date_updated_gt en millisecondes, include_closed, subtasks,
//     include_markdown_description, order_by id|created|updated|due_date, reverse)
//   https://developer.clickup.com/reference/gettaskcomments (GET /v2/task/{id}/comment : 25 plus
//     récents d'abord, start + start_id pour les plus anciens, date en millisecondes)
//   https://developer.clickup.com/reference/getthreadedcomments
//   https://developer.clickup.com/docs/rate-limits (100 requêtes par minute et par jeton hors plans
//     Business Plus et Enterprise ; 429 avec X-RateLimit-Reset en secondes depuis 1970 ; pas de Retry-After)
//   https://clickup.com/terms/developer-terms (§6 : pas d'entraînement de modèles sur les données
//     des utilisateurs sans leur accord exprès ; suppression des données si l'accord est retiré)
// Le bouton « Se connecter avec ClickUp » (jeton OAuth, `Authorization: Bearer`) : voir oauth.ts.
//
// Écarts au plan, d'après la doc : le sens de `order_by=updated` n'est pas documenté (`reverse`
// « inverse » sans dire de quoi). On lit donc toutes les tâches modifiées depuis le curseur dans
// l'ordre de création, qui ne bouge pas quand une tâche est modifiée pendant la lecture, et on les
// trie ici par mise à jour. Chaque passage relit la liste entière (une requête par 100 tâches),
// pas les commentaires des tâches déjà passées. Le curseur est, par espace, l'instant de la
// dernière tâche et les identifiants déjà vus à cet instant (plusieurs tâches peuvent partager
// la même milliseconde). `last_page` n'est documenté que pour les tâches d'une liste : s'il manque,
// la dernière page est celle de moins de 100 tâches.
// Les commentaires d'une tâche : les 100 plus récents au plus. Un 403 ou un 404 y est attrapé (la
// tâche sort avec son seul corps). Les réponses dans un fil (GET /v2/comment/{id}/reply) ne sont pas
// lues : une requête de plus par fil. Une tâche sans description ni commentaire n'est pas rendue,
// mais le curseur la dépasse.
//
// Non vérifié (aucune clé réelle) : que l'ajout d'un commentaire fait avancer `date_updated` de la
// tâche (sinon un nouveau commentaire sur une tâche ancienne n'est lu qu'à sa prochaine
// modification) ; que `date_updated_gt` exclut l'instant donné (le curseur recule d'une
// milliseconde et écarte les tâches déjà vues : juste dans les deux cas) ; que `start` des
// commentaires exclut le commentaire donné (les doublons sont écartés par identifiant) ; la
// présence de `last_page` pour les tâches d'un espace ; le contenu exact de `description` face à
// `markdown_description` et `text_content` (le Markdown est préféré) ; que la limite de débit
// d'un plan Business Plus ou Enterprise est plus large que le rythme choisi (650 ms).

// Deux façons de se brancher : la clé collée (`token`, jeton personnel « pk_… ») ou le bouton
// (`accessToken`). Une connexion enregistrée avant le bouton n'a pas d'`authMode` : c'est une clé.
// Le jeton OAuth n'expire pas chez ClickUp, mais le socle écrit `refreshToken` et `expiresAt`
// pour tout connecteur à bouton.
const Secret = z.string().trim().min(1).max(500);
const ConfigSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    token: Secret.optional(),
    accessToken: Secret.optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
  });
type Config = z.infer<typeof ConfigSchema>;

// Un jeton OAuth s'envoie avec « Bearer », la clé personnelle « pk_… » seule.
const authorizationOf = (config: Config): string =>
  config.authMode === 'oauth' ? `Bearer ${config.accessToken}` : (config.token ?? '');

// Par espace : l'instant de la dernière tâche lue et les identifiants déjà lus à cet instant.
const CursorSchema = z.record(z.string(), z.object({ at: z.number(), seen: z.array(z.string()) }));
type Cursor = z.infer<typeof CursorSchema>;
type Mark = Cursor[string];

// Un curseur illisible repart de `since` : l'ingestion est idempotente, au pire on refait du travail.
function readCursor(text: string | null): Cursor {
  if (text === null) return {};
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

const updatedAt = (task: Task): number => Number(task.date_updated);

// Déjà lue : plus ancienne que le curseur, ou lue à l'instant même du curseur.
function isDone(mark: Mark | undefined, task: Task): boolean {
  if (mark === undefined) return false;
  const at = updatedAt(task);
  return at < mark.at || (at === mark.at && mark.seen.includes(task.id));
}

function advance(mark: Mark | undefined, task: Task): Mark {
  const at = updatedAt(task);
  if (mark === undefined || at > mark.at) return { at, seen: [task.id] };
  if (at < mark.at || mark.seen.includes(task.id)) return mark;
  return { at, seen: [...mark.seen, task.id] };
}

const byUpdate = (a: Task, b: Task) => updatedAt(a) - updatedAt(b) || a.id.localeCompare(b.id);

async function optionalComments(clickup: ClickupClient, taskId: string): Promise<Comment[]> {
  try {
    return await clickup.comments(taskId);
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    if (denied || missing) return [];
    throw error;
  }
}

const PAGE_SIZE = 100;

async function* syncWorkspaces(
  clickup: ClickupClient,
  since: Date,
  rawCursor: string | null,
): AsyncGenerator<SyncPage> {
  const cursor = readCursor(rawCursor);
  for (const team of await clickup.teams()) {
    const start = cursor[team.id];
    const from = start ? start.at - 1 : since.getTime();
    const tasks = (await clickup.tasks(team.id, from))
      .filter((task) => !isDone(start, task))
      .sort(byUpdate);
    for (let first = 0; first < tasks.length; first += PAGE_SIZE) {
      const items: ConnectorItem[] = [];
      for (const task of tasks.slice(first, first + PAGE_SIZE)) {
        const item = toItem(team.name, task, await optionalComments(clickup, task.id));
        if (item) items.push(item);
        cursor[team.id] = advance(cursor[team.id], task);
      }
      yield { items, cursor: JSON.stringify(cursor) };
    }
  }
}

export const clickupConnector: Connector<Config> = {
  id: 'clickup',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['api.clickup.com'],
  minIntervalMs: 650, // 100 requêtes par minute

  async verify(config: Config, http: ConnectorHttp) {
    const clickup = clickupClient(authorizationOf(config), http);
    const user = await clickup.user();
    const teams = await clickup.teams();
    if (teams.length === 0) {
      throw new ConnectorHttpError(null, 'No ClickUp workspace accessible with this key');
    }
    const names = teams.map((team) => team.name).join(', ');
    // L'identifiant porte les espaces, triés : un autre espace du même utilisateur est un autre compte.
    const ids = teams.map((team) => team.id).sort();
    return { account: `${user.username} (${names})`, accountKey: [user.id, ...ids].join(':') };
  },

  sync(config: Config, state, http: ConnectorHttp) {
    return syncWorkspaces(clickupClient(authorizationOf(config), http), state.since, state.cursor);
  },

  oauth: clickupOAuth,
};
