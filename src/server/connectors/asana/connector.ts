import { z } from 'zod';
import { ConnectorHttpError } from '../http';
import type { Connector, SyncPage } from '../types';
import { asanaClient, type Workspace } from './client';
import { syncProjects } from './projects';

// Doc lue le 15/10/2026 (developers.asana.com) :
//   /docs/personal-access-token (jeton personnel, en-tête « Authorization: Bearer », console
//     app.asana.com/0/my-apps), /docs/authentication
//   /reference/gettasks (GET /tasks : project, modified_since, limit, offset, opt_fields),
//   /reference/getprojects (GET /projects : workspace, archived, limit, offset),
//   /reference/getstoriesfortask (GET /tasks/{gid}/stories : resource_subtype=comment_added),
//   /reference/getuser (GET /users/me : name, workspaces), /reference/gettask (champs d'une tâche),
//   /docs/pagination (limit de 1 à 100 ; next_page seulement si limit est donné ; offset périmable),
//   /docs/rate-limits (150 requêtes par minute en gratuit, 1 500 en payant ; 429 + Retry-After),
//   /docs/dates-and-times (ISO 8601 UTC avec millisecondes), /docs/errors,
//   et le fichier OpenAPI officiel github.com/Asana/openapi (defs/asana_oas.yaml, paramètres des histoires).
//
// Écarts au plan, d'après la doc :
// - Les commentaires se filtrent côté Asana par `resource_subtype=comment_added` ; le champ `type`
//   (« comment ») que cite le plan n'est pas documenté dans StoryCompact.
// - Aucun ordre n'est documenté pour GET /tasks (pas de tri par modification) : le curseur n'est pas
//   une date mais, par projet, un repère et l'offset de la page en cours (voir cursor.ts). Seul
//   l'ordre à l'intérieur d'une page est croissant.
// - Le corps est `notes` (texte brut), pas `html_notes`. L'adresse e-mail d'un auteur demanderait
//   une requête par utilisateur : l'auteur n'a qu'un nom. Les sous-tâches ne sont pas lues (la liste
//   d'un projet ne les donne pas, et modifier une sous-tâche ne modifie pas sa tâche).
// - Rythme : 400 ms entre deux requêtes, soit 150 par minute, la limite du plan gratuit.
// Un 403 sur les commentaires d'une tâche est attrapé : la tâche sort avec sa seule description.
// Les projets archivés ne sont pas lus. Une tâche rangée dans plusieurs projets n'est rendue qu'une
// fois par appel (le premier projet lu).
//
// Non vérifié (aucune clé réelle) : si `modified_since` inclut l'instant donné (on recule d'une
// seconde et on écarte les tâches déjà vues) ; la durée de vie d'un offset (un offset refusé en 400
// fait reprendre le projet à sa première page, ce code d'erreur est supposé) ; le tri de GET
// /projects ; que GET /users/me rende `workspaces` à un jeton sans autre portée ; les réponses
// d'exemple sont construites d'après les schémas de la doc, qui ne donne pas d'exemple complet.
// Le chemin `created_by.name` demandé à GET /tasks n'est pas listé dans les `opt_fields` de la doc
// (seul `created_by` l'est, et son schéma ne porte que `gid` et `resource_type` ; sur les histoires,
// `created_by.name` est bien listé). Si Asana ignore le chemin, l'auteur du tour `document` reste
// nul, ce que le code tolère ; s'il le refuse en 400, la lecture des tâches échoue. La forme de
// `created_by` (avec un `name`) dans les exemples de tâches est donc supposée, pas tirée de la doc.
// Se vérifie à l'essai réel (T44).

const ConfigSchema = z.object({
  token: z.string().trim().min(1).max(500),
  workspace: z.string().trim().max(200).optional(), // nom ou identifiant ; vide : le premier espace
});
type Config = z.infer<typeof ConfigSchema>;

function pickWorkspace(workspaces: Workspace[], wanted: string | undefined): Workspace {
  const name = wanted?.toLowerCase();
  const found = name
    ? workspaces.find((w) => w.gid === wanted || w.name.toLowerCase() === name)
    : workspaces[0];
  if (found) return found;
  throw new ConnectorHttpError(
    null,
    wanted ? `Espace introuvable : ${wanted}` : 'Aucun espace Asana accessible',
  );
}

export const asanaConnector: Connector<Config> = {
  id: 'asana',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['app.asana.com'],
  minIntervalMs: 400,

  async verify(config, http) {
    const { name, workspaces } = await asanaClient(config.token, http).me();
    const workspace = pickWorkspace(workspaces, config.workspace);
    return { account: `${name ?? 'Compte Asana'} (${workspace.name})` };
  },

  async *sync(config, state, http): AsyncGenerator<SyncPage> {
    const asana = asanaClient(config.token, http);
    const { workspaces } = await asana.me();
    yield* syncProjects(asana, pickWorkspace(workspaces, config.workspace), state);
  },
};
