# 01. Données et migrations

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Ce chapitre donne tout ce qui entre dans la base pour le système d'agents : le SQL des onze migrations 0075 à 0085, prêt à poser dans `src/server/db/migrations/`, les schémas Drizzle, les tests, et les quatre retouches hors SQL qui vont avec. Il recopie les noms de l'architecture (`00-architecture.md`, section 7) sans en changer un seul. Là où elle ne peut pas être suivie à la lettre, c'est écrit en section 18.

Convention de lecture, comme dans l'architecture :

- **existe** : présent dans le code, avec son chemin et sa ligne. Vérifié par lecture, au commit `fabea06`.
- **à créer** : n'existe pas. Le nom est fixé par l'architecture, ou ici quand elle ne le fixe pas.
- **jalon 1** : fait partie du premier agent chez un client (architecture, 14.3). **après** : vient ensuite.

Ce qui a été joué, et ce qui ne l'a pas été. Les onze fichiers SQL ont été appliqués, dans l'ordre, sur un Postgres 16.15 jetable, monté pour cela hors du projet, avec un schéma minimal recopié des migrations existantes (les tables et fonctions que ces migrations touchent, pas les 74 migrations : `pgvector` n'y est pas installé). Chaque fonction et chaque règle de droits y a été essayée à la main, sous le rôle `leon_app` avec le contexte de `withTenant`, et sous `leon_porte`. Rien n'a été joué sur la base du projet, ni sur Postgres 17. Aucun test vitest n'a été lancé (`node_modules` est absent) : le TypeScript de ce chapitre n'a pas été compilé. Le détail est en section 19.

## 1. Ce que ce chapitre fixe

1. **Onze migrations**, `0075` à `0085`, en SQL complet. `0075` à `0081` font le jalon 1. `0082` à `0085` viennent après.
2. **Le corps entier de chaque fonction SQL** de la section 7.4 de l'architecture : 24 fonctions. Plus deux que 7.4 n'a pas et que ses règles demandent : `purger_veilles` et `heure_locale` (section 18, écart 7).
3. **Les schémas Drizzle** : trois fichiers à créer (`schema/agents.ts`, `schema/webhooks.ts`, `schema/channels.ts`) et cinq à compléter (`actions.ts`, `connections.ts`, `memory.ts`, `organisation.ts`, `auth.ts`).
4. **Les tests** : un fichier `NNNN-sujet.db.test.ts` par migration, les entrées des trois listes de garde (`DELETE_ALLOWED`, `COMPOSITE_KEYS`, `VALIDATED_IN_CODE`), un test qui supprime le parent pour chaque clé composée en `set null`, un test « autre organisation refusée » par fonction qui écrit, le test « un membre ordinaire ne modifie pas une activation d'équipe ».
5. **Quatre retouches hors SQL** : l'appel de `supprimer_agents_du_compte` dans `deleteAccount` ; le rôle `leon_porte` dans `docker/postgres/init.sql` ; la commande du README ; le bloc `do` en tête de `0083`.

Ce chapitre ne refait pas le sens des colonnes : il est fixé par la section 7 de l'architecture. Il ne dit pas non plus comment le code les lit : c'est l'affaire des chapitres 02 à 07.

## 2. Vue d'ensemble

### 2.1 Les onze migrations

« PR » renvoie au tableau du jalon 1 de l'architecture (14.3).

| Fichier | Jalon | PR | Tables créées | Tables modifiées | Fonctions |
|---|---|---|---|---|---|
| `0075-appels-modele-attribution.sql` | 1 | 3 | | `appels_modele` | |
| `0076-budget-agents.sql` | 1 | 4 | `budgets_agents`, `budgets_personne_jour` | | `reserver_budget`, `solder_budget`, `budget_du_mois` |
| `0077-evenements.sql` | 1 | 5 | `evenements` | `ingest_runs` | `runs_a_signaler`, `purger_evenements` |
| `0078-agents-actives.sql` | 1 | 5 | `agents_actives`, `executions_par_jour` | `reglages_organisation` | `reserver_execution`, `activations_de`, `reprendre_agent_equipe` |
| `0079-executions-agent.sql` | 1 | 6 | `executions_agent`, `etapes_execution` | | `executions_a_reveiller`, `purger_executions` |
| `0080-actions-generalisees.sql` | 1 | 7 | | `actions` | `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| `0081-connexions-renouvellement.sql` | 1 | 7 | `creneaux_ecriture` | `connections` | `reserver_creneau` |
| `0082-veilles.sql` | après | veilles et horloge | `veilles` | | `veilles_echues`, `purger_veilles` ; refait `supprimer_agents_du_compte` |
| `0083-webhooks.sql` | après | webhooks | `abonnements_webhook`, `boite_entree_webhooks` | | `porte_secret`, `porte_deposer`, `webhooks_a_traiter`, `prendre_livraison`, `connexions_du_compte`, `abonnements_a_renouveler`, `purger_boite_entree` ; refait `couper_agents_du_membre` |
| `0084-canaux-sortants.sql` | après | récapitulatif et Slack | `preferences_canaux`, `installations_slack`, `messages_sortants` | `"user"` | `heure_locale`, `compte_slack`, `recaps_dus` ; refait `supprimer_agents_du_compte` |
| `0085-agents-statistiques.sql` | après | statistiques | | | `taux_acceptation_agents` |

Les dépendances entre fichiers suivent leur numéro : `0079` cite `agents_actives` (0078), `0080` cite `executions_agent` (0079), `0082` et `0084` refont une fonction de `0080`, `0083` en refait une autre. Aucun fichier ne peut passer avant un fichier de numéro plus petit.

```mermaid
flowchart LR
  sources --> evenements
  ingest_runs -. un run, un événement, sans clé .-> evenements
  evenements -. recopie de source_id et cle_objet, sans clé .-> executions_agent
  agents_actives -. set null .-> executions_agent
  agents_actives --> executions_par_jour
  agents_actives --> veilles
  sources -. set null .-> veilles
  executions_agent --> etapes_execution
  executions_agent -. set null .-> actions
  connections -. set null, existe .-> actions
  connections --> creneaux_ecriture
  connections --> abonnements_webhook
  abonnements_webhook --> boite_entree_webhooks
```

Une flèche pleine est une clé étrangère en cascade. Une flèche pointillée est une clé en `set null`, ou un lien sans clé quand c'est écrit dessus. Toutes les tables nouvelles qui portent `tenant_id` tiennent en plus à `organization` par une clé en cascade, et celles qui portent `user_id` à `"user"`. Les trois tables de 0084 n'ont pas d'autre clé.

### 2.2 Ce qui existe et que ces migrations touchent

Tout ce tableau a été relu dans le dépôt.

| Pièce | État | Où | Ce que ce chapitre en fait |
|---|---|---|---|
| Dernière migration | existe | `src/server/db/migrations/0074-points-lignes-retirees.sql` | Les numéros 0075 à 0085 suivent |
| `app_tenant()`, `app_principals()` | existent | `0001-base.sql:6-9` | Lues par chaque règle `tenant_acl` |
| `app_user()`, `app_est_admin()` | existent | `0055-groupes.sql:10-11`, `:15-21` | Lues par les fonctions « pour soi » et les règles d'administrateur |
| `appels_modele` | existe | `0039-tableau-admin.sql:22-34` ; dernier `check` de `step` : `0072-agenda.sql:55-58` | 0075 : trois colonnes, quatre étapes, sécurité par ligne |
| `logUsage` | existe | `src/server/llm/anthropic-llm.ts:49-93` | Rien ici : le chapitre 04 lui fait écrire les trois colonnes |
| Contrat du `check` de `step` | existe | `src/test/contracts/llm-contract.test.ts:89-120` | Il lit la forme `step in (…)` : 0075 la garde |
| `points_par_jour`, `reserver_point` | existent | `0060-plafond-points.sql:7-31` | Modèle de `executions_par_jour` et de `reserver_execution` |
| `ingest_runs` | existe | `0003-memoire.sql:33-45`, `0005-durcissement.sql:12`, `0010-suppression-tri.sql:32-36` | 0077 : colonne `signale_le` |
| Droits sur `ingest_runs` | existent | `0003-memoire.sql:248` (`select, insert, update` sur toute la table) | Aucun droit à ajouter pour `signale_le` |
| `runs_en_attente` | existe | `0011-passages.sql:85-97`, refaite en `0019-corrections-audit.sql:42` | Modèle de `runs_a_signaler` |
| `sources`, clé `(tenant_id, id)` | existe | `0005-durcissement.sql:10` | Cible des clés composées de `evenements` et `veilles` |
| `on delete set null (colonne)` | existe | `0008-connecteurs.sql:37-38` (`sources.connection_id`) | Précédent des trois clés de ce chapitre |
| `reglages_organisation` | existe | `0057-manager-voit-tout.sql:11-22` ; Drizzle : `schema/organisation.ts:38-43` | 0078 : trois colonnes. Les règles `admin_insert` et `admin_update` s'appliquent telles quelles |
| `actions` | existe | `0037-actions.sql`, `0038-actions-github.sql` ; Drizzle : `schema/actions.ts` | 0080 : quatorze colonnes, deux `check` refaits, une règle étendue |
| `own_discussion_and_connection` | existe | `0037-actions.sql:34-42` | 0080 l'étend à l'exécution, sans changer son nom |
| `ACTION_KINDS`, `ACTION_STATUSES` | existent | `src/lib/actions.ts:7-22`, `:64` | 0080 : `ACTION_STATUSES` gagne `'defaite'` dans la même PR |
| `proposeAction`, `claimAction` | existent | `src/server/discussion/proposed-actions.ts:40-67`, `:105-119` | Rien ici (chapitre 05). 0080 reste compatible avec leur forme d'aujourd'hui |
| `connections` | existe | `0008-connecteurs.sql:3-32`, `0056-partage-connexions.sql:4` ; Drizzle : `schema/connections.ts:10-37` | 0081 : colonne `renew_lock_at` |
| `same_acl_as_discussion` | existe | `0012-discussions.sql:50-55` | Modèle de `same_acl_as_execution` |
| `supprimer_notes_du_compte` | existe | `0067-supprimer-notes.sql` | Modèle de `supprimer_agents_du_compte` |
| `deleteAccount` | existe | `src/server/auth/delete-account.ts:161-257` | Section 15.1 : un appel de plus |
| `removeMember`, `setMemberRole` | existent | `src/server/auth/members.ts:116-130`, `:100-112` | Rien ici : le chapitre 06 leur fait appeler `couper_agents_du_membre` |
| Rôles Postgres | existent | `docker/postgres/init.sql:12-13` | Section 15.2 : `leon_porte` |
| `RLS_EXCEPTIONS`, `DELETE_ALLOWED` | existent | `src/server/db/rls-coverage.db.test.ts:9-14`, `:20-34` | Section 15.4 |
| `COMPOSITE_KEYS` | existe | `src/server/db/tenant-integrity.db.test.ts:90-102` | Section 15.4 |
| `VALIDATED_IN_CODE` | existe | `src/server/db/schema-contract.db.test.ts:66` | Section 15.4 |
| Test des fonctions `security definer` | existe | `src/server/db/migrations/0046-pg-temp-en-dernier.db.test.ts` | Il vaut pour les 25 fonctions `security definer` nouvelles (les 24 de l'architecture et `purger_veilles`) : toutes posent `search_path = public, pg_temp` |
| Runner de migrations | existe | `src/server/db/migrate.ts:15-38` (verrou consultatif), `:49-59` (une transaction par fichier) | Chaque fichier tient dans une transaction |

### 2.3 Règles d'écriture, pour qui relit le SQL

Les règles de l'architecture (7.1) sont appliquées telles quelles. Sept points de plus, appris en écrivant :

1. **Une contrainte nommée à la main ne reprend jamais le nom `table_colonne_check`.** Postgres donne ce nom au `check` écrit sur la colonne : `actions_origine_check` existait déjà au moment d'ajouter la contrainte de table. D'où `actions_origine_cle_check`, `boite_entree_webhooks_cible_check`.
2. **Une seule contrainte par colonne contient `colonne = any (…)`.** Le contrat de schéma (`schema-contract.db.test.ts:53-62`) prend la première contrainte qui contient `(colonne = ANY` et la compare à l'`enum` Drizzle. Une seconde contrainte sur la même colonne s'écrit donc avec des `or` (`actions_simulation_statut_check`).
3. **`appels_modele.step` garde `in (…)`.** Aucune autre migration qui cite `appels_modele` n'écrit `step in (` : le contrat `llm-contract` lirait cette liste à la place.
4. **Une fonction qui rend une table qualifie toutes ses colonnes** (`a.tenant_id`, jamais `tenant_id`) : les colonnes de sortie portent souvent le nom d'une colonne lue. En `plpgsql`, `prendre_livraison` ajoute `#variable_conflict use_column`.
5. **Chaque migration reste compatible avec le code d'avant**, qui tourne encore pendant le recouvrement d'une mise en ligne (architecture, 4.1, règle 6). Toute colonne ajoutée à une table existante est nulle ou a un défaut.
6. **Un `alter table` sur une table existante pose `set local lock_timeout = '5s'`**, comme `0069-roles-coulisses.sql` : c'est le cas de 0075, 0077, 0078, 0080, 0081 et 0084. Le verrou exclusif d'un `alter` tient jusqu'à la fin de la transaction. Sans lui en 5 secondes, la migration échoue et se relance, plutôt que de faire attendre toutes les requêtes de la table.
7. **Une table hors de portée de l'app (modèle H) a la sécurité par ligne activée, sans règle et sans droit**, qu'elle porte `tenant_id` ou non. Sans droit, `leon_app` n'y accède déjà pas ; la sécurité par ligne couvre le jour où un droit serait accordé par erreur.

Numéros. Les numéros 0075 à 0085 sont réservés par l'architecture. Avant d'ouvrir une PR : `git fetch origin` puis `gh pr list`. Si `main` a pris un de ces numéros, tout le bloc se décale d'autant. Trois choses suivent alors le fichier : le nom de son test, les renvois d'un fichier à l'autre dans les commentaires SQL (« 0079 », « 0080 », « 0082 », « 0083 », « 0084 »), et les commentaires des schémas Drizzle.

### 2.4 Qui a quel droit sur quelle table

P : privée à la personne. O : organisation. H : hors de portée de l'app. Ce sont les trois modèles de l'architecture (7.1).

| Table | Modèle | `leon_app` peut | Règles | Écrite aussi par |
|---|---|---|---|---|
| `appels_modele` | à part | insérer | `insertion_seule` | |
| `budgets_agents`, `budgets_personne_jour` | H | rien | aucune | `reserver_budget`, `solder_budget` |
| `evenements` | P | lire, insérer, modifier `etiquette`, `urgence`, `confiance`, `trie_par`, `statut`, `raison` | `tenant_acl`, `own_source` | `purger_evenements`, `supprimer_agents_du_compte` |
| `agents_actives` | P ou lisible de l'organisation, selon `portee` | lire, insérer, modifier `autonomie`, `reglages`, `actif`, `modifie_le` | `tenant_acl`, `activateur_insert`, `activateur_update` | `reprendre_agent_equipe`, `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| `executions_par_jour` | H | rien | aucune | `reserver_execution` |
| `executions_agent` | P | lire, insérer, modifier les treize colonnes d'état | `tenant_acl`, `own_activation` | `purger_executions`, `supprimer_agents_du_compte` |
| `etapes_execution` | l'accès de son exécution | lire, insérer, modifier `statut`, `sortie`, `fini_le` | `tenant_acl`, `same_acl_as_execution` | `purger_executions` |
| `actions` | P | lire, insérer, modifier `status`, `result`, `decided_at`, `decide_par`, `annulation`, `defaite_le` | `tenant_acl`, `own_discussion_and_connection` | `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| `creneaux_ecriture` | H | rien | aucune | `reserver_creneau` |
| `veilles` | P | lire, insérer, modifier `etat`, `echeance_le`, `close_le` | `tenant_acl`, `own_activation` | `purger_veilles`, `supprimer_agents_du_compte` |
| `abonnements_webhook` | P | lire, insérer, supprimer, modifier `externe_id`, `secret`, `etat`, `expire_le`, `renouveler_le`, `renouvele_le`, `erreur` | `tenant_acl`, `own_connection` | `porte_deposer` (`dernier_recu_le`), `couper_agents_du_membre` |
| `boite_entree_webhooks` | H | rien | aucune | `porte_deposer`, `prendre_livraison`, `purger_boite_entree` |
| `preferences_canaux` | P | lire, insérer, modifier `recap_email`, `recap_heure`, `fuseau`, `slack`, `slack_user_id` | `tenant_acl` | `supprimer_agents_du_compte` |
| `installations_slack` | O | lire, insérer, supprimer, modifier `team_id`, `bot_token`, `bot_user_id`, `installe_par` | `tenant_only`, `admin_insert`, `admin_update`, `admin_delete` | |
| `messages_sortants` | P | lire, insérer, modifier `statut`, `envoye_le` | `tenant_acl` | `supprimer_agents_du_compte` |

Aucune de ces tables ne reçoit de règle `equipe_lit` : la vue manager (0057) ne s'y applique pas (architecture, 9.11). Le rôle `leon_porte` n'a de droit sur aucune table.

### 2.5 Les fonctions

« Pour soi » : l'organisation et la personne viennent de `app_tenant()` et `app_user()`. « Hors contexte » : la fonction travaille pour plusieurs organisations et ne rend que des identifiants ou des compteurs. Toutes sont `security definer set search_path = public, pg_temp`, retirées à `public`, accordées au seul rôle indiqué.

| Fonction | Rend | Contexte | Accordée à | Migration |
|---|---|---|---|---|
| `reserver_budget(p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric)` | `boolean` | pour soi | `leon_app` | 0076 |
| `solder_budget(p_reserve_usd numeric, p_reel_usd numeric)` | `void` | pour soi | `leon_app` | 0076 |
| `budget_du_mois()` | `(reserve_usd numeric, depense_usd numeric)` | pour soi, administrateur | `leon_app` | 0076 |
| `runs_a_signaler(p_minutes integer)` | `(ingest_run_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0077 |
| `purger_evenements()` | `integer` | hors contexte | `leon_app` | 0077 |
| `reserver_execution(p_activation uuid, p_plafond integer)` | `boolean` | pour soi | `leon_app` | 0078 |
| `activations_de(p_agent text)` | `(activation_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0078 |
| `reprendre_agent_equipe(p_activation uuid)` | `boolean` | pour soi, administrateur | `leon_app` | 0078 |
| `executions_a_reveiller(p_max integer)` | `(execution_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0079 |
| `purger_executions(p_jours_simulation integer, p_jours_contenu integer)` | `integer` | hors contexte | `leon_app` | 0079 |
| `couper_agents_du_membre(p_user uuid, p_equipe_seulement boolean)` | `integer` | pour soi, administrateur | `leon_app` | 0080, refaite en 0083 |
| `supprimer_agents_du_compte()` | `integer` | pour soi | `leon_app` | 0080, refaite en 0082 et 0084 |
| `reserver_creneau(p_connection uuid, p_pas_ms integer, p_retard_ms integer)` | `integer`, ou nul | pour soi | `leon_app` | 0081 |
| `veilles_echues(p_max integer)` | `(veille_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0082 |
| `purger_veilles(p_jours integer)` (ajout) | `integer` | hors contexte | `leon_app` | 0082 |
| `porte_secret(p_outil text, p_abonnement uuid)` | `(tenant_id uuid, secret text)` | hors contexte | `leon_porte` | 0083 |
| `porte_deposer(p_outil text, p_abonnement uuid, p_compte text, p_genre text, p_livraison text, p_corps text, p_entetes jsonb)` | `integer` | hors contexte | `leon_porte` | 0083 |
| `webhooks_a_traiter(p_max integer)` | `(id uuid, tenant_id uuid)` | hors contexte | `leon_app` | 0083 |
| `prendre_livraison(p_id uuid)` | `(tenant_id uuid, user_id uuid, outil text, portee text, genre text, abonnement_id uuid, compte text, corps text, entetes jsonb)` | hors contexte | `leon_app` | 0083 |
| `connexions_du_compte(p_tenant uuid, p_outil text, p_compte text)` | `(connection_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0083 |
| `abonnements_a_renouveler(p_max integer)` | `(abonnement_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0083 |
| `purger_boite_entree()` | `integer` | hors contexte | `leon_app` | 0083 |
| `heure_locale(p_fuseau text)` (ajout, interne) | `timestamp`, ou nul | sans objet | personne | 0084 |
| `compte_slack(p_team text, p_slack_user text)` | `(tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0084 |
| `recaps_dus(p_max integer)` | `(tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0084 |
| `taux_acceptation_agents(p_jours integer)` | `(agent_id text, proposees integer, faites integer, annulees integer, expirees integer, defaites integer, faites_sans_clic integer)` | pour soi, administrateur | `leon_app` | 0085 |

Appel depuis TypeScript, comme `reserver_point` aujourd'hui (`src/server/briefing/briefings.ts:110`). Une fonction « pour soi » s'appelle dans `withTenant` ; une fonction hors contexte s'appelle sur `db` :

```ts
// Pour soi : dans la transaction qui porte le contexte.
const { rows } = await withTenant(ctx, (tx) =>
  tx.execute<{ ok: boolean }>(
    sql`select reserver_budget(${usd}::numeric, ${monthCap}::numeric, ${dayCap}::numeric) as ok`,
  ),
);
// Hors contexte : sur la connexion nue, comme les tics d'aujourd'hui.
const due = await db.execute<{ execution_id: string; tenant_id: string; user_id: string }>(
  sql`select * from executions_a_reveiller(${100})`,
);
```


## 3. Migration 0075 : l'attribution des appels au modèle

| | |
|---|---|
| Fichier | `src/server/db/migrations/0075-appels-modele-attribution.sql` (à créer) |
| Jalon | 1, PR 3 (« Sortie structurée ») |
| Touche | `appels_modele` (existe, `0039-tableau-admin.sql:22-34`) |
| Test | `0075-appels-modele-attribution.db.test.ts` (section 16.2) |
| Drizzle | rien : `appels_modele` n'est pas déclarée dans `schema/`, `logUsage` écrit en SQL (`anthropic-llm.ts:77-92`) |

```sql
-- 0075-appels-modele-attribution.sql : chaque appel au modèle dit pour qui il a été fait (organisation, personne,
-- exécution d'agent), et le journal accepte les quatre étapes des agents : tri, lecture, decision, redaction (D11).
--
-- Qui écrit : logUsage (src/server/llm/anthropic-llm.ts), sans attendre, hors de withTenant. Qui lit : personne par
-- l'app. Le tableau des admins passe par statistiques_admin() (0039), et aucune lecture n'agrège par personne pour un
-- administrateur (dossier agents, 9.11). Les trois colonnes sont nulles pour les lignes passées et pour tout appel sans
-- attribution (réponse en tête, discussion, point du matin).
--
-- La table porte désormais tenant_id : le filet rls-coverage exige la sécurité par ligne. Elle est activée, avec une
-- seule règle : l'insertion (écart E4). leon_app n'a toujours que le droit d'insérer.

-- Le verrou exclusif d'un alter tient jusqu'au commit : sans lui en 5 s, la migration échoue et se relance, plutôt que
-- de faire attendre derrière elle toutes les requêtes de la table (0069).
set local lock_timeout = '5s';

alter table appels_modele
  add column tenant_id uuid references organization(id) on delete set null,
  add column user_id uuid references "user"(id) on delete set null,
  -- Sans clé étrangère : la table executions_agent arrive en 0079, et le coût d'une exécution purgée reste compté.
  add column execution_id uuid;

-- Forme « in (…) », pas any(array[…]) : src/test/contracts/llm-contract.test.ts lit cette forme dans le SQL.
alter table appels_modele
  drop constraint appels_modele_step_check,
  add constraint appels_modele_step_check
    check (step in ('reponse', 'discussion', 'point', 'resume', 'fil', 'agenda',
                    'tri', 'lecture', 'decision', 'redaction'));

-- La mesure du jalon 1 : le coût d'une exécution est la somme de ses appels.
create index appels_modele_execution_idx on appels_modele (execution_id) where execution_id is not null;
create index appels_modele_tenant_idx on appels_modele (tenant_id, created_at) where tenant_id is not null;

alter table appels_modele enable row level security;
-- Aucune règle de lecture, de modification ni de suppression : seule l'insertion passe.
create policy insertion_seule on appels_modele for insert to leon_app with check (true);
```

À savoir :

- **Pourquoi la sécurité par ligne.** `rls-coverage.db.test.ts` refuse toute table à `tenant_id` sans elle. `logUsage` écrit hors de `withTenant`, par `pool.query` : la règle d'insertion ne peut donc pas comparer `tenant_id` à `app_tenant()`. C'est `with check (true)`, comme le dit l'architecture (écart E4).
- **Les lectures existantes passent toujours.** `statistiques_admin()` est `security definer` et appartient à `leon_owner`, qui possède la table : la sécurité par ligne ne s'applique pas au propriétaire (jamais de `force row level security`). Le test `0039-tableau-admin.db.test.ts:53-62` insère sans contexte puis attend un refus de lecture : les deux tiennent.
- **Les clés sont en `set null`.** Une organisation ou un compte supprimé ne retire pas ses appels du tableau des coûts.
- **Mesurer le coût d'une exécution.** `leon_app` ne lit pas la table. Le moteur garde son propre total dans `executions_agent.cout_usd` (0079). La somme par `execution_id` se lit avec le compte propriétaire : c'est la mesure du jalon 1, une requête à la main, pas une fonction.
- **Les huit endroits d'une étape de modèle** (architecture, 10.2) restent à faire dans la même PR par le chapitre 11 : sans cette migration, chaque insertion d'une étape nouvelle échoue en silence.

## 4. Migration 0076 : le budget des agents

| | |
|---|---|
| Fichier | `src/server/db/migrations/0076-budget-agents.sql` (à créer) |
| Jalon | 1, PR 4 (« Budget ») |
| Crée | `budgets_agents`, `budgets_personne_jour`, `reserver_budget`, `solder_budget`, `budget_du_mois` |
| Test | `0076-budget-agents.db.test.ts` (section 16.3, code complet) |
| Drizzle | rien : les deux tables sont hors de portée de l'app, comme `points_par_jour` |

```sql
-- 0076-budget-agents.sql : le budget des agents, réservé avant chaque exécution et soldé après (dossier agents, 9.3).
--
-- Deux compteurs sans aucun texte, comme points_par_jour (0060) : par organisation et par mois, par personne et par
-- jour (UTC). Qui écrit : le moteur d'agents, par reserver_budget puis solder_budget, sous le contexte de la personne
-- au nom de qui l'exécution tourne (withTenant). Qui lit : le poste de contrôle, par budget_du_mois(), pour les
-- administrateurs seulement. Interdit : tout accès direct. Les deux tables ont la sécurité par ligne, sans aucune
-- règle, et leon_app n'y a aucun droit.
--
-- L'organisation et la personne viennent toujours du contexte (app_tenant(), app_user()), jamais d'un paramètre.

create table budgets_agents (
  tenant_id uuid not null references organization(id) on delete cascade,
  -- Le premier jour du mois, en UTC.
  mois date not null check (extract(day from mois) = 1),
  -- Ce que les exécutions en cours ont réservé, et ce que les exécutions finies ont coûté.
  reserve_usd numeric(12, 5) not null default 0 check (reserve_usd >= 0),
  depense_usd numeric(12, 5) not null default 0 check (depense_usd >= 0),
  primary key (tenant_id, mois)
);
alter table budgets_agents enable row level security;

-- Ce qu'une personne a réservé puis dépensé dans la journée. Une inondation qui vise une boîte épuise ce plafond, pas
-- celui de l'organisation.
create table budgets_personne_jour (
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  jour date not null,
  usd numeric(12, 5) not null default 0 check (usd >= 0),
  primary key (tenant_id, user_id, jour)
);
alter table budgets_personne_jour enable row level security;

-- Réserve p_usd pour la personne courante, sur le mois de son organisation et sur sa journée, ou rien du tout.
-- Vrai : réservé. Faux : un plafond serait dépassé, une valeur est négative ou manque, ou il n'y a pas de contexte.
-- p_plafond_jour_usd nul : la journée est comptée sans plafond (exécution d'un agent d'équipe).
-- Les deux lignes sont verrouillées dans le même ordre que solder_budget (le mois, puis le jour) : deux exécutions
-- simultanées ne passent pas un plafond et ne s'attendent pas l'une l'autre.
create function reserver_budget(p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_mois date := date_trunc('month', now() at time zone 'UTC')::date;
  v_jour date := (now() at time zone 'UTC')::date;
  v_pris_mois numeric;
  v_pris_jour numeric;
begin
  if v_tenant is null or v_user is null
     or p_usd is null or p_usd < 0
     or p_plafond_mois_usd is null or p_plafond_mois_usd < 0
     or p_plafond_jour_usd < 0 then
    return false;
  end if;

  insert into budgets_agents (tenant_id, mois) values (v_tenant, v_mois) on conflict do nothing;
  select b.reserve_usd + b.depense_usd into v_pris_mois
    from budgets_agents b where b.tenant_id = v_tenant and b.mois = v_mois for update;
  if v_pris_mois + p_usd > p_plafond_mois_usd then
    return false;
  end if;

  -- Les jours passés de la personne s'effacent au passage, comme dans reserver_point.
  delete from budgets_personne_jour j where j.tenant_id = v_tenant and j.user_id = v_user and j.jour < v_jour;
  insert into budgets_personne_jour (tenant_id, user_id, jour) values (v_tenant, v_user, v_jour)
    on conflict do nothing;
  select j.usd into v_pris_jour
    from budgets_personne_jour j
   where j.tenant_id = v_tenant and j.user_id = v_user and j.jour = v_jour for update;
  if p_plafond_jour_usd is not null and v_pris_jour + p_usd > p_plafond_jour_usd then
    return false;
  end if;

  update budgets_agents b set reserve_usd = b.reserve_usd + p_usd
   where b.tenant_id = v_tenant and b.mois = v_mois;
  update budgets_personne_jour j set usd = j.usd + p_usd
   where j.tenant_id = v_tenant and j.user_id = v_user and j.jour = v_jour;
  return true;
end
$$;
revoke all on function reserver_budget(numeric, numeric, numeric) from public;
grant execute on function reserver_budget(numeric, numeric, numeric) to leon_app;

-- Solde une réservation de la personne courante : rend p_reserve_usd et compte p_reel_usd, dans les deux tables.
-- reserve_usd ne passe jamais sous zéro ; depense_usd ne baisse jamais. Une valeur négative ou absente est une faute
-- du code : elle lève (22023), rien n'est écrit. Sans contexte : rien.
-- Une exécution qui passe minuit, ou la fin du mois, est soldée sur le jour et le mois du solde : l'écart reste borné
-- par une réservation (limits.maxUsd, 0,50 $ au plus).
create function solder_budget(p_reserve_usd numeric, p_reel_usd numeric)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_mois date := date_trunc('month', now() at time zone 'UTC')::date;
  v_jour date := (now() at time zone 'UTC')::date;
begin
  if p_reserve_usd is null or p_reel_usd is null or p_reserve_usd < 0 or p_reel_usd < 0 then
    raise exception 'solder_budget : valeur négative ou absente' using errcode = '22023';
  end if;
  if v_tenant is null or v_user is null then
    return;
  end if;

  insert into budgets_agents as b (tenant_id, mois, reserve_usd, depense_usd)
  values (v_tenant, v_mois, 0, p_reel_usd)
  on conflict (tenant_id, mois) do update
    set reserve_usd = greatest(b.reserve_usd - p_reserve_usd, 0),
        depense_usd = b.depense_usd + p_reel_usd;

  insert into budgets_personne_jour as j (tenant_id, user_id, jour, usd)
  values (v_tenant, v_user, v_jour, p_reel_usd)
  on conflict (tenant_id, user_id, jour) do update
    set usd = greatest(j.usd - p_reserve_usd + p_reel_usd, 0);
end
$$;
revoke all on function solder_budget(numeric, numeric) from public;
grant execute on function solder_budget(numeric, numeric) to leon_app;

-- Le réservé et le dépensé du mois en cours, pour l'organisation courante. Une ligne, à zéro si rien n'a tourné, pour
-- un propriétaire ou un administrateur ; aucune ligne pour un autre membre. Jamais de détail par personne.
create function budget_du_mois()
returns table (reserve_usd numeric, depense_usd numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(b.reserve_usd, 0), coalesce(b.depense_usd, 0)
    from (select 1) as une_ligne
    left join budgets_agents b
      on b.tenant_id = app_tenant() and b.mois = date_trunc('month', now() at time zone 'UTC')::date
   where app_est_admin()
$$;
revoke all on function budget_du_mois() from public;
grant execute on function budget_du_mois() to leon_app;
```

À savoir :

- **Ce qui compte contre le plafond du mois** : le réservé plus le dépensé. Une exécution en cours pèse sa réserve entière (`limits.maxUsd`) ; finie, elle ne pèse plus que son coût réel.
- **Le jour est toujours compté, plafond ou non.** L'architecture dit que `reserver_budget` écrit « dans les deux tables » et que `solder_budget` solde « dans les deux tables ». `solder_budget` n'a aucun moyen de savoir si la réserve avait touché la journée. Les deux écrivent donc toujours les deux tables, et `p_plafond_jour_usd` nul veut dire « ne pas comparer ». Conséquence pour un agent d'équipe : écart 3 de la section 18.
- **Refus et fautes.** `reserver_budget` rend faux, sans lever : c'est un cas nominal (plafond atteint). `solder_budget` rend `void` : une valeur négative ne peut être qu'une faute du code, elle lève `22023`.
- **`budget_du_mois` ne dit rien à un membre ordinaire** : aucune ligne. Le code distingue ainsi « pas le droit » de « zéro ».
- **Ce que la fonction ne sait pas.** Le plafond du mois est passé par le code (`reglages_organisation.agents_budget_mois_usd`, ou `AGENTS_BUDGET_USD_PER_SEAT` fois le nombre de membres) : la base ne le calcule pas. L'alerte à 80 % n'a donc pas de lecture ici (écart 6).

## 5. Migration 0077 : les événements du standard

| | |
|---|---|
| Fichier | `src/server/db/migrations/0077-evenements.sql` (à créer) |
| Jalon | 1, PR 5 (« Événements, règles, routage ») |
| Touche | `ingest_runs` (existe) |
| Crée | `evenements`, `runs_a_signaler`, `purger_evenements` |
| Test | `0077-evenements.db.test.ts` (section 16.2) |
| Drizzle | `evenements` dans `schema/agents.ts` ; `signaleLe` dans `schema/memory.ts` (section 14) |

```sql
-- 0077-evenements.sql : les événements du standard (dossier agents, 8.4). Un élément indexé à orienter, et son
-- étiquette de routage. Ce n'est pas une mémoire : l'étiquette ne sert qu'à choisir un agent, elle vit 14 jours, elle
-- n'est lue ni par la recherche, ni par la discussion, ni par le point du matin, et elle se recalcule depuis le brut.
--
-- Qui écrit : signalStandard (src/server/standard/signal.ts), sous les droits du propriétaire de la source, puis le
-- tri et le routage, qui ne changent que l'étiquette et l'état. Qui lit : le standard, sous les mêmes droits. Privé à
-- la personne (acl = [user_id], contrôlé par la base) : ni l'équipe, ni un manager, ni un administrateur. Interdit :
-- supprimer (purger_evenements le fait), et tout texte capté (la table ne porte que des identifiants et des
-- empreintes).

-- Un run d'indexation est signalé au standard une seule fois. Les runs déjà finis sont marqués signalés : sans cela,
-- le rattrapage (runs_a_signaler) émettrait tout l'historique. Le verrou exclusif de l'alter tient jusqu'au commit :
-- lock_timeout fait échouer la migration, qui se relance, plutôt que de bloquer derrière une longue transaction (0069).
set local lock_timeout = '5s';
alter table ingest_runs add column signale_le timestamptz;
update ingest_runs set signale_le = updated_at where status = 'done';
-- Le tic passe chaque minute : il ne relit que les runs finis et pas encore signalés.
create index ingest_runs_a_signaler_idx on ingest_runs (updated_at) where status = 'done' and signale_le is null;

create table evenements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  -- Le propriétaire de la source : celui dont les droits ont servi à l'indexer.
  user_id uuid not null references "user"(id) on delete cascade,
  source_id uuid not null,
  -- Sans clé étrangère : le run peut disparaître avec une réindexation, l'événement reste jusqu'à sa purge.
  ingest_run_id uuid not null,
  -- sources.kind et sources.metadata.nature : validés dans le code (SOURCE_KINDS, ITEM_NATURES), comme depuis 0010.
  outil text not null check (char_length(outil) between 1 and 40),
  nature text not null check (char_length(nature) between 1 and 40),
  -- Le côté de l'auteur du dernier tour nouveau, lu dans turns.author_side : team, external, nul.
  cote text not null check (cote = any (array['equipe', 'externe', 'inconnu'])),
  -- `${sources.kind}:${sources.external_id}` : le même objet relevé par deux personnes a la même clé.
  cle_objet text not null check (char_length(cle_objet) between 1 and 300),
  -- SHA-256 des external_id des tours nouveaux, triés.
  empreinte text not null check (empreinte ~ '^[0-9a-f]{64}$'),
  -- SHA-256 de l'adresse de l'auteur du dernier tour nouveau ; nul si l'outil ne la donne pas. Jamais l'adresse.
  auteur_empreinte text check (auteur_empreinte ~ '^[0-9a-f]{64}$'),
  -- La liste des étiquettes est fermée dans le code (ROUTING_LABELS) : en ajouter une ne demande pas de migration.
  etiquette text check (etiquette ~ '^[a-z][a-z0-9_]{1,39}$'),
  urgence text check (urgence = any (array['basse', 'normale', 'haute'])),
  confiance real check (confiance >= 0 and confiance <= 1),
  trie_par text check (trie_par = any (array['regle', 'modele'])),
  statut text not null default 'recu' check (statut = any (array['recu', 'trie', 'route', 'ignore'])),
  -- Pourquoi il est « ignore » ; nul sinon.
  raison text check (raison = any (array['expediteur', 'budget', 'sans_agent'])),
  cree_le timestamptz not null default now(),
  expire_le timestamptz not null default (now() + interval '14 days'),
  -- Privé à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, id),
  -- Un run ne donne qu'un événement : un job rejoué ou le rattrapage n'en écrivent pas un second.
  unique (tenant_id, ingest_run_id),
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete cascade
);
-- Le plafond par expéditeur (SENDER_EVENTS_PER_DAY) : les événements d'un même auteur pour une personne, sur 24 heures.
create index evenements_auteur_idx on evenements (tenant_id, user_id, auteur_empreinte, cree_le);
-- Le tri par lot : les événements restés « recu ». La purge : par échéance. La cascade depuis sources.
create index evenements_recus_idx on evenements (tenant_id, user_id, cree_le) where statut = 'recu';
create index evenements_expire_idx on evenements (expire_le);
create index evenements_source_idx on evenements (tenant_id, source_id);

alter table evenements enable row level security;
create policy tenant_acl on evenements to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- La clé étrangère se vérifie hors sécurité par ligne : sans cette règle, qui connaîtrait l'identifiant de la source
-- d'un collègue pourrait y rattacher un événement. Un événement n'entre que pour une source dont la personne est
-- propriétaire (la sous-requête lit sources sous ses droits).
create policy own_source on evenements as restrictive for insert to leon_app
  with check (exists (
    select 1 from sources s
    where s.tenant_id = evenements.tenant_id and s.id = evenements.source_id
      and s.owner_user_id = evenements.user_id));

-- Ajouter, puis ne changer que l'étiquette et l'état. Aucune suppression par l'app.
grant select, insert on evenements to leon_app;
grant update (etiquette, urgence, confiance, trie_par, statut, raison) on evenements to leon_app;

-- Lectures hors sécurité par ligne, pour les tics du standard : des identifiants, jamais de texte (comme
-- runs_en_attente, 0011 et 0019). Le standard travaille ensuite sous les droits du propriétaire de la source.

-- Les runs finis depuis plus de p_minutes que le standard n'a pas vus, toutes organisations : un processus mort entre
-- la fin de l'indexation et le signal. Le propriétaire est membre et son compte n'est pas supprimé : le standard ne
-- travaille pas pour un parti. Un run fini depuis plus de 3 jours n'est plus rendu : il ne peut plus donner
-- d'événement (EVENT_MAX_AGE_HOURS vaut 48), et un run que rien ne marquerait ne reste pas en tête pour toujours.
create function runs_a_signaler(p_minutes integer)
returns table (ingest_run_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select r.id, r.tenant_id, s.owner_user_id
    from ingest_runs r
    join sources s on s.tenant_id = r.tenant_id and s.id = r.source_id
    join member m on m."organizationId" = r.tenant_id and m."userId" = s.owner_user_id
    join "user" u on u.id = s.owner_user_id and u.deleted_at is null
   where r.status = 'done' and r.signale_le is null
     and r.updated_at < now() - make_interval(mins => greatest(p_minutes, 0))
     and r.updated_at > now() - interval '3 days'
   order by r.updated_at, r.id
$$;
revoke all on function runs_a_signaler(integer) from public;
grant execute on function runs_a_signaler(integer) to leon_app;

-- Supprime les événements échus (14 jours), toutes organisations. Rend leur nombre.
create function purger_evenements()
returns integer
language sql volatile security definer set search_path = public, pg_temp as $$
  with partis as (
    delete from evenements e where e.expire_le < now() returning 1
  )
  select count(*)::integer from partis
$$;
revoke all on function purger_evenements() from public;
grant execute on function purger_evenements() to leon_app;
```

À savoir :

- **Le rattrapage ne réveille pas l'histoire.** Les runs déjà `done` reçoivent `signale_le = updated_at`. Un run fini par l'ancienne version pendant le recouvrement de la mise en ligne reste, lui, à signaler : `runs_a_signaler(5)` le rend, `signalStandard` l'écarte s'il a plus de 48 heures et le marque dans tous les cas.
- **`update ingest_runs` tient le verrou exclusif de l'`alter`** jusqu'à la fin de la transaction. La table n'est lue que par l'indexation et ses tics, pas par un écran. La durée dépend du nombre de runs en production, que je ne connais pas (section 19).
- **Trois colonnes ne sont pas des listes fermées en SQL** : `outil`, `nature`, `etiquette`. L'outil et la nature se valident dans le code depuis 0010. L'architecture veut qu'ajouter une étiquette soit « une PR dans `labels.ts` » : un `check` fermé en ferait aussi une migration. Le schéma Drizzle les type sans `enum` (section 14).
- **`own_source` est un ajout** (section 18, point 9) : sans elle, un membre qui connaîtrait l'identifiant de la source privée d'un collègue pourrait y rattacher un événement, puisque la clé étrangère se vérifie hors sécurité par ligne. L'événement ne porte aucun texte, mais la règle coûte une ligne et suit le modèle de `0037`.
- **`runs_a_signaler` n'a pas de plafond, mais une fenêtre de 3 jours.** La signature de l'architecture n'a pas de `p_max`, comme `runs_en_attente`. Un run fini depuis plus de 3 jours ne peut plus donner d'événement (`EVENT_MAX_AGE_HOURS` vaut 48) : il sort de la liste, et rien ne s'y accumule. Si cette constante dépasse un jour 72 heures, la fenêtre suit.
- **`standard-lot` (après le jalon 1) n'a pas de lecture hors contexte** pour trouver les personnes qui ont des événements restés `recu`. L'index `evenements_recus_idx` est prêt ; la fonction est proposée en section 18 (écart 5).

## 6. Migration 0078 : les activations

| | |
|---|---|
| Fichier | `src/server/db/migrations/0078-agents-actives.sql` (à créer) |
| Jalon | 1, PR 5. Les agents d'équipe viennent après, mais leurs colonnes et leurs règles sont posées ici |
| Touche | `reglages_organisation` (existe, `0057-manager-voit-tout.sql:11-22`) |
| Crée | `agents_actives`, `executions_par_jour`, `reserver_execution`, `activations_de`, `reprendre_agent_equipe` |
| Test | `0078-agents-actives.db.test.ts` (section 16.4, code complet) |
| Drizzle | `agentsActives` dans `schema/agents.ts` ; trois colonnes dans `schema/organisation.ts` |

```sql
-- 0078-agents-actives.sql : l'activation d'une fiche d'agent, par une personne pour elle-même ou par un administrateur
-- pour l'équipe, avec son cran d'autonomie et ses réglages (dossier agents, 8.1, 8.5 et 9.1). Et les trois réglages
-- d'organisation qui bornent tous les agents.
--
-- Qui écrit : la personne, depuis le poste de contrôle (src/server/agents/activation.ts). Une activation personnelle
-- est privée à la personne (acl = [user_id]). Une activation d'équipe est lisible de toute l'organisation
-- (acl = [tenant_id]) et seul un propriétaire ou un administrateur l'écrit. Qui lit : le routage et le moteur, sous
-- les droits de la personne ; le tic d'horloge, par activations_de. Interdit : supprimer (couper, c'est actif = faux) ;
-- un agent d'équipe au-dessus du cran « propose » (il écrit par la connexion de l'administrateur qui l'a activé).

-- Le verrou exclusif d'un alter tient jusqu'au commit : sans lui en 5 s, la migration échoue et se relance, plutôt que
-- de faire attendre derrière elle toutes les requêtes de la table (0069).
set local lock_timeout = '5s';

-- Sans ligne, une organisation a les défauts ci-dessous (0057 : « sans ligne » est un état normal). Le code les
-- applique à la lecture, le SQL par coalesce, et l'écriture est un insert … on conflict do update.
alter table reglages_organisation
  -- Faux : plus aucune exécution n'est créée dans l'organisation.
  add column agents_actifs boolean not null default true,
  -- Le cran le plus haut qu'un membre peut choisir.
  add column agents_autonomie_max text not null default 'agit_previent'
    check (agents_autonomie_max = any (array['propose', 'agit_previent', 'agit_seul'])),
  -- Le plafond du mois ; nul : le défaut du code (AGENTS_BUDGET_USD_PER_SEAT fois le nombre de membres).
  add column agents_budget_mois_usd numeric(8, 2) check (agents_budget_mois_usd >= 0);

create table agents_actives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  -- Celui qui a activé : l'agent tourne en son nom et écrit par ses connexions.
  user_id uuid not null references "user"(id) on delete cascade,
  -- L'identifiant de la fiche (AgentDefinition.id) ; le catalogue vit dans le code.
  agent_id text not null check (agent_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  portee text not null default 'personne' check (portee = any (array['personne', 'equipe'])),
  autonomie text not null default 'propose'
    check (autonomie = any (array['propose', 'agit_previent', 'agit_seul'])),
  -- Les réglages que la fiche ouvre à la personne (AgentDefinition.settings), validés par le code.
  reglages jsonb not null default '{}'::jsonb check (jsonb_typeof(reglages) = 'object'),
  actif boolean not null default true,
  cree_le timestamptz not null default now(),
  modifie_le timestamptz not null default now(),
  acl uuid[] not null,
  unique (tenant_id, id),
  unique (tenant_id, agent_id, user_id),
  -- Un agent d'équipe ne fait que proposer, quoi qu'écrive le code.
  constraint agents_actives_equipe_propose check (portee = 'personne' or autonomie = 'propose'),
  -- La portée fixe l'accès : privé à la personne, ou lisible de toute l'organisation.
  constraint agents_actives_acl_portee check (
    (portee = 'personne' and acl = array[user_id]) or (portee = 'equipe' and acl = array[tenant_id]))
);
-- Une seule activation d'équipe par fiche et par organisation.
create unique index agents_actives_equipe_idx on agents_actives (tenant_id, agent_id) where portee = 'equipe';
-- Le tic d'horloge (activations_de) : les activations en service d'une fiche.
create index agents_actives_agent_idx on agents_actives (agent_id) where actif;

alter table agents_actives enable row level security;
create policy tenant_acl on agents_actives to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- On n'active qu'en son nom, et pour l'équipe seulement si l'on est propriétaire ou administrateur.
create policy activateur_insert on agents_actives as restrictive for insert to leon_app
  with check (user_id = app_user() and (portee = 'personne' or app_est_admin()));
-- Une activation d'équipe est lisible de tous : sans cette règle, tout membre pourrait la couper ou changer ses
-- réglages. Pour update, Postgres écarte sans erreur les lignes refusées.
create policy activateur_update on agents_actives as restrictive for update to leon_app
  using ((portee = 'personne' and user_id = app_user()) or (portee = 'equipe' and app_est_admin()))
  with check ((portee = 'personne' and user_id = app_user()) or (portee = 'equipe' and app_est_admin()));

-- Activer, régler, couper. Ni suppression, ni changement de fiche, de portée ou de personne (reprendre_agent_equipe).
grant select, insert on agents_actives to leon_app;
grant update (autonomie, reglages, actif, modifie_le) on agents_actives to leon_app;

-- Le plafond d'exécutions par activation et par jour (UTC), sans texte : la copie de points_par_jour (0060). L'app n'y
-- touche que par reserver_execution.
create table executions_par_jour (
  activation_id uuid not null references agents_actives(id) on delete cascade,
  jour date not null,
  nombre integer not null,
  primary key (activation_id, jour)
);
alter table executions_par_jour enable row level security;

-- Compte une exécution de l'activation aujourd'hui s'il en reste sous p_plafond, et rend vrai ; sinon rend faux.
-- L'activation est en service, de l'organisation courante, et la personne courante peut la déclencher : la sienne, ou
-- celle de l'équipe. Les jours passés de l'activation s'effacent au passage.
create function reserver_execution(p_activation uuid, p_plafond integer)
returns boolean
language sql volatile security definer set search_path = public, pg_temp as $$
  with passes as (
    delete from executions_par_jour e
     where e.activation_id = p_activation and e.jour < (now() at time zone 'UTC')::date
  ), compte as (
    insert into executions_par_jour as e (activation_id, jour, nombre)
    select a.id, (now() at time zone 'UTC')::date, 1
      from agents_actives a
     where a.id = p_activation and a.tenant_id = app_tenant() and a.actif
       and (a.portee = 'equipe' or a.user_id = app_user())
       and p_plafond >= 1
    on conflict (activation_id, jour) do update set nombre = e.nombre + 1 where e.nombre < p_plafond
    returning 1
  )
  select exists (select 1 from compte)
$$;
revoke all on function reserver_execution(uuid, integer) from public;
grant execute on function reserver_execution(uuid, integer) to leon_app;

-- Lecture hors sécurité par ligne, pour le tic d'horloge : les activations en service de la fiche p_agent, toutes
-- organisations. Des identifiants seulement. La personne est membre et son compte n'est pas supprimé ; l'organisation
-- n'a pas coupé ses agents (sans ligne de réglages : non coupés) ; pour une activation d'équipe, l'activateur est
-- encore propriétaire ou administrateur.
create function activations_de(p_agent text)
returns table (activation_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.tenant_id, a.user_id
    from agents_actives a
    join member m on m."organizationId" = a.tenant_id and m."userId" = a.user_id
    join "user" u on u.id = a.user_id and u.deleted_at is null
    left join reglages_organisation r on r.tenant_id = a.tenant_id
   where a.agent_id = p_agent and a.actif
     and coalesce(r.agents_actifs, true)
     and (a.portee = 'personne' or string_to_array(m.role, ',') && array['owner', 'admin'])
   order by a.tenant_id, a.id
$$;
revoke all on function activations_de(text) from public;
grant execute on function activations_de(text) to leon_app;

-- Un administrateur reprend un agent d'équipe dont l'activateur n'est plus valable : il n'est plus membre, plus
-- propriétaire ni administrateur, ou son compte est supprimé. Le repreneur devient l'activateur, et l'agent reste
-- coupé : il le réactive lui-même, en connaissance de cause (l'agent écrira par ses connexions à lui).
-- Faux : l'appelant n'est pas administrateur, l'activation n'est pas une activation d'équipe de l'organisation
-- courante, ou son activateur est encore valable.
create function reprendre_agent_equipe(p_activation uuid)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_activateur uuid;
begin
  if app_user() is null or not app_est_admin() then
    return false;
  end if;
  select a.user_id into v_activateur
    from agents_actives a
   where a.id = p_activation and a.tenant_id = app_tenant() and a.portee = 'equipe'
     for update;
  if not found then
    return false;
  end if;
  if exists (
    select 1 from member m join "user" u on u.id = m."userId"
     where m."organizationId" = app_tenant() and m."userId" = v_activateur and u.deleted_at is null
       and string_to_array(m.role, ',') && array['owner', 'admin']) then
    return false;
  end if;
  update agents_actives a set user_id = app_user(), actif = false, modifie_le = now()
   where a.id = p_activation;
  return true;
exception when unique_violation then
  -- Le repreneur a déjà une activation de cette fiche : rien ne change.
  return false;
end
$$;
revoke all on function reprendre_agent_equipe(uuid) from public;
grant execute on function reprendre_agent_equipe(uuid) to leon_app;
```

À savoir :

- **Le cran « propose » d'un agent d'équipe est tenu par la base** (`agents_actives_equipe_propose`), en plus de la règle 8 de `checkDefinition` et du calcul du cran effectif (architecture, 9.1).
- **Deux règles restrictives, deux commandes.** `activateur_insert` : on n'active qu'en son nom, et pour l'équipe seulement si l'on est administrateur. `activateur_update` : en `using` et en `with check`. Un membre ordinaire voit l'activation d'équipe et ne la change pas : son `update` ne touche aucune ligne, sans erreur. C'est le test demandé par l'architecture (section 16.4).
- **Un administrateur peut régler ou réactiver l'activation d'équipe d'un autre administrateur.** C'est la règle écrite par l'architecture. L'agent tourne alors toujours au nom du premier, qui valide chaque action : à savoir avant d'ouvrir les agents d'équipe (section 18, point 12).
- **`reserver_execution` vérifie un peu plus que demandé** : l'activation est de l'organisation courante (demandé), en service, et la personne courante peut la déclencher (la sienne, ou celle de l'équipe). Un plafond inférieur à 1 rend faux ; `reserver_point`, dont elle est la copie, laisserait passer la première.
- **`reprendre_agent_equipe` laisse l'agent coupé.** Elle ne touche ni aux exécutions passées ni aux actions de l'ancien activateur, qui restent privées à lui.
- **`reglages_organisation` peut ne pas avoir de ligne.** Les trois défauts sont ceux des colonnes ; `activations_de` les applique par `left join` et `coalesce`. L'écriture d'un réglage est un `insert … on conflict (tenant_id) do update`.

## 7. Migration 0079 : les exécutions et leur journal

| | |
|---|---|
| Fichier | `src/server/db/migrations/0079-executions-agent.sql` (à créer) |
| Jalon | 1, PR 6 (« Moteur linéaire ») |
| Crée | `executions_agent`, `etapes_execution`, `executions_a_reveiller`, `purger_executions` |
| Test | `0079-executions-agent.db.test.ts` (section 16.5, code complet : il supprime le parent) |
| Drizzle | `executionsAgent`, `etapesExecution` dans `schema/agents.ts` |

```sql
-- 0079-executions-agent.sql : les exécutions d'agent et le journal de leurs étapes (dossier agents, 8.6 et 9.6).
--
-- executions_agent : une ligne par exécution, son état, ce qu'elle attend, son coût. C'est le journal que montre le
-- poste de contrôle. etapes_execution : une ligne par étape, écrite avant (« intention ») et après (« faite ») : c'est
-- ce qui rend une étape rejouable sans la refaire.
--
-- Qui écrit : le routage (une ligne « en-file »), puis le moteur (src/server/agents/engine/), toujours sous le
-- contexte de la personne au nom de qui l'exécution tourne. Qui lit : elle seule. Privé à la personne
-- (acl = [user_id], contrôlé par la base), agent d'équipe compris : ni l'équipe, ni un manager, ni un administrateur
-- (9.11 : pas un mouchard). Interdit : supprimer par l'app ; garder le brut (une étape « lire » ou « chercher » ne
-- laisse que des identifiants de sources et une empreinte) ; lire evenements depuis le moteur (source_id et cle_objet
-- sont recopiés ici au routage).

create table executions_agent (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  -- La personne au nom de qui l'exécution tourne ; pour un agent d'équipe, son activateur.
  user_id uuid not null references "user"(id) on delete cascade,
  activation_id uuid,
  agent_id text not null check (agent_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  agent_version integer not null check (agent_version >= 1),
  -- Sans clé étrangère : l'événement est privé au propriétaire de la source et se purge à 14 jours.
  evenement_id uuid,
  -- La source qui a déclenché ; nul pour une horloge. Sans clé étrangère : la lecture se fait sous les droits du moment.
  source_id uuid,
  cle_objet text not null check (char_length(cle_objet) between 1 and 300),
  declencheur text not null check (declencheur = any (array['evenement', 'horloge', 'veille', 'manuel'])),
  mode text not null default 'reel' check (mode = any (array['reel', 'simulation'])),
  -- executionKey : un événement rejoué, ou relevé par deux personnes, ne crée pas deux exécutions.
  cle text not null check (cle ~ '^[0-9a-f]{64}$'),
  statut text not null default 'en-file'
    check (statut = any (array['en-file', 'en-cours', 'en-attente', 'faite', 'echouee', 'annulee', 'ignoree'])),
  raison text check (raison = any (array[
    'budget', 'plafond', 'parti', 'role', 'connexion', 'limite', 'refus', 'erreur', 'expiree'])),
  -- Le cran effectif, lu au départ.
  autonomie text not null check (autonomie = any (array['propose', 'agit_previent', 'agit_seul'])),
  -- La provenance, calculée par le code, qui ne fait que monter (9.5).
  contenu_externe boolean not null default false,
  donnees_privees boolean not null default false,
  -- Le verrou du déroulé : rafraîchi à chaque étape. Au-delà de 2 minutes, executions_a_reveiller rend l'exécution.
  verrou_le timestamptz,
  attend_cle text check (char_length(attend_cle) <= 200),
  reveil_le timestamptz,
  -- TOUTES les sources fournies au modèle : si l'une n'est plus visible du lecteur, le détail n'est pas rendu.
  source_ids uuid[] not null default '{}',
  cout_usd numeric(12, 5) not null default 0 check (cout_usd >= 0),
  nb_appels_modele integer not null default 0 check (nb_appels_modele >= 0),
  -- Un code ou un message fixe du moteur : jamais le texte d'un outil ni d'un modèle.
  erreur text check (char_length(erreur) <= 300),
  cree_le timestamptz not null default now(),
  commence_le timestamptz,
  fini_le timestamptz,
  -- Privée à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, id),
  unique (tenant_id, cle),
  -- La liste de colonnes est obligatoire : sans elle, tenant_id passerait aussi à nul et la suppression de
  -- l'activation échouerait (précédent : 0008, sources.connection_id).
  foreign key (tenant_id, activation_id) references agents_actives (tenant_id, id)
    on delete set null (activation_id)
);
-- Le journal d'une personne, le plus récent d'abord ; les exécutions d'une activation ; les deux lectures du tic.
create index executions_agent_user_idx on executions_agent (tenant_id, user_id, cree_le desc);
create index executions_agent_activation_idx on executions_agent (tenant_id, activation_id);
create index executions_agent_reveil_idx on executions_agent (reveil_le) where statut = 'en-attente';
create index executions_agent_verrou_idx on executions_agent (verrou_le) where statut = 'en-cours';
create index executions_agent_file_idx on executions_agent (cree_le) where statut = 'en-file';
create index executions_agent_simulation_idx on executions_agent (cree_le) where mode = 'simulation';

alter table executions_agent enable row level security;
create policy tenant_acl on executions_agent to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- La clé étrangère se vérifie hors sécurité par ligne : une exécution n'entre que pour une activation de la personne
-- (pour un agent d'équipe, celle de son activateur).
create policy own_activation on executions_agent as restrictive for insert to leon_app
  with check (activation_id is null or exists (
    select 1 from agents_actives a
    where a.tenant_id = executions_agent.tenant_id and a.id = executions_agent.activation_id
      and a.user_id = executions_agent.user_id));

-- Ajouter, puis ne changer que l'état. Ni suppression, ni changement de fiche, de clé ou de personne.
grant select, insert on executions_agent to leon_app;
grant update (statut, raison, contenu_externe, donnees_privees, verrou_le, attend_cle, reveil_le, source_ids,
              cout_usd, nb_appels_modele, erreur, commence_le, fini_le)
  on executions_agent to leon_app;

create table etapes_execution (
  execution_id uuid not null,
  tenant_id uuid not null references organization(id) on delete cascade,
  rang integer not null check (rang >= 0),
  -- Le nom stable de l'étape : celui de la fiche, ou « nom#i » pour une action d'un decider ou d'un each.
  nom text not null check (char_length(nom) between 1 and 80),
  genre text not null default 'etape' check (genre = any (array['etape', 'attente', 'evenement'])),
  statut text not null default 'intention' check (statut = any (array['intention', 'faite', 'echouee'])),
  -- idempotencyKey(exécution, nom, rang) : la clé d'une écriture dans un outil.
  cle_idempotence text not null check (cle_idempotence ~ '^[0-9a-f]{64}$'),
  -- Du JSON borné. Étape lire ou chercher : des identifiants de sources et une empreinte, jamais le texte lu.
  entree jsonb check (octet_length(entree::text) <= 262144),
  sortie jsonb check (octet_length(sortie::text) <= 262144),
  cree_le timestamptz not null default clock_timestamp(),
  fini_le timestamptz,
  acl uuid[] not null,
  primary key (execution_id, rang),
  foreign key (tenant_id, execution_id) references executions_agent (tenant_id, id) on delete cascade
);
-- La purge : les étapes qui portent encore un contenu.
create index etapes_execution_contenu_idx on etapes_execution (cree_le)
  where entree is not null or sortie is not null;

alter table etapes_execution enable row level security;
create policy tenant_acl on etapes_execution to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- Une étape n'entre que dans une exécution que la personne voit, avec l'accès de cette exécution (donc privée),
-- comme un message dans sa discussion (0012, same_acl_as_discussion).
create policy same_acl_as_execution on etapes_execution as restrictive for insert to leon_app
  with check (exists (
    select 1 from executions_agent e
    where e.tenant_id = etapes_execution.tenant_id and e.id = etapes_execution.execution_id
      and e.acl = etapes_execution.acl));

grant select, insert on etapes_execution to leon_app;
grant update (statut, sortie, fini_le) on etapes_execution to leon_app;

-- Lecture hors sécurité par ligne, pour le tic agent-reveils : des identifiants seulement, toutes organisations.
-- Trois cas : une minuterie échue (« en-attente », reveil_le passé) ; un déroulé mort (« en-cours », verrou de plus
-- de 2 minutes) ; un job perdu entre l'écriture de la ligne et l'envoi en file (« en-file » depuis plus de
-- 15 minutes). Le tic remet un job en file, dédoublonné par l'identifiant de l'exécution.
-- L'exécution d'une personne partie est rendue aussi : c'est le moteur qui la ferme (« annulee », raison « parti »).
create function executions_a_reveiller(p_max integer)
returns table (execution_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.tenant_id, e.user_id
    from executions_agent e
   where (e.statut = 'en-attente' and e.reveil_le <= now())
      or (e.statut = 'en-cours' and (e.verrou_le is null or e.verrou_le < now() - interval '2 minutes'))
      or (e.statut = 'en-file' and e.cree_le < now() - interval '15 minutes')
   order by e.cree_le, e.id
   limit least(greatest(p_max, 0), 1000)
$$;
revoke all on function executions_a_reveiller(integer) from public;
grant execute on function executions_a_reveiller(integer) to leon_app;

-- La purge de l'heure, toutes organisations (9.6). Supprime les simulations de plus de p_jours_simulation jours (leurs
-- étapes partent en cascade). Vide l'entrée et la sortie des étapes de plus de p_jours_contenu jours, et tout de suite
-- celles d'une exécution dont une source lue (source_ids) n'existe plus. Rend le nombre de lignes touchées.
-- shortcut: la recherche d'une source disparue relit, à chaque passage, les étapes qui portent encore un contenu
-- (30 jours au plus). À remplacer par un passage déclenché à la suppression d'une source si la table grossit.
create function purger_executions(p_jours_simulation integer, p_jours_contenu integer)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_simulations integer;
  v_videes integer;
begin
  with parties as (
    delete from executions_agent e
     where e.mode = 'simulation'
       and e.cree_le < now() - make_interval(days => greatest(p_jours_simulation, 0))
    returning 1
  )
  select count(*)::integer into v_simulations from parties;

  with videes as (
    update etapes_execution t set entree = null, sortie = null
      from executions_agent e
     where e.tenant_id = t.tenant_id and e.id = t.execution_id
       and (t.entree is not null or t.sortie is not null)
       and (t.cree_le < now() - make_interval(days => greatest(p_jours_contenu, 0))
            or exists (
              select 1 from unnest(e.source_ids) as lue (id)
               where not exists (
                 select 1 from sources s where s.tenant_id = e.tenant_id and s.id = lue.id)))
    returning 1
  )
  select count(*)::integer into v_videes from videes;

  return v_simulations + v_videes;
end
$$;
revoke all on function purger_executions(integer, integer) from public;
grant execute on function purger_executions(integer, integer) to leon_app;
```

À savoir :

- **Les colonnes d'état que l'app peut changer** : `statut`, `raison`, `contenu_externe`, `donnees_privees`, `verrou_le`, `attend_cle`, `reveil_le`, `source_ids`, `cout_usd`, `nb_appels_modele`, `erreur`, `commence_le`, `fini_le`. Ni la fiche, ni la clé, ni le cran, ni la personne.
- **Prendre le verrou** (chapitre 04) est un `update` atomique, comme `claimConnection` (`src/server/connectors/connections.ts:391`) :

  ```sql
  update executions_agent set statut = 'en-cours', verrou_le = now(), commence_le = coalesce(commence_le, now())
   where id = $1 and (statut in ('en-file', 'en-attente')
          or (statut = 'en-cours' and (verrou_le is null or verrou_le < now() - interval '2 minutes')))
  returning id
  ```

- **`executions_a_reveiller` ne joint pas `member`**, à la différence des autres fonctions de tic. Une personne retirée n'a plus de ligne `member` (`removeMember`, `members.ts:116-130`) : si le tic taisait ses exécutions, celle qui attend une minuterie n'aurait jamais de « job suivant », et ne finirait jamais `annulee`, raison `parti` (architecture, 9.10). C'est le moteur qui la ferme. Elle sort alors de la liste : rien ne s'accumule en tête. Écart 1 de la section 18.
- **Le troisième cas, `en-file` depuis plus de 15 minutes, est un ajout.** Le routage écrit la ligne puis envoie le job : un processus tué entre les deux laisserait l'exécution en file pour toujours. Le job est dédoublonné par l'identifiant de l'exécution, donc un envoi de trop est sans effet.
- **`erreur` ne porte jamais un texte d'outil ou de modèle** : un code du moteur, 300 caractères au plus.
- **`entree` et `sortie` sont bornées à 256 Kio** chacune. Le plus gros contenu prévu est un texte de rédacteur de 8 000 caractères.
- **`purger_executions` rend un nombre de lignes touchées** : simulations supprimées plus étapes vidées. Une action de simulation survit à son exécution (`actions` ne se supprime jamais) : son `execution_id` passe à nul (section 18, point 11).


## 8. Migration 0080 : les actions généralisées

| | |
|---|---|
| Fichier | `src/server/db/migrations/0080-actions-generalisees.sql` (à créer) |
| Jalon | 1, PR 7 (« Actions généralisées ») |
| Touche | `actions` (existe, `0037-actions.sql`, `0038-actions-github.sql`) |
| Crée | `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| Test | `0080-actions-generalisees.db.test.ts` (section 16.6, code complet : il supprime le parent) |
| Drizzle | quatorze colonnes dans `schema/actions.ts` (section 14.4) |
| Dans la même PR | `ACTION_STATUSES` gagne `'defaite'` (`src/lib/actions.ts:64`) ; `'actions.kind'` entre dans `VALIDATED_IN_CODE` ; l'appel dans `deleteAccount` (section 15.1) |

```sql
-- 0080-actions-generalisees.sql : la table actions s'ouvre aux agents et à tous les outils (dossier agents, 7.3, 8.1,
-- 8.2). Elle reste le journal des écritures : privée à la personne (acl = [user_id]), jamais supprimée.
--
-- Ce qui change : une action dit d'où elle vient (une discussion ou une exécution d'agent), ce qu'elle a de grave
-- (enjeu), qui la lira (audience), ce que l'exécution avait lu (contenu_externe, donnees_privees, texte_libre), jusqu'à
-- quand elle se valide (expire_le), qui l'a décidée (decide_par), et de quoi l'annuler (annulation). Le type d'action
-- devient « outil.verbe », validé dans le code (ACTION_KINDS), comme sources.kind depuis 0010.
--
-- Qui écrit : la discussion (comme avant, avec les défauts les plus prudents : enjeu haut, audience externe, donc
-- toujours un clic) et le moteur d'agents, sous le contexte de la personne. Qui lit : la personne seule. Interdit :
-- supprimer ; changer les paramètres, le type, l'enjeu, l'audience ou la provenance d'une action écrite ; exécuter une
-- action de simulation.
--
-- Compatible avec le code d'avant, qui tourne encore pendant le recouvrement d'une mise en ligne : chaque colonne
-- nouvelle est nulle ou a un défaut, expire_le compris (une heure, la règle d'aujourd'hui).
set local lock_timeout = '5s';

alter table actions
  add column origine text not null default 'discussion' check (origine = any (array['discussion', 'agent'])),
  add column execution_id uuid,
  -- Le rang de l'étape du journal (etapes_execution.rang) qui a proposé l'action.
  add column etape_rang integer check (etape_rang >= 0),
  add column enjeu text not null default 'haut' check (enjeu = any (array['bas', 'moyen', 'haut'])),
  add column audience text not null default 'externe' check (audience = any (array['soi', 'interne', 'externe'])),
  add column texte_libre boolean not null default false,
  add column contenu_externe boolean not null default false,
  add column donnees_privees boolean not null default false,
  add column simulation boolean not null default false,
  add column cle_idempotence text check (cle_idempotence ~ '^[0-9a-f]{64}$'),
  add column expire_le timestamptz,
  add column decide_par text check (decide_par = any (array['personne', 'autonomie'])),
  -- De quoi défaire : l'identifiant créé, ou l'état lu avant l'écriture. Des identifiants et des valeurs de champ.
  add column annulation jsonb check (annulation is null or jsonb_typeof(annulation) = 'object'),
  add column defaite_le timestamptz;

-- Les lignes passées : une proposition valait une heure, et toute décision était un clic.
update actions set expire_le = created_at + interval '1 hour';
update actions set decide_par = 'personne' where decided_at is not null;
alter table actions
  alter column expire_le set default (clock_timestamp() + interval '1 hour'),
  alter column expire_le set not null;

alter table actions
  -- La liste fermée de 0038 devient un motif : ajouter un type d'action ne demande plus de migration.
  drop constraint actions_kind_check,
  add constraint actions_kind_check check (kind ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),
  drop constraint actions_status_check,
  add constraint actions_status_check
    check (status = any (array['proposee', 'en-cours', 'faite', 'echouee', 'annulee', 'defaite'])),
  -- La clé d'une écriture est posée avant l'appel à l'outil : une seule ligne par clé.
  add constraint actions_cle_idempotence_key unique (tenant_id, cle_idempotence),
  -- Une action d'agent porte toujours sa clé ; une action de discussion n'a pas d'exécution.
  add constraint actions_origine_cle_check
    check ((origine = 'agent' and cle_idempotence is not null) or (origine = 'discussion' and execution_id is null)),
  -- Une action de simulation ne s'exécute jamais, avec ou sans clic, quoi qu'écrive le code. Écrit sans any(array[…]) :
  -- le contrat de schéma cherche « (status = ANY » pour lire la liste des états, et ne doit trouver que celle du dessus.
  add constraint actions_simulation_statut_check
    check (not simulation or status = 'proposee' or status = 'annulee'),
  -- La liste de colonnes est obligatoire : sans elle, tenant_id passerait aussi à nul (précédent : 0008).
  add constraint actions_execution_fkey foreign key (tenant_id, execution_id)
    references executions_agent (tenant_id, id) on delete set null (execution_id);

-- « À valider » et la pastille : les propositions en attente d'une personne. Les actions d'une exécution.
create index actions_en_attente_idx on actions (tenant_id, user_id, expire_le) where status = 'proposee';
create index actions_execution_idx on actions (tenant_id, execution_id) where execution_id is not null;

-- 0037, plus l'exécution : une action n'entre que dans une exécution de son auteur.
alter policy own_discussion_and_connection on actions
  with check (
    (discussion_id is null or exists (
      select 1 from discussions d
      where d.id = actions.discussion_id and d.tenant_id = actions.tenant_id and d.user_id = actions.user_id))
    and (connection_id is null or exists (
      select 1 from connections c
      where c.id = actions.connection_id and c.tenant_id = actions.tenant_id
        and c.created_by = actions.user_id))
    and (execution_id is null or exists (
      select 1 from executions_agent e
      where e.id = actions.execution_id and e.tenant_id = actions.tenant_id and e.user_id = actions.user_id)));

-- En plus de status, result et decided_at (0037) : qui a décidé, de quoi annuler, et l'heure de l'annulation.
grant update (decide_par, annulation, defaite_le) on actions to leon_app;

-- Un administrateur coupe les agents d'un membre qu'il retire, ou d'un administrateur qui perd son rôle
-- (removeMember, setMemberRole ; dossier agents, 9.10). Dans l'organisation courante seulement : ses activations
-- passent à actif = faux, et ses actions d'agent en attente à « annulee » (decide_par reste nul : ni un clic, ni
-- l'autonomie). Avec p_equipe_seulement : ses activations d'équipe et leurs actions seulement, ses agents personnels
-- continuent. Rend le nombre d'activations coupées ; 0 si l'appelant n'est ni propriétaire ni administrateur.
-- Les abonnements de webhook s'ajoutent en 0083.
create function couper_agents_du_membre(p_user uuid, p_equipe_seulement boolean)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_equipe boolean := coalesce(p_equipe_seulement, false);
  v_coupees integer;
begin
  if v_tenant is null or p_user is null or not app_est_admin() then
    return 0;
  end if;

  with coupees as (
    update agents_actives a set actif = false, modifie_le = now()
     where a.tenant_id = v_tenant and a.user_id = p_user and a.actif
       and (not v_equipe or a.portee = 'equipe')
    returning 1
  )
  select count(*)::integer into v_coupees from coupees;

  update actions x set status = 'annulee', decided_at = now()
   where x.tenant_id = v_tenant and x.user_id = p_user and x.origine = 'agent' and x.status = 'proposee'
     and (not v_equipe or exists (
           select 1 from executions_agent e
             join agents_actives a on a.tenant_id = e.tenant_id and a.id = e.activation_id
            where e.tenant_id = x.tenant_id and e.id = x.execution_id and a.portee = 'equipe'));

  return v_coupees;
end
$$;
revoke all on function couper_agents_du_membre(uuid, boolean) from public;
grant execute on function couper_agents_du_membre(uuid, boolean) to leon_app;

-- Ce que la suppression d'un compte emporte du système d'agents, pour la personne courante dans l'organisation
-- courante (deleteAccount, sous withTenant ; modèle : supprimer_notes_du_compte, 0067). L'app n'a le droit de
-- supprimer dans aucune de ces tables : seule cette fonction le fait.
-- Supprime ses exécutions (leurs étapes partent en cascade), ses événements, ses activations personnelles, son
-- compteur du jour. Coupe ses activations d'équipe, qu'un administrateur pourra reprendre. Annule ses actions d'agent
-- en attente, puis vide les paramètres et l'annulation de toutes ses actions d'agent : la ligne reste comme journal.
-- Rend le nombre d'exécutions supprimées. Les veilles s'ajoutent en 0082, les canaux en 0084.
create function supprimer_agents_du_compte()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_executions integer;
begin
  if v_tenant is null or v_user is null then
    return 0;
  end if;

  with parties as (
    delete from executions_agent e where e.tenant_id = v_tenant and e.user_id = v_user returning 1
  )
  select count(*)::integer into v_executions from parties;

  delete from evenements e where e.tenant_id = v_tenant and e.user_id = v_user;
  delete from agents_actives a where a.tenant_id = v_tenant and a.user_id = v_user and a.portee = 'personne';
  update agents_actives a set actif = false, modifie_le = now()
   where a.tenant_id = v_tenant and a.user_id = v_user and a.portee = 'equipe' and a.actif;
  delete from budgets_personne_jour j where j.tenant_id = v_tenant and j.user_id = v_user;

  update actions x set status = 'annulee', decided_at = now()
   where x.tenant_id = v_tenant and x.user_id = v_user and x.origine = 'agent' and x.status = 'proposee';
  update actions x set params = '{}'::jsonb, annulation = null
   where x.tenant_id = v_tenant and x.user_id = v_user and x.origine = 'agent';

  return v_executions;
end
$$;
revoke all on function supprimer_agents_du_compte() from public;
grant execute on function supprimer_agents_du_compte() to leon_app;
```

À savoir :

- **`expire_le` a un défaut d'une heure.** L'architecture écrit `expire_le timestamptz not null`. Pendant le recouvrement d'une mise en ligne, l'ancien `proposeAction` (`proposed-actions.ts:47-60`) insère encore sans cette colonne : sans défaut, chaque proposition de la discussion échouerait. Le défaut est la règle d'aujourd'hui (`ACTION_VALID_MS`). Le code nouveau écrit toujours la colonne (chapitre 05).
- **Une action de discussion garde les défauts les plus prudents** : `enjeu = 'haut'`, `audience = 'externe'`. Elle attend donc toujours un clic, comme aujourd'hui.
- **Deux contraintes de plus que l'architecture** (section 18, point 9). `actions_origine_cle_check` : une action d'agent porte toujours sa clé d'idempotence, une action de discussion n'a pas d'exécution. Il n'y a pas de contrainte « une action d'agent a une exécution » : l'exécution peut être supprimée, et `execution_id` passe alors à nul. `actions_simulation_statut_check` : une action de simulation ne quitte jamais `proposee` que pour `annulee`.
- **Le test du contrat de schéma oblige deux gestes dans la même PR.** `ACTION_STATUSES` gagne `'defaite'`, sinon l'`enum` Drizzle et le `check` diffèrent. `'actions.kind'` entre dans `VALIDATED_IN_CODE`, sinon le test cherche une liste fermée qui n'existe plus.
- **`decide_par` reste nul pour une action annulée par une fonction** : ce n'est ni un clic, ni l'autonomie. `annulee` avec `decide_par` nul et `decided_at` daté veut dire « coupée par un départ ».
- **`couper_agents_du_membre` prend un identifiant de personne** (`"user".id`), pas d'adhésion. `removeMember` et `setMemberRole` reçoivent un `memberId` (`members.ts:100-130`) : `departure.ts` (chapitre 06) lit `member."userId"` avant d'appeler, et appelle avant de supprimer l'adhésion.
- **Elle ne ferme pas les exécutions en cours** de la personne : c'est le moteur qui le fait au job suivant (architecture, 9.10 ; écart 1).
- **`supprimer_agents_du_compte` vide `params` à `{}`**, pas à nul : la colonne est `not null` et son `check` exige un objet (`0037-actions.sql:15`). Elle garde `result` (une adresse dans l'outil et un code d'erreur, pas de contenu).

## 9. Migration 0081 : le verrou de renouvellement et le créneau d'écriture

| | |
|---|---|
| Fichier | `src/server/db/migrations/0081-connexions-renouvellement.sql` (à créer) |
| Jalon | 1, PR 7 |
| Touche | `connections` (existe, `0008-connecteurs.sql:3-32`) |
| Crée | `creneaux_ecriture`, `reserver_creneau` |
| Test | `0081-connexions-renouvellement.db.test.ts` (section 16.7, code complet) |
| Drizzle | `renewLockAt` dans `schema/connections.ts` (section 14.4). `creneaux_ecriture` n'est pas déclarée |

```sql
-- 0081-connexions-renouvellement.sql : deux gardes qui passent de la mémoire du processus à la base, parce que web et
-- worker écrivent désormais tous les deux dans les outils (dossier agents, 4, 8.3 et 9.4).
--
-- 1. Le verrou de renouvellement d'un jeton OAuth. ensureFreshTokens (src/server/connectors/oauth.ts) le prend par un
--    update atomique, comme sync_lock_at, avant de renouveler : un jeton de rafraîchissement ne sert qu'une fois, et
--    la relève, la relève ciblée et un clic peuvent le renouveler en même temps.
-- 2. Le créneau d'écriture d'une connexion : le pas entre deux écritures, partagé entre tous les processus. L'app n'y
--    touche que par reserver_creneau ; la table est sans texte, sans droit pour leon_app.

-- Le verrou exclusif d'un alter tient jusqu'au commit : sans lui en 5 s, la migration échoue et se relance, plutôt que
-- de faire attendre derrière elle toutes les requêtes de la table (0069).
set local lock_timeout = '5s';

alter table connections add column renew_lock_at timestamptz;

create table creneaux_ecriture (
  connection_id uuid primary key references connections(id) on delete cascade,
  -- Le premier instant où la prochaine écriture pourra partir.
  prochain_le timestamptz not null
);
alter table creneaux_ecriture enable row level security;

-- Réserve le prochain créneau d'écriture de la connexion et rend le temps à attendre avant d'écrire, en
-- millisecondes (0 : tout de suite). p_pas_ms : le pas de l'outil entre deux écritures (Connector.write.minIntervalMs).
-- p_retard_ms : après un refus pour débit, le délai demandé par l'outil ; il repousse le créneau de tous.
-- La connexion est de l'organisation courante et branchée par la personne courante ; sinon rend nul, sans rien écrire.
-- Bornes : un pas de 10 minutes au plus, un retard d'une heure au plus (un Retry-After aberrant ne gèle pas l'outil).
create function reserver_creneau(p_connection uuid, p_pas_ms integer, p_retard_ms integer)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_pas interval := make_interval(secs => least(greatest(coalesce(p_pas_ms, 0), 0), 600000) / 1000.0);
  v_retard interval := make_interval(secs => least(greatest(coalesce(p_retard_ms, 0), 0), 3600000) / 1000.0);
  v_maintenant timestamptz := clock_timestamp();
  v_creneau timestamptz;
begin
  if not exists (
    select 1 from connections c
     where c.id = p_connection and c.tenant_id = app_tenant() and c.created_by = app_user()) then
    return null;
  end if;

  -- Le créneau de l'appelant : le plus tard de « maintenant plus le retard » et du créneau déjà promis. Le suivant
  -- vient un pas après. Deux appels simultanés s'attendent sur la ligne et reçoivent deux créneaux distincts.
  insert into creneaux_ecriture as k (connection_id, prochain_le)
  values (p_connection, v_maintenant + v_retard + v_pas)
  on conflict (connection_id) do update
    set prochain_le = greatest(k.prochain_le, v_maintenant + v_retard) + v_pas
  returning k.prochain_le - v_pas into v_creneau;

  return greatest(ceil(extract(epoch from (v_creneau - v_maintenant)) * 1000), 0)::integer;
end
$$;
revoke all on function reserver_creneau(uuid, integer, integer) from public;
grant execute on function reserver_creneau(uuid, integer, integer) to leon_app;
```

À savoir :

- **Aucun droit à ajouter pour `renew_lock_at`** : `leon_app` a `update` sur toute la table `connections` (`0008-connecteurs.sql:32`). Le verrou se prend comme l'écrit l'architecture (8.3) :

  ```sql
  update connections set renew_lock_at = now()
   where id = $1 and (renew_lock_at is null or renew_lock_at < now() - interval '1 minute')
  returning id
  ```

- **Ce que rend `reserver_creneau`.** Le temps à attendre avant d'écrire, en millisecondes. Essai sur la base jetable, pas de 2 000 ms : premier appel 0, deuxième 2 000, appel après un refus avec un retard de 30 000 ms : 30 000, appel suivant : 32 000. Nul : la connexion n'est pas celle de la personne, rien n'est écrit.
- **Un créneau pris n'est pas rendu.** Après un refus pour débit, l'appelant prend un créneau repoussé, puis en prend un autre au moment de réessayer : le premier est perdu. Cela ne fait qu'espacer un peu plus.
- **Deux bornes internes** : un pas de 10 minutes au plus, un retard d'une heure au plus. Un `Retry-After` aberrant ne gèle pas un outil pour la journée.
- **Le créneau est par connexion**, comme le dit l'architecture (9.4). Deux collègues sur le même compte HubSpot ne se partagent rien : c'est la limite connue, avec sa mesure de déclenchement.

## 10. Migration 0082 : les veilles

| | |
|---|---|
| Fichier | `src/server/db/migrations/0082-veilles.sql` (à créer) |
| Jalon | après. Déclencheur : le premier agent de relance ou de préparation de rendez-vous |
| Crée | `veilles`, `veilles_echues`, `purger_veilles` (ajout) |
| Refait | `supprimer_agents_du_compte` (0080) |
| Test | `0082-veilles.db.test.ts` (section 16.2 : il supprime le parent) |
| Drizzle | `veilles` dans `schema/agents.ts` |
| Dans la même PR | `'veilles.source_id → sources'` dans `COMPOSITE_KEYS` |

```sql
-- 0082-veilles.sql : les veilles (dossier agents, 8.5). L'état court d'un suivi : « attend une réponse depuis le… ».
-- Une veille s'ouvre sur une étiquette, se ferme sur une autre, et échoit après un délai : c'est alors qu'elle
-- déclenche son agent.
--
-- Qui écrit : le standard (src/server/standard/watches.ts), sous les droits de la personne. Qui lit : elle seule, et
-- le tic agent-veilles par veilles_echues. Privée à la personne (acl = [user_id], contrôlé par la base), agent
-- d'équipe compris : une veille rappelle à quelqu'un son propre suivi, personne d'autre ne la lit (9.11). Elle porte
-- un objet (cle_objet), jamais le nom d'un collègue. Interdit : supprimer par l'app (purger_veilles le fait).

create table veilles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  activation_id uuid not null,
  agent_id text not null check (agent_id ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- WATCH_MOTIFS (src/server/agents/definition.ts). Ajouter un motif : une migration qui refait ce check (modèle 0038).
  motif text not null
    check (motif = any (array['attend_reponse', 'tache_en_retard', 'rdv_a_venir', 'sans_nouvelle'])),
  -- `${sources.kind}:${sources.external_id}`, comme evenements.cle_objet.
  cle_objet text not null check (char_length(cle_objet) between 1 and 300),
  source_id uuid,
  etat text not null default 'ouverte' check (etat = any (array['ouverte', 'declenchee', 'close'])),
  ouverte_le timestamptz not null default now(),
  echeance_le timestamptz not null,
  close_le timestamptz,
  -- Privée à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, id),
  -- Une seule veille par activation, motif et objet : la rouvrir, c'est la remettre à « ouverte ».
  unique (tenant_id, activation_id, motif, cle_objet),
  foreign key (tenant_id, activation_id) references agents_actives (tenant_id, id) on delete cascade,
  -- La liste de colonnes est obligatoire : sans elle, tenant_id passerait aussi à nul et la suppression de la source
  -- échouerait (précédent : 0008). La veille survit à sa source : elle garde cle_objet.
  foreign key (tenant_id, source_id) references sources (tenant_id, id) on delete set null (source_id)
);
create index veilles_echeance_idx on veilles (echeance_le) where etat = 'ouverte';
create index veilles_user_idx on veilles (tenant_id, user_id, etat);
create index veilles_source_idx on veilles (tenant_id, source_id) where source_id is not null;

alter table veilles enable row level security;
create policy tenant_acl on veilles to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- La clé étrangère se vérifie hors sécurité par ligne : une veille n'entre que pour une activation de la personne.
create policy own_activation on veilles as restrictive for insert to leon_app
  with check (exists (
    select 1 from agents_actives a
    where a.tenant_id = veilles.tenant_id and a.id = veilles.activation_id and a.user_id = veilles.user_id));

grant select, insert on veilles to leon_app;
grant update (etat, echeance_le, close_le) on veilles to leon_app;

-- Lecture hors sécurité par ligne, pour le tic agent-veilles : les veilles ouvertes dont l'échéance est passée, toutes
-- organisations. Des identifiants seulement. La personne est membre, son compte n'est pas supprimé, l'activation est
-- en service et toujours la sienne, l'organisation n'a pas coupé ses agents.
create function veilles_echues(p_max integer)
returns table (veille_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select v.id, v.tenant_id, v.user_id
    from veilles v
    join agents_actives a
      on a.tenant_id = v.tenant_id and a.id = v.activation_id and a.user_id = v.user_id and a.actif
    join member m on m."organizationId" = v.tenant_id and m."userId" = v.user_id
    join "user" u on u.id = v.user_id and u.deleted_at is null
    left join reglages_organisation r on r.tenant_id = v.tenant_id
   where v.etat = 'ouverte' and v.echeance_le <= now()
     and coalesce(r.agents_actifs, true)
   order by v.echeance_le, v.id
   limit least(greatest(p_max, 0), 1000)
$$;
revoke all on function veilles_echues(integer) from public;
grant execute on function veilles_echues(integer) to leon_app;

-- Supprime, toutes organisations, les veilles closes depuis plus de p_jours jours, et celles dont l'échéance est
-- passée depuis plus de p_jours jours sans avoir été closes (personne partie, agent coupé). Rend leur nombre.
create function purger_veilles(p_jours integer)
returns integer
language sql volatile security definer set search_path = public, pg_temp as $$
  with parties as (
    delete from veilles v
     where (v.etat = 'close' and v.close_le < now() - make_interval(days => greatest(p_jours, 1)))
        or (v.etat <> 'close' and v.echeance_le < now() - make_interval(days => greatest(p_jours, 1)))
    returning 1
  )
  select count(*)::integer from parties
$$;
revoke all on function purger_veilles(integer) from public;
grant execute on function purger_veilles(integer) to leon_app;

-- 0080, plus les veilles de la personne (celles de ses activations d'équipe ne partiraient pas en cascade).
create or replace function supprimer_agents_du_compte()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_executions integer;
begin
  if v_tenant is null or v_user is null then
    return 0;
  end if;

  with parties as (
    delete from executions_agent e where e.tenant_id = v_tenant and e.user_id = v_user returning 1
  )
  select count(*)::integer into v_executions from parties;

  delete from evenements e where e.tenant_id = v_tenant and e.user_id = v_user;
  delete from veilles v where v.tenant_id = v_tenant and v.user_id = v_user;
  delete from agents_actives a where a.tenant_id = v_tenant and a.user_id = v_user and a.portee = 'personne';
  update agents_actives a set actif = false, modifie_le = now()
   where a.tenant_id = v_tenant and a.user_id = v_user and a.portee = 'equipe' and a.actif;
  delete from budgets_personne_jour j where j.tenant_id = v_tenant and j.user_id = v_user;

  update actions x set status = 'annulee', decided_at = now()
   where x.tenant_id = v_tenant and x.user_id = v_user and x.origine = 'agent' and x.status = 'proposee';
  update actions x set params = '{}'::jsonb, annulation = null
   where x.tenant_id = v_tenant and x.user_id = v_user and x.origine = 'agent';

  return v_executions;
end
$$;
```

À savoir :

- **`purger_veilles` n'est pas dans la liste de l'architecture** (7.4). Sa règle 9.6, point 10, dit qu'une veille close est supprimée après 30 jours, et l'app n'a pas le droit de supprimer : il faut une fonction. Elle est appelée par le tic `agent-veilles`, une fois par heure, avec 30 (écart 7).
- **Elle emporte aussi les veilles jamais closes dont l'échéance est passée depuis 30 jours** : celles d'une personne partie, ou d'un agent coupé, que `veilles_echues` ne rend jamais.
- **Rouvrir une veille**, c'est remettre la ligne à `ouverte` avec une nouvelle échéance : la clé `(tenant_id, activation_id, motif, cle_objet)` interdit une seconde ligne. Le standard écrit donc un `insert … on conflict do update set etat = 'ouverte', echeance_le = …, close_le = null`.
- **La liste des motifs est fermée en SQL.** Ajouter un motif à `WATCH_MOTIFS` demande une migration qui refait ce `check`, sur le modèle de `0038`. C'est voulu : un motif change ce que fait le standard, pas seulement une étiquette.
- **Une veille d'agent d'équipe est privée à son activateur.** Après une reprise (`reprendre_agent_equipe`), les veilles de l'ancien activateur ne sont plus rendues (`a.user_id = v.user_id`) et partent à la purge.

## 11. Migration 0083 : les webhooks

| | |
|---|---|
| Fichier | `src/server/db/migrations/0083-webhooks.sql` (à créer) |
| Jalon | après. Déclencheur : un agent dont la valeur tient à la fraîcheur |
| Demande | le rôle Postgres `leon_porte`, créé hors migration (section 15.2) |
| Crée | `abonnements_webhook`, `boite_entree_webhooks`, sept fonctions |
| Refait | `couper_agents_du_membre` (0080) |
| Test | `0083-webhooks.db.test.ts` (section 16.8, code complet) ; contrat `src/test/contracts/prendre-livraison.test.ts` (section 16.9) |
| Drizzle | `schema/webhooks.ts` (section 14.2) |
| Dans la même PR | `abonnements_webhook` dans `DELETE_ALLOWED` ; `init.sql` et README (section 15) |

```sql
-- 0083-webhooks.sql : les webhooks entrants (dossier agents, 3, 7.4 et 8.3). Les abonnements chez les éditeurs, la
-- boîte d'entrée où « la porte » dépose chaque livraison vérifiée, et le contrat de la porte : deux fonctions.
--
-- abonnements_webhook : un abonnement, lié à une connexion. Son id est l'identifiant opaque de l'adresse de rappel.
-- Privé à la personne qui a branché la connexion (acl = [user_id]). Écrit par src/server/webhooks/subscriptions.ts.
-- boite_entree_webhooks : une ligne par livraison. Le corps d'un webhook peut porter ce que tous ne voient pas : il
-- n'est lisible par personne. leon_app n'a aucun droit sur la table. porte_deposer écrit ; prendre_livraison rend le
-- corps une seule fois, pour la correspondance (Connector.webhook.match), et le vide dans le même geste.
--
-- La porte a son propre rôle Postgres, leon_porte, qui n'a que deux droits : exécuter porte_secret et porte_deposer.
-- Ces deux fonctions ne sont accordées à personne d'autre : leon_app ne peut ni lire le secret d'un abonnement d'une
-- autre organisation, ni déposer une livraison sans signature.

-- Les rôles ne se créent pas dans les migrations (docker/postgres/init.sql). Sur un volume créé avant ce fichier, et
-- en production, leon_porte se crée à la main : sans lui, on s'arrête ici avec la marche à suivre.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'leon_porte') then
    raise exception
      'Le rôle Postgres leon_porte manque. Avec le compte d''administration de la base : create role leon_porte login password ''…'' nobypassrls; grant connect on database % to leon_porte; puis relancer pnpm db:migrate (README, « Rôle de la porte »).',
      current_database();
  end if;
  if exists (
    select 1 from pg_roles
     where rolname = 'leon_porte' and (rolsuper or rolbypassrls or rolcreaterole or rolcreatedb)) then
    raise exception
      'Le rôle Postgres leon_porte a trop de droits : ni superutilisateur, ni bypassrls, ni createrole, ni createdb.';
  end if;
end
$$;
grant usage on schema public to leon_porte;

create table abonnements_webhook (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  -- Le créateur de la connexion.
  user_id uuid not null references "user"(id) on delete cascade,
  connection_id uuid not null,
  outil text not null check (outil ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- app : une adresse par appli, le compte est lu dans le corps ; la ligne dit « cette connexion écoute ce compte ».
  -- abonnement : une adresse par abonnement.
  portee text not null check (portee = any (array['app', 'abonnement'])),
  -- La clé de compte (connections.config.accountKey), pour la portée app.
  compte text check (char_length(compte) between 1 and 200),
  ressource text not null check (char_length(ressource) between 1 and 500),
  -- L'identifiant de l'abonnement chez l'éditeur ; nul pour app et pour une adresse collée à la main.
  externe_id text check (char_length(externe_id) between 1 and 500),
  -- Le secret de l'abonnement, chiffré par LEON_PORTE_KEY ; nul pour app (secret d'application, dans une variable).
  secret text check (secret like 'v1:%'),
  -- active : en service. expiree, erreur : à recréer par subscribeConnection. manuelle : adresse collée à la main dans
  -- l'outil, en service, jamais renouvelée. resiliee : coupée (membre retiré), jamais recréée.
  etat text not null default 'active'
    check (etat = any (array['active', 'expiree', 'erreur', 'manuelle', 'resiliee'])),
  -- Lue dans la réponse de l'éditeur, jamais dans une constante ; nul : l'abonnement n'expire pas.
  expire_le timestamptz,
  -- Aux trois quarts de la durée.
  renouveler_le timestamptz,
  renouvele_le timestamptz,
  dernier_recu_le timestamptz,
  erreur text check (char_length(erreur) <= 300),
  cree_le timestamptz not null default now(),
  -- Privé à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, id),
  unique (connection_id, ressource),
  constraint abonnements_webhook_app_check check (portee <> 'app' or (compte is not null and secret is null)),
  foreign key (tenant_id, connection_id) references connections (tenant_id, id) on delete cascade
);
-- Le dépôt d'un webhook d'application : qui écoute ce compte. Le tic de renouvellement.
create index abonnements_webhook_compte_idx on abonnements_webhook (outil, compte) where portee = 'app';
create index abonnements_webhook_renouveler_idx on abonnements_webhook (renouveler_le) where etat = 'active';
create index abonnements_webhook_user_idx on abonnements_webhook (tenant_id, user_id);

alter table abonnements_webhook enable row level security;
create policy tenant_acl on abonnements_webhook to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- La clé étrangère se vérifie hors sécurité par ligne : un abonnement n'entre que pour une connexion que la personne a
-- branchée elle-même (comme une action, 0037).
create policy own_connection on abonnements_webhook as restrictive for insert to leon_app
  with check (exists (
    select 1 from connections c
    where c.tenant_id = abonnements_webhook.tenant_id and c.id = abonnements_webhook.connection_id
      and c.created_by = abonnements_webhook.user_id));

-- Abonner, renouveler, se désabonner. dernier_recu_le n'est écrit que par porte_deposer.
grant select, insert, delete on abonnements_webhook to leon_app;
grant update (externe_id, secret, etat, expire_le, renouveler_le, renouvele_le, erreur)
  on abonnements_webhook to leon_app;

create table boite_entree_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  outil text not null check (outil ~ '^[a-z][a-z0-9_]{1,39}$'),
  portee text not null check (portee = any (array['app', 'abonnement'])),
  abonnement_id uuid,
  compte text check (char_length(compte) between 1 and 200),
  -- L'id de l'abonnement, ou la clé de compte : ce qui rend une livraison unique.
  depot text not null check (char_length(depot) between 1 and 200),
  genre text not null default 'livraison' check (genre = any (array['livraison', 'cycle'])),
  -- L'identifiant de livraison de l'éditeur, ou le SHA-256 du corps.
  livraison text not null check (char_length(livraison) between 1 and 200),
  -- Le corps brut, 256 Kio au plus. Nul dès qu'il a été pris, ou après 24 heures.
  corps text check (octet_length(corps) <= 262144),
  -- Les en-têtes d'une liste blanche, 8 Kio au plus : jamais celui qui porte un jeton ou une signature.
  entetes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(entetes) = 'object' and octet_length(entetes::text) <= 8192),
  -- recue : à traiter. traitee : prise par prendre_livraison. ignoree : l'abonnement n'est plus en service ou sa
  -- personne est partie. echouee : restée « recue » plus de 24 heures.
  statut text not null default 'recue' check (statut = any (array['recue', 'traitee', 'ignoree', 'echouee'])),
  recu_le timestamptz not null default now(),
  traite_le timestamptz,
  -- Une livraison rejouée par l'éditeur ne s'écrit pas deux fois.
  unique (tenant_id, outil, depot, livraison),
  constraint boite_entree_webhooks_cible_check check (
    (portee = 'app' and abonnement_id is null and compte is not null)
    or (portee = 'abonnement' and abonnement_id is not null)),
  foreign key (tenant_id, abonnement_id) references abonnements_webhook (tenant_id, id) on delete cascade
);
create index boite_entree_webhooks_recues_idx on boite_entree_webhooks (recu_le) where statut = 'recue';
create index boite_entree_webhooks_recu_idx on boite_entree_webhooks (recu_le);
create index boite_entree_webhooks_abonnement_idx on boite_entree_webhooks (tenant_id, abonnement_id)
  where abonnement_id is not null;
-- Aucune règle, aucun droit : ni leon_app ni leon_porte ne lisent ni n'écrivent la table directement.
alter table boite_entree_webhooks enable row level security;

-- Le contrat de la porte ----------------------------------------------------------------------------------------

-- Le secret chiffré d'un abonnement en service, et son organisation. Aucune ligne pour un abonnement inconnu, d'un
-- autre outil, expiré, en erreur ou résilié, ni pour une personne partie ou un compte supprimé. Une ligne au secret
-- nul : l'abonnement existe et l'outil signe avec un secret d'application.
create function porte_secret(p_outil text, p_abonnement uuid)
returns table (tenant_id uuid, secret text)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.tenant_id, a.secret
    from abonnements_webhook a
    join member m on m."organizationId" = a.tenant_id and m."userId" = a.user_id
    join "user" u on u.id = a.user_id and u.deleted_at is null
   where a.id = p_abonnement and a.outil = p_outil and a.portee = 'abonnement'
     and a.etat = any (array['active', 'manuelle'])
     and (a.expire_le is null or a.expire_le > now())
$$;
revoke all on function porte_secret(text, uuid) from public;
grant execute on function porte_secret(text, uuid) to leon_porte;

-- Dépose une livraison que la porte a vérifiée, et rend le nombre de lignes écrites. Exactement un de p_abonnement
-- et p_compte est donné.
-- Portée abonnement (p_abonnement) : une ligne, si l'abonnement est en service.
-- Portée app (p_compte) : une ligne par organisation qui a au moins un abonnement en service pour cet outil et ce
-- compte, jamais une par personne.
-- Une livraison déjà déposée n'est pas réécrite (0 ligne). Chaque ligne écrite réveille le worker
-- (NOTIFY leon_porte, avec l'id de la ligne), à la validation de la transaction.
-- 0 aussi pour un genre inconnu, un identifiant de livraison absent ou trop long, ou un corps de plus de 256 Kio. Des
-- en-têtes qui ne sont pas un objet, ou de plus de 8 Kio, sont remplacés par un objet vide.
create function porte_deposer(
  p_outil text, p_abonnement uuid, p_compte text, p_genre text, p_livraison text, p_corps text, p_entetes jsonb)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_entetes jsonb := case
    when p_entetes is null or jsonb_typeof(p_entetes) <> 'object' or octet_length(p_entetes::text) > 8192
      then '{}'::jsonb
    else p_entetes end;
  v_ecrites integer := 0;
  v_id uuid;
begin
  if p_outil is null
     or (p_abonnement is null) = (p_compte is null)
     or p_genre is null or p_genre <> all (array['livraison', 'cycle'])
     or p_livraison is null or char_length(p_livraison) not between 1 and 200
     or octet_length(coalesce(p_corps, '')) > 262144 then
    return 0;
  end if;

  if p_abonnement is not null then
    for v_id in
      insert into boite_entree_webhooks
        (tenant_id, outil, portee, abonnement_id, depot, genre, livraison, corps, entetes)
      select a.tenant_id, a.outil, 'abonnement', a.id, a.id::text, p_genre, p_livraison, p_corps, v_entetes
        from abonnements_webhook a
        join member m on m."organizationId" = a.tenant_id and m."userId" = a.user_id
        join "user" u on u.id = a.user_id and u.deleted_at is null
       where a.id = p_abonnement and a.outil = p_outil and a.portee = 'abonnement'
         and a.etat = any (array['active', 'manuelle'])
      on conflict (tenant_id, outil, depot, livraison) do nothing
      returning id
    loop
      v_ecrites := v_ecrites + 1;
      perform pg_notify('leon_porte', v_id::text);
    end loop;
    -- Pour l'alerte « aucune livraison depuis N jours » : une écriture toutes les 10 minutes au plus.
    update abonnements_webhook a set dernier_recu_le = now()
     where a.id = p_abonnement and a.outil = p_outil
       and (a.dernier_recu_le is null or a.dernier_recu_le < now() - interval '10 minutes');
  else
    for v_id in
      insert into boite_entree_webhooks
        (tenant_id, outil, portee, compte, depot, genre, livraison, corps, entetes)
      select o.tenant_id, p_outil, 'app', p_compte, p_compte, p_genre, p_livraison, p_corps, v_entetes
        from (
          select distinct a.tenant_id
            from abonnements_webhook a
            join member m on m."organizationId" = a.tenant_id and m."userId" = a.user_id
            join "user" u on u.id = a.user_id and u.deleted_at is null
           where a.outil = p_outil and a.portee = 'app' and a.compte = p_compte
             and a.etat = any (array['active', 'manuelle'])
        ) o
      on conflict (tenant_id, outil, depot, livraison) do nothing
      returning id
    loop
      v_ecrites := v_ecrites + 1;
      perform pg_notify('leon_porte', v_id::text);
    end loop;
    update abonnements_webhook a set dernier_recu_le = now()
     where a.outil = p_outil and a.portee = 'app' and a.compte = p_compte
       and a.etat = any (array['active', 'manuelle'])
       and (a.dernier_recu_le is null or a.dernier_recu_le < now() - interval '10 minutes');
  end if;
  return v_ecrites;
end
$$;
revoke all on function porte_deposer(text, uuid, text, text, text, text, jsonb) from public;
grant execute on function porte_deposer(text, uuid, text, text, text, text, jsonb) to leon_porte;

-- Les lectures du worker ----------------------------------------------------------------------------------------

-- Les livraisons reçues depuis plus de 30 secondes et pas encore prises, toutes organisations : une notification
-- perdue, un worker arrêté. Des identifiants seulement.
create function webhooks_a_traiter(p_max integer)
returns table (id uuid, tenant_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select b.id, b.tenant_id
    from boite_entree_webhooks b
   where b.statut = 'recue' and b.recu_le < now() - interval '30 seconds'
   order by b.recu_le, b.id
   limit least(greatest(p_max, 0), 1000)
$$;
revoke all on function webhooks_a_traiter(integer) from public;
grant execute on function webhooks_a_traiter(integer) to leon_app;

-- Prend une livraison : rend sa ligne, corps compris, une seule fois, puis vide le corps et passe la ligne à
-- « traitee ». C'est la seule fonction hors sécurité par ligne qui rend du texte (écart E18) : le corps ne sert qu'à
-- Connector.webhook.match, qui n'en tire que des identifiants. Seul src/server/webhooks/inbox.ts l'appelle (contrat
-- src/test/contracts/prendre-livraison.test.ts). Appelée hors contexte, comme une fonction de tic : le job ne connaît
-- que l'id de la ligne.
-- user_id : la personne de l'abonnement, membre et compte non supprimé ; nul pour la portée app (le job demande
-- ensuite connexions_du_compte). Aucune ligne si la livraison est déjà prise, inconnue, ou si son abonnement n'est
-- plus en service ou sa personne partie : la ligne passe alors à « ignoree », corps vidé.
create function prendre_livraison(p_id uuid)
returns table (
  tenant_id uuid, user_id uuid, outil text, portee text, genre text, abonnement_id uuid, compte text, corps text,
  entetes jsonb)
language plpgsql volatile security definer set search_path = public, pg_temp as $$
#variable_conflict use_column
declare
  v_ligne boite_entree_webhooks%rowtype;
  v_user uuid;
begin
  select b.* into v_ligne
    from boite_entree_webhooks b
   where b.id = p_id and b.statut = 'recue'
     for update skip locked;
  if not found then
    return;
  end if;

  if v_ligne.portee = 'abonnement' then
    select a.user_id into v_user
      from abonnements_webhook a
      join member m on m."organizationId" = a.tenant_id and m."userId" = a.user_id
      join "user" u on u.id = a.user_id and u.deleted_at is null
     where a.tenant_id = v_ligne.tenant_id and a.id = v_ligne.abonnement_id
       and a.etat = any (array['active', 'manuelle']);
    if not found then
      update boite_entree_webhooks b set statut = 'ignoree', corps = null, traite_le = now() where b.id = p_id;
      return;
    end if;
  end if;

  update boite_entree_webhooks b set statut = 'traitee', corps = null, traite_le = now() where b.id = p_id;
  return query
    select v_ligne.tenant_id, v_user, v_ligne.outil, v_ligne.portee, v_ligne.genre, v_ligne.abonnement_id,
           v_ligne.compte, v_ligne.corps, v_ligne.entetes;
end
$$;
revoke all on function prendre_livraison(uuid) from public;
grant execute on function prendre_livraison(uuid) to leon_app;

-- Les connexions en service qui écoutent ce compte dans cette organisation, par ancienneté : la relève ciblée d'un
-- webhook d'application essaie la plus ancienne, puis la suivante. Appelée hors contexte : le job ne sait pas encore
-- au nom de qui lire. Des identifiants seulement. Le créateur est membre et son compte n'est pas supprimé ; la
-- connexion n'est pas en pause.
create function connexions_du_compte(p_tenant uuid, p_outil text, p_compte text)
returns table (connection_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select c.id, c.created_by
    from connections c
    join member m on m."organizationId" = c.tenant_id and m."userId" = c.created_by
    join "user" u on u.id = c.created_by and u.deleted_at is null
   where c.tenant_id = p_tenant and c.status in ('active', 'error')
     and exists (
       select 1 from abonnements_webhook a
        where a.tenant_id = c.tenant_id and a.connection_id = c.id
          and a.outil = p_outil and a.portee = 'app' and a.compte = p_compte
          and a.etat = any (array['active', 'manuelle']))
   order by c.created_at, c.id
   limit 20
$$;
revoke all on function connexions_du_compte(uuid, text, text) from public;
grant execute on function connexions_du_compte(uuid, text, text) to leon_app;

-- Les abonnements en service dont l'heure de renouvellement est passée, toutes organisations. Des identifiants
-- seulement. La personne est membre, son compte n'est pas supprimé, sa connexion n'est pas en pause.
create function abonnements_a_renouveler(p_max integer)
returns table (abonnement_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select a.id, a.tenant_id, a.user_id
    from abonnements_webhook a
    join connections c
      on c.tenant_id = a.tenant_id and c.id = a.connection_id and c.status in ('active', 'error')
    join member m on m."organizationId" = a.tenant_id and m."userId" = a.user_id
    join "user" u on u.id = a.user_id and u.deleted_at is null
   where a.etat = 'active' and a.renouveler_le <= now()
   order by a.renouveler_le, a.id
   limit least(greatest(p_max, 0), 1000)
$$;
revoke all on function abonnements_a_renouveler(integer) from public;
grant execute on function abonnements_a_renouveler(integer) to leon_app;

-- La purge de l'heure, toutes organisations. Une livraison restée « recue » plus de 24 heures perd son corps et passe
-- à « echouee ». Toute ligne de plus de 7 jours est supprimée, quel que soit son état : plus que toute tolérance
-- d'horodatage, donc une livraison rejouée est encore reconnue. Rend le nombre de lignes touchées.
create function purger_boite_entree()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_videes integer;
  v_parties integer;
begin
  with videes as (
    update boite_entree_webhooks b set corps = null, statut = 'echouee', traite_le = now()
     where b.statut = 'recue' and b.recu_le < now() - interval '24 hours'
    returning 1
  )
  select count(*)::integer into v_videes from videes;

  with parties as (
    delete from boite_entree_webhooks b where b.recu_le < now() - interval '7 days' returning 1
  )
  select count(*)::integer into v_parties from parties;

  return v_videes + v_parties;
end
$$;
revoke all on function purger_boite_entree() from public;
grant execute on function purger_boite_entree() to leon_app;

-- 0080, plus les abonnements d'un membre retiré : ils passent à « resiliee ». La porte refuse alors leurs livraisons,
-- le tic ne les renouvelle plus, et rien n'est appelé chez l'éditeur avec les jetons d'un parti (9.10). Un
-- administrateur qui perd seulement son rôle (p_equipe_seulement) garde ses connexions et leurs abonnements.
create or replace function couper_agents_du_membre(p_user uuid, p_equipe_seulement boolean)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_equipe boolean := coalesce(p_equipe_seulement, false);
  v_coupees integer;
begin
  if v_tenant is null or p_user is null or not app_est_admin() then
    return 0;
  end if;

  with coupees as (
    update agents_actives a set actif = false, modifie_le = now()
     where a.tenant_id = v_tenant and a.user_id = p_user and a.actif
       and (not v_equipe or a.portee = 'equipe')
    returning 1
  )
  select count(*)::integer into v_coupees from coupees;

  update actions x set status = 'annulee', decided_at = now()
   where x.tenant_id = v_tenant and x.user_id = p_user and x.origine = 'agent' and x.status = 'proposee'
     and (not v_equipe or exists (
           select 1 from executions_agent e
             join agents_actives a on a.tenant_id = e.tenant_id and a.id = e.activation_id
            where e.tenant_id = x.tenant_id and e.id = x.execution_id and a.portee = 'equipe'));

  if not v_equipe then
    update abonnements_webhook a set etat = 'resiliee'
     where a.tenant_id = v_tenant and a.user_id = p_user and a.etat <> 'resiliee';
  end if;

  return v_coupees;
end
$$;
```

À savoir :

- **Le contrat de la porte tient en deux appels**, les mêmes pour la route Hono et pour le service Rust :

  ```sql
  select tenant_id, secret from porte_secret($1, $2);                 -- outil, abonnement
  select porte_deposer($1, $2, $3, $4, $5, $6, $7);                   -- outil, abonnement, compte, genre, livraison, corps, en-têtes
  ```

  Portée `abonnement` : `p_abonnement` donné, `p_compte` nul. Portée `app` : l'inverse. Les deux donnés, ou aucun : 0.
- **`porte_deposer` rend 0 pour une livraison rejouée.** La porte répond alors comme pour une livraison neuve : l'éditeur ne doit pas réessayer.
- **`NOTIFY leon_porte` porte l'`id` de la ligne**, en texte. La notification part à la validation de la transaction de la porte. Le worker écoute, puis appelle `prendre_livraison` avec cet identifiant. `webhooks_a_traiter` rattrape une notification perdue après 30 secondes.
- **Un abonnement `manuelle` est en service** : la porte accepte ses livraisons. L'architecture écrit « un abonnement `active` » ; une adresse collée à la main dans l'outil ne servirait à rien si la porte la refusait (écart 2).
- **Les états `ignoree` et `echouee` de la boîte d'entrée.** `leon_app` n'a aucun droit sur la table et l'architecture ne dit pas qui les pose. Ici : `prendre_livraison` pose `ignoree` quand l'abonnement n'est plus en service ou que sa personne est partie ; `purger_boite_entree` pose `echouee` sur une ligne restée `recue` 24 heures. Un échec de `match` ou de la relève ciblée, après la prise, ne se voit pas dans la boîte : la ligne est `traitee`, l'erreur est dans pg-boss et Sentry (écart 4).
- **`prendre_livraison` est appelable par tout code de `leon_app`** (architecture, écart E18). Le contrat de la section 16.9 vérifie que seul `src/server/webhooks/inbox.ts` la nomme.
- **Un secret nul dans `porte_secret`** veut dire : l'abonnement existe, et l'outil signe avec un secret d'application (`WebhookSecret`, `from: 'env'`). Aucune ligne veut dire : refuser, avec la même réponse qu'une signature fausse.
- **Le corps est du texte.** Postgres refuse l'octet nul dans un `text` : la porte doit rejeter un corps qui en contient un avant d'appeler (chapitre 03).
- **`couper_agents_du_membre` passe les abonnements à `resiliee`** seulement quand le membre est retiré. Un administrateur qui perd son rôle garde ses connexions et leurs abonnements.

## 12. Migration 0084 : les canaux sortants

| | |
|---|---|
| Fichier | `src/server/db/migrations/0084-canaux-sortants.sql` (à créer) |
| Jalon | après. Déclencheur : des validations qui attendent plus d'un jour |
| Touche | `"user"` (existe, `0002-auth.sql:5`) |
| Crée | `preferences_canaux`, `installations_slack`, `messages_sortants`, `heure_locale` (ajout), `compte_slack`, `recaps_dus` |
| Refait | `supprimer_agents_du_compte` (0082) |
| Test | `0084-canaux-sortants.db.test.ts` (section 16.2) |
| Drizzle | `schema/channels.ts` (section 14.3) ; `locale` dans `schema/auth.ts` |
| Dans la même PR | `installations_slack` dans `DELETE_ALLOWED` |

```sql
-- 0084-canaux-sortants.sql : ce qui prévient une personne hors de l'application (dossier agents, 9.12) : le
-- récapitulatif par e-mail et le message direct du bot Slack. Rien de ce qui est écrit ici ne porte de contenu : ni
-- paramètre d'action, ni résumé, ni nom de client. Le message est reconstruit à l'envoi, sous les droits du moment.
--
-- preferences_canaux : où et quand prévenir. Privée à la personne, écrite par elle (src/server/channels/).
--   Sans ligne, les défauts : récapitulatif par e-mail à 8 h, heure de Paris, pas de Slack.
-- installations_slack : l'appli Slack de Leon dans l'espace d'une organisation. Lisible de toute l'organisation,
--   écrite par un propriétaire ou un administrateur. Le jeton du bot est chiffré (v1:, LEON_CONNECTORS_KEY) et, comme
--   pour connections.secret, c'est le code qui réserve sa lecture.
-- messages_sortants : le journal des messages envoyés, sans aucun texte. Sert d'idempotence : pas deux
--   récapitulatifs le même jour. Privé à la personne.

-- Le verrou exclusif d'un alter tient jusqu'au commit : sans lui en 5 s, la migration échoue et se relance, plutôt que
-- de faire attendre derrière elle toutes les requêtes de la table (0069).
set local lock_timeout = '5s';

-- La langue de la personne, pour un message écrit sans elle (le cookie leon-locale ne vaut que dans le navigateur).
-- Nul : DEFAULT_LOCALE. Écrite par le réglage de langue.
alter table "user" add column locale text check (locale = any (array['fr', 'en']));

create table preferences_canaux (
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  recap_email boolean not null default true,
  -- L'heure locale à partir de laquelle le récapitulatif part.
  recap_heure smallint not null default 8 check (recap_heure between 0 and 23),
  -- Un nom de fuseau IANA, validé par le code. Un nom que Postgres ne connaît pas : pas de récapitulatif (heure_locale).
  fuseau text not null default 'Europe/Paris' check (char_length(fuseau) between 1 and 64),
  slack boolean not null default false,
  -- Posé par linkSlackUser (users.lookupByEmail sur l'adresse vérifiée du compte), jamais par un formulaire.
  slack_user_id text check (slack_user_id ~ '^[A-Za-z0-9]{1,40}$'),
  -- Privée à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  primary key (tenant_id, user_id)
);
-- Un compte Slack ne se lie qu'à une personne par organisation.
create unique index preferences_canaux_slack_idx on preferences_canaux (tenant_id, slack_user_id)
  where slack_user_id is not null;

alter table preferences_canaux enable row level security;
create policy tenant_acl on preferences_canaux to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
-- Refaite en place (insert … on conflict do update). Aucune suppression par l'app.
grant select, insert on preferences_canaux to leon_app;
grant update (recap_email, recap_heure, fuseau, slack, slack_user_id) on preferences_canaux to leon_app;

create table installations_slack (
  tenant_id uuid primary key references organization(id) on delete cascade,
  -- L'espace Slack : un espace ne s'installe que dans une organisation.
  team_id text not null unique check (team_id ~ '^[A-Za-z0-9]{1,40}$'),
  bot_token text not null check (bot_token like 'v1:%'),
  bot_user_id text not null check (bot_user_id ~ '^[A-Za-z0-9]{1,40}$'),
  installe_par uuid not null references "user"(id) on delete cascade,
  cree_le timestamptz not null default now()
);
alter table installations_slack enable row level security;
create policy tenant_only on installations_slack to leon_app
  using (tenant_id = app_tenant()) with check (tenant_id = app_tenant());
create policy admin_insert on installations_slack as restrictive for insert to leon_app
  with check (app_est_admin());
create policy admin_update on installations_slack as restrictive for update to leon_app
  using (app_est_admin());
create policy admin_delete on installations_slack as restrictive for delete to leon_app
  using (app_est_admin());
-- Installer, réinstaller (insert … on conflict do update), désinstaller.
grant select, insert, delete on installations_slack to leon_app;
grant update (team_id, bot_token, bot_user_id, installe_par) on installations_slack to leon_app;

create table messages_sortants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  canal text not null check (canal = any (array['email', 'slack'])),
  genre text not null check (genre = any (array['recap', 'validation', 'fait', 'alerte'])),
  -- La clé d'idempotence du message, bâtie par le code (elle commence par la personne et finit, pour un
  -- récapitulatif, par le jour).
  cle text not null check (char_length(cle) between 1 and 200),
  -- Les actions dont le message parle : des identifiants, relus sous les droits de la personne à l'envoi.
  action_ids uuid[] not null default '{}' check (cardinality(action_ids) <= 200),
  statut text not null default 'en-file' check (statut = any (array['en-file', 'envoye', 'echoue'])),
  cree_le timestamptz not null default now(),
  envoye_le timestamptz,
  -- Privé à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, cle)
);
create index messages_sortants_user_idx on messages_sortants (tenant_id, user_id, canal, genre, cree_le desc);

alter table messages_sortants enable row level security;
create policy tenant_acl on messages_sortants to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
grant select, insert on messages_sortants to leon_app;
grant update (statut, envoye_le) on messages_sortants to leon_app;

-- L'heure qu'il est dans un fuseau, ou nul si Postgres ne connaît pas ce nom : un fuseau faux dans une ligne ne doit
-- pas faire échouer le tic de tout le monde. Interne à recaps_dus : aucun droit pour leon_app.
create function heure_locale(p_fuseau text)
returns timestamp
language plpgsql stable set search_path = public, pg_temp as $$
begin
  return now() at time zone p_fuseau;
exception when others then
  return null;
end
$$;
revoke all on function heure_locale(text) from public;

-- La personne liée à ce compte Slack dans l'organisation qui a installé cet espace : la route des clics Slack ne
-- connaît que ces deux identifiants. Hors contexte ; des identifiants seulement. Aucune ligne si la personne n'est
-- plus membre ou si son compte est supprimé.
create function compte_slack(p_team text, p_slack_user text)
returns table (tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.tenant_id, p.user_id
    from installations_slack i
    join preferences_canaux p on p.tenant_id = i.tenant_id and p.slack_user_id = p_slack_user
    join member m on m."organizationId" = p.tenant_id and m."userId" = p.user_id
    join "user" u on u.id = p.user_id and u.deleted_at is null
   where i.team_id = p_team
$$;
revoke all on function compte_slack(text, text) from public;
grant execute on function compte_slack(text, text) to leon_app;

-- Lecture hors sécurité par ligne, pour le tic recap-tic : les personnes à qui un récapitulatif est dû, toutes
-- organisations. Des identifiants seulement ; le worker recompte ensuite sous les droits de la personne.
-- Dû : il y a quelque chose à dire (une action d'agent en attente et pas expirée, ou une action faite sans clic
-- depuis 24 heures) ; la personne est membre, son compte n'est pas supprimé, elle n'a pas coupé le récapitulatif ;
-- son heure locale a passé l'heure choisie ; aucun récapitulatif n'a été écrit pour elle depuis son minuit local.
-- Sans ligne de préférences : 8 h, heure de Paris.
create function recaps_dus(p_max integer)
returns table (tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  with a_dire as (
    select x.tenant_id, x.user_id
      from actions x
     where x.origine = 'agent' and not x.simulation
       and ((x.status = 'proposee' and x.expire_le > now())
            or (x.decide_par = 'autonomie' and x.decided_at > now() - interval '24 hours'))
     group by x.tenant_id, x.user_id
  ), reglees as (
    select d.tenant_id, d.user_id,
           coalesce(p.recap_heure, 8) as recap_heure,
           heure_locale(coalesce(p.fuseau, 'Europe/Paris')) as ici
      from a_dire d
      join member m on m."organizationId" = d.tenant_id and m."userId" = d.user_id
      join "user" u on u.id = d.user_id and u.deleted_at is null
      left join preferences_canaux p on p.tenant_id = d.tenant_id and p.user_id = d.user_id
     where coalesce(p.recap_email, true)
  )
  select r.tenant_id, r.user_id
    from reglees r
   where extract(hour from r.ici) >= r.recap_heure
     and not exists (
       select 1 from messages_sortants s
        where s.tenant_id = r.tenant_id and s.user_id = r.user_id
          and s.canal = 'email' and s.genre = 'recap'
          -- Depuis le minuit local : maintenant, moins le temps écoulé depuis ce minuit.
          and s.cree_le >= now() - (r.ici - date_trunc('day', r.ici)))
   order by r.tenant_id, r.user_id
   limit least(greatest(p_max, 0), 1000)
$$;
revoke all on function recaps_dus(integer) from public;
grant execute on function recaps_dus(integer) to leon_app;

-- 0082, plus les canaux de la personne : ses préférences (dont son compte Slack lié) et le journal de ses messages.
create or replace function supprimer_agents_du_compte()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_executions integer;
begin
  if v_tenant is null or v_user is null then
    return 0;
  end if;

  with parties as (
    delete from executions_agent e where e.tenant_id = v_tenant and e.user_id = v_user returning 1
  )
  select count(*)::integer into v_executions from parties;

  delete from evenements e where e.tenant_id = v_tenant and e.user_id = v_user;
  delete from veilles v where v.tenant_id = v_tenant and v.user_id = v_user;
  delete from agents_actives a where a.tenant_id = v_tenant and a.user_id = v_user and a.portee = 'personne';
  update agents_actives a set actif = false, modifie_le = now()
   where a.tenant_id = v_tenant and a.user_id = v_user and a.portee = 'equipe' and a.actif;
  delete from budgets_personne_jour j where j.tenant_id = v_tenant and j.user_id = v_user;
  delete from preferences_canaux p where p.tenant_id = v_tenant and p.user_id = v_user;
  delete from messages_sortants s where s.tenant_id = v_tenant and s.user_id = v_user;

  update actions x set status = 'annulee', decided_at = now()
   where x.tenant_id = v_tenant and x.user_id = v_user and x.origine = 'agent' and x.status = 'proposee';
  update actions x set params = '{}'::jsonb, annulation = null
   where x.tenant_id = v_tenant and x.user_id = v_user and x.origine = 'agent';

  return v_executions;
end
$$;
```

À savoir :

- **Aucun droit à ajouter pour `"user".locale`** : `leon_app` a `update` sur toute la table (`0002-auth.sql:20`). Better Auth ne connaît pas la colonne, comme `about` et `deleted_at` avant elle.
- **Sans ligne de préférences, le récapitulatif part** : à 8 h, heure de Paris. L'architecture fixe l'heure et le fuseau par défaut, pas `recap_email` : je le pose à vrai, parce que le récapitulatif est le seul canal qui dit à quelqu'un que des validations l'attendent. À confirmer (section 18, point 14).
- **`heure_locale` est un ajout** (écart 7). Un nom de fuseau que Postgres ne connaît pas fait lever `at time zone` : une seule ligne fausse aurait fait échouer `recaps_dus` pour tout le monde. La fonction rend nul, et la personne n'a simplement pas de récapitulatif. Le code valide le fuseau à l'écriture.
- **« Rien n'est parti aujourd'hui »** se lit dans `messages_sortants` : une ligne `email`, `recap`, écrite depuis le minuit local. Le worker écrit donc sa ligne avant d'envoyer (unique par `(tenant_id, cle)`), et `recaps_dus` ne dépend pas de la forme de la clé.
- **La clé d'un message est unique par organisation, pas par personne** : elle doit contenir la personne. Forme conseillée : `<genre>:<user_id>:<AAAA-MM-JJ>` pour un récapitulatif, `<genre>:<user_id>:<action_id>` pour un message d'action. Le chapitre 07 la fixe.
- **Les identifiants Slack** (`team_id`, `bot_user_id`, `slack_user_id`) sont bornés à des lettres et des chiffres, 40 au plus. Leur forme exacte est à vérifier dans la documentation de l'éditeur.
- **Un message `alerte` à un administrateur** ne peut être écrit que sous le contexte de cet administrateur : la ligne lui est privée. L'exécution qui passe le seuil de 80 % tourne au nom d'un autre (écart 6).

## 13. Migration 0085 : les statistiques

| | |
|---|---|
| Fichier | `src/server/db/migrations/0085-agents-statistiques.sql` (à créer) |
| Jalon | après. Déclencheur : trois personnes sur un même agent |
| Crée | `taux_acceptation_agents`, un index sur `actions` |
| Test | `0085-agents-statistiques.db.test.ts` (section 16.2) |
| Drizzle | rien |

```sql
-- 0085-agents-statistiques.sql : le taux d'acceptation des agents, pour le poste de contrôle des administrateurs
-- (dossier agents, 9.11). Des compteurs par agent, jamais par personne : c'est la seule lecture qui traverse les
-- journaux privés des membres d'une organisation.

-- Les actions d'agent d'une organisation dans la fenêtre : la fonction ci-dessous ne relit pas toute la table.
create index actions_agent_idx on actions (tenant_id, created_at) where origine = 'agent';

-- Par fiche d'agent, sur les p_jours derniers jours (1 à 365), dans l'organisation courante : les actions proposées,
-- et parmi elles celles qui sont faites, annulées, expirées, défaites, et faites sans clic. Les simulations ne
-- comptent pas.
-- Pour un propriétaire ou un administrateur seulement : aucune ligne pour un autre membre. Aucune ligne non plus pour
-- un agent que moins de trois personnes ont en service, ni si les actions comptées viennent de moins de trois
-- personnes : un compteur d'un ou deux membres dirait ce que fait chacun. Un agent d'équipe, qui n'a qu'un
-- activateur, n'a donc jamais de ligne.
create function taux_acceptation_agents(p_jours integer)
returns table (
  agent_id text, proposees integer, faites integer, annulees integer, expirees integer, defaites integer,
  faites_sans_clic integer)
language sql stable security definer set search_path = public, pg_temp as $$
  with en_service as (
    select a.agent_id
      from agents_actives a
      join member m on m."organizationId" = a.tenant_id and m."userId" = a.user_id
      join "user" u on u.id = a.user_id and u.deleted_at is null
     where a.tenant_id = app_tenant() and a.actif
     group by a.agent_id
    having count(distinct a.user_id) >= 3
  )
  select e.agent_id,
         count(*)::integer,
         (count(*) filter (where x.status = 'faite'))::integer,
         (count(*) filter (where x.status = 'annulee'))::integer,
         (count(*) filter (where x.status = 'proposee' and x.expire_le <= now()))::integer,
         (count(*) filter (where x.status = 'defaite'))::integer,
         (count(*) filter (where x.decide_par = 'autonomie' and x.status in ('faite', 'defaite')))::integer
    from actions x
    join executions_agent e on e.tenant_id = x.tenant_id and e.id = x.execution_id
    join en_service s on s.agent_id = e.agent_id
   where app_est_admin()
     and x.tenant_id = app_tenant() and x.origine = 'agent' and not x.simulation
     and x.created_at > now() - make_interval(days => least(greatest(p_jours, 1), 365))
   group by e.agent_id
  having count(distinct x.user_id) >= 3
   order by e.agent_id
$$;
revoke all on function taux_acceptation_agents(integer) from public;
grant execute on function taux_acceptation_agents(integer) to leon_app;
```

À savoir :

- **Deux seuils de trois personnes, pas un.** L'architecture demande : aucune ligne pour un agent activé par moins de trois personnes. Si trois personnes l'ont en service mais qu'une seule a eu des actions dans la fenêtre, le compteur dirait ce que fait cette personne. La fonction exige donc aussi trois personnes parmi les actions comptées (section 18, point 13).
- **Un agent d'équipe n'a jamais de ligne** : il n'a qu'un activateur. Celui-ci voit son propre journal.
- **La fonction rend des compteurs, pas un ratio.** Les actions encore en attente et les échecs sont le reste : `proposees` moins les quatre autres colonnes. Le chapitre 11 fixe la formule du taux.
- **Une action dont l'exécution a été supprimée** (compte supprimé, simulation purgée) ne compte plus : la jointure passe par `executions_agent` pour connaître la fiche.


## 14. Schémas Drizzle

Règles du dépôt (carte 07, `schema-contract.db.test.ts`) : le schéma est écrit à la main ; chaque colonne déclarée existe en base, chaque colonne de la base est déclarée, du même type et de la même nullité ; un `enum` Drizzle a les valeurs du `check`. Un module de `schema/` n'exporte que des tables et n'importe que `@/lib`, `@/capture` et ses voisins.

Conséquence pour l'ordre des PR : **une table n'entre dans un fichier de schéma qu'avec la migration qui la crée**. Le contrat lit tous les fichiers du dossier : une table déclarée avant sa migration fait échouer `pnpm test:db`.

| Table Drizzle | Fichier | Entre avec |
|---|---|---|
| `evenements` | `schema/agents.ts` (à créer) | 0077 |
| `agentsActives` | `schema/agents.ts` | 0078 |
| `executionsAgent`, `etapesExecution` | `schema/agents.ts` | 0079 |
| `veilles` | `schema/agents.ts` | 0082 |
| `abonnementsWebhook`, `boiteEntreeWebhooks` | `schema/webhooks.ts` (à créer) | 0083 |
| `preferencesCanaux`, `installationsSlack`, `messagesSortants` | `schema/channels.ts` (à créer) | 0084 |

Trois choix qui valent pour les trois fichiers :

- **Les montants passent par `customType`.** La base rend `numeric(12,5)` (`format_type`). Le contrat compare cette chaîne à `getSQLType()`. Aucun schéma du dépôt n'a de colonne `numeric` aujourd'hui, et je n'ai pas pu lire ce que rend `numeric()` de Drizzle 0.45.4 (`node_modules` absent). Un `customType` rend la chaîne écrite, sans surprise, et lit le montant en nombre.
- **Les listes fermées sont écrites dans le schéma**, comme `ingestRuns.status` (`schema/memory.ts:71`). Seules les trois listes partagées avec le navigateur viennent de `@/lib/agents` (`AUTONOMY_LEVELS`, `RISK_LEVELS`, `AUDIENCES`). Le contrat de schéma tient chaque liste égale à son `check`. Le code tire ses types de la table : `typeof executionsAgent.$inferSelect['statut']`.
- **`outil`, `nature` et `etiquette` sont typées sans `enum`** (`$type<…>()`) : elles n'ont pas de liste fermée en SQL, et seule `actions.kind` entre dans `VALIDATED_IN_CODE` (architecture, 7.5).

`src/lib/agents.ts` (à créer) doit exister dès la PR 5, avec les trois listes recopiées de l'architecture (8.1). `needsClick` y entre à la PR 7 (chapitre 06).

### 14.1 `src/server/db/schema/agents.ts` (à créer)

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ItemNature, SourceKind } from '@/capture/turn';
import { AUTONOMY_LEVELS } from '@/lib/agents';
import type { RoutingLabel } from '@/server/standard/labels';
import { organizations, users } from './auth';

// Le système d'agents (0077 à 0082) : les événements du standard, les activations, les exécutions et leur journal,
// les veilles. Tout est privé à la personne (acl = [user_id], contrôlé par la base), sauf une activation d'équipe,
// lisible de l'organisation. Le module n'exporte que des tables : le contrat de schéma lit Object.values du module.
// Les tables hors de portée de l'app (budgets_agents, budgets_personne_jour, executions_par_jour) n'y sont pas :
// l'app n'y touche que par leurs fonctions.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const acl = () => uuid('acl').array().notNull();
const at = (name: string) => timestamp(name, { withTimezone: true });

// numeric(12,5) lu en nombre. Le type SQL est rendu tel quel, sans espace, comme format_type de Postgres : le contrat
// de schéma compare les deux chaînes.
const usd = customType<{ data: number; driverData: string }>({
  dataType: () => 'numeric(12,5)',
  fromDriver: (value) => Number(value),
});

// Un élément indexé à orienter, et son étiquette de routage (0077). Vit 14 jours ; purger_evenements le supprime.
export const evenements = pgTable('evenements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  // Le propriétaire de la source.
  userId: userId(),
  // Clé étrangère composée (tenant_id, source_id) en SQL, on delete cascade.
  sourceId: uuid('source_id').notNull(),
  ingestRunId: uuid('ingest_run_id').notNull(),
  // Validés dans le code (SOURCE_KINDS, ITEM_NATURES, ROUTING_LABELS) : pas de liste fermée en base.
  outil: text('outil').$type<SourceKind>().notNull(),
  nature: text('nature').$type<ItemNature>().notNull(),
  // EVENT_SIDES (src/server/events/event.ts).
  cote: text('cote', { enum: ['equipe', 'externe', 'inconnu'] }).notNull(),
  cleObjet: text('cle_objet').notNull(),
  empreinte: text('empreinte').notNull(),
  auteurEmpreinte: text('auteur_empreinte'),
  etiquette: text('etiquette').$type<RoutingLabel>(),
  // EVENT_URGENCIES.
  urgence: text('urgence', { enum: ['basse', 'normale', 'haute'] }),
  confiance: real('confiance'),
  triePar: text('trie_par', { enum: ['regle', 'modele'] }),
  // EVENT_STATUSES.
  statut: text('statut', { enum: ['recu', 'trie', 'route', 'ignore'] })
    .notNull()
    .default('recu'),
  raison: text('raison', { enum: ['expediteur', 'budget', 'sans_agent'] }),
  creeLe: at('cree_le').notNull().defaultNow(),
  expireLe: at('expire_le')
    .notNull()
    .default(sql`now() + interval '14 days'`),
  acl: acl(),
});

// L'activation d'une fiche (0078). portee « personne » : acl = [user_id]. portee « equipe » : acl = [tenant_id],
// écrite par un administrateur, toujours au cran « propose ». L'app ne modifie que autonomie, reglages, actif et
// modifie_le ; elle ne supprime pas.
export const agentsActives = pgTable('agents_actives', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  // Celui qui a activé : l'agent tourne en son nom.
  userId: userId(),
  agentId: text('agent_id').notNull(),
  // AGENT_SCOPES (src/server/agents/definition.ts).
  portee: text('portee', { enum: ['personne', 'equipe'] })
    .notNull()
    .default('personne'),
  autonomie: text('autonomie', { enum: AUTONOMY_LEVELS }).notNull().default('propose'),
  reglages: jsonb('reglages').$type<Record<string, unknown>>().notNull().default({}),
  actif: boolean('actif').notNull().default(true),
  creeLe: at('cree_le').notNull().defaultNow(),
  modifieLe: at('modifie_le').notNull().defaultNow(),
  acl: acl(),
});

// Une exécution d'agent (0079) : le journal du poste de contrôle. L'app ajoute, puis ne change que l'état.
export const executionsAgent = pgTable('executions_agent', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  // La personne au nom de qui elle tourne.
  userId: userId(),
  // Clé étrangère composée (tenant_id, activation_id) en SQL, on delete set null (activation_id).
  activationId: uuid('activation_id'),
  agentId: text('agent_id').notNull(),
  agentVersion: integer('agent_version').notNull(),
  // Sans clé étrangère, tous les deux.
  evenementId: uuid('evenement_id'),
  sourceId: uuid('source_id'),
  cleObjet: text('cle_objet').notNull(),
  declencheur: text('declencheur', { enum: ['evenement', 'horloge', 'veille', 'manuel'] }).notNull(),
  mode: text('mode', { enum: ['reel', 'simulation'] })
    .notNull()
    .default('reel'),
  cle: text('cle').notNull(),
  statut: text('statut', {
    enum: ['en-file', 'en-cours', 'en-attente', 'faite', 'echouee', 'annulee', 'ignoree'],
  })
    .notNull()
    .default('en-file'),
  raison: text('raison', {
    enum: [
      'budget',
      'plafond',
      'parti',
      'role',
      'connexion',
      'limite',
      'refus',
      'erreur',
      'expiree',
    ],
  }),
  autonomie: text('autonomie', { enum: AUTONOMY_LEVELS }).notNull(),
  contenuExterne: boolean('contenu_externe').notNull().default(false),
  donneesPrivees: boolean('donnees_privees').notNull().default(false),
  verrouLe: at('verrou_le'),
  attendCle: text('attend_cle'),
  reveilLe: at('reveil_le'),
  // Toutes les sources fournies au modèle : la lecture vérifie qu'elles sont encore visibles.
  sourceIds: uuid('source_ids').array().notNull().default(sql`'{}'::uuid[]`),
  coutUsd: usd('cout_usd').notNull().default(0),
  nbAppelsModele: integer('nb_appels_modele').notNull().default(0),
  erreur: text('erreur'),
  creeLe: at('cree_le').notNull().defaultNow(),
  commenceLe: at('commence_le'),
  finiLe: at('fini_le'),
  acl: acl(),
});

// Le journal des étapes d'une exécution (0079). L'accès est celui de l'exécution, imposé par la base
// (same_acl_as_execution). L'app ne modifie que statut, sortie et fini_le.
export const etapesExecution = pgTable(
  'etapes_execution',
  {
    // Clé étrangère composée (tenant_id, execution_id) en SQL, on delete cascade.
    executionId: uuid('execution_id').notNull(),
    tenantId: tenantId(),
    rang: integer('rang').notNull(),
    nom: text('nom').notNull(),
    genre: text('genre', { enum: ['etape', 'attente', 'evenement'] })
      .notNull()
      .default('etape'),
    statut: text('statut', { enum: ['intention', 'faite', 'echouee'] })
      .notNull()
      .default('intention'),
    cleIdempotence: text('cle_idempotence').notNull(),
    entree: jsonb('entree').$type<unknown>(),
    sortie: jsonb('sortie').$type<unknown>(),
    creeLe: at('cree_le')
      .notNull()
      .default(sql`clock_timestamp()`),
    finiLe: at('fini_le'),
    acl: acl(),
  },
  (table) => [primaryKey({ columns: [table.executionId, table.rang] })],
);

// L'état court d'une veille (0082). L'app ne modifie que etat, echeance_le et close_le ; purger_veilles supprime.
export const veilles = pgTable('veilles', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: userId(),
  // Clé étrangère composée (tenant_id, activation_id) en SQL, on delete cascade.
  activationId: uuid('activation_id').notNull(),
  agentId: text('agent_id').notNull(),
  // WATCH_MOTIFS (src/server/agents/definition.ts).
  motif: text('motif', {
    enum: ['attend_reponse', 'tache_en_retard', 'rdv_a_venir', 'sans_nouvelle'],
  }).notNull(),
  cleObjet: text('cle_objet').notNull(),
  // Clé étrangère composée (tenant_id, source_id) en SQL, on delete set null (source_id).
  sourceId: uuid('source_id'),
  etat: text('etat', { enum: ['ouverte', 'declenchee', 'close'] })
    .notNull()
    .default('ouverte'),
  ouverteLe: at('ouverte_le').notNull().defaultNow(),
  echeanceLe: at('echeance_le').notNull(),
  closeLe: at('close_le'),
  acl: acl(),
});
```

### 14.2 `src/server/db/schema/webhooks.ts` (à créer, avec 0083)

```ts
import { jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { ProviderId } from '@/capture/turn';
import { organizations, users } from './auth';

// Les webhooks entrants (0083). abonnements_webhook : privé à la personne qui a branché la connexion. Le module
// n'exporte que des tables : le contrat de schéma lit Object.values du module.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const at = (name: string) => timestamp(name, { withTimezone: true });

export const abonnementsWebhook = pgTable('abonnements_webhook', {
  // L'identifiant opaque de l'adresse de rappel : <LEON_PORTE_URL>/h/<outil>/<id>.
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  // Clé étrangère composée (tenant_id, connection_id) en SQL, on delete cascade.
  connectionId: uuid('connection_id').notNull(),
  outil: text('outil').$type<ProviderId>().notNull(),
  portee: text('portee', { enum: ['app', 'abonnement'] }).notNull(),
  compte: text('compte'),
  ressource: text('ressource').notNull(),
  externeId: text('externe_id'),
  // v1:…, chiffré par LEON_PORTE_KEY ; nul pour la portée app.
  secret: text('secret'),
  etat: text('etat', { enum: ['active', 'expiree', 'erreur', 'manuelle', 'resiliee'] })
    .notNull()
    .default('active'),
  expireLe: at('expire_le'),
  renouvelerLe: at('renouveler_le'),
  renouveleLe: at('renouvele_le'),
  // Écrit par porte_deposer seulement.
  dernierRecuLe: at('dernier_recu_le'),
  erreur: text('erreur'),
  creeLe: at('cree_le').notNull().defaultNow(),
  acl: uuid('acl').array().notNull(),
});

// La boîte d'entrée. leon_app n'a AUCUN droit sur cette table : aucune requête de l'app ne passe par cette
// déclaration. Elle est là pour le contrat de schéma et pour les fixtures des tests (adminDb). L'app lit par
// prendre_livraison et webhooks_a_traiter.
export const boiteEntreeWebhooks = pgTable('boite_entree_webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  outil: text('outil').$type<ProviderId>().notNull(),
  portee: text('portee', { enum: ['app', 'abonnement'] }).notNull(),
  // Clé étrangère composée (tenant_id, abonnement_id) en SQL, on delete cascade.
  abonnementId: uuid('abonnement_id'),
  compte: text('compte'),
  depot: text('depot').notNull(),
  genre: text('genre', { enum: ['livraison', 'cycle'] })
    .notNull()
    .default('livraison'),
  livraison: text('livraison').notNull(),
  corps: text('corps'),
  entetes: jsonb('entetes').$type<Record<string, string>>().notNull().default({}),
  statut: text('statut', { enum: ['recue', 'traitee', 'ignoree', 'echouee'] })
    .notNull()
    .default('recue'),
  recuLe: at('recu_le').notNull().defaultNow(),
  traiteLe: at('traite_le'),
});
```

### 14.3 `src/server/db/schema/channels.ts` (à créer, avec 0084)

```ts
import { sql } from 'drizzle-orm';
import {
  boolean,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations, users } from './auth';

// Les canaux sortants (0084) : où prévenir une personne, l'appli Slack d'une organisation, et le journal des messages
// envoyés, sans aucun texte. Le module n'exporte que des tables : le contrat de schéma lit Object.values du module.

const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' });
const userId = () =>
  uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' });
const at = (name: string) => timestamp(name, { withTimezone: true });

// Sans ligne : récapitulatif par e-mail à 8 h, heure de Paris, pas de Slack. Refaite en place ; aucune suppression.
export const preferencesCanaux = pgTable(
  'preferences_canaux',
  {
    tenantId: tenantId(),
    userId: userId(),
    recapEmail: boolean('recap_email').notNull().default(true),
    recapHeure: smallint('recap_heure').notNull().default(8),
    fuseau: text('fuseau').notNull().default('Europe/Paris'),
    slack: boolean('slack').notNull().default(false),
    // Posé par linkSlackUser, jamais par un formulaire.
    slackUserId: text('slack_user_id'),
    acl: uuid('acl').array().notNull(),
  },
  (table) => [primaryKey({ columns: [table.tenantId, table.userId] })],
);

// Lisible de toute l'organisation, écrite par un propriétaire ou un administrateur. Le code réserve la lecture du
// jeton (v1:…, LEON_CONNECTORS_KEY), comme pour connections.secret.
export const installationsSlack = pgTable('installations_slack', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  teamId: text('team_id').notNull().unique(),
  botToken: text('bot_token').notNull(),
  botUserId: text('bot_user_id').notNull(),
  installePar: uuid('installe_par')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  creeLe: at('cree_le').notNull().defaultNow(),
});

// Privé à la personne. L'app ajoute, puis ne change que statut et envoye_le.
export const messagesSortants = pgTable('messages_sortants', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: tenantId(),
  userId: userId(),
  canal: text('canal', { enum: ['email', 'slack'] }).notNull(),
  genre: text('genre', { enum: ['recap', 'validation', 'fait', 'alerte'] }).notNull(),
  cle: text('cle').notNull(),
  actionIds: uuid('action_ids').array().notNull().default(sql`'{}'::uuid[]`),
  statut: text('statut', { enum: ['en-file', 'envoye', 'echoue'] })
    .notNull()
    .default('en-file'),
  creeLe: at('cree_le').notNull().defaultNow(),
  envoyeLe: at('envoye_le'),
  acl: uuid('acl').array().notNull(),
});
```

### 14.4 Les cinq fichiers à compléter

`src/server/db/schema/actions.ts` (existe), avec 0080. Le fichier entier, après changement :

```ts
import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ACTION_KINDS, ACTION_STATUSES } from '@/lib/actions';
import { AUDIENCES, RISK_LEVELS } from '@/lib/agents';
import { organizations, users } from './auth';
import { connections } from './connections';
import { discussions } from './search';

// Les actions proposées par Leon, dans une discussion ou par un agent, puis confirmées d'un clic ou exécutées selon
// le cran (0037-actions.sql, 0080-actions-generalisees.sql) : aussi le journal des écritures.
// Le module n'exporte que la table : le contrat de schéma lit Object.values du module.

export const actions = pgTable('actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  discussionId: uuid('discussion_id').references(() => discussions.id, { onDelete: 'set null' }),
  connectionId: uuid('connection_id').references(() => connections.id, { onDelete: 'set null' }),
  // « outil.verbe » : validé dans le code depuis 0080 (VALIDATED_IN_CODE du contrat de schéma).
  kind: text('kind', { enum: ACTION_KINDS }).notNull(),
  params: jsonb('params').$type<Record<string, unknown>>().notNull(),
  status: text('status', { enum: ACTION_STATUSES }).notNull().default('proposee'),
  result: jsonb('result').$type<Record<string, unknown>>(),
  acl: uuid('acl').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp()`),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  // 0080. D'où vient l'action ; pour un agent, son exécution et l'étape du journal qui l'a proposée.
  origine: text('origine', { enum: ['discussion', 'agent'] })
    .notNull()
    .default('discussion'),
  // Clé étrangère composée (tenant_id, execution_id) en SQL, on delete set null (execution_id).
  executionId: uuid('execution_id'),
  etapeRang: integer('etape_rang'),
  // Les défauts sont les plus prudents : une action de discussion attend toujours un clic.
  enjeu: text('enjeu', { enum: RISK_LEVELS }).notNull().default('haut'),
  audience: text('audience', { enum: AUDIENCES }).notNull().default('externe'),
  // La provenance, recopiée de l'exécution au moment de la proposition (needsClick la relit avant d'écrire).
  texteLibre: boolean('texte_libre').notNull().default(false),
  contenuExterne: boolean('contenu_externe').notNull().default(false),
  donneesPrivees: boolean('donnees_privees').notNull().default(false),
  simulation: boolean('simulation').notNull().default(false),
  cleIdempotence: text('cle_idempotence'),
  // Le défaut (une heure) ne sert qu'au code d'avant 0080 : le code écrit toujours la colonne.
  expireLe: timestamp('expire_le', { withTimezone: true })
    .notNull()
    .default(sql`clock_timestamp() + interval '1 hour'`),
  decidePar: text('decide_par', { enum: ['personne', 'autonomie'] }),
  annulation: jsonb('annulation').$type<Record<string, string>>(),
  defaiteLe: timestamp('defaite_le', { withTimezone: true }),
});
```

`src/lib/actions.ts:64` (existe), dans la même PR :

```ts
// proposee → en-cours (le clic ou l'autonomie, une seule fois) → faite ou echouee ; ou annulee. faite → defaite.
export const ACTION_STATUSES = [
  'proposee',
  'en-cours',
  'faite',
  'echouee',
  'annulee',
  'defaite',
] as const;
```

`src/server/db/schema/connections.ts` (existe), avec 0081. Une ligne, après `syncLockAt` (`:27`) :

```ts
  // Le verrou de renouvellement d'un jeton OAuth (0081), pris par ensureFreshTokens.
  renewLockAt: timestamp('renew_lock_at', { withTimezone: true }),
```

`src/server/db/schema/memory.ts` (existe), avec 0077. Une ligne dans `ingestRuns`, après `error` (`:77`) :

```ts
  // Le standard a vu ce run (0077) ; nul : à signaler (runs_a_signaler).
  signaleLe: timestamp('signale_le', { withTimezone: true }),
```

`src/server/db/schema/organisation.ts` (existe), avec 0078. `reglagesOrganisation` devient :

```ts
// numeric(8,2) lu en nombre : même raison que dans agents.ts (le contrat de schéma compare la chaîne du type).
const budget = customType<{ data: number; driverData: string }>({
  dataType: () => 'numeric(8,2)',
  fromDriver: (value) => Number(value),
});

// Sans ligne : les défauts de chaque colonne (0057, 0078). RLS : écrit par un propriétaire ou un administrateur.
export const reglagesOrganisation = pgTable('reglages_organisation', {
  tenantId: uuid('tenant_id')
    .primaryKey()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  managersVoientTout: boolean('managers_voient_tout').notNull().default(true),
  // Faux : plus aucune exécution d'agent n'est créée dans l'organisation.
  agentsActifs: boolean('agents_actifs').notNull().default(true),
  agentsAutonomieMax: text('agents_autonomie_max', { enum: AUTONOMY_LEVELS })
    .notNull()
    .default('agit_previent'),
  // Nul : le défaut du code (AGENTS_BUDGET_USD_PER_SEAT fois le nombre de membres).
  agentsBudgetMoisUsd: budget('agents_budget_mois_usd'),
});
```

Avec deux imports de plus en tête du fichier : `customType` depuis `drizzle-orm/pg-core`, `AUTONOMY_LEVELS` depuis `@/lib/agents`.

`src/server/db/schema/auth.ts` (existe), avec 0084. Une ligne dans `users`, après `about` (`:13`) :

```ts
  // La langue des messages écrits sans la personne (0084) ; nul : DEFAULT_LOCALE (src/i18n/request.ts).
  locale: text('locale', { enum: ['fr', 'en'] }),
```

La liste `['fr', 'en']` est celle de `locales` (`src/i18n/request.ts:7`, existe). Ce fichier importe `next/headers` : le schéma ne l'importe pas.


## 15. Hors SQL : quatre retouches

### 15.1 `deleteAccount` appelle `supprimer_agents_du_compte` (avec 0080)

`src/server/auth/delete-account.ts` (existe). L'appel se place après la suppression des fils de travail (`:223-225`) et avant le changement de rôle (`:226`), donc avant la suppression des connexions (`:248`). Il tourne dans la transaction `withTenant(ctx, …)` de `deleteAccount` : la fonction lit `app_tenant()` et `app_user()`.

```ts
    // Ce que ses agents ont laissé (0080, complétée en 0082 et 0084) : ses exécutions et leurs étapes, ses événements,
    // ses veilles, ses activations personnelles, ses préférences de canaux. Ses activations d'équipe sont coupées
    // (un administrateur pourra les reprendre). Ses actions d'agent en attente sont annulées ; toutes restent comme
    // journal, vidées de leurs paramètres. L'app ne supprime dans aucune de ces tables : seule cette fonction le fait,
    // bornée à la personne qui agit, dans cette organisation.
    await tx.execute(sql`select supprimer_agents_du_compte()`);
```

Ce que cela ne couvre pas, et qui le fait :

- **Les abonnements de webhook** partent avec les connexions (`on delete cascade`, 0083). Avant de supprimer les connexions, le code relève leurs abonnements ; après la transaction, il désabonne chez chaque éditeur, sans bloquer, sur le modèle de `pipedreamUsersOf` (`delete-account.ts:121-127`). C'est le chapitre 03 qui l'écrit, avec `subscriptions.ts`.
- **La suppression de l'organisation** (`removeOrganization`, `:129-158`) n'appelle rien : chaque table nouvelle porte `tenant_id … references organization (id) on delete cascade`. Essayé sur la base jetable : après la suppression d'une organisation, aucune ligne ne reste dans les quatorze tables nouvelles, et ses lignes d'`appels_modele` gardent leur coût avec `tenant_id` nul.
- **Un compte membre d'une autre organisation** est refusé avant (`DeletionRefused('autre_organisation')`, `:174-179`) : borner la fonction à l'organisation courante suffit.

### 15.2 Le rôle `leon_porte` dans `docker/postgres/init.sql` (avec 0083)

`docker/postgres/init.sql` (existe) ne s'exécute qu'à la création du volume ; la CI le rejoue (`.github/workflows/tests.yml:66`). Deux ajouts :

```sql
create role leon_owner login password 'leon_owner';
create role leon_app login password 'leon_app' nobypassrls;
-- La passerelle de webhooks (0083-webhooks.sql) : deux fonctions, aucune table.
create role leon_porte login password 'leon_porte' nobypassrls;
create database leon owner leon_owner;
create database leon_test owner leon_owner;
revoke all on database leon from public;
revoke all on database leon_test from public;
grant connect on database leon to leon_app;
grant connect on database leon_test to leon_app;
grant connect on database leon to leon_porte;
grant connect on database leon_test to leon_porte;
```

Le test `extensions-contract.db.test.ts` lit ce fichier ligne par ligne pour ses `create extension` et ses `create database` : ces ajouts ne le touchent pas. Une base de test de branche (`LEON_TEST_DATABASE=leon_test_<nom>`) reçoit le même `grant connect`.

### 15.3 La commande du README (avec 0083)

`README.md` (existe). Un paragraphe de plus après celui de l'extension `vector` (ligne 27 à 33), sur le même modèle. Le message d'erreur de la migration renvoie à ce titre.

````markdown
**Rôle de la porte.** La migration `0083-webhooks.sql` demande le rôle Postgres `leon_porte` (la passerelle de webhooks : deux fonctions, aucune table). Un volume neuf l'a (`docker/postgres/init.sql`). Pour un volume créé avant, il faut le créer une fois, puis relancer `pnpm db:migrate` (qui sinon s'arrête et rappelle cette commande) :

```bash
docker compose exec -T postgres psql -U postgres -c "create role leon_porte login password 'leon_porte' nobypassrls"
for base in leon leon_test; do
  docker compose exec -T postgres psql -U postgres -c "grant connect on database $base to leon_porte"
done
```
````

Dans « En ligne (Railway) », la phrase « l'application n'utilise que `leon_owner` (migrations) et `leon_app` » (ligne 72) devient :

```markdown
l'application n'utilise que `leon_owner` (migrations), `leon_app` et `leon_porte` (la passerelle de webhooks). Avant de
mettre en ligne la migration 0083 : avec le compte maître, `create role leon_porte login password '<tiré au hasard>'
nobypassrls; grant connect on database leon to leon_porte;`. Son adresse va dans `DATABASE_URL_PORTE`.
```

Le reste de « En ligne » (deux services, un seul worker par base, arrêt propre) et la variable `DATABASE_URL_PORTE` sont au chapitre 13.

Le bloc `do` en tête de `0083` est dans le SQL de la section 11. Essayé sans le rôle sur la base jetable, il arrête la migration avec ce message :

```
ERROR:  Le rôle Postgres leon_porte manque. Avec le compte d'administration de la base : create role leon_porte login
password '…' nobypassrls; grant connect on database leon_stub to leon_porte; puis relancer pnpm db:migrate (README,
« Rôle de la porte »).
```

`pnpm db:migrate` affiche l'erreur entière (`migrate-cli.ts:14-17` : `console.error(error)`, avec sa cause). Le bloc refuse aussi un rôle `leon_porte` qui serait superutilisateur, `bypassrls`, `createrole` ou `createdb`.

### 15.4 Les trois listes de garde

`src/server/db/rls-coverage.db.test.ts` (existe), `DELETE_ALLOWED` (`:20-34`). Deux entrées. Aucune dans `RLS_EXCEPTIONS`.

```ts
  'abonnements_webhook', // la personne se désabonne ; la ligne part aussi avec sa connexion (0083)
  'installations_slack', // un administrateur désinstalle l'appli Slack de l'organisation (0084)
```

`src/server/db/tenant-integrity.db.test.ts` (existe), `COMPOSITE_KEYS` (`:90-102`). La liste est comparée triée (`keys.sort()`, `toEqual`) : chaque entrée va à sa place.

```ts
const COMPOSITE_KEYS = [
  'evenements.source_id → sources', // 0077
  'ingest_runs.source_id → sources',
  'passage_vectors.passage_id → passages',
  'passages.source_id → sources',
  'passages.turn_id → turns',
  'passages_a_vectoriser.passage_id → passages',
  'rappels_cites.fil_id → sources',
  'read_log.lecon_id → lecons',
  'read_log.source_id → sources',
  'turns.source_id → sources',
  'veilles.source_id → sources', // 0082
  'versions_memoire.lecon_id → lecons',
  'versions_memoire.source_id → sources',
];
```

Ce test ne lit que le début de la définition (`FOREIGN KEY (tenant_id, x) REFERENCES t(tenant_id, id)`) : il ne voit pas si la liste de colonnes du `set null` manque. D'où les trois tests qui suppriment le parent (sections 16.5, 16.6 et 16.2). Sur la base jetable, les deux clés rendent bien :

```
evenements : FOREIGN KEY (tenant_id, source_id) REFERENCES sources(tenant_id, id) ON DELETE CASCADE
veilles    : FOREIGN KEY (tenant_id, source_id) REFERENCES sources(tenant_id, id) ON DELETE SET NULL (source_id)
```

`src/server/db/schema-contract.db.test.ts` (existe), `VALIDATED_IN_CODE` (`:66`), avec 0080 :

```ts
// Depuis 0010, la liste des outils se valide dans le code (SOURCE_KINDS, PROVIDER_IDS) ; depuis 0080, celle des types
// d'action aussi (ACTION_KINDS) : ces trois colonnes gardent leur enum côté TypeScript mais n'ont plus de liste
// fermée en base.
const VALIDATED_IN_CODE = new Set(['sources.kind', 'connections.provider', 'actions.kind']);
```

Les autres lignes du tableau 7.5 de l'architecture (`PUBLIC` de `route-guards`, `.env.example`, extraits `vendor-specs`, faux `Llm`, `NAV`) ne touchent pas la base : elles sont aux chapitres 03, 04, 05 et 07.


## 16. Tests à écrire

Tous sont des tests `db` (`*.db.test.ts`, projet vitest `db`), à côté de leur migration, sauf le contrat de la section 16.9. Ils suivent les tests voisins (`0030-points-du-matin.db.test.ts`, `0067-supprimer-notes.db.test.ts`) : fixtures par le rôle propriétaire (`adminDb`, `adminPool`), lectures et écritures de l'app sous `withTenant`, fonctions hors contexte sur `db`. Chaque test crée ses propres organisations : la base de test est partagée.

Codes d'erreur attendus, lus dans `error.cause.code` : `42501` (refus de la sécurité par ligne, ou droit manquant), `23514` (`check`), `23505` (unicité), `23503` (clé étrangère), `22023` (valeur refusée par `solder_budget`).

Aucun de ces tests n'a été lancé. Leurs scénarios, eux, ont été joués à la main en SQL sur la base jetable, et les résultats attendus ci-dessous en viennent.

Une règle de plus, propre aux fonctions de tic. Elles traversent les organisations et la plupart ont un plafond : une ligne « due » oubliée par un test (une exécution en file, une veille échue, une livraison reçue, une action en attente) finirait par cacher celles des autres. **Un fichier de test qui crée de telles lignes supprime ses organisations à la fin** (`afterAll`, par le rôle propriétaire) : tout part en cascade.

### 16.1 Fixtures : `src/test/seed-agents.ts` (à créer)

Créé avec 0076 (`setRole`), complété avec 0078 (`hex64`, `seedActivation`), 0079 (`seedExecution`) et 0080 (`seedAgentAction`). Modèle : `src/test/fixtures.ts` et `src/test/seed-search.ts` (existent).

```ts
import { createHash, randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { TenantContext } from '@/server/auth/tenant-context';
import { actions } from '@/server/db/schema/actions';
import { agentsActives, executionsAgent } from '@/server/db/schema/agents';
import { members } from '@/server/db/schema/auth';
import { adminDb } from './db';

// Fixtures du système d'agents : insertion par le rôle propriétaire, hors RLS, comme fixtures.ts.

// 64 caractères hexadécimaux, uniques : une clé d'exécution ou d'idempotence de test.
export const hex64 = (): string => createHash('sha256').update(randomUUID()).digest('hex');

// app_est_admin() lit member.role ; createTestTenant ne crée que des membres ordinaires.
export async function setRole(
  ctx: TenantContext,
  role: 'owner' | 'admin' | 'member',
): Promise<void> {
  await adminDb
    .update(members)
    .set({ role })
    .where(and(eq(members.userId, ctx.userId), eq(members.organizationId, ctx.tenantId)));
}

export async function seedActivation(
  ctx: TenantContext,
  input: { agentId?: string; portee?: 'personne' | 'equipe'; actif?: boolean } = {},
): Promise<string> {
  const portee = input.portee ?? 'personne';
  const [row] = await adminDb
    .insert(agentsActives)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      // Une fiche par appel : l'index unique d'équipe (tenant_id, agent_id) ne gêne pas deux tests.
      agentId: input.agentId ?? `agent_${randomUUID().slice(0, 8)}`,
      portee,
      actif: input.actif ?? true,
      acl: [portee === 'equipe' ? ctx.tenantId : ctx.userId],
    })
    .returning({ id: agentsActives.id });
  if (!row) throw new Error('activation de test non créée');
  return row.id;
}

export async function seedExecution(
  ctx: TenantContext,
  input: Partial<typeof executionsAgent.$inferInsert> = {},
): Promise<string> {
  const [row] = await adminDb
    .insert(executionsAgent)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      agentId: 'suivi_echange',
      agentVersion: 1,
      cleObjet: 'fathom:meeting:1',
      declencheur: 'evenement',
      cle: hex64(),
      // Finie par défaut : une exécution « en-file » laissée dans la base partagée serait rendue par
      // executions_a_reveiller au bout de 15 minutes, dans les tests des autres.
      statut: 'faite',
      autonomie: 'propose',
      acl: [ctx.userId],
      ...input,
    })
    .returning({ id: executionsAgent.id });
  if (!row) throw new Error('exécution de test non créée');
  return row.id;
}

// Une action d'agent en attente, valable 7 jours. Le type par défaut est un type GitHub : ACTION_KINDS n'a que
// ceux-là tant que le chapitre 05 ne l'a pas étendue.
export async function seedAgentAction(
  ctx: TenantContext,
  executionId: string,
  input: Partial<typeof actions.$inferInsert> = {},
): Promise<string> {
  const [row] = await adminDb
    .insert(actions)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      kind: 'github.commenter',
      params: { repo: 'acme/leon', number: '1', title: 'Titre', body: 'Texte.' },
      origine: 'agent',
      executionId,
      enjeu: 'moyen',
      audience: 'interne',
      cleIdempotence: hex64(),
      expireLe: new Date(Date.now() + 7 * 86_400_000),
      acl: [ctx.userId],
      ...input,
    })
    .returning({ id: actions.id });
  if (!row) throw new Error('action de test non créée');
  return row.id;
}
```

### 16.2 La liste

| Fichier (à créer, sauf mention) | Ce qu'il prouve |
|---|---|
| `0075-appels-modele-attribution.db.test.ts` | Les dix étapes passent, une étape inconnue est refusée (`appels_modele_step_check`). `leon_app` insère avec et sans attribution, hors contexte ; il ne lit pas. La sécurité par ligne est activée (`pg_class.relrowsecurity`). Supprimer l'organisation garde la ligne, `tenant_id` nul. Insertions annulées par `rollback`, comme `0062-etape-fil.db.test.ts` |
| `0076-budget-agents.db.test.ts` | Section 16.3 |
| `0077-evenements.db.test.ts` | Un événement n'est lu que par sa personne ; le `check` refuse une ACL d'équipe. `own_source` refuse la source d'un collègue. Un second événement du même run est refusé (`23505`). L'app change `statut` et `etiquette`, pas `cle_objet` (`42501`), et ne supprime pas. `runs_a_signaler` : rend un run `done` non signalé de plus de N minutes ; pas un run signalé, pas un run récent, pas un run fini depuis plus de 3 jours, pas celui d'un membre retiré, pas celui d'un compte supprimé. `purger_evenements` supprime l'échu, garde le reste. Supprimer la source emporte l'événement |
| `0078-agents-actives.db.test.ts` | Section 16.4, dont « un membre ordinaire ne modifie pas une activation d'équipe » |
| `0079-executions-agent.db.test.ts` | Section 16.5, dont la suppression de l'activation |
| `0080-actions-generalisees.db.test.ts` | Section 16.6, dont la suppression de l'exécution |
| `0081-connexions-renouvellement.db.test.ts` | Section 16.7 |
| `0082-veilles.db.test.ts` | Une veille n'est lue que par sa personne. `own_activation` refuse l'activation d'un collègue. La clé `(activation, motif, objet)` est unique. **Supprimer la source garde la veille : `source_id` passe à nul, `tenant_id` reste.** Supprimer l'activation emporte la veille. `veilles_echues` : rend une veille ouverte échue ; pas une veille close, pas celle d'une activation coupée, d'un membre retiré, d'une organisation coupée. `purger_veilles(30)` : supprime une veille close depuis 31 jours et une veille jamais close échue depuis 31 jours, garde les autres. `supprimer_agents_du_compte` emporte les veilles de la personne, pas celles d'un collègue |
| `0083-webhooks.db.test.ts` | Section 16.8 |
| `0084-canaux-sortants.db.test.ts` | `preferences_canaux` : privée ; un compte Slack ne se lie qu'à une personne par organisation (`23505`). `installations_slack` : un membre ordinaire n'installe pas (`42501`), ne modifie ni ne supprime (0 ligne) ; un espace ne s'installe que dans une organisation. `messages_sortants` : privé ; une clé ne sert qu'une fois ; l'app ne change que `statut` et `envoye_le`. `"user".locale` refuse une langue inconnue. `compte_slack` : rend la personne liée ; rien pour un autre espace, un membre retiré, un compte supprimé. `recaps_dus` : rien sans action en attente ; une ligne avec une action en attente et `recap_heure = 0` ; rien une fois un récapitulatif écrit depuis minuit ; rien avec `recap_email = false` ; **un fuseau inconnu ne fait pas échouer la fonction** ; sans ligne de préférences, les défauts. `supprimer_agents_du_compte` emporte préférences et messages |
| `0085-agents-statistiques.db.test.ts` | Aucune ligne pour un membre ordinaire. Aucune ligne avec deux personnes sur la fiche. Une ligne avec trois : les six compteurs sont justes (une action faite, une annulée, une expirée, une défaite, une faite sans clic). Les simulations ne comptent pas. Une autre organisation ne voit rien et n'est pas comptée |
| `src/test/contracts/prendre-livraison.test.ts` | Section 16.9 |
| `src/server/auth/delete-account.db.test.ts` (existe) | Section 16.10 : deux cas de plus |
| `src/server/db/migrations/0046-pg-temp-en-dernier.db.test.ts` (existe) | Rien à écrire : il lit `pg_proc` et couvre les 25 fonctions `security definer` nouvelles |

### 16.3 `0076-budget-agents.db.test.ts`

```ts
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { setRole } from '@/test/seed-agents';

// Migration 0076 : le budget des agents. Deux compteurs hors de portée de l'app (par organisation et par mois, par
// personne et par jour), que seules reserver_budget et solder_budget écrivent, pour la personne et l'organisation du
// contexte. Les lectures de vérification passent par le rôle propriétaire.

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from budgets_personne_jour where tenant_id = any($1)', [tenantIds]);
  await adminPool.query('delete from budgets_agents where tenant_id = any($1)', [tenantIds]);
});

// Alice est administratrice, Bob membre ordinaire.
async function team(): Promise<{ alice: TenantContext; bob: TenantContext }> {
  const { tenantId, members } = await createTestTenant(['Alice', 'Bob']);
  tenantIds.push(tenantId);
  const [alice, bob] = members as [TenantContext, TenantContext];
  await setRole(alice, 'admin');
  return { alice, bob };
}

const reserve = async (ctx: TenantContext, usd: number, month: number, day: number | null) =>
  (
    await withTenant(ctx, (tx) =>
      tx.execute<{ ok: boolean }>(
        sql`select reserver_budget(${usd}::numeric, ${month}::numeric, ${day}::numeric) as ok`,
      ),
    )
  ).rows[0]?.ok;

const settle = (ctx: TenantContext, reserved: number, real: number) =>
  withTenant(ctx, (tx) =>
    tx.execute(sql`select solder_budget(${reserved}::numeric, ${real}::numeric)`),
  );

async function monthOf(tenantId: string): Promise<{ reserve: number; depense: number } | null> {
  const { rows } = await adminPool.query<{ reserve_usd: string; depense_usd: string }>(
    'select reserve_usd, depense_usd from budgets_agents where tenant_id = $1',
    [tenantId],
  );
  const row = rows[0];
  return row ? { reserve: Number(row.reserve_usd), depense: Number(row.depense_usd) } : null;
}

async function dayOf(ctx: TenantContext): Promise<number | null> {
  const { rows } = await adminPool.query<{ usd: string }>(
    'select usd from budgets_personne_jour where tenant_id = $1 and user_id = $2',
    [ctx.tenantId, ctx.userId],
  );
  return rows[0] ? Number(rows[0].usd) : null;
}

describe('reserver_budget', () => {
  it('réserve sur le mois et sur le jour, puis refuse au plafond du jour sans rien prendre', async () => {
    const { bob } = await team();

    expect(await reserve(bob, 0.4, 10, 1)).toBe(true);
    expect(await reserve(bob, 0.4, 10, 1)).toBe(true);
    expect(await reserve(bob, 0.4, 10, 1)).toBe(false);

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0.8, depense: 0 });
    expect(await dayOf(bob)).toBe(0.8);
  });

  it('refuse au plafond du mois sans rien prendre sur le jour', async () => {
    const { alice, bob } = await team();
    expect(await reserve(alice, 0.5, 0.6, 5)).toBe(true);

    expect(await reserve(bob, 0.5, 0.6, 5)).toBe(false);

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0.5, depense: 0 });
    // Le mois est vérifié d'abord : la journée de Bob n'a même pas de ligne.
    expect(await dayOf(bob)).toBeNull();
  });

  it('un plafond du jour nul compte la journée sans la plafonner', async () => {
    const { alice } = await team();

    expect(await reserve(alice, 0.5, 10, null)).toBe(true);
    expect(await reserve(alice, 0.5, 10, null)).toBe(true);

    expect(await dayOf(alice)).toBe(1);
  });

  it('refuse une valeur négative, un plafond absent, et tout appel sans contexte', async () => {
    const { bob } = await team();

    expect(await reserve(bob, -0.1, 10, 1)).toBe(false);
    expect(await reserve(bob, 0.1, -1, 1)).toBe(false);
    const withoutCap = await withTenant(bob, (tx) =>
      tx.execute<{ ok: boolean }>(sql`select reserver_budget(0.1, null, 1) as ok`),
    );
    expect(withoutCap.rows[0]?.ok).toBe(false);
    const withoutContext = await db.execute<{ ok: boolean }>(
      sql`select reserver_budget(0.1, 10, 1) as ok`,
    );
    expect(withoutContext.rows[0]?.ok).toBe(false);
    expect(await monthOf(bob.tenantId)).toBeNull();
  });

  it("ne touche pas le budget d'une autre organisation", async () => {
    const { bob } = await team();
    const { alice: zoe } = await team();
    expect(await reserve(zoe, 0.3, 10, 1)).toBe(true);

    expect(await reserve(bob, 0.4, 10, 1)).toBe(true);
    await settle(bob, 0.4, 0.1);

    expect(await monthOf(zoe.tenantId)).toEqual({ reserve: 0.3, depense: 0 });
    expect(await dayOf(zoe)).toBe(0.3);
  });
});

describe('solder_budget', () => {
  it('rend la réserve et compte le réel, dans les deux tables', async () => {
    const { bob } = await team();
    await reserve(bob, 0.5, 10, 1);

    await settle(bob, 0.5, 0.07);

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0, depense: 0.07 });
    expect(await dayOf(bob)).toBe(0.07);
  });

  it('ne passe jamais sous zéro et ne fait jamais baisser le dépensé', async () => {
    const { bob } = await team();
    await reserve(bob, 0.1, 10, 1);

    await settle(bob, 5, 0);
    await settle(bob, 0, 0.02);

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0, depense: 0.02 });
    expect(await dayOf(bob)).toBe(0.02);
  });

  it('lève sur une valeur négative, sans rien écrire', async () => {
    const { bob } = await team();
    await reserve(bob, 0.1, 10, 1);

    await expect(settle(bob, -1, 0)).rejects.toMatchObject({ cause: { code: '22023' } });
    await expect(settle(bob, 0, -1)).rejects.toMatchObject({ cause: { code: '22023' } });

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0.1, depense: 0 });
  });
});

describe('budget_du_mois', () => {
  const read = async (ctx: TenantContext) =>
    (
      await withTenant(ctx, (tx) =>
        tx.execute<{ reserve_usd: string; depense_usd: string }>(
          sql`select * from budget_du_mois()`,
        ),
      )
    ).rows.map((row) => ({ reserve: Number(row.reserve_usd), depense: Number(row.depense_usd) }));

  it('rend une ligne à un administrateur, à zéro si rien n’a tourné', async () => {
    const { alice, bob } = await team();
    expect(await read(alice)).toEqual([{ reserve: 0, depense: 0 }]);

    await reserve(bob, 0.4, 10, 1);
    await settle(bob, 0.4, 0.05);
    await reserve(bob, 0.4, 10, 1);

    expect(await read(alice)).toEqual([{ reserve: 0.4, depense: 0.05 }]);
  });

  it('ne rend aucune ligne à un membre ordinaire', async () => {
    const { bob } = await team();
    await reserve(bob, 0.4, 10, 1);

    expect(await read(bob)).toEqual([]);
  });
});

describe('droits', () => {
  it.each(['budgets_agents', 'budgets_personne_jour'])(
    'leon_app ne lit ni n’écrit %s directement',
    async (table) => {
      await expect(db.execute(sql.raw(`select * from ${table}`))).rejects.toMatchObject({
        cause: { code: '42501' },
      });
      for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
        const { rows } = await adminPool.query<{ granted: boolean }>(
          'select has_table_privilege($1, $2, $3) as granted',
          ['leon_app', `public.${table}`, privilege],
        );
        expect(rows, `${privilege} sur ${table}`).toEqual([{ granted: false }]);
      }
    },
  );
});
```

### 16.4 `0078-agents-actives.db.test.ts`

```ts
import { and, eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { agentsActives } from '@/server/db/schema/agents';
import { members, users } from '@/server/db/schema/auth';
import { reglagesOrganisation } from '@/server/db/schema/organisation';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedActivation, setRole } from '@/test/seed-agents';

// Migration 0078 : les activations. Une activation personnelle est privée ; une activation d'équipe est lisible de
// l'organisation, écrite par un administrateur, et ne dépasse pas « propose ». Les trois fonctions sont bornées à
// l'organisation du contexte.

const REFUSED = { cause: { code: '42501' } };
const CHECK = { cause: { code: '23514' } };

// Alice est administratrice, Bob et Carl membres ordinaires ; Zoé est propriétaire d'une autre organisation.
async function setup() {
  const team = await createTestTenant(['Alice', 'Bob', 'Carl']);
  const other = await createTestTenant(['Zoé']);
  const [alice, bob, carl] = team.members as [TenantContext, TenantContext, TenantContext];
  const [zoe] = other.members as [TenantContext];
  await setRole(alice, 'admin');
  await setRole(zoe, 'owner');
  return { alice, bob, carl, zoe };
}

const row = async (id: string) => {
  const [found] = await adminDb.select().from(agentsActives).where(eq(agentsActives.id, id));
  if (!found) throw new Error('activation introuvable');
  return found;
};

const visibleTo = async (ctx: TenantContext, id: string) =>
  (
    await withTenant(ctx, (tx) =>
      tx.select({ id: agentsActives.id }).from(agentsActives).where(eq(agentsActives.id, id)),
    )
  ).length;

describe('agents_actives sous la sécurité par ligne', () => {
  it('une personne active une fiche pour elle, au cran « propose » ; elle seule la voit', async () => {
    const { alice, bob } = await setup();

    const [created] = await withTenant(bob, (tx) =>
      tx
        .insert(agentsActives)
        .values({
          tenantId: bob.tenantId,
          userId: bob.userId,
          agentId: 'suivi_echange',
          acl: [bob.userId],
        })
        .returning(),
    );

    if (!created) throw new Error('activation non créée');
    expect(created).toMatchObject({ portee: 'personne', autonomie: 'propose', actif: true });
    expect(await visibleTo(bob, created.id)).toBe(1);
    // Ni un collègue, ni un administrateur : une activation personnelle est privée.
    expect(await visibleTo(alice, created.id)).toBe(0);
  });

  it("refuse d'activer au nom d'un autre, même pour un administrateur", async () => {
    const { alice, bob } = await setup();

    await expect(
      withTenant(alice, (tx) =>
        tx.insert(agentsActives).values({
          tenantId: alice.tenantId,
          userId: bob.userId,
          agentId: 'suivi_echange',
          acl: [bob.userId],
        }),
      ),
    ).rejects.toMatchObject(REFUSED);
  });

  it("seul un administrateur active pour l'équipe", async () => {
    const { alice, bob } = await setup();
    const team = (ctx: TenantContext) =>
      withTenant(ctx, (tx) =>
        tx.insert(agentsActives).values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          agentId: 'tri_support',
          portee: 'equipe',
          acl: [ctx.tenantId],
        }),
      );

    await expect(team(bob)).rejects.toMatchObject(REFUSED);
    await expect(team(alice)).resolves.toBeDefined();
  });

  it("la portée fixe l'accès, et un agent d'équipe ne dépasse pas « propose »", async () => {
    const { alice } = await setup();
    const insert = (values: Partial<typeof agentsActives.$inferInsert>) =>
      withTenant(alice, (tx) =>
        tx.insert(agentsActives).values({
          tenantId: alice.tenantId,
          userId: alice.userId,
          agentId: 'tri_support',
          acl: [alice.userId],
          ...values,
        }),
      );

    // Une activation personnelle visible de l'équipe, une activation d'équipe privée : refusées par la base.
    await expect(insert({ acl: [alice.tenantId] })).rejects.toMatchObject(CHECK);
    await expect(insert({ portee: 'equipe' })).rejects.toMatchObject(CHECK);
    await expect(
      insert({ portee: 'equipe', acl: [alice.tenantId], autonomie: 'agit_previent' }),
    ).rejects.toMatchObject(CHECK);
    const teamId = await seedActivation(alice, { portee: 'equipe' });
    await expect(
      withTenant(alice, (tx) =>
        tx.update(agentsActives).set({ autonomie: 'agit_seul' }).where(eq(agentsActives.id, teamId)),
      ),
    ).rejects.toMatchObject(CHECK);
  });

  it("un membre ordinaire lit l'activation d'équipe mais ne la modifie pas", async () => {
    const { alice, bob } = await setup();
    const id = await seedActivation(alice, { portee: 'equipe' });
    expect(await visibleTo(bob, id)).toBe(1);

    // Pour update, Postgres écarte sans erreur les lignes refusées : aucune n'est touchée.
    const changed = await withTenant(bob, (tx) =>
      tx
        .update(agentsActives)
        .set({ actif: false, reglages: { cible: 'tout' } })
        .where(eq(agentsActives.id, id))
        .returning({ id: agentsActives.id }),
    );

    expect(changed).toEqual([]);
    const after = await row(id);
    expect(after.actif).toBe(true);
    expect(after.reglages).toEqual({});
  });

  it("un administrateur règle et coupe l'activation d'équipe ; chacun règle la sienne", async () => {
    const { alice, bob } = await setup();
    const teamId = await seedActivation(alice, { portee: 'equipe' });
    const mine = await seedActivation(bob);
    const cut = (ctx: TenantContext, id: string) =>
      withTenant(ctx, (tx) =>
        tx
          .update(agentsActives)
          .set({ actif: false, modifieLe: sql`now()` })
          .where(eq(agentsActives.id, id))
          .returning({ id: agentsActives.id }),
      );

    expect(await cut(alice, teamId)).toHaveLength(1);
    expect(await cut(bob, mine)).toHaveLength(1);
  });

  it("l'app ne supprime pas une activation et ne change ni sa fiche, ni sa portée, ni sa personne", async () => {
    const { alice, bob } = await setup();
    const id = await seedActivation(bob);

    await expect(
      withTenant(bob, (tx) => tx.delete(agentsActives).where(eq(agentsActives.id, id))),
    ).rejects.toMatchObject(REFUSED);
    for (const change of [
      { agentId: 'autre' },
      { portee: 'equipe' as const },
      { userId: alice.userId },
    ]) {
      await expect(
        withTenant(bob, (tx) =>
          tx.update(agentsActives).set(change).where(eq(agentsActives.id, id)),
        ),
      ).rejects.toMatchObject(REFUSED);
    }
  });
});

describe('reserver_execution', () => {
  const reserve = async (ctx: TenantContext, activation: string, cap: number) =>
    (
      await withTenant(ctx, (tx) =>
        tx.execute<{ ok: boolean }>(sql`select reserver_execution(${activation}, ${cap}) as ok`),
      )
    ).rows[0]?.ok;

  it('compte jusqu’au plafond du jour, puis refuse', async () => {
    const { bob } = await setup();
    const id = await seedActivation(bob);

    expect(await reserve(bob, id, 2)).toBe(true);
    expect(await reserve(bob, id, 2)).toBe(true);
    expect(await reserve(bob, id, 2)).toBe(false);
    expect(await reserve(bob, id, 0)).toBe(false);
  });

  it("refuse l'activation d'une autre organisation, d'un collègue, ou coupée ; accepte celle de l'équipe", async () => {
    const { alice, bob, carl, zoe } = await setup();
    const mine = await seedActivation(bob);
    const cut = await seedActivation(bob, { actif: false });
    const teamId = await seedActivation(alice, { portee: 'equipe' });

    expect(await reserve(zoe, mine, 100)).toBe(false);
    expect(await reserve(carl, mine, 100)).toBe(false);
    expect(await reserve(bob, cut, 100)).toBe(false);
    expect(await reserve(carl, teamId, 100)).toBe(true);
    const outside = await db.execute<{ ok: boolean }>(
      sql`select reserver_execution(${mine}, 100) as ok`,
    );
    expect(outside.rows[0]?.ok).toBe(false);
  });
});

describe('activations_de', () => {
  const of = async (agentId: string) =>
    (
      await db.execute<{ activation_id: string; tenant_id: string; user_id: string }>(
        sql`select * from activations_de(${agentId})`,
      )
    ).rows.map((found) => found.activation_id);
  const agent = () => `agent_${crypto.randomUUID().slice(0, 8)}`;

  it('rend les activations en service, avec leur organisation et leur personne', async () => {
    const { bob, carl } = await setup();
    const agentId = agent();
    const one = await seedActivation(bob, { agentId });
    const two = await seedActivation(carl, { agentId });
    await seedActivation(bob, { agentId: agent() });

    expect((await of(agentId)).sort()).toEqual([one, two].sort());
  });

  it('écarte une activation coupée, un membre retiré et un compte supprimé', async () => {
    const { alice, bob, carl } = await setup();
    const agentId = agent();
    await seedActivation(alice, { agentId, actif: false });
    await seedActivation(bob, { agentId });
    await seedActivation(carl, { agentId });
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, bob.userId), eq(members.organizationId, bob.tenantId)));
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, carl.userId));

    expect(await of(agentId)).toEqual([]);
  });

  it("écarte une organisation qui a coupé ses agents ; sans ligne de réglages, ils tournent", async () => {
    const { bob } = await setup();
    const agentId = agent();
    const id = await seedActivation(bob, { agentId });
    expect(await of(agentId)).toEqual([id]);

    await adminDb
      .insert(reglagesOrganisation)
      .values({ tenantId: bob.tenantId, agentsActifs: false });

    expect(await of(agentId)).toEqual([]);
  });

  it("écarte une activation d'équipe dont l'activateur n'est plus administrateur", async () => {
    const { alice } = await setup();
    const agentId = agent();
    const id = await seedActivation(alice, { agentId, portee: 'equipe' });
    expect(await of(agentId)).toEqual([id]);

    await setRole(alice, 'member');

    expect(await of(agentId)).toEqual([]);
  });
});

describe('reprendre_agent_equipe', () => {
  const takeOver = async (ctx: TenantContext, activation: string) =>
    (
      await withTenant(ctx, (tx) =>
        tx.execute<{ ok: boolean }>(sql`select reprendre_agent_equipe(${activation}) as ok`),
      )
    ).rows[0]?.ok;

  it("refuse tant que l'activateur est encore administrateur", async () => {
    const { alice, bob } = await setup();
    await setRole(bob, 'admin');
    const id = await seedActivation(alice, { portee: 'equipe' });

    expect(await takeOver(bob, id)).toBe(false);
    expect(await row(id)).toMatchObject({ userId: alice.userId, actif: true });
  });

  it("refuse un membre ordinaire, une autre organisation et une activation personnelle", async () => {
    const { alice, bob, carl, zoe } = await setup();
    const teamId = await seedActivation(alice, { portee: 'equipe' });
    const personal = await seedActivation(carl);
    await setRole(alice, 'member');
    await setRole(carl, 'admin');

    expect(await takeOver(bob, teamId)).toBe(false);
    expect(await takeOver(zoe, teamId)).toBe(false);
    expect(await takeOver(carl, personal)).toBe(false);
    expect(await row(teamId)).toMatchObject({ userId: alice.userId, actif: true });
  });

  it("donne l'agent au repreneur, coupé, quand l'activateur a perdu son rôle", async () => {
    const { alice, bob } = await setup();
    const id = await seedActivation(alice, { portee: 'equipe' });
    await setRole(alice, 'member');
    await setRole(bob, 'admin');

    expect(await takeOver(bob, id)).toBe(true);

    expect(await row(id)).toMatchObject({ userId: bob.userId, actif: false, portee: 'equipe' });
  });
});
```


### 16.5 `0079-executions-agent.db.test.ts`

```ts
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { etapesExecution, executionsAgent } from '@/server/db/schema/agents';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { hex64, seedActivation, seedExecution, setRole } from '@/test/seed-agents';

// Migration 0079 : les exécutions d'agent et le journal de leurs étapes, privés à la personne au nom de qui
// l'exécution tourne. La clé vers l'activation est composée et en « set null (activation_id) » : supprimer
// l'activation ne doit ni échouer ni effacer tenant_id.

const REFUSED = { cause: { code: '42501' } };
const DAY = 86_400_000;

// Les exécutions « dues » de ce fichier ne restent pas dans la base partagée : tout part avec l'organisation.
const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

async function setup() {
  const { tenantId, members } = await createTestTenant(['Alice', 'Bob']);
  tenantIds.push(tenantId);
  const [alice, bob] = members as [TenantContext, TenantContext];
  await setRole(alice, 'admin');
  return { alice, bob };
}

const step = (ctx: TenantContext, executionId: string, values = {}) => ({
  executionId,
  tenantId: ctx.tenantId,
  rang: 0,
  nom: 'extraire',
  cleIdempotence: hex64(),
  entree: { depuis: ['lire'] },
  acl: [ctx.userId],
  ...values,
});

describe('executions_agent et etapes_execution sous la sécurité par ligne', () => {
  it('la personne écrit son exécution et ses étapes ; personne d’autre ne les lit, administrateur compris', async () => {
    const { alice, bob } = await setup();
    const activationId = await seedActivation(bob);

    const [created] = await withTenant(bob, async (tx) => {
      const rows = await tx
        .insert(executionsAgent)
        .values({
          tenantId: bob.tenantId,
          userId: bob.userId,
          activationId,
          agentId: 'suivi_echange',
          agentVersion: 1,
          cleObjet: 'fathom:meeting:1',
          declencheur: 'evenement',
          cle: hex64(),
          autonomie: 'propose',
          acl: [bob.userId],
        })
        .returning();
      if (!rows[0]) throw new Error('exécution non créée');
      await tx.insert(etapesExecution).values(step(bob, rows[0].id));
      return rows;
    });

    expect(created).toMatchObject({ statut: 'en-file', mode: 'reel', coutUsd: 0, sourceIds: [] });
    const seenBy = async (ctx: TenantContext) =>
      withTenant(ctx, async (tx) => ({
        executions: (await tx.select().from(executionsAgent)).length,
        etapes: (await tx.select().from(etapesExecution)).length,
      }));
    expect(await seenBy(bob)).toEqual({ executions: 1, etapes: 1 });
    expect(await seenBy(alice)).toEqual({ executions: 0, etapes: 0 });
  });

  it("une exécution n'entre que pour une activation de la personne", async () => {
    const { alice, bob } = await setup();
    const teamActivation = await seedActivation(alice, { portee: 'equipe' });

    // Bob voit l'activation d'équipe, mais l'exécution d'un agent d'équipe s'écrit au nom de son activateur.
    await expect(
      withTenant(bob, (tx) =>
        tx.insert(executionsAgent).values({
          tenantId: bob.tenantId,
          userId: bob.userId,
          activationId: teamActivation,
          agentId: 'tri_support',
          agentVersion: 1,
          cleObjet: 'zendesk:ticket:1',
          declencheur: 'evenement',
          cle: hex64(),
          autonomie: 'propose',
          acl: [bob.userId],
        }),
      ),
    ).rejects.toMatchObject(REFUSED);
  });

  it("une étape n'entre que dans une exécution de la personne, avec son accès", async () => {
    const { alice, bob } = await setup();
    const bobRun = await seedExecution(bob);

    await expect(
      withTenant(alice, (tx) =>
        tx.insert(etapesExecution).values(step(alice, bobRun, { acl: [alice.userId] })),
      ),
    ).rejects.toMatchObject(REFUSED);
    await expect(
      withTenant(bob, (tx) =>
        tx.insert(etapesExecution).values(step(bob, bobRun, { acl: [bob.tenantId] })),
      ),
    ).rejects.toMatchObject(REFUSED);
  });

  it('la clé d’une exécution est unique dans l’organisation', async () => {
    const { bob } = await setup();
    const cle = hex64();
    await seedExecution(bob, { cle });

    await expect(seedExecution(bob, { cle })).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it("l'app ne change que l'état : ni la fiche, ni la clé, ni le cran, et ne supprime pas", async () => {
    const { bob } = await setup();
    const id = await seedExecution(bob);
    const update = (values: Partial<typeof executionsAgent.$inferInsert>) =>
      withTenant(bob, (tx) =>
        tx.update(executionsAgent).set(values).where(eq(executionsAgent.id, id)),
      );

    await expect(
      update({ statut: 'en-cours', verrouLe: new Date(), sourceIds: [], coutUsd: 0.03 }),
    ).resolves.toBeDefined();
    for (const values of [
      { agentId: 'autre' },
      { cle: hex64() },
      { autonomie: 'agit_seul' as const },
    ]) {
      await expect(update(values)).rejects.toMatchObject(REFUSED);
    }
    await expect(
      withTenant(bob, (tx) => tx.delete(executionsAgent).where(eq(executionsAgent.id, id))),
    ).rejects.toMatchObject(REFUSED);
  });
});

describe('clé composée vers agents_actives', () => {
  it("supprimer l'activation garde l'exécution : activation_id passe à nul, tenant_id reste", async () => {
    const { bob } = await setup();
    const activationId = await seedActivation(bob);
    const id = await seedExecution(bob, { activationId });

    // Seul le rôle propriétaire supprime une activation (suppression d'un compte, d'une organisation).
    await expect(
      adminPool.query('delete from agents_actives where id = $1', [activationId]),
    ).resolves.toMatchObject({ rowCount: 1 });

    const [kept] = await adminDb.select().from(executionsAgent).where(eq(executionsAgent.id, id));
    expect(kept).toMatchObject({ activationId: null, tenantId: bob.tenantId, userId: bob.userId });
  });

  it("refuse une exécution rattachée à l'activation d'une autre organisation", async () => {
    const { bob } = await setup();
    const { bob: stranger } = await setup();
    const foreign = await seedActivation(stranger);

    await expect(seedExecution(bob, { activationId: foreign })).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });
});

describe('executions_a_reveiller', () => {
  const due = async () =>
    (
      await db.execute<{ execution_id: string }>(sql`select * from executions_a_reveiller(1000)`)
    ).rows.map((row) => row.execution_id);
  const ago = (ms: number) => new Date(Date.now() - ms);

  it('rend une minuterie échue, un verrou de plus de 2 minutes et un job perdu', async () => {
    const { bob } = await setup();
    const timer = await seedExecution(bob, { statut: 'en-attente', reveilLe: ago(1000) });
    const dead = await seedExecution(bob, { statut: 'en-cours', verrouLe: ago(3 * 60_000) });
    const lost = await seedExecution(bob, { statut: 'en-file', creeLe: ago(16 * 60_000) });

    expect(await due()).toEqual(expect.arrayContaining([timer, dead, lost]));
  });

  it('ne rend ni une minuterie à venir, ni un déroulé vivant, ni une exécution finie ou tout juste en file', async () => {
    const { bob } = await setup();
    const others = [
      await seedExecution(bob, { statut: 'en-attente', reveilLe: new Date(Date.now() + 60_000) }),
      await seedExecution(bob, { statut: 'en-cours', verrouLe: new Date() }),
      await seedExecution(bob, { statut: 'faite', verrouLe: ago(DAY) }),
      await seedExecution(bob, { statut: 'en-file' }),
    ];

    const found = await due();
    for (const id of others) expect(found).not.toContain(id);
  });
});

describe('purger_executions', () => {
  const purge = async () =>
    (await db.execute<{ n: number }>(sql`select purger_executions(30, 30) as n`)).rows[0]?.n;
  const stepOf = async (executionId: string) => {
    const [found] = await adminDb
      .select({ entree: etapesExecution.entree, sortie: etapesExecution.sortie })
      .from(etapesExecution)
      .where(eq(etapesExecution.executionId, executionId));
    return found;
  };
  const withStep = async (
    ctx: TenantContext,
    values: Partial<typeof executionsAgent.$inferInsert>,
    at = new Date(),
  ) => {
    const id = await seedExecution(ctx, values);
    await adminDb
      .insert(etapesExecution)
      .values(step(ctx, id, { sortie: { resume: 'Promesse de rappel.' }, creeLe: at }));
    return id;
  };

  it('supprime une simulation de plus de 30 jours et ses étapes, garde une simulation récente', async () => {
    const { bob } = await setup();
    const old = await withStep(bob, { mode: 'simulation', creeLe: new Date(Date.now() - 31 * DAY) });
    const recent = await withStep(bob, { mode: 'simulation' });

    await purge();

    expect(await stepOf(old)).toBeUndefined();
    expect(
      await adminDb.select().from(executionsAgent).where(eq(executionsAgent.id, old)),
    ).toEqual([]);
    expect(await stepOf(recent)).toMatchObject({ sortie: { resume: 'Promesse de rappel.' } });
  });

  it('vide une étape de plus de 30 jours, et garde la ligne', async () => {
    const { bob } = await setup();
    const old = await withStep(bob, {}, new Date(Date.now() - 31 * DAY));
    const recent = await withStep(bob, {});

    await purge();

    expect(await stepOf(old)).toEqual({ entree: null, sortie: null });
    expect(await stepOf(recent)).toMatchObject({ entree: { depuis: ['lire'] } });
  });

  it("vide tout de suite les étapes d'une exécution dont une source lue a disparu", async () => {
    const { bob } = await setup();
    const kept = await seedSource(bob);
    const gone = await seedSource(bob);
    const touched = await withStep(bob, { sourceIds: [kept.sourceId, gone.sourceId] });
    const untouched = await withStep(bob, { sourceIds: [kept.sourceId] });
    await adminPool.query('delete from sources where id = $1', [gone.sourceId]);

    await purge();

    expect(await stepOf(touched)).toEqual({ entree: null, sortie: null });
    expect(await stepOf(untouched)).toMatchObject({ sortie: { resume: 'Promesse de rappel.' } });
  });
});
```

### 16.6 `0080-actions-generalisees.db.test.ts`

```ts
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { actions } from '@/server/db/schema/actions';
import { agentsActives, evenements, executionsAgent } from '@/server/db/schema/agents';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import {
  hex64,
  seedActivation,
  seedAgentAction,
  seedExecution,
  setRole,
} from '@/test/seed-agents';

// Migration 0080 : la table actions s'ouvre aux agents. Les lignes d'avant gardent les défauts les plus prudents ;
// une action d'agent porte sa clé, n'entre que dans une exécution de son auteur, et survit à la suppression de cette
// exécution. Les deux fonctions de départ ne touchent que l'organisation du contexte.

const REFUSED = { cause: { code: '42501' } };
const CHECK = { cause: { code: '23514' } };

// Les actions en attente de ce fichier ne restent pas dans la base partagée (recaps_dus les rendrait) : tout part
// avec l'organisation.
const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

// Alice est administratrice, Bob et Carl membres ordinaires ; Zoé est propriétaire d'une autre organisation.
async function setup() {
  const team = await createTestTenant(['Alice', 'Bob', 'Carl']);
  const other = await createTestTenant(['Zoé']);
  tenantIds.push(team.tenantId, other.tenantId);
  const [alice, bob, carl] = team.members as [TenantContext, TenantContext, TenantContext];
  const [zoe] = other.members as [TenantContext];
  await setRole(alice, 'admin');
  await setRole(zoe, 'owner');
  return { alice, bob, carl, zoe };
}

const actionRow = async (id: string) => {
  const [found] = await adminDb.select().from(actions).where(eq(actions.id, id));
  if (!found) throw new Error('action introuvable');
  return found;
};

// Par le rôle propriétaire, en SQL : seuls les contrôles de la table jouent, pas ACTION_KINDS ni la RLS.
const rawInsert = (ctx: TenantContext, columns: Record<string, unknown>) => {
  const all = { tenant_id: ctx.tenantId, user_id: ctx.userId, params: '{}', ...columns };
  const names = Object.keys(all);
  return adminPool.query(
    `insert into actions (${names.join(', ')}, acl)
     values (${names.map((_, index) => `$${index + 1}`).join(', ')}, array[$2::uuid]) returning id`,
    Object.values(all),
  );
};

describe('actions après 0080', () => {
  it('une action écrite comme avant garde les défauts les plus prudents, et vaut une heure', async () => {
    const { bob } = await setup();

    const [created] = await withTenant(bob, (tx) =>
      tx
        .insert(actions)
        .values({
          tenantId: bob.tenantId,
          userId: bob.userId,
          kind: 'github.commenter',
          params: { repo: 'acme/leon', number: '1', title: 'Titre', body: 'Texte.' },
          acl: [bob.userId],
        })
        .returning(),
    );

    if (!created) throw new Error('action non créée');
    expect(created).toMatchObject({
      origine: 'discussion',
      enjeu: 'haut',
      audience: 'externe',
      texteLibre: false,
      contenuExterne: false,
      donneesPrivees: false,
      simulation: false,
      decidePar: null,
    });
    const validFor = created.expireLe.getTime() - created.createdAt.getTime();
    expect(Math.abs(validFor - 3_600_000)).toBeLessThan(5_000);
  });

  it('accepte un type « outil.verbe », refuse toute autre forme', async () => {
    const { bob } = await setup();

    await expect(rawInsert(bob, { kind: 'hubspot.creer_note' })).resolves.toBeDefined();
    for (const kind of ['creer_note', 'HubSpot.creer_note', 'hubspot.creer note', 'a.b.c']) {
      await expect(rawInsert(bob, { kind }), kind).rejects.toThrow(/actions_kind_check/);
    }
  });

  it('une action d’agent porte toujours sa clé, et une clé ne sert qu’une fois', async () => {
    const { bob } = await setup();
    const cle = hex64();

    await expect(rawInsert(bob, { kind: 'hubspot.creer_note', origine: 'agent' })).rejects.toThrow(
      /actions_origine_cle_check/,
    );
    await rawInsert(bob, { kind: 'hubspot.creer_note', origine: 'agent', cle_idempotence: cle });
    await expect(
      rawInsert(bob, { kind: 'hubspot.creer_note', origine: 'agent', cle_idempotence: cle }),
    ).rejects.toThrow(/actions_cle_idempotence_key/);
  });

  it("une action n'entre que dans une exécution de son auteur", async () => {
    const { alice, bob } = await setup();
    const bobRun = await seedExecution(bob);
    const propose = (ctx: TenantContext) =>
      withTenant(ctx, (tx) =>
        tx.insert(actions).values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          kind: 'github.commenter',
          params: {},
          origine: 'agent',
          executionId: bobRun,
          cleIdempotence: hex64(),
          expireLe: new Date(Date.now() + 7 * 86_400_000),
          acl: [ctx.userId],
        }),
      );

    await expect(propose(alice)).rejects.toMatchObject(REFUSED);
    await expect(propose(bob)).resolves.toBeDefined();
  });

  it('se défait : faite → defaite, avec de quoi annuler et qui a décidé', async () => {
    const { bob } = await setup();
    const id = await seedAgentAction(bob, await seedExecution(bob));
    const update = (values: Partial<typeof actions.$inferInsert>) =>
      withTenant(bob, (tx) => tx.update(actions).set(values).where(eq(actions.id, id)));

    await update({ status: 'en-cours', decidedAt: new Date(), decidePar: 'autonomie' });
    await update({ status: 'faite', result: { url: null, error: null }, annulation: { id: '42' } });
    await update({ status: 'defaite', defaiteLe: new Date() });

    expect(await actionRow(id)).toMatchObject({
      status: 'defaite',
      decidePar: 'autonomie',
      annulation: { id: '42' },
    });
  });

  it("l'app ne change ni les paramètres, ni l'enjeu, ni l'audience, ni la provenance, ni l'échéance", async () => {
    const { bob } = await setup();
    const id = await seedAgentAction(bob, await seedExecution(bob));

    for (const values of [
      { params: {} },
      { enjeu: 'bas' as const },
      { audience: 'soi' as const },
      { donneesPrivees: false },
      { simulation: false },
      { expireLe: new Date(Date.now() + 365 * 86_400_000) },
    ]) {
      await expect(
        withTenant(bob, (tx) => tx.update(actions).set(values).where(eq(actions.id, id))),
      ).rejects.toMatchObject(REFUSED);
    }
  });

  it('une action de simulation ne s’exécute jamais', async () => {
    const { bob } = await setup();
    const id = await seedAgentAction(bob, await seedExecution(bob, { mode: 'simulation' }), {
      simulation: true,
    });
    const to = (status: 'en-cours' | 'faite' | 'annulee') =>
      withTenant(bob, (tx) => tx.update(actions).set({ status }).where(eq(actions.id, id)));

    await expect(to('en-cours')).rejects.toMatchObject(CHECK);
    await expect(to('faite')).rejects.toMatchObject(CHECK);
    await expect(to('annulee')).resolves.toBeDefined();
  });
});

describe('clé composée vers executions_agent', () => {
  it("supprimer l'exécution garde l'action : execution_id passe à nul, tenant_id reste", async () => {
    const { bob } = await setup();
    const executionId = await seedExecution(bob);
    const id = await seedAgentAction(bob, executionId);

    await expect(
      adminPool.query('delete from executions_agent where id = $1', [executionId]),
    ).resolves.toMatchObject({ rowCount: 1 });

    expect(await actionRow(id)).toMatchObject({
      executionId: null,
      tenantId: bob.tenantId,
      origine: 'agent',
      status: 'proposee',
    });
  });
});

describe('couper_agents_du_membre', () => {
  const cut = async (ctx: TenantContext, target: TenantContext, teamOnly: boolean) =>
    (
      await withTenant(ctx, (tx) =>
        tx.execute<{ n: number }>(
          sql`select couper_agents_du_membre(${target.userId}, ${teamOnly}) as n`,
        ),
      )
    ).rows[0]?.n;
  const isActive = async (id: string) =>
    (await adminDb.select().from(agentsActives).where(eq(agentsActives.id, id)))[0]?.actif;

  it('un administrateur coupe les activations du membre et annule ses actions d’agent en attente', async () => {
    const { alice, bob, carl } = await setup();
    const activation = await seedActivation(bob);
    const run = await seedExecution(bob, { activationId: activation });
    const pending = await seedAgentAction(bob, run);
    const done = await seedAgentAction(bob, run, { status: 'faite' });
    const carlActivation = await seedActivation(carl);
    const carlPending = await seedAgentAction(carl, await seedExecution(carl));

    expect(await cut(alice, bob, false)).toBe(1);

    expect(await isActive(activation)).toBe(false);
    expect(await actionRow(pending)).toMatchObject({ status: 'annulee', decidePar: null });
    expect((await actionRow(pending)).decidedAt).not.toBeNull();
    expect(await actionRow(done)).toMatchObject({ status: 'faite' });
    // Le collègue n'est pas touché.
    expect(await isActive(carlActivation)).toBe(true);
    expect(await actionRow(carlPending)).toMatchObject({ status: 'proposee' });
  });

  it('refuse un membre ordinaire et un administrateur d’une autre organisation : rien ne change', async () => {
    const { bob, carl, zoe } = await setup();
    const activation = await seedActivation(bob);
    const pending = await seedAgentAction(bob, await seedExecution(bob));

    expect(await cut(carl, bob, false)).toBe(0);
    expect(await cut(bob, bob, false)).toBe(0);
    expect(await cut(zoe, bob, false)).toBe(0);

    expect(await isActive(activation)).toBe(true);
    expect(await actionRow(pending)).toMatchObject({ status: 'proposee' });
  });

  it('avec p_equipe_seulement, ne coupe que les activations d’équipe et leurs actions', async () => {
    const { alice, bob } = await setup();
    await setRole(bob, 'admin');
    const personal = await seedActivation(bob);
    const team = await seedActivation(bob, { portee: 'equipe' });
    const personalAction = await seedAgentAction(
      bob,
      await seedExecution(bob, { activationId: personal }),
    );
    const teamAction = await seedAgentAction(bob, await seedExecution(bob, { activationId: team }));

    expect(await cut(alice, bob, true)).toBe(1);

    expect(await isActive(personal)).toBe(true);
    expect(await isActive(team)).toBe(false);
    expect(await actionRow(personalAction)).toMatchObject({ status: 'proposee' });
    expect(await actionRow(teamAction)).toMatchObject({ status: 'annulee' });
  });
});

describe('supprimer_agents_du_compte', () => {
  const remove = async (ctx: TenantContext) =>
    (
      await withTenant(ctx, (tx) =>
        tx.execute<{ n: number }>(sql`select supprimer_agents_du_compte() as n`),
      )
    ).rows[0]?.n;
  const left = async (userId: string) => ({
    executions: (
      await adminDb.select().from(executionsAgent).where(eq(executionsAgent.userId, userId))
    ).length,
    evenements: (await adminDb.select().from(evenements).where(eq(evenements.userId, userId)))
      .length,
    activations: await adminDb
      .select({ id: agentsActives.id, portee: agentsActives.portee, actif: agentsActives.actif })
      .from(agentsActives)
      .where(eq(agentsActives.userId, userId)),
  });

  it('supprime ses exécutions, ses événements et ses activations personnelles ; garde ses actions, vidées', async () => {
    const { alice, bob } = await setup();
    await setRole(bob, 'admin');
    const run = await seedExecution(bob, { activationId: await seedActivation(bob) });
    const team = await seedActivation(bob, { portee: 'equipe' });
    const pending = await seedAgentAction(bob, run);
    const done = await seedAgentAction(bob, run, { status: 'faite', annulation: { id: '42' } });
    const { sourceId } = await seedSource(bob);
    await adminDb.insert(evenements).values({
      tenantId: bob.tenantId,
      userId: bob.userId,
      sourceId,
      ingestRunId: crypto.randomUUID(),
      outil: 'fathom',
      nature: 'reunion',
      cote: 'externe',
      cleObjet: 'fathom:meeting:1',
      empreinte: hex64(),
      acl: [bob.userId],
    });
    await seedExecution(alice);

    expect(await remove(bob)).toBe(1);

    // Son activation d'équipe reste, coupée : un administrateur pourra la reprendre.
    expect(await left(bob.userId)).toEqual({
      executions: 0,
      evenements: 0,
      activations: [{ id: team, portee: 'equipe', actif: false }],
    });
    // toEqual, pas toMatchObject : un objet vide « correspondrait » à des paramètres encore pleins.
    const cancelled = await actionRow(pending);
    expect(cancelled).toMatchObject({ status: 'annulee', executionId: null });
    expect(cancelled.params).toEqual({});
    const kept = await actionRow(done);
    expect(kept).toMatchObject({ status: 'faite', annulation: null });
    expect(kept.params).toEqual({});
    // Le journal d'un collègue n'est pas touché.
    expect((await left(alice.userId)).executions).toBe(1);
  });

  it('ne touche ni une action de discussion, ni ce que la personne aurait dans une autre organisation', async () => {
    const { bob, zoe } = await setup();
    const run = await seedExecution(bob);
    const [fromDiscussion] = await adminDb
      .insert(actions)
      .values({
        tenantId: bob.tenantId,
        userId: bob.userId,
        kind: 'github.commenter',
        params: { repo: 'acme/leon', number: '1', title: 'Titre', body: 'Texte.' },
        acl: [bob.userId],
      })
      .returning({ id: actions.id });

    // Le contexte d'une autre organisation : rien de Bob n'y est.
    expect(await remove({ ...zoe, userId: bob.userId, principals: [bob.userId] })).toBe(0);
    expect(
      await adminDb.select().from(executionsAgent).where(eq(executionsAgent.id, run)),
    ).toHaveLength(1);

    expect(await remove(bob)).toBe(1);
    expect(await actionRow(fromDiscussion?.id ?? '')).toMatchObject({
      status: 'proposee',
      params: { repo: 'acme/leon' },
    });
  });
});
```

### 16.7 `0081-connexions-renouvellement.db.test.ts`

```ts
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { connections } from '@/server/db/schema/connections';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';

// Migration 0081 : le créneau d'écriture d'une connexion, partagé en base, et le verrou de renouvellement d'un jeton.
// reserver_creneau ne sert que la personne qui a branché la connexion, dans son organisation.

async function setup() {
  const team = await createTestTenant(['Bob', 'Carl']);
  const other = await createTestTenant(['Zoé']);
  const [bob, carl] = team.members as [TenantContext, TenantContext];
  const [zoe] = other.members as [TenantContext];
  return { bob, carl, zoe };
}

const slot = async (ctx: TenantContext, connectionId: string, stepMs: number, delayMs = 0) =>
  (
    await withTenant(ctx, (tx) =>
      tx.execute<{ ms: number | null }>(
        sql`select reserver_creneau(${connectionId}, ${stepMs}, ${delayMs}) as ms`,
      ),
    )
  ).rows[0]?.ms;

const nextSlot = async (connectionId: string) =>
  (
    await adminPool.query<{ prochain_le: Date }>(
      'select prochain_le from creneaux_ecriture where connection_id = $1',
      [connectionId],
    )
  ).rows[0]?.prochain_le ?? null;

describe('reserver_creneau', () => {
  it('le premier créneau est immédiat, le suivant vient un pas après', async () => {
    const { bob } = await setup();
    const id = await seedConnection(bob, { provider: 'hubspot' });

    expect(await slot(bob, id, 2000)).toBe(0);
    const second = await slot(bob, id, 2000);
    const third = await slot(bob, id, 2000);

    // Le temps passé entre deux appels se déduit de l'attente.
    expect(second).toBeGreaterThan(1000);
    expect(second).toBeLessThanOrEqual(2000);
    expect(third).toBeGreaterThan(3000);
    expect(third).toBeLessThanOrEqual(4000);
  });

  it('après un refus pour débit, le retard repousse le créneau de tous', async () => {
    const { bob } = await setup();
    const id = await seedConnection(bob, { provider: 'hubspot' });
    await slot(bob, id, 2000);

    const delayed = await slot(bob, id, 2000, 30_000);
    const after = await slot(bob, id, 2000);

    expect(delayed).toBeGreaterThan(29_000);
    expect(delayed).toBeLessThanOrEqual(30_000);
    expect(after).toBeGreaterThan(31_000);
    expect(after).toBeLessThanOrEqual(32_000);
  });

  it('borne un retard aberrant à une heure', async () => {
    const { bob } = await setup();
    const id = await seedConnection(bob, { provider: 'hubspot' });

    expect(await slot(bob, id, 2000, 86_400_000)).toBeLessThanOrEqual(3_600_000);
  });

  it("rend nul pour la connexion d'un collègue ou d'une autre organisation, sans rien écrire", async () => {
    const { bob, carl, zoe } = await setup();
    const id = await seedConnection(bob, { provider: 'hubspot' });

    // seedConnection pose acl = [tenant_id] : Carl voit la connexion, mais ne l'a pas branchée.
    expect(await slot(carl, id, 2000)).toBeNull();
    expect(await slot(zoe, id, 2000)).toBeNull();
    const outside = await db.execute<{ ms: number | null }>(
      sql`select reserver_creneau(${id}, 2000, 0) as ms`,
    );
    expect(outside.rows[0]?.ms).toBeNull();
    expect(await nextSlot(id)).toBeNull();
  });

  it('le créneau part avec la connexion, et leon_app ne lit pas la table', async () => {
    const { bob } = await setup();
    const id = await seedConnection(bob, { provider: 'hubspot' });
    await slot(bob, id, 2000);
    expect(await nextSlot(id)).not.toBeNull();

    await expect(db.execute(sql`select * from creneaux_ecriture`)).rejects.toMatchObject({
      cause: { code: '42501' },
    });
    await withTenant(bob, (tx) => tx.delete(connections).where(eq(connections.id, id)));

    expect(await nextSlot(id)).toBeNull();
  });
});

describe('connections.renew_lock_at', () => {
  // La requête de ensureFreshTokens (architecture, 8.3) : un seul appelant gagne le verrou.
  const take = (ctx: TenantContext, id: string) =>
    withTenant(ctx, (tx) =>
      tx
        .update(connections)
        .set({ renewLockAt: sql`now()` })
        .where(
          sql`${connections.id} = ${id} and (${connections.renewLockAt} is null
              or ${connections.renewLockAt} < now() - interval '1 minute')`,
        )
        .returning({ id: connections.id }),
    );

  it('se prend une fois, puis se reprend au bout d’une minute', async () => {
    const { bob } = await setup();
    const id = await seedConnection(bob, { provider: 'outlook' });

    expect(await take(bob, id)).toHaveLength(1);
    expect(await take(bob, id)).toHaveLength(0);
    await adminPool.query(
      "update connections set renew_lock_at = now() - interval '61 seconds' where id = $1",
      [id],
    );
    expect(await take(bob, id)).toHaveLength(1);
  });
});
```


### 16.8 `0083-webhooks.db.test.ts`

Le fichier ouvre une troisième connexion, sous le rôle `leon_porte`, à côté de `db` (`leon_app`) et de `adminPool` (`leon_owner`). Son adresse se déduit de celle de l'app : aucun changement à `src/test/test-env.ts`.

```ts
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { Client, Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { members } from '@/server/db/schema/auth';
import { abonnementsWebhook, boiteEntreeWebhooks } from '@/server/db/schema/webhooks';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedConnection } from '@/test/fixtures';
import { setRole } from '@/test/seed-agents';
import { TEST_ENV } from '@/test/test-env';

// Migration 0083 : les webhooks entrants. La porte a son propre rôle, leon_porte, qui n'a que deux fonctions ;
// leon_app n'a aucun droit sur la boîte d'entrée et ne lit un corps que par prendre_livraison, une seule fois.

const PORTE_URL = TEST_ENV.DATABASE_URL.replace('leon_app:leon_app', 'leon_porte:leon_porte');
const porte = new Pool({ connectionString: PORTE_URL, max: 2 });

// Les livraisons « reçues » de ce fichier ne restent pas dans la base partagée : tout part avec l'organisation.
const tenantIds: string[] = [];
afterAll(async () => {
  await porte.end();
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

async function team(names: string[]): Promise<TenantContext[]> {
  const { tenantId, members: created } = await createTestTenant(names);
  tenantIds.push(tenantId);
  return created;
}

// Un abonnement « par abonnement » (Outlook), posé par le rôle propriétaire.
async function seedSubscription(
  ctx: TenantContext,
  values: Partial<typeof abonnementsWebhook.$inferInsert> = {},
): Promise<string> {
  const [row] = await adminDb
    .insert(abonnementsWebhook)
    .values({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      connectionId: await seedConnection(ctx, { provider: 'outlook' }),
      outil: 'outlook',
      portee: 'abonnement',
      ressource: `me/messages/${randomUUID()}`,
      externeId: randomUUID(),
      secret: 'v1:secret-de-test',
      expireLe: new Date(Date.now() + 2 * 86_400_000),
      acl: [ctx.userId],
      ...values,
    })
    .returning({ id: abonnementsWebhook.id });
  if (!row) throw new Error('abonnement de test non créé');
  return row.id;
}

// Un abonnement « d'application » (HubSpot) : cette connexion écoute ce compte.
const seedAppListener = async (ctx: TenantContext, compte: string) =>
  seedSubscription(ctx, {
    connectionId: await seedConnection(ctx, { provider: 'hubspot' }),
    outil: 'hubspot',
    portee: 'app',
    compte,
    ressource: 'app',
    externeId: null,
    secret: null,
    expireLe: null,
  });

const secretOf = async (outil: string, abonnement: string) =>
  (
    await porte.query<{ tenant_id: string; secret: string | null }>(
      'select tenant_id, secret from porte_secret($1, $2)',
      [outil, abonnement],
    )
  ).rows;

const deposit = async (input: {
  outil: string;
  abonnement?: string;
  compte?: string;
  genre?: string;
  livraison?: string;
  corps?: string;
  entetes?: unknown;
}) =>
  (
    await porte.query<{ n: number }>('select porte_deposer($1, $2, $3, $4, $5, $6, $7) as n', [
      input.outil,
      input.abonnement ?? null,
      input.compte ?? null,
      input.genre ?? 'livraison',
      input.livraison ?? randomUUID(),
      input.corps ?? '{"value":[{"id":"m1"}]}',
      JSON.stringify(input.entetes ?? { 'content-type': 'application/json' }),
    ])
  ).rows[0]?.n;

const linesOf = (depot: string) =>
  adminDb.select().from(boiteEntreeWebhooks).where(eq(boiteEntreeWebhooks.depot, depot));

const take = async (id: string) =>
  (
    await db.execute<{
      tenant_id: string;
      user_id: string | null;
      outil: string;
      portee: string;
      genre: string;
      abonnement_id: string | null;
      compte: string | null;
      corps: string | null;
      entetes: Record<string, string>;
    }>(sql`select * from prendre_livraison(${id})`)
  ).rows;

describe('les droits de la porte', () => {
  it('leon_porte est un rôle ordinaire, qui ne lit ni n’écrit aucune table', async () => {
    const { rows } = await porte.query(
      'select current_user as who, rolsuper, rolbypassrls from pg_roles where rolname = current_user',
    );
    expect(rows[0]).toEqual({ who: 'leon_porte', rolsuper: false, rolbypassrls: false });
    for (const table of ['boite_entree_webhooks', 'abonnements_webhook', 'connections', 'sources']) {
      await expect(porte.query(`select 1 from ${table} limit 1`), table).rejects.toMatchObject({
        code: '42501',
      });
    }
  });

  it('porte_secret et porte_deposer ne sont accordées qu’à leon_porte ; les autres fonctions, pas à lui', async () => {
    const { rows } = await adminPool.query<{ fonction: string; app: boolean; porte: boolean }>(
      `select p.proname as fonction,
              has_function_privilege('leon_app', p.oid, 'execute') as app,
              has_function_privilege('leon_porte', p.oid, 'execute') as porte
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.prosecdef
        order by p.proname`,
    );
    const granted = (role: 'app' | 'porte') =>
      rows.filter((row) => row[role]).map((row) => row.fonction);

    expect(granted('porte')).toEqual(['porte_deposer', 'porte_secret']);
    expect(granted('app')).not.toContain('porte_deposer');
    expect(granted('app')).not.toContain('porte_secret');
    expect(granted('app')).toContain('prendre_livraison');
  });

  it('leon_app ne lit pas la boîte d’entrée, même sous le contexte de la personne', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    await deposit({ outil: 'outlook', abonnement: id });

    await expect(
      withTenant(bob, (tx) => tx.select().from(boiteEntreeWebhooks)),
    ).rejects.toMatchObject({ cause: { code: '42501' } });
  });
});

describe('porte_secret', () => {
  it("rend le secret chiffré et l'organisation d'un abonnement en service", async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);

    expect(await secretOf('outlook', id)).toEqual([
      { tenant_id: bob.tenantId, secret: 'v1:secret-de-test' },
    ]);
  });

  it('ne rend rien pour un autre outil, un abonnement inconnu, expiré, en erreur ou résilié', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const active = await seedSubscription(bob);

    expect(await secretOf('gmail', active)).toEqual([]);
    expect(await secretOf('outlook', randomUUID())).toEqual([]);
    expect(
      await secretOf('outlook', await seedSubscription(bob, { expireLe: new Date(Date.now() - 1000) })),
    ).toEqual([]);
    for (const etat of ['expiree', 'erreur', 'resiliee'] as const) {
      expect(await secretOf('outlook', await seedSubscription(bob, { etat })), etat).toEqual([]);
    }
    // Une adresse collée à la main dans l'outil est en service.
    expect(await secretOf('outlook', await seedSubscription(bob, { etat: 'manuelle' }))).toHaveLength(1);
  });

  it('ne rend rien quand la personne a quitté l’organisation', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    await adminDb.delete(members).where(eq(members.userId, bob.userId));

    expect(await secretOf('outlook', id)).toEqual([]);
  });
});

describe('porte_deposer', () => {
  it('écrit une ligne par livraison, corps et en-têtes compris, et rien pour une livraison rejouée', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    const livraison = randomUUID();

    expect(await deposit({ outil: 'outlook', abonnement: id, livraison })).toBe(1);
    expect(await deposit({ outil: 'outlook', abonnement: id, livraison })).toBe(0);

    expect(await linesOf(id)).toMatchObject([
      {
        tenantId: bob.tenantId,
        outil: 'outlook',
        portee: 'abonnement',
        abonnementId: id,
        genre: 'livraison',
        livraison,
        corps: '{"value":[{"id":"m1"}]}',
        entetes: { 'content-type': 'application/json' },
        statut: 'recue',
      },
    ]);
  });

  it("un webhook d'application donne une ligne par organisation qui écoute le compte, jamais une par personne", async () => {
    const [bob, carl] = (await team(['Bob', 'Carl'])) as [TenantContext, TenantContext];
    const [zoe] = (await team(['Zoé'])) as [TenantContext];
    const compte = `portal-${randomUUID()}`;
    await seedAppListener(bob, compte);
    await seedAppListener(carl, compte);
    await seedAppListener(zoe, compte);

    expect(await deposit({ outil: 'hubspot', compte })).toBe(2);

    const lines = await linesOf(compte);
    expect(lines.map((line) => line.tenantId).sort()).toEqual([bob.tenantId, zoe.tenantId].sort());
    expect(lines.every((line) => line.portee === 'app' && line.abonnementId === null)).toBe(true);
    // Personne n'écoute ce compte : rien n'est écrit.
    expect(await deposit({ outil: 'hubspot', compte: `portal-${randomUUID()}` })).toBe(0);
  });

  it('refuse une forme fausse : les deux cibles, aucune, un genre inconnu, un corps trop gros', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);

    expect(await deposit({ outil: 'outlook', abonnement: id, compte: 'x' })).toBe(0);
    expect(await deposit({ outil: 'outlook' })).toBe(0);
    expect(await deposit({ outil: 'outlook', abonnement: id, genre: 'autre' })).toBe(0);
    expect(await deposit({ outil: 'outlook', abonnement: id, corps: 'x'.repeat(262_145) })).toBe(0);
    expect(await linesOf(id)).toEqual([]);
  });

  it('remplace des en-têtes qui ne sont pas un objet, ou trop gros, par un objet vide', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);

    await deposit({ outil: 'outlook', abonnement: id, entetes: ['pas', 'un', 'objet'] });
    await deposit({ outil: 'outlook', abonnement: id, entetes: { gros: 'x'.repeat(9000) } });

    expect((await linesOf(id)).map((line) => line.entetes)).toEqual([{}, {}]);
  });

  it('réveille le worker : NOTIFY leon_porte porte l’id de la ligne', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    const listener = new Client({ connectionString: TEST_ENV.DATABASE_URL });
    await listener.connect();
    const heard: string[] = [];
    listener.on('notification', (message) => {
      if (message.channel === 'leon_porte' && message.payload) heard.push(message.payload);
    });
    await listener.query('listen leon_porte');
    try {
      await deposit({ outil: 'outlook', abonnement: id });
      const [line] = await linesOf(id);
      await expect.poll(() => heard).toContain(line?.id);
    } finally {
      await listener.end();
    }
  });
});

describe('prendre_livraison', () => {
  it('rend la ligne et son corps une seule fois, puis le corps est vidé', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    await deposit({ outil: 'outlook', abonnement: id, genre: 'cycle', corps: '{"value":[]}' });
    const [line] = await linesOf(id);
    if (!line) throw new Error('livraison non déposée');

    expect(await take(line.id)).toEqual([
      {
        tenant_id: bob.tenantId,
        user_id: bob.userId,
        outil: 'outlook',
        portee: 'abonnement',
        genre: 'cycle',
        abonnement_id: id,
        compte: null,
        corps: '{"value":[]}',
        entetes: { 'content-type': 'application/json' },
      },
    ]);
    expect(await take(line.id)).toEqual([]);

    const [after] = await linesOf(id);
    expect(after).toMatchObject({ statut: 'traitee', corps: null });
    expect(after?.traiteLe).not.toBeNull();
  });

  it("pour un webhook d'application, ne nomme personne : le job demande ensuite connexions_du_compte", async () => {
    const [bob, carl] = (await team(['Bob', 'Carl'])) as [TenantContext, TenantContext];
    const compte = `portal-${randomUUID()}`;
    await seedAppListener(bob, compte);
    await seedAppListener(carl, compte);
    await deposit({ outil: 'hubspot', compte, corps: '[{"objectId":1}]' });
    const [line] = await linesOf(compte);
    if (!line) throw new Error('livraison non déposée');

    expect(await take(line.id)).toMatchObject([
      { tenant_id: bob.tenantId, user_id: null, portee: 'app', compte, corps: '[{"objectId":1}]' },
    ]);

    const listeners = await db.execute<{ connection_id: string; user_id: string }>(
      sql`select * from connexions_du_compte(${bob.tenantId}, 'hubspot', ${compte})`,
    );
    // Par ancienneté de la connexion : celle de Bob d'abord.
    expect(listeners.rows.map((row) => row.user_id)).toEqual([bob.userId, carl.userId]);
  });

  it("ignore la livraison d'un abonnement résilié après le dépôt : rien n'est rendu, le corps est vidé", async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    await deposit({ outil: 'outlook', abonnement: id });
    const [line] = await linesOf(id);
    if (!line) throw new Error('livraison non déposée');
    await adminDb
      .update(abonnementsWebhook)
      .set({ etat: 'resiliee' })
      .where(eq(abonnementsWebhook.id, id));

    expect(await take(line.id)).toEqual([]);

    expect((await linesOf(id))[0]).toMatchObject({ statut: 'ignoree', corps: null });
  });
});

describe('les tics et la purge', () => {
  const backdate = (depot: string, interval: string) =>
    adminPool.query(
      `update boite_entree_webhooks set recu_le = now() - $2::interval where depot = $1`,
      [depot, interval],
    );
  const toProcess = async () =>
    (
      await db.execute<{ id: string }>(sql`select * from webhooks_a_traiter(1000)`)
    ).rows.map((row) => row.id);

  it('webhooks_a_traiter rattrape une livraison restée reçue plus de 30 secondes', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    await deposit({ outil: 'outlook', abonnement: id });
    const [line] = await linesOf(id);
    if (!line) throw new Error('livraison non déposée');

    expect(await toProcess()).not.toContain(line.id);
    await backdate(id, '1 minute');
    expect(await toProcess()).toContain(line.id);
    await take(line.id);
    expect(await toProcess()).not.toContain(line.id);
  });

  it('purger_boite_entree vide le corps après 24 heures et supprime la ligne après 7 jours', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    await deposit({ outil: 'outlook', abonnement: id });

    await backdate(id, '25 hours');
    await db.execute(sql`select purger_boite_entree()`);
    expect((await linesOf(id))[0]).toMatchObject({ statut: 'echouee', corps: null });

    await backdate(id, '8 days');
    await db.execute(sql`select purger_boite_entree()`);
    expect(await linesOf(id)).toEqual([]);
  });

  it('abonnements_a_renouveler rend un abonnement actif dont l’heure est passée, pas celui d’une connexion en pause', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const due = await seedSubscription(bob, { renouvelerLe: new Date(Date.now() - 60_000) });
    const later = await seedSubscription(bob, { renouvelerLe: new Date(Date.now() + 3_600_000) });
    const paused = await seedSubscription(bob, {
      connectionId: await seedConnection(bob, { provider: 'outlook', status: 'paused' }),
      renouvelerLe: new Date(Date.now() - 60_000),
    });

    const found = (
      await db.execute<{ abonnement_id: string }>(sql`select * from abonnements_a_renouveler(1000)`)
    ).rows.map((row) => row.abonnement_id);

    expect(found).toContain(due);
    expect(found).not.toContain(later);
    expect(found).not.toContain(paused);
  });
});

describe('abonnements_webhook sous la sécurité par ligne', () => {
  it("un abonnement n'entre que pour une connexion que la personne a branchée, et elle seule le lit", async () => {
    const [bob, carl] = (await team(['Bob', 'Carl'])) as [TenantContext, TenantContext];
    const bobConnection = await seedConnection(bob, { provider: 'outlook' });
    const subscribe = (ctx: TenantContext) =>
      withTenant(ctx, (tx) =>
        tx.insert(abonnementsWebhook).values({
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          connectionId: bobConnection,
          outil: 'outlook',
          portee: 'abonnement',
          ressource: 'me/messages',
          secret: 'v1:secret-de-test',
          acl: [ctx.userId],
        }),
      );

    await expect(subscribe(carl)).rejects.toMatchObject({ cause: { code: '42501' } });
    await expect(subscribe(bob)).resolves.toBeDefined();
    const seenBy = async (ctx: TenantContext) =>
      (await withTenant(ctx, (tx) => tx.select().from(abonnementsWebhook))).length;
    expect(await seenBy(bob)).toBe(1);
    expect(await seenBy(carl)).toBe(0);
  });

  it('se désabonner supprime la ligne ; supprimer la connexion emporte ses abonnements et leurs livraisons', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const gone = await seedSubscription(bob);
    const cascaded = await seedSubscription(bob);
    await deposit({ outil: 'outlook', abonnement: cascaded });
    const [row] = await adminDb
      .select({ connectionId: abonnementsWebhook.connectionId })
      .from(abonnementsWebhook)
      .where(eq(abonnementsWebhook.id, cascaded));

    await withTenant(bob, (tx) =>
      tx.delete(abonnementsWebhook).where(eq(abonnementsWebhook.id, gone)),
    );
    await adminPool.query('delete from connections where id = $1', [row?.connectionId]);

    expect(
      await adminDb
        .select()
        .from(abonnementsWebhook)
        .where(eq(abonnementsWebhook.userId, bob.userId)),
    ).toEqual([]);
    expect(await linesOf(cascaded)).toEqual([]);
  });
});

describe('couper_agents_du_membre, complétée en 0083', () => {
  it('passe les abonnements du membre retiré à « resiliee » : la porte refuse alors ses livraisons', async () => {
    const [alice, bob] = (await team(['Alice', 'Bob'])) as [TenantContext, TenantContext];
    await setRole(alice, 'admin');
    const id = await seedSubscription(bob);
    const cut = (teamOnly: boolean) =>
      withTenant(alice, (tx) =>
        tx.execute(sql`select couper_agents_du_membre(${bob.userId}, ${teamOnly})`),
      );

    // Un administrateur qui perd seulement son rôle garde ses abonnements.
    await cut(true);
    expect(await secretOf('outlook', id)).toHaveLength(1);

    await cut(false);
    expect(await secretOf('outlook', id)).toEqual([]);
    expect(await deposit({ outil: 'outlook', abonnement: id })).toBe(0);
  });
});
```

### 16.9 `src/test/contracts/prendre-livraison.test.ts`

Un test `unit`, sans base, sur le modèle de `privileges.test.ts`. Il passe dès 0083, avant même que `inbox.ts` existe (chapitre 03).

```ts
import { describe, expect, it } from 'vitest';
import { productionSources } from './files';

// prendre_livraison (0083) est la seule fonction hors sécurité par ligne qui rend du texte : le corps brut d'un
// webhook, une fois, pour Connector.webhook.match (dossier agents, écart E18). Tout code de leon_app peut l'appeler :
// ce contrat garde contre une erreur de code, pas contre un processus hostile. Un second appelant ferait sortir le
// corps d'un webhook ailleurs que dans la correspondance.
const ONLY_CALLER = 'src/server/webhooks/inbox.ts';

describe('prendre_livraison', () => {
  it(`n'est nommée que par ${ONLY_CALLER}`, () => {
    const callers = productionSources('src/**/*.{ts,tsx}')
      .filter(({ text }) => /prendre_livraison/.test(text))
      .map(({ path }) => path);

    expect(callers.filter((path) => path !== ONLY_CALLER)).toEqual([]);
  });
});
```

### 16.10 `src/server/auth/delete-account.db.test.ts` (existe) : deux cas de plus

Avec 0080, dans le `describe` qui couvre `deleteAccount`. Ils passent par la vraie fonction, pas par le SQL seul : c'est l'appel qui est vérifié ici.

```ts
  it('efface ses exécutions, ses événements et ses activations ; garde ses actions d’agent, vidées', async () => {
    const { members: team } = await createTestTenant(['Alice', 'Bob']);
    const [alice, bob] = team as [TenantContext, TenantContext];
    await setRole(alice, 'owner');
    const run = await seedExecution(bob, { activationId: await seedActivation(bob) });
    const pending = await seedAgentAction(bob, run);
    const aliceRun = await seedExecution(alice);

    await deleteAccount(bob, null, false);

    expect(
      await adminDb.select().from(executionsAgent).where(eq(executionsAgent.userId, bob.userId)),
    ).toEqual([]);
    expect(
      await adminDb.select().from(agentsActives).where(eq(agentsActives.userId, bob.userId)),
    ).toEqual([]);
    const [kept] = await adminDb.select().from(actions).where(eq(actions.id, pending));
    expect(kept).toMatchObject({ status: 'annulee', executionId: null });
    expect(kept?.params).toEqual({});
    // Le journal d'un collègue reste.
    expect(
      await adminDb.select().from(executionsAgent).where(eq(executionsAgent.id, aliceRun)),
    ).toHaveLength(1);
  });

  it("coupe son agent d'équipe sans le supprimer : un administrateur le reprend ensuite", async () => {
    const { members: team } = await createTestTenant(['Alice', 'Bob']);
    const [alice, bob] = team as [TenantContext, TenantContext];
    await setRole(alice, 'owner');
    await setRole(bob, 'admin');
    const teamAgent = await seedActivation(bob, { portee: 'equipe' });

    await deleteAccount(bob, null, false);

    const takeOver = await withTenant(alice, (tx) =>
      tx.execute<{ ok: boolean }>(sql`select reprendre_agent_equipe(${teamAgent}) as ok`),
    );
    expect(takeOver.rows[0]?.ok).toBe(true);
    const [after] = await adminDb.select().from(agentsActives).where(eq(agentsActives.id, teamAgent));
    expect(after).toMatchObject({ userId: alice.userId, actif: false });
  });
