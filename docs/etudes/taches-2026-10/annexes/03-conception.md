# Annexe 3 : conception détaillée

Proposition à valider dans la spec. Elle s'appuie sur le code de `main` (4e8d36c) et respecte les règles de simplicité du [plan du premier jet](../../../plans/2026-10-13-premier-jet.md) : monolithe, pas de couche service ni repository, fonctions courtes, zod aux frontières, pas de nouvelle dépendance sans exception écrite.

## 1. Données

Migration `0007-taches.sql` (lot 1). Même motif que la mémoire : `tenant_id`, `acl uuid[]`, politique RLS `tenant_acl` (`0003-memoire.sql`), clés étrangères composées `(tenant_id, id)` comme dans `0005-durcissement.sql`. Esquisse :

```sql
create table task_projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  key text not null check (key ~ '^[A-Z][A-Z0-9]{1,9}$'),   -- « LEO »
  name text not null,
  card_id uuid,                                            -- fiche « projet » de la mémoire, facultative
  last_number integer not null default 0,
  acl uuid[] not null,
  unique (tenant_id, key)
);

create table task_statuses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, project_id uuid not null,
  label text not null, color text, position integer not null,
  category text not null check (category in ('triage','backlog','todo','started','done','canceled'))
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, project_id uuid not null,
  number integer not null,                                 -- LEO-12
  status_id uuid not null, parent_id uuid,                 -- sous-tâches
  title text not null check (char_length(title) between 1 and 200),
  description_md text not null default '',
  priority text not null default 'none' check (priority in ('none','low','medium','high','urgent')),
  assignee_id uuid, creator_id uuid not null,
  due_date date, position integer not null,
  origin text not null check (origin in ('ui','mcp','cli','pipeline','github')),
  completed_at timestamptz,
  acl uuid[] not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (project_id, number)
);

-- task_labels (nom, couleur, acl) et task_label_links (tâche, étiquette)
-- task_comments (auteur, body_md)
-- task_links (tâche ↔ fiche, fait facultatif, origine)
-- task_events : journal en ajout seul. Porte la provenance de chaque changement :
--   actor_kind ('user','agent','leon','github'), client (ex. « Claude Code »), kind, payload jsonb,
--   source_id, turn_id, quote, quote_start, quote_end.
-- revoke update, delete on task_events from leon_app;
```

- **La numérotation** se fait par `update task_projects set last_number = last_number + 1 … returning`, ce qui sérialise deux créations simultanées (repris de Kaneo).
- **Les tables enfants** (commentaires, événements, liens, étiquettes posées) n'ont pas d'ACL propre : leur politique vérifie que la tâche est visible (`exists (select 1 from tasks …)`). Quand une tâche « À trier », privée, est acceptée et passe à l'équipe, rien n'est à recopier.
- **Un lien vers une fiche** n'est accepté que si la fiche est visible de celui qui le pose.
- Migration `0008` (lot 4) : `task_candidates`, sur le modèle de `fact_candidates`, et la valeur `tasks` ajoutée au CHECK de `ingest_runs.step`.
- Migration `0009` (lot 7) : les webhooks GitHub et les PR liées aux tâches.

## 2. Alimentation automatique

### Où ça se branche

