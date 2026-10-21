# Annexe 2 : carte du code de Kaneo

Relevé le 14/10/2026 sur [usekaneo/kaneo](https://github.com/usekaneo/kaneo), branche `main` au commit `4c89504` (version 2.46.2 du 12/10/2026, dernier commit le 13/10). Les chemins sont relatifs au dépôt Kaneo.

## Licence

`LICENSE` à la racine : **MIT**. Les sous-paquets `cli`, `mcp`, `importers` et `planka-import` sont aussi en MIT. Aucun dossier `ee/` ni « enterprise » : la facturation (`apps/api/src/billing/*`) est du code MIT ordinaire. `apps/docs/LICENSE` est un reste du modèle Mintlify, sans intérêt pour nous.

Obligation quand on reprend du code : garder l'avis de copyright et le texte de la licence MIT dans notre fichier des codes tiers.

## Organisation

- `apps/api` : API Hono, Drizzle, better-auth, WebSocket, point MCP hébergé.
- `apps/web` : l'application (Vite, React 19.3 avec le React Compiler, TanStack Router et Query, zustand, i18next, shadcn « new-york », Tailwind 4).
- `packages/libs` : client Hono typé. `packages/permissions` : rôles. `packages/mcp` : serveur MCP autonome. `packages/cli`, `email`, `importers`.

## Ce qu'on reprend, et ce qui change

| Domaine | Chez Kaneo | Chez Leon |
|---|---|---|
| Schéma | `apps/api/src/database/schema.ts`, migrations `apps/api/drizzle/0000–0063` | Migration SQL écrite à la main, avec `tenant_id`, `acl` et RLS (Kaneo filtre côté application, sans RLS) |
| Numérotation | `project.slug` sert de clé, `lastTaskNumber`, identifiant `KAN-12` (`apps/api/src/task/ticket-id.ts`) | Repris tel quel : clé de projet, `last_number`, `LEO-12` |
| Position | entier, nouvelle tâche = max + 1 (`apps/api/src/task/controllers/next-task-position.ts`) | Repris |
| Statuts | table `column` (slug, position, couleur, `isFinal`) ; la tâche porte le slug **et** `columnId` | `task_statuses` avec une **catégorie** (à trier, backlog, à faire, en cours, terminé, annulé) que lisent l'automatique et GitHub ; `status_id` seul |
| Sous-tâches | lignes `task_relation` de type `subtask` (aussi `blocks`, `related`) | `parent_id` sur la tâche ; « bloque » et « lié » hors V1 |
| Étiquettes | une ligne copiée par tâche (définition et affectation dans la même table) | Table des étiquettes et table de liens |
| Description, commentaires | Markdown produit par `@tiptap/markdown` | Repris : `description_md` |
| Réordonnancement | `POST /task/reorder` (`apps/api/src/task/controllers/reorder-tasks.ts`) : verrou `FOR UPDATE`, 409 si le tableau a changé depuis l'instantané du client, une seule mise à jour par `jsonb_to_recordset` | Repris dans une server action |
| Permissions | rôles viewer, member, admin, owner (`packages/permissions/src/index.ts`), contrôlés par `apps/api/src/utils/require-workspace-permission.ts` | Notre RLS et nos ACL ; pas de rôles par projet en V1 |
| API | Hono + `@hono/zod-openapi` (`apps/api/src/task/index.ts`, `column/index.ts`) | Nos routes Hono et `api-contract.ts`, sans OpenAPI |

## Interface (`apps/web/src`)

| Élément | Chemin | Adaptation |
|---|---|---|
| Kanban | `components/kanban-board/*` ; logique pure dans `apply-reorder.ts`, `move-task.ts`, `board-collision-detection.ts`, `drag-preview/*` | Logique pure portée avec ses tests ; composants à brancher sur nos server actions |
| Listes | `components/list-view/*`, `components/backlog-list-view/*` | Rendu serveur chez nous, filtres dans l'URL |
| Détail de tâche | `components/task/task-details-sheet.tsx`, `task-details-content.tsx`, `properties/*` | Page `/taches/LEO-12` |
| Éditeur | `components/editor/extensions.ts` (StarterKit, Markdown, listes de tâches, tableaux, code, Mermaid…), `editor/slash-commands.ts`, mentions dans `components/task/extensions/*` | Liste d'extensions restreinte (l'aller-retour Markdown perd de l'information au-delà) ; mention `@fiche` vers la mémoire |
| Palette | `components/command-palette/index.tsx` (cmdk) | Fusion avec notre ⌘K existant |
| Raccourcis | `lib/shortcuts/*` (`catalog.ts`, `use-shortcut.ts`) | Comparer `event.key` pour l'AZERTY ; raccourcis actifs seulement dans leur zone |

Ce qu'il faut remplacer partout : TanStack Router (`useNavigate`, `useLocation`) par `next/navigation`, le client `hc` typé sur l'API de Kaneo par nos server actions, les stores zustand, `react-i18next` (textes en français en dur), `framer-motion` si on peut s'en passer. Les composants deviennent `"use client"`.

## Ce qu'on ne reprend pas en V1

- **Temps réel** (`apps/api/src/ws/*`, `@hono/node-ws`) : impossible dans les route handlers de Next.js, il faudrait un second serveur. On rafraîchit la page après chaque action.
- **Webhooks sortants** (`apps/api/src/plugins/generic-webhook/*`) et intégrations Slack, Discord, Telegram, Mattermost.
- **Webhooks entrants GitLab et Gitea.** Celui de GitHub (`apps/api/src/plugins/*`) sert d'idée pour le lot 7.
- **Les ~35 outils MCP** (`packages/mcp/src/tools/register.ts`) : on reprend leur forme, pas leur nombre. Six outils suffisent en V1.
- Champs personnalisés, règles d'automatisation, suivi du temps, pièces jointes, notifications, facturation.

## Effort

- **Serveur** : presque direct. Le schéma et les algorithmes se transposent ; le travail est la RLS et les tests.
- **Interface** : moyen. Le kanban et le détail dépendent du routeur, du client d'API et des stores de Kaneo.

## Non vérifié

Quels composants de `components/ui/*` reposent sur Base UI plutôt que Radix ; si une des 64 migrations active la RLS (aucun code lu ne s'en sert).