```

Imports à ajouter en tête du fichier : `sql` (depuis `drizzle-orm`), `actions`, `agentsActives`, `executionsAgent`, et les quatre fixtures de `@/test/seed-agents`. Le second cas vérifie au passage la dernière condition de `reprendre_agent_equipe` : `deleteAccount` remet le rôle du partant à `member` (`delete-account.ts:226`) et pose `deleted_at`.


## 17. Ordre de mise en œuvre

L'ordre est celui de l'architecture (14.3). Ce chapitre fournit la part « données » de chaque PR. Cette part peut partir seule, juste avant le code qui s'en sert : chaque migration est compatible avec le code d'avant (section 2.3, point 5), et une PR de SQL seul se relit mieux. Le chapitre 14 tranche le découpage ; l'ordre ne change pas.

| PR (architecture, 14.3) | Migrations | Fichiers de ce chapitre | Ce que l'autre doit vérifier |
|---|---|---|---|
| 3. Sortie structurée | 0075 | le SQL ; `0075-…db.test.ts` | Le `check` garde la forme `step in (…)`. `0039-tableau-admin.db.test.ts` passe toujours |
| 4. Budget | 0076 | le SQL ; `0076-…db.test.ts` ; `src/test/seed-agents.ts` (`setRole`) | Les deux tables n'ont aucun droit. Le choix « la journée est toujours comptée » (section 18, écart 3) |
| 5. Événements, règles, routage | 0077, 0078 | les deux SQL et leurs tests ; `schema/agents.ts` (`evenements`, `agentsActives`) ; `signaleLe` dans `schema/memory.ts` ; trois colonnes dans `schema/organisation.ts` ; `src/lib/agents.ts` avec ses trois listes ; `COMPOSITE_KEYS` (`evenements`) ; `seed-agents.ts` (`hex64`, `seedActivation`) | La durée de `update ingest_runs` sur la base de production. Les deux règles restrictives de `agents_actives` |
| 6. Moteur linéaire | 0079 | le SQL et son test ; `schema/agents.ts` (`executionsAgent`, `etapesExecution`) ; `seed-agents.ts` (`seedExecution`) | `executions_a_reveiller` sans jointure sur `member` (écart 1). Le test qui supprime l'activation |
| 7. Actions généralisées | 0080, 0081 | les deux SQL et leurs tests ; `schema/actions.ts` ; `renewLockAt` dans `schema/connections.ts` ; `ACTION_STATUSES` ; `VALIDATED_IN_CODE` ; l'appel dans `deleteAccount` et ses deux tests ; `seed-agents.ts` (`seedAgentAction`) | Le défaut de `expire_le`. Les deux contraintes ajoutées. Le test qui supprime l'exécution |
| après : veilles et horloge | 0082 | le SQL et son test ; `veilles` dans `schema/agents.ts` ; `COMPOSITE_KEYS` (`veilles`) | `purger_veilles`, qui n'est pas dans l'architecture. Le test qui supprime la source |
| après : webhooks | 0083 | `docker/postgres/init.sql` ; README ; le SQL et son test ; `schema/webhooks.ts` ; `DELETE_ALLOWED` ; `prendre-livraison.test.ts` | Le rôle `leon_porte` est créé en production **avant** la mise en ligne. Les états `manuelle`, `ignoree`, `echouee` (écarts 2 et 4) |
| après : récapitulatif et Slack | 0084 | le SQL et son test ; `schema/channels.ts` ; `locale` dans `schema/auth.ts` ; `DELETE_ALLOWED` | Le défaut `recap_email = true`. La forme des identifiants Slack |
| après : statistiques | 0085 | le SQL et son test | Les deux seuils de trois personnes |

Pour chaque PR, dans cet ordre :

```bash
cd ~/leon && git fetch origin --prune && git pull --ff-only
gh pr list                                   # personne n'a pris le numéro de migration
git worktree add --no-track -b <prenom>/<sujet> .claude/worktrees/<sujet> origin/main
cd .claude/worktrees/<sujet>
# … poser le SQL, le schéma, les tests …
pnpm db:migrate                              # sur la base locale leon
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:db
```

Trois choses à savoir avant de fusionner :

- **`pnpm lint` reformate.** Le code de ce chapitre est écrit à la main : quelques lignes de test dépassent les 100 colonnes de Biome (`biome.json`). `pnpm exec biome check --write` les replie.
- **`leon_test` est partagée.** Une migration fusionnée s'applique à la base de test de tous au prochain `pnpm test:db` (`src/test/global-setup.ts`). À partir de 0083, un volume local ancien doit avoir reçu le rôle `leon_porte` (section 15.3) : sinon la migration s'arrête, avec la commande.
- **Aucune de ces migrations n'est destructive** : rien n'entre dans `MIGRATIONS_DESTRUCTIVES` (`src/test/test-env.ts:11`). Il n'y a pas de migration de retour : chaque fichier ne fait qu'ajouter, et l'ancien code tourne sur le nouveau schéma.

À la mise en ligne (chapitre 13) : `web` et `worker` lancent `pnpm db:migrate` avant de démarrer, sous verrou consultatif. Deux cas à surveiller : une migration qui touche une table existante (0075, 0077, 0078, 0080, 0081, 0084) échoue sur `lock_timeout` si une longue transaction tient cette table (relancer suffit) ; 0083 échoue tant que `leon_porte` n'existe pas.

## 18. Écarts avec l'architecture

Aucun nom de l'architecture n'est changé : tables, colonnes, fonctions, paramètres, règles citées, numéros et noms de fichiers sont les siens. Ce qui suit est ce qui ne pouvait pas être suivi à la lettre, puis ce que j'ai ajouté ou tranché là où elle ne dit rien.

### 18.1 Écarts

| # | Ce que dit l'architecture | Ce qui heurte, et la preuve | Ce qui est écrit ici, et ma proposition |
|---|---|---|---|
| 1 | 7.1 : « une fonction de tic qui rend une personne joint `member` et écarte un compte supprimé ». 7.4 : `executions_a_reveiller` rend les exécutions `en-attente` échues et `en-cours` au verrou vieux | 9.10 veut qu'une exécution d'un membre retiré finisse `annulee`, raison `parti`, « au job suivant ». `removeMember` supprime la ligne `member` (`members.ts:116-130`). Si le tic taisait ses exécutions, celle qui attend n'aurait jamais de job suivant, et sa réserve de budget ne serait jamais soldée | `executions_a_reveiller` **ne joint pas `member`**. Le moteur ferme l'exécution, qui sort alors de la liste. À savoir pour le chapitre 04 : `resolveTenantContext` rend `null` pour un membre retiré ; pour écrire `annulee` sur une ligne privée à cette personne, le moteur bâtit le contexte à la main (`{ tenantId, userId, principals: [userId] }`). Autre voie, plus sûre, si les deux fondateurs la préfèrent : `couper_agents_du_membre` ferme aussi les exécutions en cours (un `update` de plus), et le tic reprend la jointure. J'ajoute aussi un troisième cas au tic : `en-file` depuis plus de 15 minutes (job perdu entre l'écriture et l'envoi) |
| 2 | 7.4 : `porte_secret` rend « le secret chiffré d'un abonnement `active` » ; `porte_deposer` compte les abonnements actifs | 8.3 définit l'état `manuelle` : une adresse collée à la main dans l'outil, que `subscribeConnection` ne touche pas. Si la porte la refusait, cet état ne servirait à rien | Les quatre fonctions qui demandent « en service » acceptent `active` et `manuelle` (`porte_secret`, `porte_deposer`, `prendre_livraison`, `connexions_du_compte`). `abonnements_a_renouveler` ne rend que `active`. Si aucun outil du premier lot n'a d'adresse manuelle, retirer l'état de la liste plutôt que de le laisser sans usage |
| 3 | 7.4 : `reserver_budget` réserve « dans `budgets_agents` et dans `budgets_personne_jour` d'un seul geste » ; `p_plafond_jour_usd` nul : « pas de plafond du jour » ; `solder_budget` solde « dans les deux tables ». 9.3 : une exécution d'agent d'équipe « n'y est pas soumise » | `solder_budget(p_reserve_usd, p_reel_usd)` ne sait pas si la réserve avait touché la journée. Si une réserve sans plafond ne comptait pas, son solde retirerait de la journée de la personne une somme qui n'y est jamais entrée | La journée est **toujours comptée** ; un plafond nul veut dire « ne pas comparer ». Conséquence : la dépense d'un agent d'équipe entre dans la journée de son activateur et peut épuiser le plafond de ses agents personnels. Sans effet au jalon 1 (pas d'agent d'équipe). Si ce n'est pas voulu : un troisième paramètre à `solder_budget` (`p_compter_jour boolean`), à décider avant d'ouvrir les agents d'équipe |
| 4 | 7.2 : `boite_entree_webhooks.statut` vaut `recue`, `traitee`, `ignoree` ou `echouee`. 7.4 : `prendre_livraison` passe la ligne à `traitee` | `leon_app` n'a aucun droit sur la table. Aucune fonction de 7.4 ne pose `ignoree` ni `echouee` | `prendre_livraison` pose `ignoree` (abonnement plus en service, personne partie). `purger_boite_entree` pose `echouee` (restée `recue` 24 heures). Limite : un échec de `match` ou de la relève ciblée, après la prise, laisse la ligne `traitee`. Si le poste de contrôle doit le montrer : une fonction `marquer_livraison(p_id uuid, p_statut text)`, à ajouter au chapitre 03 |
| 5 | 10.1 : le tic `standard-lot` trie « les événements restés `recu`, 20 au plus par appel, par personne » | Un tic n'a pas de contexte, et `evenements` est privée : aucune fonction de 7.4 ne lui dit pour qui travailler (`runs_a_signaler` ne sert que le rattrapage) | Rien n'est créé : c'est après le jalon 1 et hors de ma liste. Proposition, à poser dans la migration du lot « tri par le modèle » : `evenements_a_trier(p_max integer) returns table (tenant_id uuid, user_id uuid)`, les personnes membres qui ont un événement `recu` de plus de 2 minutes, sur l'index `evenements_recus_idx` déjà créé par 0077. Corps en 18.3 |
| 6 | 9.3, point 8 : à 80 % du plafond du mois, les administrateurs sont prévenus (`messages_sortants`, genre `alerte`) | `budget_du_mois()` ne répond qu'à un administrateur, et le plafond est un paramètre du code. L'exécution qui passe le seuil tourne au nom d'un membre ordinaire. Et une ligne de `messages_sortants` est privée à son destinataire : elle ne s'écrit que sous son contexte | Rien n'est créé. À concevoir aux chapitres 07 et 11. Piste : `reserver_budget` reste telle quelle ; un tic lit une fonction hors contexte qui rend, par organisation, le réservé plus le dépensé du mois et le plafond réglé ; le worker écrit l'alerte sous le contexte de chaque administrateur |
| 7 | 7.4 liste les fonctions à écrire | 9.6, point 10 : « une veille close [est supprimée] après 30 jours », et l'app ne supprime pas dans `veilles`. `recaps_dus` lit un fuseau par personne : un nom inconnu de Postgres fait lever `at time zone`, donc échouer le tic de tout le monde | Deux fonctions de plus : `purger_veilles(p_jours integer)` (0082), appelée une fois par heure par `agent-veilles` ; `heure_locale(p_fuseau text)` (0084), interne, sans droit pour `leon_app` |

### 18.2 Ajouts et précisions

Rien ici ne contredit l'architecture. C'est ce qu'elle ne fixe pas et qu'il fallait écrire.

| # | Sujet | Ce qui est écrit | Pourquoi |
|---|---|---|---|
| 8 | `actions.expire_le` | `not null`, avec un défaut d'une heure | L'ancien `proposeAction` insère sans la colonne pendant le recouvrement (architecture, 4.1, règle 6) |
| 9 | Règles et contraintes de plus | `own_source` (`evenements`) ; `own_activation` (`executions_agent`, `veilles`) ; `own_connection` est celle que demande l'architecture. `actions_origine_cle_check`, `actions_simulation_statut_check`. `reserver_execution` vérifie que l'activation est en service et que la personne peut la déclencher. La sécurité par ligne est activée aussi sur `executions_par_jour` et `creneaux_ecriture` | Les clés étrangères se vérifient hors sécurité par ligne (carte 07, piège 4). Les deux contraintes tiennent en base ce que le code promet (9.2, 9.7) |
| 10 | `supprimer_agents_du_compte` | Supprime aussi le compteur du jour (`budgets_personne_jour`) et le journal des messages (`messages_sortants`) de la personne | Deux tables qui portent `user_id` : sans cela elles survivraient au compte, dont la ligne `"user"` reste (carte 07, piège 7) |
| 11 | Actions de simulation | Quand `purger_executions` supprime une simulation, ses actions restent, `execution_id` nul | `actions` ne se supprime jamais. Le chapitre 12 dit si elles s'affichent encore |
| 12 | Activation d'équipe | Tout administrateur peut la régler ou la réactiver ; elle tourne toujours au nom de son activateur | C'est la règle de mise à jour de l'architecture (7.2), appliquée telle quelle. À relire avec la question Q4 |
| 13 | `taux_acceptation_agents` | Deux seuils : trois personnes ont la fiche en service, **et** les actions comptées viennent de trois personnes. Un agent d'équipe n'a jamais de ligne | Le premier seuil seul laisserait lire l'activité d'une personne (9.11) |
| 14 | `preferences_canaux.recap_email` | Vrai par défaut ; sans ligne, le récapitulatif part à 8 h, heure de Paris. « Quelque chose à dire » : une action d'agent en attente et pas expirée, ou une action faite sans clic depuis 24 heures | L'architecture fixe l'heure et le fuseau, pas ce défaut. À confirmer : un e-mail part sans que la personne ait rien réglé |
| 15 | Abonnements d'un membre qui revient | Ils restent `resiliee`, donc jamais recréés ; la relève de 15 minutes continue | Conforme à 8.3. À traiter au chapitre 03 : « Reconnecter » supprime les abonnements `resiliee` de la connexion |
| 16 | Listes fermées en SQL | `veilles.motif` est fermée (un motif de plus : une migration). `evenements.etiquette`, `outil` et `nature` ne le sont pas | 8.4 : ajouter une étiquette est « une PR » dans `labels.ts`. Un motif, lui, change le standard |
| 17 | Bornes internes | `runs_a_signaler` : fenêtre de 3 jours, pas de plafond. Les fonctions à `p_max` : 1 000 au plus. `connexions_du_compte` : 20. `reserver_creneau` : pas de 10 minutes, retard d'une heure. `webhooks_a_traiter` : 30 secondes. `executions_a_reveiller` : 15 minutes en file. `porte_deposer` : `dernier_recu_le` écrit toutes les 10 minutes au plus | Aucune n'est dans l'architecture ; toutes évitent qu'une valeur aberrante ou une ligne oubliée gèle un tic |
| 18 | `solder_budget` à minuit | Une exécution à cheval sur minuit, ou sur la fin du mois, est soldée sur le jour et le mois du solde | La signature ne porte pas la date de la réserve. L'écart est borné par une réservation (0,50 $ au plus) |
| 19 | `actions.decide_par` | Reste nul pour une action annulée par `couper_agents_du_membre` ou `supprimer_agents_du_compte` | Ni un clic, ni l'autonomie |
| 20 | `ACTION_STATUSES` | Gagne `'defaite'` dans la PR de 0080 | 7.5 ne le liste pas, 8.2 le dit. Sans cela `schema-contract` échoue |

### 18.3 Le corps proposé pour `evenements_a_trier` (écart 5)

Non créée par ce chapitre. Écrite ici pour que le chapitre 02 n'ait pas à la réinventer ; elle suit les règles de 7.1 et a été jouée sur la base jetable.

```sql
-- Les personnes qui ont au moins un événement resté « recu » depuis plus de 2 minutes, toutes organisations : le tic
-- standard-lot trie ensuite sous les droits de chacune. Des identifiants seulement. La personne est membre et son
-- compte n'est pas supprimé.
create function evenements_a_trier(p_max integer)
returns table (tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.tenant_id, e.user_id
    from evenements e
    join member m on m."organizationId" = e.tenant_id and m."userId" = e.user_id
    join "user" u on u.id = e.user_id and u.deleted_at is null
   where e.statut = 'recu' and e.cree_le < now() - interval '2 minutes' and e.expire_le > now()
   group by e.tenant_id, e.user_id
   order by min(e.cree_le)
   limit least(greatest(p_max, 0), 1000)
$$;
revoke all on function evenements_a_trier(integer) from public;
grant execute on function evenements_a_trier(integer) to leon_app;
```

## 19. Ce que je n'ai pas vérifié

- **Rien n'a tourné sur la base du projet, ni sur Postgres 17.** Les onze migrations ont été appliquées sur un Postgres 16.15 jetable, monté hors du dépôt puis détruit, avec un schéma minimal que j'ai recopié des migrations 0001 à 0074 : `"user"`, `organization`, `member`, `sources`, `ingest_runs`, `connections`, `discussions`, `actions`, `appels_modele`, `reglages_organisation`, et les quatre fonctions `app_*`. Les 74 migrations réelles n'y ont pas été jouées (`pgvector` n'est pas installé sur cette machine). Une erreur de recopie de ma part dans ce schéma minimal passerait inaperçue : le premier `pnpm db:migrate` sur une vraie base locale est la vérification qui manque.
- **Ce qui a été essayé sur cette base jetable**, à la main, en SQL : chaque fonction, sous `leon_app` avec le contexte de `withTenant`, sous `leon_porte`, et sans contexte ; chaque refus attendu (sécurité par ligne, droit de colonne, `check`, unicité) ; les trois suppressions de parent ; la suppression d'une organisation ; le bloc `do` de 0083 sans le rôle. Deux erreurs ont été trouvées et corrigées ainsi (deux noms de contrainte déjà pris par Postgres).
- **Aucun test vitest n'a été lancé** et aucun TypeScript n'a été compilé : `node_modules` est absent. Les schémas Drizzle, les fixtures et les tests de ce chapitre sont écrits d'après les fichiers voisins. En particulier : ce que rend `getSQLType()` pour `real`, `smallint` et un `customType` dans Drizzle 0.45.4 ; `expect.poll` dans vitest 5 ; le code d'erreur d'un `db.execute` refusé (`error.cause.code`, lu dans les tests existants pour `tx`, supposé identique pour `db`).
- **La durée de `update ingest_runs`** en production (0077) : je ne connais pas le nombre de runs. Il tient le verrou exclusif de l'`alter` jusqu'à la fin.
- **Les plans des fonctions de tic** sur un volume réel. Les index partiels sont posés d'après la forme des requêtes, pas d'après un `explain`.
- **`on delete set null (colonne)`** : vérifié sur Postgres 16, pas sur 17 ; le précédent du dépôt (`0008`) tourne en production.
- **L'affichage du message du bloc `do`** par `pnpm db:migrate` : `migrate-cli.ts` fait `console.error(error)` d'une erreur qui porte sa cause ; je n'ai pas vu la sortie réelle de Node.
- **Les identifiants Slack** (`team_id`, `bot_user_id`, `slack_user_id`) : leur forme est à vérifier dans la documentation de l'éditeur. Les `check` n'exigent que des lettres et des chiffres, 40 au plus.
- **Les noms de fuseaux** acceptés par Postgres et ceux que rend le navigateur : supposés compatibles (noms IANA). `heure_locale` protège le tic si ce n'est pas le cas.
- **Better Auth et la colonne `"user".locale`** : supposée ignorée, comme `about` (0036) et `deleted_at` (0040). Non essayé.
- **La création de `leon_porte` sur RDS** par le compte maître, et l'adresse `DATABASE_URL_PORTE` : chapitre 13.
- **Un octet nul dans le corps d'un webhook** : Postgres le refuse dans un `text`. Le chapitre 03 doit l'écarter avant `porte_deposer` ; non essayé ici.
- **La charge utile de `NOTIFY`** : un identifiant de ligne par notification. Le comportement du worker quand la file de notifications est pleine n'est pas traité ici.
- **Les autres chapitres.** Ils sont écrits en parallèle : je n'ai pas vérifié que le chapitre 04 ferme bien l'exécution d'un membre parti (écart 1), que le chapitre 02 reprend `evenements_a_trier` (écart 5), ni que les chapitres 03 et 07 emploient les états et les clés tels que posés ici.