| Étape | Modèle | Ce qui change |
|---|---|---|
| Triage (`src/server/pipeline/prompts/triage.ts`) | Haiku | Sortie en plus : `taskTurns`, les tours qui contiennent une tâche. L'extraction tourne si `keep` est vrai **ou** si `taskTurns` n'est pas vide ; dans ce second cas, elle ne lit que ces tours et celui qui précède, ce qui borne le coût des sessions de code. |
| Extraction (`src/server/pipeline/prompts/extraction.ts`) | Sonnet | Sortie en plus : `tasks[]` avec type (à faire, fait, mise à jour), titre, échéance, indices d'assigné, de projet et de sujet, citation, engagement (`engagement`, `demande`, `proposition`, `session`), confiance, sensibilité. Les dates relatives se résolvent avec la date du tour ; la citation passe par `verifyQuote` (`src/server/pipeline/quote.ts`) ; les actions passagères de la session (`session`) sont rejetées. |
| **Nouvelle étape `tasks`** | Haiku | Après le rangement, pour pouvoir lier les fiches qu'il vient de créer. Contexte de chaque candidat : 5 tâches proches au plus (similarité de titre `pg_trgm`, y compris les tâches refusées), les tâches déjà touchées par la même source, les projets, les fiches candidates (`findCardCandidates`, `src/server/memory/cards.ts`). Décision : `new`, `duplicate`, `complete`, `update` ou `ignore`. Une fonction pure n'accepte que des identifiants présents dans le contexte, et un titre normalisé identique (`normalizeStatement`, `src/server/pipeline/placement/plan.ts`) à une tâche ouverte force `duplicate`. |

Le motif est le même que pour le rangement (`src/server/pipeline/placement/` : `context`, `plan`, `apply`, `run`).

### Politique

| Cas | Effet |
|---|---|
| Engagement ou demande, confiance ≥ 0,8, non sensible, projet reconnu | Tâche créée en « À faire », visible du projet |
| Autre cas, ou simple proposition | Statut « À trier », **privée à l'auteur** ; l'accepter la rend visible du projet |
| Sensible | « À trier », privée, jamais élargie automatiquement |
| Doublon | Événement « mentionnée » avec la citation sur la tâche existante |
| « C'est fait » | Appliqué si confiance ≥ 0,8 et si l'auteur est l'assigné ou le créateur, avec un bouton « Annuler » ; sinon un signal avec un bouton « Appliquer » |
| Tâche refusée depuis « À trier » | Reste dans le contexte de comparaison : jamais reproposée |

Les suggestions passent par le statut « À trier », comme dans Linear, et non par « À vérifier » : une suggestion de tâche se corrige avant d'être acceptée, et on ne touche pas au code de `review_items`, très durci.

### GitHub

Un webhook de dépôt ou d'organisation, sans GitHub App en V1. Le secret est dérivé de `BETTER_AUTH_SECRET` et de l'identifiant du webhook : rien à stocker. La signature `X-Hub-Signature-256` est vérifiée en temps constant. Sur les événements `pull_request`, l'identifiant `LEO-12` est cherché dans la branche, le titre puis le corps : PR ouverte → lien posé et « En cours » ; fusionnée → « Terminé » ; fermée sans fusion → simple événement. Aucun appel sortant vers GitHub en V1.

### Briefing

`composeBriefing` (`src/server/memory/briefing.ts`) gagne une section « Tes tâches » : les tâches assignées en cours ou à faire, les retards d'abord, 8 lignes et environ 1 000 caractères au plus sur les 3 000 du budget. Plus « N tâches à trier » et « Leon a fermé LEO-12 (conversation du 14/10) ». Le hook de démarrage de Claude Code et l'outil MCP `briefing` en profitent sans autre changement.

### Coût

L'extraction ajoute environ 100 tokens de sortie par tâche, avec une consigne déjà en cache. L'étape `tasks` sur Haiku coûte de l'ordre de 0,0005 $ par run, et seulement quand il y a des candidats. Le vrai risque est ailleurs : ouvrir le triage fait passer plus de sessions de code dans Sonnet. À mesurer avec les journaux `llm.usage` lors d'un essai réel (lot 4) avant d'activer la création directe.

## 3. Surfaces

