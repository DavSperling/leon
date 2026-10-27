import { z } from 'zod';
import { ConnectorAuthError, ConnectorHttpError } from '../http';
import type { Connector, SyncPage } from '../types';
import { asanaClient, type Workspace } from './client';
import { asanaOAuth } from './oauth';
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
// GET /tasks demande `created_by`, que la doc liste dans ses `opt_fields` ; `created_by.name` n'y est
// pas (il l'est sur les histoires), et un chemin hors doc risque un 400 qui ferait échouer toute
// lecture de tâches. Le schéma de `created_by` ne porte que `gid` et `resource_type` : on compte sur
// le `name` que porte d'ordinaire un utilisateur « compact » (les exemples de tâches en ont un, sans
// que la doc le garantisse) ; sans nom, l'auteur du tour `document` reste nul, ce que le code tolère.
// Les requêtes de ce connecteur sont confrontées à un extrait de la spec officielle, voir
// src/test/contracts/vendor-spec.ts.
// Le bouton « Se connecter avec Asana » (adresses, droits, jetons) est décrit dans oauth.ts. Avec lui,
// le jeton d'accès remplace le jeton personnel dans l'en-tête, rien d'autre ne change.
// Se vérifie à l'essai réel (T44).

// Deux façons de se brancher : le jeton personnel collé (`token`, forme d'origine, sans `authMode`) ou
// le bouton (`accessToken` et ses compagnons, posés par le socle OAuth ; le bouton ne remplit pas
// `token`). Un z.object raffiné, et non une union : le catalogue lit `.shape`.
const ConfigSchema = z
  .object({
    authMode: z.enum(['key', 'oauth']).default('key'),
    token: z.string().trim().min(1).max(500).optional(),
    accessToken: z.string().trim().min(1).max(2000).optional(),
    refreshToken: z.string().nullable().optional(),
    expiresAt: z.string().nullable().optional(),
    workspace: z.string().trim().max(200).optional(), // nom ou identifiant ; vide : le premier espace
  })
  .superRefine((config, ctx) => {
    const field = config.authMode === 'oauth' ? 'accessToken' : 'token';
    if (!config[field]) ctx.addIssue({ code: 'custom', path: [field], message: 'Required' });
  });
type Config = z.infer<typeof ConfigSchema>;

// Le jeton qui part dans l'en-tête, quelle que soit la façon de se brancher.
function bearerToken(config: Config): string {
  const token = config.authMode === 'oauth' ? config.accessToken : config.token;
  if (!token) throw new ConnectorAuthError('Asana'); // le schéma l'exige déjà : ne se produit pas
  return token;
}

function pickWorkspace(workspaces: Workspace[], wanted: string | undefined): Workspace {
  const name = wanted?.toLowerCase();
  const found = name
    ? workspaces.find((w) => w.gid === wanted || w.name.toLowerCase() === name)
    : workspaces[0];
  if (found) return found;
  // 404 seulement si l'utilisateur a saisi l'espace : un compte sans espace n'est pas une saisie.
  throw new ConnectorHttpError(
    wanted ? 404 : null,
    wanted ? `Workspace not found: ${wanted}` : 'No Asana workspace accessible',
  );
}

export const asanaConnector: Connector<Config> = {
  id: 'asana',
  configSchema: ConfigSchema,
  secretFields: ['token'],
  hosts: () => ['app.asana.com'],
  minIntervalMs: 400,
  oauth: asanaOAuth,

  async verify(config, http) {
    const { gid, name, workspaces } = await asanaClient(bearerToken(config), http).me();
    const workspace = pickWorkspace(workspaces, config.workspace);
    return {
      account: `${name ?? 'Asana account'} (${workspace.name})`,
      accountKey: `${gid}:${workspace.gid}`,
    };
  },

  async *sync(config, state, http): AsyncGenerator<SyncPage> {
    const asana = asanaClient(bearerToken(config), http);
    const { workspaces } = await asana.me();
    yield* syncProjects(asana, pickWorkspace(workspaces, config.workspace), state);
  },
};
