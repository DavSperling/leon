import { z } from 'zod';
import { ConnectorAuthError, type ConnectorHttp, ConnectorHttpError } from '../http';
import type { Connector, ConnectorItem, SyncPage, SyncState } from '../types';
import { type PlaneClient, type Project, planeClient } from './client';
import { advance, type Cursor, isDone, readCursor } from './cursor';
import { peopleById, toItem } from './map';

// Doc lue le 15/10/2026 :
//   https://developers.plane.so/api-reference/v2/introduction        (API v2 « version courante », v1 « reste disponible »)
//   https://developers.plane.so/api-reference/v2/authentication      (en-tête X-Api-Key, clé = jeton d'accès personnel, droits du propriétaire)
//   https://developers.plane.so/api-reference/v2/pagination          (décalage par défaut, curseur avec paginate=cursor, 200 par page au plus)
//   https://developers.plane.so/api-reference/v2/filtering-and-ordering (updated_at__gte inclus, order_by=updated_at, exclusions par défaut)
//   https://developers.plane.so/api-reference/v2/work-items/list-work-items (liste d'un projet, fields, description_html)
//   https://developers.plane.so/api-reference/v2/work-item-comments/list-comments (commentaires d'un élément, expand=actor)
//   https://developers.plane.so/api-reference/v2/projects/list-projects, .../members/list-workspace-members, .../users/get-current-user
//   https://developers.plane.so/api-reference/v2/errors              (429 avec Retry-After ; 401 clé refusée, 403 rôle ou portée)
//   https://developers.plane.so/api-reference/introduction           (v1 : 60 requêtes par minute et par clé)
//   https://raw.githubusercontent.com/makeplane/plane/preview/apps/api/plane/app/serializers/workspace.py
//     (identifiant d'espace : ^[a-zA-Z0-9_-]+$) et https://github.com/makeplane/plane/pull/6546 (adresse /<espace>/browse/<PROJET>-<n>)
// Écarts au plan, d'après la doc : l'API v1 n'a aucun filtre « modifié depuis » (la liste v1 ne filtre que sur
// external_id) ; on lit donc la v2, qui en a un (`updated_at__gte`) avec un tri par date de modification et une
// pagination par curseur stable. L'en-tête est X-Api-Key (X-API-Key en v1). L'identifiant d'espace admet les
// majuscules et le tiret bas, le plan les excluait. Le débit de la v2 n'est pas chiffré : on garde les 60 requêtes
// par minute de la v1 (une par seconde). Un élément est `work-item:<uuid>` (stable ; le numéro change si on le déplace).
// Les éléments archivés, les brouillons et ceux en triage ne sont pas lus (exclusions par défaut de Plane).
// Un 403 ou un 404 sur les commentaires d'un élément ou sur la liste des membres est attrapé : l'élément sort sans
// commentaires, ou sans nom d'auteur pour son corps. Un commentaire masqué par la modération n'est pas repris.
// Au plus 400 commentaires par élément (les plus récents) et 1 000 membres.
//
// Non vérifié (aucune clé réelle) :
//   - que l'ajout d'un commentaire fait avancer `updated_at` de l'élément (la doc ne le dit pas) : sinon un
//     commentaire sur un élément resté intact n'est lu qu'à sa prochaine modification ;
//   - que `updated_at__gte` accepte une date à la milliseconde (« 2026-10-12T16:40:05.902Z »), alors que Plane écrit
//     des microsecondes : un élément du même instant mais absent du curseur est relu, au pire une fois de trop ;
//   - la réponse de Plane pour un projet visible mais que la clé n'a pas rejoint : un 403 sur la liste des éléments
//     remonte comme « Plane rejected the key » pour toute la connexion ;
//   - que `description_html` met le texte d'une liste dans des paragraphes (« <li><p>…</p></li> ») : le plan de
//     secours est dans `map.ts`, la doc ne montre que des « <p> » ;
//   - l'adresse /<espace>/browse/<PROJET>-<n> : elle vient d'une demande de fusion du dépôt de Plane, pas de la doc ;
//   - si les projets archivés sont rendus par la liste des projets (sans effet : leurs éléments ne le sont pas).

const ConfigSchema = z.object({
  apiKey: z.string().trim().min(1).max(500),
  workspace: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{1,100}$/),
});
type Config = z.infer<typeof ConfigSchema>;

// Un 403 ou un 404 sur une ressource secondaire laisse l'élément sortir sans elle ; un 401 remonte.
async function optional<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const denied = error instanceof ConnectorAuthError && error.status === 403;
    const missing = error instanceof ConnectorHttpError && error.status === 404;
    if (denied || missing) return fallback;
    throw error;
  }
}

async function* syncProject(
  plane: PlaneClient,
  context: { workspace: string; project: Project; people: ReturnType<typeof peopleById> },
  cursor: Cursor,
  since: Date,
): AsyncGenerator<SyncPage> {
  const { workspace, project, people } = context;
  const from = cursor[project.id]?.at ?? since.toISOString();
  for await (const rows of plane.workItems(project.id, from)) {
    const items: ConnectorItem[] = [];
    let fresh = false;
    for (const row of rows) {
      if (!isDone(cursor[project.id], row)) {
        fresh = true;
        const comments = await optional(() => plane.comments(project.id, row.id), []);
        const item = toItem({ workspace, project, row, comments, people });
        if (item) items.push(item);
      }
      cursor[project.id] = advance(cursor[project.id], row);
    }
    // Une page déjà lue en entier (le dernier élément du passage d'avant) ne change rien : pas de page.
    if (fresh) yield { items, cursor: JSON.stringify(cursor) };
  }
}

async function* syncWorkspace(
  plane: PlaneClient,
  workspace: string,
  state: SyncState,
): AsyncGenerator<SyncPage> {
  const cursor = readCursor(state.cursor);
  const projects = await plane.projects();
  const people = peopleById(await optional(() => plane.members(), []));
  for (const project of projects) {
    yield* syncProject(plane, { workspace, project, people }, cursor, state.since);
  }
}

export const planeConnector: Connector<Config> = {
  id: 'plane',
  configSchema: ConfigSchema,
  secretFields: ['apiKey'],
  hosts: () => ['api.plane.so'],
  minIntervalMs: 1000, // 60 requêtes par minute

  async verify(config: Config, http: ConnectorHttp) {
    const plane = planeClient(config.apiKey, config.workspace, http);
    const name = await plane.account();
    await plane.checkWorkspace();
    return { account: `${name} (${config.workspace})` };
  },

  sync(config: Config, state: SyncState, http: ConnectorHttp) {
    return syncWorkspace(
      planeClient(config.apiKey, config.workspace, http),
      config.workspace,
      state,
    );
  },
};