- **Interface** : `/taches` (liste groupée par statut, vue tableau, filtres dans l'URL), `/taches/triage`, `/taches/LEO-12` ; projets, statuts et GitHub dans `/reglages` ; bloc « Tâches liées » sur une fiche ; entrée « Tâches » dans `SECTIONS` (`src/components/sidebar-sections.tsx`) avec le compteur des tâches à trier ; ⌘K « Créer une tâche » et ouverture par `LEO-12`. Le code serveur vit dans `src/server/tasks/*`, au même rang que `src/server/memory/*` ; l'interface passe par des server actions.
- **MCP** (`src/server/mcp/tools/`, enveloppe `guarded.ts`) : `task_list`, `task_get`, `task_create`, `task_update`, `task_comment`, `task_start` (m'assigne la tâche, la passe en cours, renvoie la branche `leo-12-titre-court`). Chaque action d'agent écrit un événement avec le nom du client.
- **CLI** (`src/cli/leon.ts`) : `pnpm leon tasks [--mine] [--project] [--status]`, `pnpm leon task show|new|start|done|comment`. Exemple : `git switch -c $(pnpm -s leon task start LEO-12)`.
- **API** (Hono, jeton Bearer, `src/server/api/`) : `GET`/`POST /api/v1/tasks`, `GET`/`PATCH /api/v1/tasks/:ref`, `POST /api/v1/tasks/:ref/comments`, `POST /api/v1/tasks/:ref/start`, `POST /api/v1/github/:hookId`.

## 4. Dépendances nouvelles

Toutes MIT, chacune justifiée dans son lot :

- lot 8 : `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (la logique de kanban de Kaneo en dépend) ;
- lot 9 : `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/markdown`, `@tiptap/extension-list`, `@tiptap/extensions`, `@tiptap/suggestion` (paquets libres seulement, aucune extension Pro).

Non repris : zustand, TanStack Router et Query, i18next, `@hono/zod-openapi`, `@hono/node-ws`.

## 5. Lots et vérification

| # | Lot | Vérification principale |
|---|---|---|
| 1 | Socle : `0007-taches.sql`, schéma Drizzle, `src/server/tasks/*` | Deux créations simultanées donnent 1 et 2 ; matrice RLS (deux utilisateurs, tables enfants, lien vers une fiche invisible refusé) |
| 2 | API, MCP, CLI | Tests d'intégration MCP (créer, lister, démarrer) ; à la main : Claude Code crée et démarre une tâche |
| 3 | Interface : liste, page de tâche, triage, ⌘K, réglages | Tests des actions, build de vérification, parcours à la main |
| 4 | Détection dans le triage et l'extraction, `task_candidates`, sans rien appliquer | Tests des consignes avec un faux LLM ; **essai réel** : précision et coût |
| 5 | Étape `tasks` | Identifiant inventé rejeté, doublon forcé, seuils, « À trier » privée, pas de reproposition, de bout en bout |
| 6 | Briefing et consignes MCP | Budget de caractères respecté, droits respectés |
| 7 | GitHub | Signature, lecture de l'identifiant, fusion → terminé ; à la main avec `curl` sur une charge signée |
| 8 | Kanban glisser-déposer | Tests purs portés de Kaneo, conflit 409, déplacement au clavier possible |
| 9 | Éditeur TipTap, menu `/`, `@fiche` | Aller-retour Markdown sur des exemples, build |
| 10 | Raccourcis | AZERTY, raccourcis actifs seulement dans leur zone (accessibilité, voir la spec de design) |

## 6. Risques

- **Le bruit** : chaque « il faudrait » peut devenir une tâche. Parade : « À trier » privée par défaut, création directe seulement après l'essai réel.
- **La confidentialité** : une tâche d'équipe qui cite une conversation privée. Même règle que pour les faits partagés, à confirmer.
- **Le webhook GitHub** cesse de marcher si son créateur quitte l'organisation, et changer `BETTER_AUTH_SECRET` invalide tous les secrets.
- **L'aller-retour Markdown** de TipTap perd de l'information dès qu'on ajoute des extensions : liste restreinte.
- **Le coût** : ouvrir le triage aux sessions de code ; à mesurer avant de généraliser.
