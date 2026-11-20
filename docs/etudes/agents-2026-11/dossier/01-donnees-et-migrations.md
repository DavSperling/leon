# 01. Données et migrations

20 novembre 2026 · chapitre du dossier de conception · à relire par David et Amos

Ce chapitre donne tout ce qui entre dans la base pour le système d'agents : le SQL des onze migrations 0075 à 0085, prêt à poser dans `src/server/db/migrations/`, les schémas Drizzle, les tests, et les quatre retouches hors SQL qui vont avec. Il recopie les noms de l'architecture (`00-architecture.md`, section 7) sans en changer un seul. Là où elle ne peut pas être suivie à la lettre, c'est écrit en section 18.

Convention de lecture, comme dans l'architecture :

- **existe** : présent dans le code, avec son chemin et sa ligne. Vérifié par lecture, au commit `fabea06`.
- **à créer** : n'existe pas. Le nom est fixé par l'architecture, ou ici quand elle ne le fixe pas.
- **jalon 1** : fait partie du premier agent chez un client (architecture, 14.3). **après** : vient ensuite.

Ce qui a été joué, et ce qui ne l'a pas été. Les onze fichiers SQL ont été appliqués, dans l'ordre, sur un Postgres 16.15 jetable, après les 61 fichiers de migration du dépôt (`0001` à `0074`), une transaction par fichier comme `migrate.ts`. Une seule retouche à l'existant, dans une copie de travail : pgvector 0.6.0, le seul paquet installable sur la machine, n'a pas le type `halfvec`, et `0011-passages.sql` y a reçu `vector(1024)`. Les schémas Drizzle et les tests de la section 16 y ont été compilés (tsc) et lancés (vitest) avec des copies des fixtures du dépôt : 152 tests, tous passent ; `delete-account.db.test.ts` (16.10) n'a pas tourné. Rien n'a été joué sur la base du projet, ni sur Postgres 17. Le détail est en section 19.

## 1. Ce que ce chapitre fixe

1. **Onze migrations**, `0075` à `0085`, en SQL complet. `0075` à `0081` font le jalon 1. `0082` à `0085` viennent après.
2. **Le corps entier de chaque fonction SQL** de la section 7.4 de l'architecture : 24 fonctions. Plus six que 7.4 n'a pas et que ses règles demandent : `purger_veilles` et `heure_locale` (section 18, écart 7) ; `reserver_budget_execution` et `solder_budget_execution`, la réserve d'une exécution prise et soldée une seule fois, avec leurs deux gestes internes `budget_prendre` et `budget_rendre` (écart 3) ; `lier_slack`, seule écriture du compte Slack d'une personne (écart 23).
3. **Les schémas Drizzle** : trois fichiers à créer (`schema/agents.ts`, `schema/webhooks.ts`, `schema/channels.ts`) et cinq à compléter (`actions.ts`, `connections.ts`, `memory.ts`, `organisation.ts`, `auth.ts`).
4. **Les tests** : un fichier `NNNN-sujet.db.test.ts` par migration, en code complet pour les onze (sections 16.3 à 16.15), un test qui supprime le parent pour chaque clé composée en `set null` (16.5, 16.6, 16.13), un test « autre organisation refusée » par fonction qui écrit, le test « un membre ordinaire ne modifie pas une activation d'équipe ». Les entrées des neuf listes de 7.5, avec la PR où chacune entre (section 15.4).
5. **Cinq retouches hors SQL** : l'appel de `supprimer_agents_du_compte` dans `deleteAccount` ; le rôle `leon_porte` dans `docker/postgres/init.sql` ; la commande du README (le bloc `do` en tête de `0083` y renvoie) ; les entrées des listes de tests de l'architecture (7.5), toutes, avec la PR où chacune entre ; l'état `defaite` dans la carte d'action.

Ce chapitre ne refait pas le sens des colonnes : il est fixé par la section 7 de l'architecture. Il ne dit pas non plus comment le code les lit : c'est l'affaire des chapitres 02 à 07.

## 2. Vue d'ensemble

### 2.1 Les onze migrations

« PR » renvoie au tableau du jalon 1 de l'architecture (14.3).

| Fichier | Jalon | PR | Tables créées | Tables modifiées | Fonctions |
|---|---|---|---|---|---|
| `0075-appels-modele-attribution.sql` | 1 | 3 | | `appels_modele` | |
| `0076-budget-agents.sql` | 1 | 4 | `budgets_agents`, `budgets_personne_jour` | | `budget_prendre` et `budget_rendre` (internes), `reserver_budget`, `solder_budget`, `budget_du_mois` |
| `0077-evenements.sql` | 1 | 5 | `evenements` | `ingest_runs` | `runs_a_signaler`, `purger_evenements` |
| `0078-agents-actives.sql` | 1 | 5 | `agents_actives`, `executions_par_jour` | `reglages_organisation` | `reserver_execution`, `activations_de`, `reprendre_agent_equipe` |
| `0079-executions-agent.sql` | 1 | 6 | `executions_agent`, `etapes_execution` | | `reserver_budget_execution`, `solder_budget_execution`, `executions_a_reveiller`, `purger_executions` |
| `0080-actions-generalisees.sql` | 1 | 7 | | `actions` | `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| `0081-connexions-renouvellement.sql` | 1 | 7 | `creneaux_ecriture` | `connections` | `reserver_creneau` |
| `0082-veilles.sql` | après | veilles et horloge | `veilles` | | `veilles_echues`, `purger_veilles` ; refait `supprimer_agents_du_compte` |
| `0083-webhooks.sql` | après | webhooks | `abonnements_webhook`, `boite_entree_webhooks` | | `porte_secret`, `porte_deposer`, `webhooks_a_traiter`, `prendre_livraison`, `connexions_du_compte`, `abonnements_a_renouveler`, `purger_boite_entree` ; refait `couper_agents_du_membre` |
| `0084-canaux-sortants.sql` | après | récapitulatif et Slack | `preferences_canaux`, `installations_slack`, `messages_sortants` | `"user"` | `heure_locale`, `lier_slack`, `compte_slack`, `recaps_dus` ; refait `supprimer_agents_du_compte` |
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
| Test des fonctions `security definer` | existe | `src/server/db/migrations/0046-pg-temp-en-dernier.db.test.ts` | Il vaut pour les 28 fonctions `security definer` nouvelles (les 24 de l'architecture, `purger_veilles`, `reserver_budget_execution`, `solder_budget_execution`, `lier_slack`) : toutes posent `search_path = public, pg_temp` |
| Runner de migrations | existe | `src/server/db/migrate.ts:15-38` (verrou consultatif ; table `leon_migrations`, comparée par nom de fichier), `:49-59` (une transaction par fichier) | Chaque fichier tient dans une transaction. Renumérotation : section 2.3 |
| Carte d'action de la discussion | existe | `src/components/discussion/action-card.tsx:57-67` | Section 15.5 : le libellé de `defaite` |
| Fonctions de trigger exécutables par PUBLIC | existent | `0020-corrections-audit-2.sql:35-57`, `0055-groupes.sql:73-84` | Aucune retouche ; le test de 16.8 lit les droits accordés, pas `has_function_privilege` |

### 2.3 Règles d'écriture, pour qui relit le SQL

Les règles de l'architecture (7.1) sont appliquées telles quelles. Sept points de plus, appris en écrivant :

1. **Une contrainte nommée à la main ne reprend jamais le nom `table_colonne_check`.** Postgres donne ce nom au `check` écrit sur la colonne : `actions_origine_check` existait déjà au moment d'ajouter la contrainte de table. D'où `actions_origine_cle_check`, `boite_entree_webhooks_cible_check`.
2. **Une seule contrainte par colonne contient `colonne = any (…)`.** Le contrat de schéma (`schema-contract.db.test.ts:53-62`) prend la première contrainte qui contient `(colonne = ANY` et la compare à l'`enum` Drizzle. Une seconde contrainte sur la même colonne s'écrit donc avec des `or` (`actions_simulation_statut_check`).
3. **`appels_modele.step` garde `in (…)`.** Aucune autre migration qui cite `appels_modele` n'écrit `step in (` : le contrat `llm-contract` lirait cette liste à la place.
4. **Une fonction qui rend une table qualifie toutes ses colonnes** (`a.tenant_id`, jamais `tenant_id`) : les colonnes de sortie portent souvent le nom d'une colonne lue. En `plpgsql`, `prendre_livraison` ajoute `#variable_conflict use_column`.
5. **Chaque migration reste compatible avec le code d'avant**, qui tourne encore pendant le recouvrement d'une mise en ligne (architecture, 4.1, règle 6). Toute colonne ajoutée à une table existante est nulle ou a un défaut.
6. **Un `alter table` ou un `create index` sur une table existante pose `set local lock_timeout = '5s'`**, comme `0069-roles-coulisses.sql` : c'est le cas de 0075, 0077, 0078, 0080, 0081, 0084 et 0085. Le verrou d'un `alter` (exclusif) ou d'un `create index` (qui bloque les écritures ; `concurrently` est impossible dans la transaction du runner) tient jusqu'à la fin de la transaction, et la demande de verrou fait attendre derrière elle toutes les requêtes suivantes de la table. Sans lui en 5 secondes, la migration échoue et se relance.
7. **Une table hors de portée de l'app (modèle H) a la sécurité par ligne activée, sans règle et sans droit**, qu'elle porte `tenant_id` ou non. Sans droit, `leon_app` n'y accède déjà pas ; la sécurité par ligne couvre le jour où un droit serait accordé par erreur.

Numéros. Les numéros 0075 à 0085 sont réservés par l'architecture. Avant d'ouvrir une PR : `git fetch origin` puis `gh pr list`. Si `main` a pris un de ces numéros, tout le bloc se décale d'autant. Trois choses suivent alors le fichier : le nom de son test, les renvois d'un fichier à l'autre dans les commentaires SQL (« 0079 », « 0080 », « 0082 », « 0083 », « 0084 »), et les commentaires des schémas Drizzle.

Et une quatrième, sur les bases locales. Le runner compare par nom de fichier, pas par contenu (`migrate.ts:26-29`, table `leon_migrations`) : une base où l'ancien nom est déjà appliqué (`pnpm db:migrate` sur la base `leon`, ou `pnpm test:db` sur `leon_test`, partagée, y compris chez celui qui a relu la branche) rejouerait le fichier renommé, et il échouerait sur le premier `create table`. Ce chapitre n'écrit pas ses fichiers sous des formes rejouables (`if not exists` partout) : elles cacheraient un vrai écart entre deux bases. Après une renumérotation, on renomme la ligne du runner, une fois par base touchée, avec le compte propriétaire :

```sql
update leon_migrations set name = '0078-evenements.sql' where name = '0077-evenements.sql';  -- un update par fichier décalé
```

puis `pnpm db:migrate` applique le fichier de `main` qui a pris le numéro. Les deux s'y trouvent alors dans l'ordre inverse de la production : sans effet s'ils ne touchent pas les mêmes objets, sinon on recrée la base locale (`docker compose down -v`, puis `docker compose up -d` et `pnpm db:migrate`). La production ne voit jamais l'ancien nom : une PR n'est fusionnée qu'après la renumérotation. C'est la solution de la carte 07 (piège 15, `0070` rendue rejouable par `add column if not exists`) appliquée autrement : une ligne de SQL par base au lieu d'un fichier réécrit.

### 2.4 Qui a quel droit sur quelle table

P : privée à la personne. O : organisation. H : hors de portée de l'app. Ce sont les trois modèles de l'architecture (7.1).

| Table | Modèle | `leon_app` peut | Règles | Écrite aussi par |
|---|---|---|---|---|
| `appels_modele` | à part | insérer | `insertion_seule` | |
| `budgets_agents`, `budgets_personne_jour` | H | rien | aucune | `budget_prendre` et `budget_rendre`, par les quatre fonctions du budget, `purger_executions` et `supprimer_agents_du_compte` |
| `evenements` | P | lire, insérer, modifier `etiquette`, `urgence`, `confiance`, `trie_par`, `statut`, `raison` | `tenant_acl`, `own_source` | `purger_evenements`, `supprimer_agents_du_compte` |
| `agents_actives` | P ou lisible de l'organisation, selon `portee` ; une ligne par fiche, personne et portée | lire, insérer, modifier `autonomie`, `reglages`, `actif`, `modifie_le` | `tenant_acl`, `activateur_insert`, `activateur_update` | `reprendre_agent_equipe`, `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| `executions_par_jour` | H | rien | aucune | `reserver_execution` |
| `executions_agent` | P | lire, insérer, modifier les quatorze colonnes d'état (pas la réserve de budget) | `tenant_acl`, `own_activation` | `reserver_budget_execution`, `solder_budget_execution` (`reserve_usd`, `reserve_jour`, `solde_le`), `purger_executions`, `supprimer_agents_du_compte` |
| `etapes_execution` | l'accès de son exécution | lire, insérer, modifier `statut`, `sortie`, `fini_le` | `tenant_acl`, `same_acl_as_execution` | `purger_executions` |
| `actions` | P | lire, insérer, modifier `status`, `result`, `decided_at`, `decide_par`, `annulation`, `defaite_le` | `tenant_acl`, `own_discussion_and_connection` | `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| `creneaux_ecriture` | H | rien | aucune | `reserver_creneau` |
| `veilles` | P | lire, insérer, modifier `etat`, `echeance_le`, `close_le` | `tenant_acl`, `own_activation` | `purger_veilles`, `supprimer_agents_du_compte` |
| `abonnements_webhook` | P | lire, insérer, supprimer, modifier `externe_id`, `secret`, `etat`, `expire_le`, `renouveler_le`, `renouvele_le`, `erreur` | `tenant_acl`, `own_connection` | `porte_deposer` (`dernier_recu_le`), `couper_agents_du_membre` |
| `boite_entree_webhooks` | H | rien | aucune | `porte_deposer`, `prendre_livraison`, `purger_boite_entree` |
| `preferences_canaux` | P | lire, insérer sans `slack_user_id`, modifier `recap_email`, `recap_heure`, `fuseau`, `slack` | `tenant_acl`, `slack_par_lier_slack` | `lier_slack` (`slack_user_id`), `supprimer_agents_du_compte` |
| `installations_slack` | O | lire, insérer, supprimer, modifier `team_id`, `bot_token`, `bot_user_id`, `installe_par` | `tenant_only`, `admin_insert`, `admin_update`, `admin_delete` | |
| `messages_sortants` | P | lire, insérer, modifier `statut`, `envoye_le` | `tenant_acl` | `supprimer_agents_du_compte` |

Aucune de ces tables ne reçoit de règle `equipe_lit` : la vue manager (0057) ne s'y applique pas (architecture, 9.11). Le rôle `leon_porte` n'a de droit sur aucune table.

### 2.5 Les fonctions

« Pour soi » : l'organisation et la personne viennent de `app_tenant()` et `app_user()`. « Hors contexte » : la fonction travaille pour plusieurs organisations et ne rend que des identifiants ou des compteurs, `prendre_livraison` exceptée (écart E18). Toutes sont `security definer set search_path = public, pg_temp`, retirées à `public`, accordées au seul rôle indiqué, sauf les trois fonctions internes (`budget_prendre`, `budget_rendre`, `heure_locale`) : ni `security definer`, ni accordées, appelées seulement par des fonctions de ce tableau.

| Fonction | Rend | Contexte | Accordée à | Migration |
|---|---|---|---|---|
| `budget_prendre(p_tenant uuid, p_user uuid, p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric, p_compter_jour boolean)` (ajout, interne) | `boolean` | sans objet | personne | 0076 |
| `budget_rendre(p_tenant uuid, p_user uuid, p_reserve_usd numeric, p_reel_usd numeric, p_compter_jour boolean)` (ajout, interne) | `void` | sans objet | personne | 0076 |
| `reserver_budget(p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric)` | `boolean` ; lève `22023` sur une valeur négative ou absente | pour soi | `leon_app` | 0076 |
| `solder_budget(p_reserve_usd numeric, p_reel_usd numeric)` | `void` ; lève `22023` | pour soi | `leon_app` | 0076 |
| `budget_du_mois()` | `(reserve_usd numeric, depense_usd numeric)` | pour soi, administrateur | `leon_app` | 0076 |
| `runs_a_signaler(p_minutes integer)` | `(ingest_run_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0077 |
| `purger_evenements()` | `integer` | hors contexte | `leon_app` | 0077 |
| `reserver_execution(p_activation uuid, p_plafond integer)` | `boolean` | pour soi | `leon_app` | 0078 |
| `activations_de(p_agent text)` | `(activation_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0078 |
| `reprendre_agent_equipe(p_activation uuid)` | `boolean` | pour soi, administrateur | `leon_app` | 0078 |
| `reserver_budget_execution(p_execution uuid, p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric)` (ajout) | `boolean` ; lève `22023` | pour soi | `leon_app` | 0079 |
| `solder_budget_execution(p_execution uuid, p_reel_usd numeric)` (ajout) | `void` ; lève `22023` | pour soi | `leon_app` | 0079 |
| `executions_a_reveiller(p_max integer)` | `(execution_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0079 |
| `purger_executions(p_jours_simulation integer, p_jours_contenu integer)` | `integer` | hors contexte | `leon_app` | 0079 |
| `couper_agents_du_membre(p_user uuid, p_equipe_seulement boolean)` | `integer` ; lève `28000` sans contexte | pour soi, administrateur | `leon_app` | 0080, refaite en 0083 |
| `supprimer_agents_du_compte()` | `integer` ; lève `28000` sans contexte | pour soi | `leon_app` | 0080, refaite en 0082 et 0084 |
| `reserver_creneau(p_connection uuid, p_pas_ms integer, p_retard_ms integer)` | `integer`, ou nul | pour soi | `leon_app` | 0081 |
| `veilles_echues(p_max integer)` | `(veille_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0082 |
| `purger_veilles(p_jours integer)` (ajout) | `integer` | hors contexte | `leon_app` | 0082 |
| `porte_secret(p_outil text, p_abonnement uuid)` | `(tenant_id uuid, secret text)` | hors contexte | `leon_porte` | 0083 |
| `porte_deposer(p_outil text, p_abonnement uuid, p_compte text, p_genre text, p_livraison text, p_corps text, p_entetes jsonb)` | `integer` | hors contexte | `leon_porte` | 0083 |
| `webhooks_a_traiter(p_max integer)` | `(id uuid, tenant_id uuid)` | hors contexte | `leon_app` | 0083 |
| `prendre_livraison(p_id uuid)` | `(tenant_id uuid, user_id uuid, outil text, portee text, genre text, abonnement_id uuid, compte text, corps text, entetes jsonb)` | hors contexte, dans une transaction (section 11) | `leon_app` | 0083 |
| `connexions_du_compte(p_tenant uuid, p_outil text, p_compte text)` | `(connection_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0083 |
| `abonnements_a_renouveler(p_max integer)` | `(abonnement_id uuid, tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0083 |
| `purger_boite_entree()` | `integer` | hors contexte | `leon_app` | 0083 |
| `heure_locale(p_fuseau text)` (ajout, interne) | `timestamp`, ou nul | sans objet | personne | 0084 |
| `lier_slack(p_slack_user text)` (ajout) | `boolean` | pour soi | `leon_app` | 0084 |
| `compte_slack(p_team text, p_slack_user text)` | `(tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0084 |
| `recaps_dus(p_max integer)` | `(tenant_id uuid, user_id uuid)` | hors contexte | `leon_app` | 0084 |
| `taux_acceptation_agents(p_jours integer)` | `(agent_id text, proposees integer, faites integer, annulees integer, expirees integer, defaites integer, faites_sans_clic integer)` | pour soi, administrateur | `leon_app` | 0085 |

Appel depuis TypeScript, comme `reserver_point` aujourd'hui (`src/server/briefing/briefings.ts:110`). Une fonction « pour soi » s'appelle dans `withTenant` ; une fonction hors contexte s'appelle sur `db`, sauf `prendre_livraison`, qui s'appelle dans une transaction sans contexte (section 11). Une fonction du budget verrouille la ligne du mois de l'organisation jusqu'à la fin de la transaction : elle s'appelle dans son propre `withTenant`, court, jamais dans la transaction d'une étape qui attend le modèle ou un outil (architecture, 9.4).

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
| Test | `0075-appels-modele-attribution.db.test.ts` (section 16.11, code complet) |
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
| Crée | `budgets_agents`, `budgets_personne_jour`, `budget_prendre` et `budget_rendre` (internes, ajout), `reserver_budget`, `solder_budget`, `budget_du_mois` |
| Test | `0076-budget-agents.db.test.ts` (section 16.3, code complet) |
| Drizzle | rien : les deux tables sont hors de portée de l'app, comme `points_par_jour` |

```sql
-- 0076-budget-agents.sql : le budget des agents, réservé avant chaque exécution et soldé après (dossier agents, 9.3).
--
-- Deux compteurs sans aucun texte, comme points_par_jour (0060) : par organisation et par mois, par personne et par
-- jour (UTC). Qui écrit : le tri, par reserver_budget puis solder_budget, et le moteur d'agents, par
-- reserver_budget_execution puis solder_budget_execution (0079), toujours sous le contexte de la personne au nom de
-- qui le travail est fait (withTenant) ; les purges, par budget_rendre. Qui lit : le poste de contrôle, par
-- budget_du_mois(), pour les administrateurs seulement. Interdit : tout accès direct. Les deux tables ont la sécurité
-- par ligne, sans aucune règle, et leon_app n'y a aucun droit.
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

-- Les deux gestes internes, partagés par les quatre fonctions du budget (ici, et reserver_budget_execution et
-- solder_budget_execution en 0079) et par les purges. Ils reçoivent l'organisation et la personne en paramètre : ils
-- ne sont donc accordés à personne (revoke from public), et seules des fonctions security definer les appellent.

-- Prend p_usd sur le mois de l'organisation et, si p_compter_jour, sur la journée de la personne, ou rien du tout.
-- Faux : un plafond serait dépassé. Le mois est verrouillé puis le jour, toujours dans cet ordre (budget_rendre
-- aussi) : les réservations d'une même organisation passent l'une après l'autre, sans interblocage. Ce verrou tient
-- jusqu'à la fin de la transaction de l'appelant : elle doit être courte (section 2.5).
create function budget_prendre(
  p_tenant uuid, p_user uuid, p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric,
  p_compter_jour boolean)
returns boolean
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_mois date := date_trunc('month', now() at time zone 'UTC')::date;
  v_jour date := (now() at time zone 'UTC')::date;
  v_pris_mois numeric;
  v_pris_jour numeric;
begin
  insert into budgets_agents (tenant_id, mois) values (p_tenant, v_mois) on conflict do nothing;
  select b.reserve_usd + b.depense_usd into v_pris_mois
    from budgets_agents b where b.tenant_id = p_tenant and b.mois = v_mois for update;
  if v_pris_mois + p_usd > p_plafond_mois_usd then
    return false;
  end if;

  if p_compter_jour then
    -- Les jours passés de la personne s'effacent au passage, comme dans reserver_point.
    delete from budgets_personne_jour j where j.tenant_id = p_tenant and j.user_id = p_user and j.jour < v_jour;
    insert into budgets_personne_jour (tenant_id, user_id, jour) values (p_tenant, p_user, v_jour)
      on conflict do nothing;
    select j.usd into v_pris_jour
      from budgets_personne_jour j
     where j.tenant_id = p_tenant and j.user_id = p_user and j.jour = v_jour for update;
    if p_plafond_jour_usd is not null and v_pris_jour + p_usd > p_plafond_jour_usd then
      return false;
    end if;
    update budgets_personne_jour j set usd = j.usd + p_usd
     where j.tenant_id = p_tenant and j.user_id = p_user and j.jour = v_jour;
  end if;

  update budgets_agents b set reserve_usd = b.reserve_usd + p_usd
   where b.tenant_id = p_tenant and b.mois = v_mois;
  return true;
end
$$;
revoke all on function budget_prendre(uuid, uuid, numeric, numeric, numeric, boolean) from public;

-- Rend p_reserve_usd et compte p_reel_usd : sur le mois de l'organisation, et sur la journée de la personne si
-- p_compter_jour. reserve_usd ne passe jamais sous zéro ; depense_usd ne baisse jamais.
-- Une exécution qui passe minuit, ou la fin du mois, est soldée sur le jour et le mois du solde : l'écart reste borné
-- par une réservation (limits.maxUsd, 0,50 $ au plus).
create function budget_rendre(
  p_tenant uuid, p_user uuid, p_reserve_usd numeric, p_reel_usd numeric, p_compter_jour boolean)
returns void
language plpgsql volatile set search_path = public, pg_temp as $$
declare
  v_mois date := date_trunc('month', now() at time zone 'UTC')::date;
  v_jour date := (now() at time zone 'UTC')::date;
begin
  insert into budgets_agents as b (tenant_id, mois, reserve_usd, depense_usd)
  values (p_tenant, v_mois, 0, p_reel_usd)
  on conflict (tenant_id, mois) do update
    set reserve_usd = greatest(b.reserve_usd - p_reserve_usd, 0),
        depense_usd = b.depense_usd + p_reel_usd;

  if p_compter_jour then
    insert into budgets_personne_jour as j (tenant_id, user_id, jour, usd)
    values (p_tenant, p_user, v_jour, p_reel_usd)
    on conflict (tenant_id, user_id, jour) do update
      set usd = greatest(j.usd - p_reserve_usd + p_reel_usd, 0);
  end if;
end
$$;
revoke all on function budget_rendre(uuid, uuid, numeric, numeric, boolean) from public;

-- Réserve p_usd pour la personne courante, sur le mois de son organisation et sur sa journée, ou rien du tout. C'est
-- la réserve du tri (architecture, 9.3, point 6), qui n'a pas d'exécution ; une exécution réserve par
-- reserver_budget_execution (0079), qui ne réserve qu'une fois. Vrai : réservé. Faux : un plafond serait dépassé, ou il
-- n'y a pas de contexte. Une valeur négative ou absente, ou un plafond négatif, est une faute du code : elle lève
-- (22023), rien n'est écrit. p_plafond_jour_usd nul : la journée est comptée sans plafond.
create function reserver_budget(p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_usd is null or p_usd < 0 or p_plafond_mois_usd is null or p_plafond_mois_usd < 0
     or p_plafond_jour_usd < 0 then
    raise exception 'reserver_budget : valeur négative ou absente' using errcode = '22023';
  end if;
  if app_tenant() is null or app_user() is null then
    return false;
  end if;
  return budget_prendre(app_tenant(), app_user(), p_usd, p_plafond_mois_usd, p_plafond_jour_usd, true);
end
$$;
revoke all on function reserver_budget(numeric, numeric, numeric) from public;
grant execute on function reserver_budget(numeric, numeric, numeric) to leon_app;

-- Solde une réservation de reserver_budget pour la personne courante : rend p_reserve_usd et compte p_reel_usd, dans
-- les deux tables. Une valeur négative ou absente est une faute du code : elle lève (22023), rien n'est écrit. Sans
-- contexte : rien. Rien ne relie cette réserve à un appelant : un solde rejoué rend deux fois. D'où, pour une
-- exécution, solder_budget_execution (0079).
create function solder_budget(p_reserve_usd numeric, p_reel_usd numeric)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
begin
  if p_reserve_usd is null or p_reel_usd is null or p_reserve_usd < 0 or p_reel_usd < 0 then
    raise exception 'solder_budget : valeur négative ou absente' using errcode = '22023';
  end if;
  if app_tenant() is null or app_user() is null then
    return;
  end if;
  perform budget_rendre(app_tenant(), app_user(), p_reserve_usd, p_reel_usd, true);
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
- **Deux gestes internes, quatre fonctions.** `budget_prendre` et `budget_rendre` portent la logique ; ils reçoivent l'organisation et la personne en paramètre, donc ne sont accordés à personne, comme `heure_locale` (0084). `reserver_budget` et `solder_budget` (la réserve du tri, pour soi) et `reserver_budget_execution` et `solder_budget_execution` (la réserve d'une exécution, 0079) ne font que vérifier puis les appeler.
- **Le tri compte toujours la journée.** `reserver_budget` et `solder_budget` écrivent les deux tables : la réserve du tri n'est liée à rien, et son solde ne saurait pas si la journée avait été touchée. Un plafond du jour nul veut dire « ne pas comparer ». La règle de l'architecture (9.3, point 5) pour un agent d'équipe, « pas soumis au plafond du jour », est tenue par `reserver_budget_execution`, qui lit la portée de l'activation (section 7).
- **Refus et fautes.** `reserver_budget` rend faux pour un plafond atteint, sans lever : c'est un cas nominal (l'élément est `ignore`, raison `budget`). Une valeur négative ou absente, ou un plafond négatif, ne peut être qu'une faute du code : elle lève `22023`, comme dans `solder_budget`. Le code distingue ainsi « plafond atteint » d'une erreur de calcul de `limits.maxUsd`. Sans contexte : faux, rien n'est écrit.
- **Le verrou du mois sérialise une organisation.** `budget_prendre` prend `for update` sur l'unique ligne `budgets_agents (tenant_id, mois)` ; Postgres la garde jusqu'à la fin de la transaction de l'appelant. Deux réservations simultanées de la même organisation passent donc l'une après l'autre, sans interblocage (même ordre de verrous partout). D'où la règle d'appel : chaque fonction du budget s'appelle dans son propre `withTenant`, court, jamais dans la transaction d'une étape (section 2.5 ; architecture, 9.4).
- **Le solde du tri n'est pas idempotent.** Rien ne relie la réserve du tri à un appel : un solde rejoué rendrait deux fois, une réserve perdue (processus tué entre la réserve et le solde) reste comptée jusqu'à la fin du mois. L'écart est borné par `TRIAGE_RESERVE_USD`, une fraction de centime. Une exécution, elle, réserve 0,50 $ au plus et peut être rejouée : elle passe par les fonctions idempotentes de 0079.
- **`budget_du_mois` ne dit rien à un membre ordinaire** : aucune ligne. Le code distingue ainsi « pas le droit » de « zéro ».
- **Ce que la fonction ne sait pas.** Le plafond du mois est passé par le code (`reglages_organisation.agents_budget_mois_usd`, ou `AGENTS_BUDGET_USD_PER_SEAT` fois le nombre de membres) : la base ne le calcule pas. L'alerte à 80 % n'a donc pas de lecture ici (écart 6).

## 5. Migration 0077 : les événements du standard

| | |
|---|---|
| Fichier | `src/server/db/migrations/0077-evenements.sql` (à créer) |
| Jalon | 1, PR 5 (« Événements, règles, routage ») |
| Touche | `ingest_runs` (existe) |
| Crée | `evenements`, `runs_a_signaler`, `purger_evenements` |
| Test | `0077-evenements.db.test.ts` (section 16.12, code complet : il supprime la source) |
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
  -- Une activation par fiche, par personne et par portée : un administrateur peut avoir la fiche pour lui et l'avoir
  -- activée pour l'équipe (écart 21 ; l'architecture, 7.2, écrit la clé sans la portée).
  unique (tenant_id, agent_id, user_id, portee),
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
-- courante, ou son activateur est encore valable. Aucun autre refus : la clé unique porte la portée, et il n'y a
-- qu'une activation d'équipe par fiche, donc changer user_id ne peut heurter aucune ligne.
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
- **La clé unique porte la portée** : `(tenant_id, agent_id, user_id, portee)`, et non `(tenant_id, agent_id, user_id)` comme l'écrit l'architecture (7.2). Sans elle, un fondateur qui essaie une fiche pour lui ne pourrait plus l'activer pour l'équipe, ni l'inverse, et `reprendre_agent_equipe` échouerait pour un repreneur qui a la fiche à titre personnel (écart 21). L'index partiel `agents_actives_equipe_idx` garde une seule activation d'équipe par fiche. Conséquence pour le routage (chapitre 02) : un événement d'une source visible de toute l'organisation, chez l'administrateur qui a les deux activations, réveille les deux ; ce sont deux exécutions (la clé d'exécution contient l'activation), donc au plus deux propositions sur le même objet.
- **`reglages_organisation` peut ne pas avoir de ligne.** Les trois défauts sont ceux des colonnes ; `activations_de` les applique par `left join` et `coalesce`. L'écriture d'un réglage est un `insert … on conflict (tenant_id) do update`.

## 7. Migration 0079 : les exécutions et leur journal

| | |
|---|---|
| Fichier | `src/server/db/migrations/0079-executions-agent.sql` (à créer) |
| Jalon | 1, PR 6 (« Moteur linéaire ») |
| Crée | `executions_agent`, `etapes_execution`, `reserver_budget_execution` et `solder_budget_execution` (ajout), `executions_a_reveiller`, `purger_executions` |
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
-- contexte de la personne au nom de qui l'exécution tourne ; la réserve de budget, par les deux fonctions du budget
-- d'une exécution ; purger_executions, qui ferme une exécution abandonnée et solde une réserve oubliée. Qui lit : elle
-- seule. Privé à la personne (acl = [user_id], contrôlé par la base), agent d'équipe compris : ni l'équipe, ni un
-- manager, ni un administrateur (9.11 : pas un mouchard). Interdit : supprimer par l'app ; garder le brut (une étape
-- « lire » ou « chercher » ne laisse que des identifiants de sources et une empreinte) ; lire evenements depuis le
-- moteur (source_id et cle_objet sont recopiés ici au routage).

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
  -- Le nombre de reprises d'un déroulé mort (verrou périmé repris). À 3, le tic ne la rend plus, et purger_executions
  -- la ferme « echouee », raison « erreur » : une exécution qui fait tomber le moteur ne tourne pas sans fin.
  reprises smallint not null default 0 check (reprises >= 0),
  attend_cle text check (char_length(attend_cle) <= 200),
  reveil_le timestamptz,
  -- TOUTES les sources fournies au modèle : si l'une n'est plus visible du lecteur, le détail n'est pas rendu.
  source_ids uuid[] not null default '{}',
  cout_usd numeric(12, 5) not null default 0 check (cout_usd >= 0),
  nb_appels_modele integer not null default 0 check (nb_appels_modele >= 0),
  -- La réserve de budget de l'exécution, écrite par reserver_budget_execution seulement : nulle tant que rien n'est
  -- réservé ; le montant réservé ensuite, gardé après le solde. reserve_jour : la journée de la personne a été
  -- comptée (faux pour un agent d'équipe, 9.3). solde_le : la réserve a été soldée, une seule fois.
  reserve_usd numeric(12, 5) check (reserve_usd >= 0),
  reserve_jour boolean,
  solde_le timestamptz,
  -- Un code ou un message fixe du moteur : jamais le texte d'un outil ni d'un modèle.
  erreur text check (char_length(erreur) <= 300),
  cree_le timestamptz not null default now(),
  commence_le timestamptz,
  fini_le timestamptz,
  -- Privée à la personne, quoi qu'écrive le code : l'accès ne peut être que [user_id].
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, id),
  unique (tenant_id, cle),
  -- Une exécution « en-cours » porte toujours son verrou : le tic ne peut pas prendre pour mort un déroulé dont le
  -- statut et le verrou s'écriraient en deux temps.
  constraint executions_agent_verrou_check check (statut <> 'en-cours' or verrou_le is not null),
  constraint executions_agent_reserve_check check (
    (reserve_usd is null) = (reserve_jour is null) and (solde_le is null or reserve_usd is not null)),
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

-- Ajouter, puis ne changer que l'état. Ni suppression, ni changement de fiche, de clé ou de personne, ni de la réserve
-- de budget (reserve_usd, reserve_jour, solde_le : les fonctions du budget seulement).
grant select, insert on executions_agent to leon_app;
grant update (statut, raison, contenu_externe, donnees_privees, verrou_le, reprises, attend_cle, reveil_le,
              source_ids, cout_usd, nb_appels_modele, erreur, commence_le, fini_le)
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

-- Le budget d'une exécution (architecture, 9.3). Réserver et solder par l'exécution, et non par un montant, rend les
-- deux gestes sûrs quand le moteur rejoue un déroulé depuis le début (9.2) : la réserve est prise une fois, soldée une
-- fois, et purger_executions solde celle qu'un processus tué a laissée.

-- Réserve p_usd pour l'exécution p_execution de la personne courante, ou rien du tout. Vrai : réservé, maintenant ou
-- déjà (une reprise ne réserve pas deux fois). Faux : un plafond serait dépassé ; l'exécution n'est pas celle de la
-- personne dans l'organisation courante ; il n'y a pas de contexte. La journée de la personne n'est comptée, et son
-- plafond comparé, que pour un agent personnel : l'exécution d'un agent d'équipe n'y est pas soumise (9.3, point 5).
-- Une valeur négative ou absente, ou un plafond négatif, lève (22023).
create function reserver_budget_execution(
  p_execution uuid, p_usd numeric, p_plafond_mois_usd numeric, p_plafond_jour_usd numeric)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_reserve numeric;
  v_jour boolean;
begin
  if p_usd is null or p_usd < 0 or p_plafond_mois_usd is null or p_plafond_mois_usd < 0
     or p_plafond_jour_usd < 0 then
    raise exception 'reserver_budget_execution : valeur négative ou absente' using errcode = '22023';
  end if;
  if v_tenant is null or v_user is null then
    return false;
  end if;

  select e.reserve_usd,
         not exists (
           select 1 from agents_actives a
            where a.tenant_id = e.tenant_id and a.id = e.activation_id and a.portee = 'equipe')
    into v_reserve, v_jour
    from executions_agent e
   where e.id = p_execution and e.tenant_id = v_tenant and e.user_id = v_user
     for update;
  if not found then
    return false;
  end if;
  if v_reserve is not null then
    return true;
  end if;

  if not budget_prendre(v_tenant, v_user, p_usd, p_plafond_mois_usd, p_plafond_jour_usd, v_jour) then
    return false;
  end if;
  update executions_agent e set reserve_usd = p_usd, reserve_jour = v_jour where e.id = p_execution;
  return true;
end
$$;
revoke all on function reserver_budget_execution(uuid, numeric, numeric, numeric) from public;
grant execute on function reserver_budget_execution(uuid, numeric, numeric, numeric) to leon_app;

-- Solde la réserve de l'exécution p_execution de la personne courante : rend ce qu'elle a réservé et compte p_reel_usd,
-- sur le mois et, si la réserve l'avait comptée, sur la journée. Une seule fois : un solde rejoué, une exécution sans
-- réserve, celle d'un autre ou un appel sans contexte ne font rien. Une valeur négative ou absente lève (22023).
create function solder_budget_execution(p_execution uuid, p_reel_usd numeric)
returns void
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_reserve numeric;
  v_jour boolean;
begin
  if p_reel_usd is null or p_reel_usd < 0 then
    raise exception 'solder_budget_execution : valeur négative ou absente' using errcode = '22023';
  end if;

  update executions_agent e set solde_le = now()
   where e.id = p_execution and e.tenant_id = v_tenant and e.user_id = v_user
     and e.reserve_usd is not null and e.solde_le is null
  returning e.reserve_usd, e.reserve_jour into v_reserve, v_jour;
  if not found then
    return;
  end if;
  perform budget_rendre(v_tenant, v_user, v_reserve, p_reel_usd, v_jour);
end
$$;
revoke all on function solder_budget_execution(uuid, numeric) from public;
grant execute on function solder_budget_execution(uuid, numeric) to leon_app;

-- Lecture hors sécurité par ligne, pour le tic agent-reveils : des identifiants seulement, toutes organisations.
-- Trois cas : une minuterie échue (« en-attente », reveil_le passé) ; un déroulé mort (« en-cours », verrou de plus
-- de 2 minutes), repris moins de 3 fois ; un job perdu entre l'écriture de la ligne et l'envoi en file (« en-file »
-- depuis plus de 15 minutes). Le tic remet un job en file, dédoublonné par l'identifiant de l'exécution.
-- L'exécution d'une personne partie est rendue aussi : c'est le moteur qui la ferme (« annulee », raison « parti »).
create function executions_a_reveiller(p_max integer)
returns table (execution_id uuid, tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select e.id, e.tenant_id, e.user_id
    from executions_agent e
   where (e.statut = 'en-attente' and e.reveil_le <= now())
      or (e.statut = 'en-cours' and e.verrou_le < now() - interval '2 minutes' and e.reprises < 3)
      or (e.statut = 'en-file' and e.cree_le < now() - interval '15 minutes')
   order by e.cree_le, e.id
   limit least(greatest(p_max, 0), 1000)
$$;
revoke all on function executions_a_reveiller(integer) from public;
grant execute on function executions_a_reveiller(integer) to leon_app;

-- La purge de l'heure, toutes organisations (9.6). Dans l'ordre :
-- 1. ferme « echouee », raison « erreur », une exécution « en-cours » au verrou périmé déjà reprise 3 fois (le tic ne
--    la rend plus) ;
-- 2. solde la réserve d'une exécution finie qui ne l'a pas été (processus tué entre la fin et le solde, personne
--    partie), au coût connu (cout_usd) ;
-- 3. supprime les simulations de plus de p_jours_simulation jours (leurs étapes partent en cascade) ;
-- 4. vide l'entrée et la sortie des étapes de plus de p_jours_contenu jours, et tout de suite celles d'une exécution
--    dont une source lue (source_ids) n'existe plus.
-- Rend le nombre de lignes touchées.
-- shortcut: la recherche d'une source disparue relit, à chaque passage, les étapes qui portent encore un contenu
-- (30 jours au plus). À remplacer par un passage déclenché à la suppression d'une source si la table grossit.
create function purger_executions(p_jours_simulation integer, p_jours_contenu integer)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_fermees integer;
  v_soldees integer := 0;
  v_simulations integer;
  v_videes integer;
  v_oubliee record;
begin
  with fermees as (
    update executions_agent e
       set statut = 'echouee', raison = 'erreur', erreur = 'reprises', fini_le = now()
     where e.statut = 'en-cours' and e.verrou_le < now() - interval '2 minutes' and e.reprises >= 3
    returning 1
  )
  select count(*)::integer into v_fermees from fermees;

  for v_oubliee in
    update executions_agent e set solde_le = now()
     where e.statut = any (array['faite', 'echouee', 'annulee', 'ignoree'])
       and e.reserve_usd is not null and e.solde_le is null
    returning e.tenant_id, e.user_id, e.reserve_usd, e.cout_usd, e.reserve_jour
  loop
    perform budget_rendre(v_oubliee.tenant_id, v_oubliee.user_id, v_oubliee.reserve_usd, v_oubliee.cout_usd,
                          v_oubliee.reserve_jour);
    v_soldees := v_soldees + 1;
  end loop;

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

  return v_fermees + v_soldees + v_simulations + v_videes;
end
$$;
revoke all on function purger_executions(integer, integer) from public;
grant execute on function purger_executions(integer, integer) to leon_app;
```

À savoir :

- **Les colonnes d'état que l'app peut changer** : `statut`, `raison`, `contenu_externe`, `donnees_privees`, `verrou_le`, `reprises`, `attend_cle`, `reveil_le`, `source_ids`, `cout_usd`, `nb_appels_modele`, `erreur`, `commence_le`, `fini_le`. Ni la fiche, ni la clé, ni le cran, ni la personne, ni la réserve de budget.
- **Prendre le verrou** (chapitre 04) est un `update` atomique, comme `claimConnection` (`src/server/connectors/connections.ts:391`). Il compte une reprise quand il prend un déroulé mort : dans le `set`, `statut` est encore l'ancienne valeur.

  ```sql
  update executions_agent
     set statut = 'en-cours', verrou_le = now(), commence_le = coalesce(commence_le, now()),
         reprises = reprises + case when statut = 'en-cours' then 1 else 0 end
   where id = $1 and (statut in ('en-file', 'en-attente')
          or (statut = 'en-cours' and verrou_le < now() - interval '2 minutes' and reprises < 3))
  returning id, reprises
  ```

- **Une exécution qui fait tomber le moteur s'arrête.** `reprises` compte les verrous morts repris. À 3, `executions_a_reveiller` ne la rend plus, la requête du verrou ne la prend plus, et `purger_executions` la ferme dans l'heure : `echouee`, raison `erreur`, `erreur = 'reprises'`, réserve soldée. Une minuterie (`en-attente`) ou un job remis en file ne comptent pas : seules les morts comptent. Les `retries` de `step()` (chapitre 04) bornent une étape ; `reprises` borne l'exécution.
- **`en-cours` porte toujours son verrou** (`executions_agent_verrou_check`). Le tic n'a donc plus de cas `verrou_le is null` : une ligne passée `en-cours` sans verrou est refusée par la base au lieu d'être prise pour morte.
- **Le budget d'une exécution passe par elle.** Le moteur appelle, chacune dans son propre `withTenant` court (section 2.5) :

  ```ts
  // Au départ (architecture, 9.3, point 1). Faux : l'exécution finit « ignoree », raison « budget ».
  sql`select reserver_budget_execution(${executionId}, ${limits.maxUsd}::numeric, ${monthCap}::numeric, ${dayCap}::numeric) as ok`
  // À la fin, quel que soit le statut final (point 3).
  sql`select solder_budget_execution(${executionId}, ${meter.usd}::numeric)`
  ```

  `reserver_budget_execution` écrit `reserve_usd` sur la ligne : une reprise qui la rappelle reçoit vrai sans rien prendre. `solder_budget_execution` pose `solde_le` dans le même `update` que celui qui lit la réserve : un solde rejoué ne fait rien, et personne ne rend plus qu'il n'a réservé. Une exécution finie sans solde (processus tué, personne partie dont l'exécution est fermée `annulee`) est soldée par `purger_executions` dans l'heure, à son `cout_usd`. La journée n'est comptée que pour un agent personnel : la fonction lit la portée de l'activation, le moteur n'a rien à dire (écart 3).
- **`executions_a_reveiller` ne joint pas `member`**, à la différence des autres fonctions de tic. Une personne retirée n'a plus de ligne `member` (`removeMember`, `members.ts:116-130`) : si le tic taisait ses exécutions, celle qui attend une minuterie n'aurait jamais de « job suivant », et ne finirait jamais `annulee`, raison `parti` (architecture, 9.10). C'est le moteur qui la ferme. Elle sort alors de la liste : rien ne s'accumule en tête. Écart 1 de la section 18.
- **Le troisième cas, `en-file` depuis plus de 15 minutes, est un ajout.** Le routage écrit la ligne puis envoie le job : un processus tué entre les deux laisserait l'exécution en file pour toujours. Le job est dédoublonné par l'identifiant de l'exécution, donc un envoi de trop est sans effet.
- **`erreur` ne porte jamais un texte d'outil ou de modèle** : un code du moteur, 300 caractères au plus.
- **`entree` et `sortie` sont bornées à 256 Kio** chacune. Le plus gros contenu prévu est un texte de rédacteur de 8 000 caractères.
- **`purger_executions` rend un nombre de lignes touchées** : exécutions abandonnées fermées, réserves oubliées soldées, simulations supprimées, étapes vidées. Une action de simulation survit à son exécution (`actions` ne se supprime jamais) : son `execution_id` passe à nul (section 18, point 11).


## 8. Migration 0080 : les actions généralisées

| | |
|---|---|
| Fichier | `src/server/db/migrations/0080-actions-generalisees.sql` (à créer) |
| Jalon | 1, PR 7 (« Actions généralisées ») |
| Touche | `actions` (existe, `0037-actions.sql`, `0038-actions-github.sql`) |
| Crée | `couper_agents_du_membre`, `supprimer_agents_du_compte` |
| Test | `0080-actions-generalisees.db.test.ts` (section 16.6, code complet : il supprime le parent) |
| Drizzle | quatorze colonnes dans `schema/actions.ts` (section 14.4) |
| Dans la même PR | `ACTION_STATUSES` gagne `'defaite'` (`src/lib/actions.ts:64`) et la carte d'action l'affiche (section 15.5) ; `'actions.kind'` entre dans `VALIDATED_IN_CODE` ; l'appel dans `deleteAccount` (section 15.1) |

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
-- continuent. Rend le nombre d'activations coupées ; 0 si l'appelant n'est ni propriétaire ni administrateur. Lève
-- (28000) sans contexte. Les abonnements de webhook s'ajoutent en 0083.
create function couper_agents_du_membre(p_user uuid, p_equipe_seulement boolean)
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_equipe boolean := coalesce(p_equipe_seulement, false);
  v_coupees integer;
begin
  -- Sans contexte, l'appel est une faute du code (removeMember et setMemberRole travaillent sur db nu) : il lève,
  -- au lieu de rendre 0 comme pour un appelant qui n'est pas administrateur.
  if v_tenant is null or app_user() is null then
    raise exception 'couper_agents_du_membre : pas de contexte (withTenant)' using errcode = '28000';
  end if;
  if p_user is null or not app_est_admin() then
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
-- Rend au mois de l'organisation les réserves de budget encore ouvertes de ses exécutions. Rend le nombre
-- d'exécutions supprimées ; lève (28000) sans contexte. Les veilles s'ajoutent en 0082, les canaux en 0084.
create function supprimer_agents_du_compte()
returns integer
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
  v_executions integer;
begin
  if v_tenant is null or v_user is null then
    raise exception 'supprimer_agents_du_compte : pas de contexte (withTenant)' using errcode = '28000';
  end if;

  -- Les réserves de budget encore ouvertes sont rendues au mois de l'organisation (sa journée part plus bas).
  perform budget_rendre(e.tenant_id, e.user_id, e.reserve_usd, e.cout_usd, false)
     from executions_agent e
    where e.tenant_id = v_tenant and e.user_id = v_user and e.reserve_usd is not null and e.solde_le is null;

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
- **Elle s'appelle sous le contexte de l'administrateur qui retire.** C'est une fonction « pour soi, administrateur » : elle lit `app_tenant()` et `app_est_admin()`. Or `removeMember` et `setMemberRole` travaillent sur `db` nu, sans `withTenant` (`members.ts:106`, `:118`). L'appel s'écrit donc ainsi, avant le `delete from member` (ou le changement de rôle) :

  ```ts
  await withTenant(ctx, (tx) =>
    tx.execute(sql`select couper_agents_du_membre(${userId}::uuid, ${teamOnly}) as n`),
  );
  ```

  Appelée sur `db` nu, elle lève `28000` au lieu de rendre 0 : sans cela, l'oubli du contexte et le refus d'un non-administrateur se confondraient, et les agents d'un membre retiré resteraient actifs sans erreur. `supprimer_agents_du_compte` lève de même sans contexte.
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
| Test | `0082-veilles.db.test.ts` (section 16.13, code complet : il supprime le parent) |
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
    raise exception 'supprimer_agents_du_compte : pas de contexte (withTenant)' using errcode = '28000';
  end if;

  -- Les réserves de budget encore ouvertes sont rendues au mois de l'organisation (sa journée part plus bas).
  perform budget_rendre(e.tenant_id, e.user_id, e.reserve_usd, e.cout_usd, false)
     from executions_agent e
    where e.tenant_id = v_tenant and e.user_id = v_user and e.reserve_usd is not null and e.solde_le is null;

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
-- La porte a son propre rôle Postgres, leon_porte, qui ne reçoit que deux droits : exécuter porte_secret et
-- porte_deposer. Ces deux fonctions ne sont accordées à personne d'autre : leon_app ne peut ni lire le secret d'un
-- abonnement d'une autre organisation, ni déposer une livraison sans signature. (PUBLIC garde l'exécution de trois
-- fonctions de trigger existantes, 0020 et 0055 : elles ne s'appellent pas hors d'un trigger.)

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
-- que l'id de la ligne. Mais dans une transaction, validée seulement après match et la mise en file de la relève
-- ciblée : un échec avant la validation annule la prise, la ligne reste « recue » avec son corps, et le job rejoué ou
-- webhooks_a_traiter la reprend. Pendant ce temps, la ligne est verrouillée : un second appel la saute (skip locked).
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
  -- Sans contexte, l'appel est une faute du code (removeMember et setMemberRole travaillent sur db nu) : il lève,
  -- au lieu de rendre 0 comme pour un appelant qui n'est pas administrateur.
  if v_tenant is null or app_user() is null then
    raise exception 'couper_agents_du_membre : pas de contexte (withTenant)' using errcode = '28000';
  end if;
  if p_user is null or not app_est_admin() then
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
- **Les états `ignoree` et `echouee` de la boîte d'entrée.** `leon_app` n'a aucun droit sur la table et l'architecture ne dit pas qui les pose. Ici : `prendre_livraison` pose `ignoree` quand l'abonnement n'est plus en service ou que sa personne est partie ; `purger_boite_entree` pose `echouee` sur une ligne restée `recue` 24 heures. Un échec de la relève ciblée, une fois la prise validée, ne se voit pas dans la boîte : la ligne est `traitee`, l'erreur est dans pg-boss et Sentry (écart 4).
- **Prendre une livraison sans la perdre.** La fonction vide le corps dans le même geste qu'elle le rend (architecture, 7.4). Appelée sur `db` nu, ce geste serait validé tout de suite : un worker tué, ou une mise en file qui échoue, perdrait la livraison, et le job rejoué trouverait 0 ligne. `inbox.ts` (chapitre 03) l'appelle donc dans une transaction sans contexte, qu'il ne valide qu'après `match` et l'envoi en file. Aucune requête HTTP ni appel au modèle n'a lieu dans cette transaction (architecture, 9.4) : `match` lit le corps, l'envoi en file est une écriture en base.

  ```ts
  await db.transaction(async (tx) => {
    const { rows } = await tx.execute<Delivery>(sql`select * from prendre_livraison(${id}::uuid)`);
    const delivery = rows[0];
    if (!delivery) return; // déjà prise, ou ignorée : rien à faire
    const refs = matchDelivery(delivery); // Connector.webhook.match : un corps illisible rend [] et part dans Sentry
    await enqueueTargetedFetch(refs); // une erreur ici annule la prise : la ligne reste « recue », corps compris
  });
  ```

  Si l'envoi en file réussit et que la validation échoue, la livraison est reprise et renvoyée : la clé unique du job de relève (`connector-fetch`, architecture 10.1) le dédoublonne tant que le premier n'a pas tourné, et une relève de trop ne fait que relire. Un corps que `match` ne sait pas lire ne doit pas lever : la transaction serait annulée à chaque reprise pendant 24 heures. `matchDelivery` et `enqueueTargetedFetch` sont des noms de ce paragraphe ; le chapitre 03 fixe les siens.
- **`prendre_livraison` est appelable par tout code de `leon_app`** (architecture, écart E18). Le contrat de la section 16.9 vérifie que seul `src/server/webhooks/inbox.ts` la nomme. Ce n'est pas une garde contre une injection SQL sous `leon_app` : celle-ci poserait elle-même `app.tenant` et `app.principals` par `set_config` (`0001-base.sql:5-9`, `with-tenant.ts`) et lirait toute la mémoire sous la sécurité par ligne. Un rôle de plus pour le seul worker ne fermerait donc rien de ce côté.
- **Un secret nul dans `porte_secret`** veut dire : l'abonnement existe, et l'outil signe avec un secret d'application (`WebhookSecret`, `from: 'env'`). Aucune ligne veut dire : refuser, avec la même réponse qu'une signature fausse.
- **Le corps est du texte.** Postgres refuse l'octet nul dans un `text` : la porte doit rejeter un corps qui en contient un avant d'appeler (chapitre 03).
- **`couper_agents_du_membre` passe les abonnements à `resiliee`** seulement quand le membre est retiré. Un administrateur qui perd son rôle garde ses connexions et leurs abonnements.

## 12. Migration 0084 : les canaux sortants

| | |
|---|---|
| Fichier | `src/server/db/migrations/0084-canaux-sortants.sql` (à créer) |
| Jalon | après. Déclencheur : des validations qui attendent plus d'un jour |
| Touche | `"user"` (existe, `0002-auth.sql:5`) |
| Crée | `preferences_canaux`, `installations_slack`, `messages_sortants`, `heure_locale` (ajout), `lier_slack` (ajout), `compte_slack`, `recaps_dus` |
| Refait | `supprimer_agents_du_compte` (0082) |
| Test | `0084-canaux-sortants.db.test.ts` (section 16.14, code complet) |
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
  -- Posé par lier_slack seulement, que linkSlackUser appelle avec ce que rend users.lookupByEmail sur l'adresse vérifiée
  -- du compte : jamais par un formulaire. leon_app n'a pas le droit d'écrire la colonne.
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
-- slack_user_id ne s'écrit que par lier_slack : un membre ne peut pas s'attribuer le compte Slack d'un collègue, ce qui
-- lui ferait recevoir ses clics et empêcherait le collègue de lier le sien. À l'insertion, une règle restrictive (un
-- droit d'insertion colonne par colonne casserait les insertions de Drizzle, qui nomment toutes les colonnes) ; à la
-- modification, la colonne n'est pas dans le droit. lier_slack, propriétaire de la table, ne passe ni par l'une ni
-- par l'autre.
create policy slack_par_lier_slack on preferences_canaux as restrictive for insert to leon_app
  with check (slack_user_id is null);
-- Refaite en place (insert … on conflict do update). Aucune suppression par l'app.
grant select, insert on preferences_canaux to leon_app;
grant update (recap_email, recap_heure, fuseau, slack) on preferences_canaux to leon_app;

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

-- Lie la personne courante à son compte Slack dans l'organisation courante, ou la délie (p_slack_user nul). Seule
-- écriture de slack_user_id : linkSlackUser (chapitre 07) l'appelle avec l'identifiant que rend users.lookupByEmail,
-- par le jeton du bot, sur l'adresse vérifiée du compte Leon (architecture, 9.12, point 4). La base ne peut pas
-- prouver que ce compte Slack est celui de la personne ; elle garantit que rien d'autre que ce chemin ne l'écrit.
-- Vrai : lié ou délié. Faux : ce compte Slack est déjà lié à une autre personne de l'organisation, ou il n'y a pas de
-- contexte. Une forme d'identifiant fausse lève (23514).
create function lier_slack(p_slack_user text)
returns boolean
language plpgsql volatile security definer set search_path = public, pg_temp as $$
declare
  v_tenant uuid := app_tenant();
  v_user uuid := app_user();
begin
  if v_tenant is null or v_user is null then
    return false;
  end if;
  insert into preferences_canaux as p (tenant_id, user_id, slack_user_id, acl)
  values (v_tenant, v_user, p_slack_user, array[v_user])
  on conflict (tenant_id, user_id) do update set slack_user_id = excluded.slack_user_id;
  return true;
exception when unique_violation then
  return false;
end
$$;
revoke all on function lier_slack(text) from public;
grant execute on function lier_slack(text) to leon_app;

-- La personne liée à ce compte Slack dans l'organisation qui a installé cet espace : la route des clics Slack ne
-- connaît que ces deux identifiants. Hors contexte ; des identifiants seulement. Aucune ligne si la personne a coupé
-- Slack (slack = faux), n'est plus membre, ou si son compte est supprimé.
create function compte_slack(p_team text, p_slack_user text)
returns table (tenant_id uuid, user_id uuid)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.tenant_id, p.user_id
    from installations_slack i
    join preferences_canaux p
      on p.tenant_id = i.tenant_id and p.slack_user_id = p_slack_user and p.slack
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
    raise exception 'supprimer_agents_du_compte : pas de contexte (withTenant)' using errcode = '28000';
  end if;

  -- Les réserves de budget encore ouvertes sont rendues au mois de l'organisation (sa journée part plus bas).
  perform budget_rendre(e.tenant_id, e.user_id, e.reserve_usd, e.cout_usd, false)
     from executions_agent e
    where e.tenant_id = v_tenant and e.user_id = v_user and e.reserve_usd is not null and e.solde_le is null;

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
- **`slack_user_id` ne s'écrit que par `lier_slack`** (écart 23). L'architecture écrit « posé par `linkSlackUser`, jamais par un formulaire » (7.2) ; avec un droit d'écriture sur la colonne, n'importe quelle route de l'app pouvait le poser, et un membre qui s'attribuait l'identifiant d'un collègue le réservait (index unique) : le collègue ne pouvait plus lier son compte, et ses clics arrivaient sous le contexte de l'autre, où la sécurité par ligne refusait ses actions. La colonne sort donc du droit de modification, et la règle restrictive `slack_par_lier_slack` refuse une insertion qui la remplit. Pas de droit d'insertion colonne par colonne : Drizzle nomme toutes les colonnes d'un `insert` (`default` pour celles qu'on ne donne pas), et Postgres demande le droit sur chaque colonne nommée, même à `default` (essayé). Le formulaire des préférences reste un `insert … on conflict do update` sur les autres colonnes.
- **`compte_slack` exige `slack = vrai`.** Une personne qui coupe Slack ne valide plus rien depuis un ancien message.
- **Un message `alerte` à un administrateur** ne peut être écrit que sous le contexte de cet administrateur : la ligne lui est privée. L'exécution qui passe le seuil de 80 % tourne au nom d'un autre (écart 6).

## 13. Migration 0085 : les statistiques

| | |
|---|---|
| Fichier | `src/server/db/migrations/0085-agents-statistiques.sql` (à créer) |
| Jalon | après. Déclencheur : trois personnes sur un même agent |
| Crée | `taux_acceptation_agents`, un index sur `actions` |
| Test | `0085-agents-statistiques.db.test.ts` (section 16.15, code complet) |
| Drizzle | rien |

```sql
-- 0085-agents-statistiques.sql : le taux d'acceptation des agents, pour le poste de contrôle des administrateurs
-- (dossier agents, 9.11). Des compteurs par agent, jamais par personne : c'est la seule lecture qui traverse les
-- journaux privés des membres d'une organisation.

-- Un create index sans concurrently (impossible dans la transaction du runner) prend un verrou qui bloque les
-- écritures de la table, et attend derrière les transactions en cours en bloquant les suivantes : comme pour un
-- alter, sans lui en 5 s, la migration échoue et se relance (0069).
set local lock_timeout = '5s';

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

- **Les montants passent par `customType`.** La base rend `numeric(12,5)` (`format_type`). Le contrat compare cette chaîne à `getSQLType()`. Aucun schéma du dépôt n'a de colonne `numeric` aujourd'hui. Un `customType` rend la chaîne écrite, sans surprise, et lit le montant en nombre. Le contrat de schéma, rejoué sur le banc de la section 19 avec Drizzle 0.45.4, trouve les trois colonnes `numeric` (`cout_usd`, `reserve_usd`, `agents_budget_mois_usd`) égales à la base.
- **Les listes fermées sont écrites dans le schéma**, comme `ingestRuns.status` (`schema/memory.ts:71`). Seules les trois listes partagées avec le navigateur viennent de `@/lib/agents` (`AUTONOMY_LEVELS`, `RISK_LEVELS`, `AUDIENCES`). Le contrat de schéma tient chaque liste égale à son `check`. Le code tire ses types de la table : `typeof executionsAgent.$inferSelect['statut']`.
- **`outil`, `nature` et `etiquette` sont déclarées sans `enum`** : elles n'ont pas de liste fermée en SQL, et seule `actions.kind` entre dans `VALIDATED_IN_CODE` (architecture, 7.5). `outil` et `nature` prennent leur type de `@/capture/turn` (`$type<…>()`). `etiquette` reste un `text` : son type, `RoutingLabel`, vit dans `src/server/standard/labels.ts` (chapitre 02), qu'un module de `schema/` n'importe pas ; le standard revalide la valeur à la lecture.

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
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ItemNature, SourceKind } from '@/capture/turn';
import { AUTONOMY_LEVELS } from '@/lib/agents';
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
  // Une étiquette de ROUTING_LABELS (src/server/standard/labels.ts), revalidée à la lecture (chapitre 02). Pas de
  // $type<RoutingLabel>() : un module de schema/ n'importe pas src/server/standard/, qui n'existe pas encore à 0077.
  etiquette: text('etiquette'),
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
  // Les verrous morts repris ; à 3, purger_executions ferme l'exécution.
  reprises: smallint('reprises').notNull().default(0),
  attendCle: text('attend_cle'),
  reveilLe: at('reveil_le'),
  // Toutes les sources fournies au modèle : la lecture vérifie qu'elles sont encore visibles.
  sourceIds: uuid('source_ids').array().notNull().default(sql`'{}'::uuid[]`),
  coutUsd: usd('cout_usd').notNull().default(0),
  nbAppelsModele: integer('nb_appels_modele').notNull().default(0),
  // La réserve de budget, écrite par reserver_budget_execution et solder_budget_execution seulement (pas de droit
  // d'écriture pour l'app) ; nulle tant que rien n'est réservé.
  reserveUsd: usd('reserve_usd'),
  reserveJour: boolean('reserve_jour'),
  soldeLe: at('solde_le'),
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
// déclaration. Elle est là pour le contrat de schéma et pour les fixtures des tests (adminDb). L'app la lit par deux
// fonctions de 0083 : celle qui prend une livraison (seul inbox.ts la nomme, contrat prendre-livraison.test.ts) et
// webhooks_a_traiter.
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
    // Posé par lier_slack (0084), que seul linkSlackUser appelle ; l'app n'a pas le droit d'écrire la colonne.
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


## 15. Hors SQL : cinq retouches

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

- **Les abonnements de webhook** partent avec les connexions (`on delete cascade`, 0083), et avec eux `externe_id` et le secret ; les jetons partent avec la connexion. Le relevé fait avant la suppression des connexions (`delete-account.ts:248`) doit donc porter tout ce que l'appel à l'éditeur demande : pour chaque abonnement `active` de portée `abonnement`, l'outil, `externe_id`, et les jetons de sa connexion, lus dans la même transaction. Après la transaction, le code désabonne chez chaque éditeur, sans bloquer et en tolérant l'échec, sur le modèle de `pipedreamUsersOf` (`delete-account.ts:120-127` : relevé dans la transaction, appel après). Un abonnement de portée `app` n'appelle rien : la ligne dit seulement « cette connexion écoute ce compte ». C'est le chapitre 03 qui l'écrit, avec `subscriptions.ts`.
- **Un membre retiré n'est pas désabonné chez l'éditeur.** `couper_agents_du_membre` passe ses abonnements à `resiliee` et rien n'est appelé : l'architecture (9.10) refuse de se servir des jetons d'un parti. La porte refuse ses livraisons avec la même réponse qu'une signature fausse ; un abonnement Microsoft s'éteint seul à son échéance, et un éditeur qui désactive un webhook refusé fait ce qu'on veut.
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

Ce test ne lit que le début de la définition (`FOREIGN KEY (tenant_id, x) REFERENCES t(tenant_id, id)`) : il ne voit pas si la liste de colonnes du `set null` manque. D'où les trois tests qui suppriment le parent (sections 16.5, 16.6 et 16.13). Sur la base jetable, les deux clés rendent bien :

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

Les autres lignes du tableau 7.5 ne touchent pas la base, mais l'architecture les donne à ce chapitre (section 11, ligne 01). Chacune entre avec le code qu'elle garde, sinon son contrat échoue : une route publique avec sa route, une variable avec le code qui la lit (`env-contract.test.ts` exige les deux sens : toute variable lue est documentée, toute variable documentée est lue).

`src/test/contracts/route-guards.db.test.ts` (existe), `PUBLIC` (`:24-29`). Deux lignes, chacune dans la PR de sa route :

```ts
  /^\/api\/v1\/porte\//, // la porte en Hono (chapitre 03) : elle vérifie la signature de l'éditeur, pas une session
  /^\/api\/v1\/slack\/interactions$/, // les clics Slack (chapitre 07) : signature v0 de Slack, LEON_SLACK_SIGNING_SECRET
```

`.env.example` (existe). Les lignes, chacune dans la PR du code qui la lit :

```bash
# Le rôle du processus : web (pages, API, la porte en Hono), worker (les files) ou tout (développement, tests). Vide : tout.
LEON_ROLE=
# Les modèles des quatre étapes des agents (dossier agents, 10.2). Vide : le défaut du code (Haiku 5.5 pour le tri et la
# lecture, Sonnet 5.5 pour la décision et la rédaction).
LEON_MODEL_TRI=
LEON_MODEL_LECTURE=
LEON_MODEL_DECISION=
LEON_MODEL_REDACTION=
# La porte des webhooks. DATABASE_URL_PORTE : le rôle leon_porte (deux fonctions, aucune table) ; vide, la porte répond
# 503 et le sondage de 15 minutes continue. LEON_PORTE_KEY : chiffre les secrets d'abonnement (32 octets en base64 :
# openssl rand -base64 32), jamais commitée. LEON_PORTE_URL : l'adresse publique donnée aux éditeurs.
DATABASE_URL_PORTE=postgres://leon_porte:leon_porte@127.0.0.1:54329/leon
LEON_PORTE_KEY=
LEON_PORTE_URL=http://localhost:3000
# Le secret de signature d'application d'un outil qui signe ainsi ses webhooks : une ligne par outil du premier lot.
LEON_PORTE_SECRET_<OUTIL>=
# L'appli Slack de Leon (api.slack.com > Your Apps) : installation et clics. Vide : pas de Slack.
LEON_SLACK_CLIENT_ID=
LEON_SLACK_CLIENT_SECRET=
LEON_SLACK_SIGNING_SECRET=
```

| Lignes | PR (architecture, 14.3) | Autre retouche dans la même PR |
|---|---|---|
| `LEON_ROLE` | PR n° 0 (chapitre 13) | |
| `LEON_MODEL_TRI`, `_LECTURE`, `_DECISION`, `_REDACTION` | PR 3, avec 0075 (chapitre 11) | les quatre noms entrent dans la liste du test « laisse vides les modèles par étape » (`env-contract.test.ts:79-89`) |
| `DATABASE_URL_PORTE`, `LEON_PORTE_KEY`, `LEON_PORTE_URL` | après : webhooks, avec 0083 (chapitre 03) | la ligne `PUBLIC` de la porte |
| `LEON_PORTE_SECRET_<OUTIL>` | même PR | `<OUTIL>` est remplacé par chaque outil du premier lot qui signe par un secret d'application ; la liste est celle du chapitre 03 (`WebhookSecret`, `from: 'env'`) |
| `LEON_SLACK_*` | après : récapitulatif et Slack, avec 0084 (chapitre 07) | la ligne `PUBLIC` des clics |

Les quatre dernières lignes de 7.5 ont un propriétaire écrit dans la section 11 de l'architecture : les extraits `vendor-specs` de Jira et d'Asana (chapitre 05), les 14 faux `Llm` (chapitre 04), `NAV` et son guide (chapitre 07), `connectors-docs` le jour d'un 43e outil (chapitre 10). La dernière, l'appel dans `deleteAccount`, est en section 15.1.


### 15.5 La carte d'action affiche `defaite` (avec 0080)

`ACTION_STATUSES` gagne `'defaite'` dans la PR de 0080 (section 14.4), et `ActionView.status` en dérive (`src/lib/actions.ts:91`, `:110`) : `parseActionView` accepte donc la valeur. Or `src/components/discussion/action-card.tsx` (existe) finit sa chaîne de libellés sur `t('expired')` (`:57-67`) : une action défaite s'y afficherait « Expirée ». Une action de discussion ne devient `defaite` que si le chapitre 05 lui ouvre l'annulation ; la carte est corrigée dans la même PR que le type, pour que ce jour-là rien ne change à l'écran. La fin de la chaîne devient :

```tsx
            : view.status === 'annulee'
              ? t('cancelled')
              : view.status === 'defaite'
                ? t('undone')
                : t('expired');
```

Et une clé de plus sous `discussionView.action`, après `cancelled` (`messages/fr.json:592`, `messages/en.json:592`) :

```json
      "undone": "Défaite : ce qui avait été fait a été annulé.",
```

```json
      "undone": "Undone: what had been done was reversed.",
```

Le chapitre 07 donne les libellés définitifs de l'écran `/agents` ; celui-ci n'est que celui de la carte de discussion.

## 16. Tests à écrire

Tous sont des tests `db` (`*.db.test.ts`, projet vitest `db`), à côté de leur migration, sauf le contrat de la section 16.9. Ils suivent les tests voisins (`0030-points-du-matin.db.test.ts`, `0067-supprimer-notes.db.test.ts`) : fixtures par le rôle propriétaire (`adminDb`, `adminPool`), lectures et écritures de l'app sous `withTenant`, fonctions hors contexte sur `db`. Chaque test crée ses propres organisations : la base de test est partagée.

Codes d'erreur attendus, lus dans `error.cause.code` (dans `error.code` pour une requête `pg` directe) : `42501` (refus de la sécurité par ligne, ou droit manquant), `23514` (`check`), `23505` (unicité), `23503` (clé étrangère), `22023` (valeur refusée par une fonction du budget), `28000` (fonction « pour soi » appelée sans contexte).

Ces tests ont été lancés (vitest 3.2.7, TypeScript 5.9, Drizzle 0.45.4) contre un Postgres 16.15 qui porte les 61 fichiers de migration du dépôt puis les onze de ce chapitre, avec des copies des fixtures du dépôt (section 19) : 152 tests, tous passent. Ce n'est pas `pnpm test:db` : le banc n'a ni `global-setup.ts`, ni les autres tests du dépôt.

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
| `0075-appels-modele-attribution.db.test.ts` | Section 16.11 |
| `0076-budget-agents.db.test.ts` | Section 16.3 |
| `0077-evenements.db.test.ts` | Section 16.12, dont la suppression de la source |
| `0078-agents-actives.db.test.ts` | Section 16.4, dont « un membre ordinaire ne modifie pas une activation d'équipe » |
| `0079-executions-agent.db.test.ts` | Section 16.5, dont la suppression de l'activation et le budget d'une exécution |
| `0080-actions-generalisees.db.test.ts` | Section 16.6, dont la suppression de l'exécution |
| `0081-connexions-renouvellement.db.test.ts` | Section 16.7 |
| `0082-veilles.db.test.ts` | Section 16.13, dont la suppression de la source |
| `0083-webhooks.db.test.ts` | Section 16.8 |
| `0084-canaux-sortants.db.test.ts` | Section 16.14 |
| `0085-agents-statistiques.db.test.ts` | Section 16.15 |
| `src/test/contracts/prendre-livraison.test.ts` | Section 16.9 |
| `src/server/auth/delete-account.db.test.ts` (existe) | Section 16.10 : deux cas de plus |
| `src/server/db/migrations/0046-pg-temp-en-dernier.db.test.ts` (existe) | Rien à écrire : il lit `pg_proc` et couvre les 28 fonctions `security definer` nouvelles |

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
// personne et par jour), que seules les fonctions du budget écrivent, pour la personne et l'organisation du contexte.
// Ici, reserver_budget et solder_budget (la réserve du tri) ; celles d'une exécution sont testées avec 0079. Les
// lectures de vérification passent par le rôle propriétaire.

const FAULT = { cause: { code: '22023' } };

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

  it('lève sur une valeur négative ou un plafond absent : une faute du code n’est pas un plafond atteint', async () => {
    const { bob } = await team();

    await expect(reserve(bob, -0.1, 10, 1)).rejects.toMatchObject(FAULT);
    await expect(reserve(bob, 0.1, -1, 1)).rejects.toMatchObject(FAULT);
    await expect(reserve(bob, 0.1, 10, -1)).rejects.toMatchObject(FAULT);
    await expect(
      withTenant(bob, (tx) => tx.execute(sql`select reserver_budget(0.1, null, 1)`)),
    ).rejects.toMatchObject(FAULT);

    expect(await monthOf(bob.tenantId)).toBeNull();
  });

  it('rend faux sans contexte, sans rien écrire', async () => {
    const { bob } = await team();

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

  it("ne rend à l'administrateur d'une autre organisation que la sienne", async () => {
    const { bob } = await team();
    const { alice: zoe } = await team();
    await reserve(bob, 0.4, 10, 1);

    expect(await read(zoe)).toEqual([{ reserve: 0, depense: 0 }]);
  });
});

describe('droits', () => {
  it.each([
    'budget_prendre(uuid, uuid, numeric, numeric, numeric, boolean)',
    'budget_rendre(uuid, uuid, numeric, numeric, boolean)',
  ])('leon_app n’appelle pas le geste interne %s', async (fonction) => {
    const { rows } = await adminPool.query<{ granted: boolean }>(
      "select has_function_privilege('leon_app', $1, 'execute') as granted",
      [fonction],
    );
    expect(rows).toEqual([{ granted: false }]);
  });

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

  it("un administrateur a la même fiche pour lui et pour l'équipe ; pas deux fois la même portée", async () => {
    const { alice } = await setup();
    const activate = (portee: 'personne' | 'equipe') =>
      withTenant(alice, (tx) =>
        tx
          .insert(agentsActives)
          .values({
            tenantId: alice.tenantId,
            userId: alice.userId,
            agentId: 'tri_support',
            portee,
            acl: [portee === 'equipe' ? alice.tenantId : alice.userId],
          })
          .returning({ id: agentsActives.id }),
      );

    await expect(activate('personne')).resolves.toHaveLength(1);
    await expect(activate('equipe')).resolves.toHaveLength(1);
    await expect(activate('personne')).rejects.toMatchObject({ cause: { code: '23505' } });
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

  it('reprend aussi quand le repreneur a la même fiche à titre personnel', async () => {
    const { alice, bob } = await setup();
    const agentId = `agent_${crypto.randomUUID().slice(0, 8)}`;
    const id = await seedActivation(alice, { agentId, portee: 'equipe' });
    const personal = await seedActivation(bob, { agentId });
    await setRole(alice, 'member');
    await setRole(bob, 'admin');

    expect(await takeOver(bob, id)).toBe(true);

    expect(await row(id)).toMatchObject({ userId: bob.userId, portee: 'equipe', actif: false });
    expect(await row(personal)).toMatchObject({ userId: bob.userId, portee: 'personne', actif: true });
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
// l'activation ne doit ni échouer ni effacer tenant_id. La réserve de budget d'une exécution est prise une fois et
// soldée une fois, même quand le moteur rejoue.

const REFUSED = { cause: { code: '42501' } };
const CHECK = { cause: { code: '23514' } };
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

  it('une exécution « en-cours » porte toujours son verrou', async () => {
    const { bob } = await setup();

    await expect(seedExecution(bob, { statut: 'en-cours', verrouLe: null })).rejects.toMatchObject(CHECK);
  });

  it('compte les reprises d’un déroulé mort, et ne rend plus une exécution reprise 3 fois', async () => {
    const { bob } = await setup();
    const id = await seedExecution(bob, { statut: 'en-file' });
    // La requête du verrou du chapitre 04 (section 7, « Prendre le verrou »).
    const take = async () =>
      (
        await withTenant(bob, (tx) =>
          tx.execute<{ reprises: number }>(sql`
            update executions_agent
               set statut = 'en-cours', verrou_le = now(), commence_le = coalesce(commence_le, now()),
                   reprises = reprises + case when statut = 'en-cours' then 1 else 0 end
             where id = ${id} and (statut in ('en-file', 'en-attente')
                    or (statut = 'en-cours' and verrou_le < now() - interval '2 minutes' and reprises < 3))
            returning reprises`),
        )
      ).rows.map((row) => row.reprises);
    const die = () =>
      adminPool.query(
        "update executions_agent set verrou_le = now() - interval '3 minutes' where id = $1",
        [id],
      );

    expect(await take()).toEqual([0]);
    for (const reprises of [1, 2, 3]) {
      await die();
      expect(await due()).toContain(id);
      expect(await take()).toEqual([reprises]);
    }
    await die();

    expect(await due()).not.toContain(id);
    expect(await take()).toEqual([]);
  });
});

describe('le budget d’une exécution', () => {
  const FAULT = { cause: { code: '22023' } };
  const reserve = async (ctx: TenantContext, id: string, usd: number, day: number | null = 1) =>
    (
      await withTenant(ctx, (tx) =>
        tx.execute<{ ok: boolean }>(
          sql`select reserver_budget_execution(${id}, ${usd}::numeric, 10::numeric, ${day}::numeric) as ok`,
        ),
      )
    ).rows[0]?.ok;
  const settle = (ctx: TenantContext, id: string, real: number) =>
    withTenant(ctx, (tx) => tx.execute(sql`select solder_budget_execution(${id}, ${real}::numeric)`));
  const monthOf = async (tenantId: string) =>
    (
      await adminPool.query<{ reserve_usd: string; depense_usd: string }>(
        'select reserve_usd, depense_usd from budgets_agents where tenant_id = $1',
        [tenantId],
      )
    ).rows.map((row) => ({ reserve: Number(row.reserve_usd), depense: Number(row.depense_usd) }))[0];
  const dayOf = async (ctx: TenantContext) =>
    (
      await adminPool.query<{ usd: string }>(
        'select usd from budgets_personne_jour where tenant_id = $1 and user_id = $2',
        [ctx.tenantId, ctx.userId],
      )
    ).rows.map((row) => Number(row.usd))[0] ?? null;
  const runOf = async (id: string) =>
    (await adminDb.select().from(executionsAgent).where(eq(executionsAgent.id, id)))[0];

  it('réserve une fois : une reprise qui rappelle la fonction ne prend rien de plus', async () => {
    const { bob } = await setup();
    const id = await seedExecution(bob, { activationId: await seedActivation(bob), statut: 'en-file' });

    expect(await reserve(bob, id, 0.5)).toBe(true);
    expect(await reserve(bob, id, 0.5)).toBe(true);

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0.5, depense: 0 });
    expect(await dayOf(bob)).toBe(0.5);
    expect(await runOf(id)).toMatchObject({ reserveUsd: 0.5, reserveJour: true, soldeLe: null });
  });

  it('solde une fois : un solde rejoué ne rend rien de plus', async () => {
    const { bob } = await setup();
    const id = await seedExecution(bob, { activationId: await seedActivation(bob), statut: 'en-file' });
    await reserve(bob, id, 0.5);

    await settle(bob, id, 0.07);
    await settle(bob, id, 0.07);

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0, depense: 0.07 });
    expect(await dayOf(bob)).toBe(0.07);
    expect((await runOf(id))?.soldeLe).not.toBeNull();
  });

  it("l'exécution d'un agent d'équipe ne touche pas la journée de son activateur", async () => {
    const { alice } = await setup();
    const team = await seedActivation(alice, { portee: 'equipe' });
    const id = await seedExecution(alice, { activationId: team, statut: 'en-file' });

    // Un plafond du jour à zéro n'est même pas comparé.
    expect(await reserve(alice, id, 0.5, 0)).toBe(true);
    await settle(alice, id, 0.1);

    expect(await monthOf(alice.tenantId)).toEqual({ reserve: 0, depense: 0.1 });
    expect(await dayOf(alice)).toBeNull();
    expect(await runOf(id)).toMatchObject({ reserveJour: false });
  });

  it("refuse l'exécution d'un collègue ou d'une autre organisation, sans rien écrire", async () => {
    const { alice, bob } = await setup();
    const { bob: stranger } = await setup();
    const id = await seedExecution(bob, { statut: 'en-file' });

    expect(await reserve(alice, id, 0.5)).toBe(false);
    expect(await reserve(stranger, id, 0.5)).toBe(false);
    await reserve(bob, id, 0.5);
    await settle(alice, id, 0);

    expect(await monthOf(bob.tenantId)).toEqual({ reserve: 0.5, depense: 0 });
    expect(await monthOf(stranger.tenantId)).toBeUndefined();
    expect((await runOf(id))?.soldeLe).toBeNull();
  });

  it('lève sur une valeur négative ; l’app n’écrit pas la réserve elle-même', async () => {
    const { bob } = await setup();
    const id = await seedExecution(bob, { statut: 'en-file' });

    await expect(reserve(bob, id, -1)).rejects.toMatchObject(FAULT);
    await expect(settle(bob, id, -1)).rejects.toMatchObject(FAULT);
    await expect(
      withTenant(bob, (tx) =>
        tx.update(executionsAgent).set({ reserveUsd: 0 }).where(eq(executionsAgent.id, id)),
      ),
    ).rejects.toMatchObject(REFUSED);
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

  it('ferme une exécution reprise 3 fois et solde la réserve oubliée d’une exécution finie', async () => {
    const { bob } = await setup();
    const reserveFor = async (id: string) =>
      withTenant(bob, (tx) =>
        tx.execute(sql`select reserver_budget_execution(${id}, 0.5::numeric, 10::numeric, 1::numeric)`),
      );
    const abandoned = await seedExecution(bob, {
      statut: 'en-cours',
      verrouLe: new Date(Date.now() - 3 * 60_000),
      reprises: 3,
      coutUsd: 0.02,
    });
    const finished = await seedExecution(bob, { statut: 'en-file', coutUsd: 0.05 });
    await reserveFor(abandoned);
    await reserveFor(finished);
    // Le moteur a écrit « faite » puis le processus est mort avant le solde.
    await adminPool.query("update executions_agent set statut = 'faite' where id = $1", [finished]);

    await purge();

    const [closed] = await adminDb
      .select()
      .from(executionsAgent)
      .where(eq(executionsAgent.id, abandoned));
    expect(closed).toMatchObject({ statut: 'echouee', raison: 'erreur', erreur: 'reprises' });
    expect(closed?.soldeLe).not.toBeNull();
    const { rows } = await adminPool.query<{ reserve_usd: string; depense_usd: string }>(
      'select reserve_usd, depense_usd from budgets_agents where tenant_id = $1',
      [bob.tenantId],
    );
    expect(rows.map((row) => [Number(row.reserve_usd), Number(row.depense_usd)])).toEqual([[0, 0.07]]);
  });
});
```

### 16.6 `0080-actions-generalisees.db.test.ts`

```ts
import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
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

  it('lève sans contexte : un appel sur db nu, sans withTenant, ne passe pas pour un refus', async () => {
    const { bob } = await setup();
    const activation = await seedActivation(bob);

    await expect(
      db.execute(sql`select couper_agents_du_membre(${bob.userId}, false)`),
    ).rejects.toMatchObject({ cause: { code: '28000' } });

    expect(await isActive(activation)).toBe(true);
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

  it('rend au mois de l’organisation la réserve d’une exécution en cours', async () => {
    const { alice, bob } = await setup();
    const run = await seedExecution(bob, { statut: 'en-file', coutUsd: 0.03 });
    await withTenant(bob, (tx) =>
      tx.execute(sql`select reserver_budget_execution(${run}, 0.5::numeric, 10::numeric, 1::numeric)`),
    );

    await remove(bob);

    const month = await withTenant(alice, (tx) =>
      tx.execute<{ reserve_usd: string; depense_usd: string }>(sql`select * from budget_du_mois()`),
    );
    expect(month.rows.map((row) => [Number(row.reserve_usd), Number(row.depense_usd)])).toEqual([
      [0, 0.03],
    ]);
  });

  it('lève sans contexte', async () => {
    await expect(db.execute(sql`select supprimer_agents_du_compte()`)).rejects.toMatchObject({
      cause: { code: '28000' },
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

// Migration 0083 : les webhooks entrants. La porte a son propre rôle, leon_porte, qui ne reçoit que deux fonctions ;
// leon_app n'a aucun droit sur la boîte d'entrée et ne lit un corps que par prendre_livraison, une seule fois, dans
// une transaction qu'il ne valide qu'après la mise en file.

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

  it('leon_porte ne reçoit que porte_secret et porte_deposer, qui ne sont accordées qu’à lui', async () => {
    // Les droits accordés (pg_proc.proacl), pas has_function_privilege : PUBLIC garde l'exécution de trois fonctions
    // de trigger existantes (passages_entrent_en_file, passages_sortent_de_file en 0020, creer_groupe_service en
    // 0055), qu'aucun rôle ne peut appeler hors d'un trigger.
    const { rows } = await adminPool.query<{ fonction: string; role: string }>(
      `select p.proname as fonction, a.grantee::regrole::text as role
         from pg_proc p
         join pg_namespace n on n.oid = p.pronamespace
         cross join lateral aclexplode(p.proacl) a
        where n.nspname = 'public' and a.privilege_type = 'EXECUTE'
          and a.grantee in ('leon_app'::regrole, 'leon_porte'::regrole)
        order by 1`,
    );
    const to = (role: string) => rows.filter((row) => row.role === role).map((row) => row.fonction);

    expect(to('leon_porte')).toEqual(['porte_deposer', 'porte_secret']);
    expect(to('leon_app')).not.toContain('porte_deposer');
    expect(to('leon_app')).not.toContain('porte_secret');
    expect(to('leon_app')).toContain('prendre_livraison');
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

  it('une prise annulée laisse la livraison reçue, corps compris : la reprise la retrouve', async () => {
    const [bob] = (await team(['Bob'])) as [TenantContext];
    const id = await seedSubscription(bob);
    await deposit({ outil: 'outlook', abonnement: id });
    const [line] = await linesOf(id);
    if (!line) throw new Error('livraison non déposée');

    // inbox.ts : la prise, match et la mise en file dans une transaction ; ici, la mise en file échoue.
    await expect(
      db.transaction(async (tx) => {
        const { rows } = await tx.execute(sql`select * from prendre_livraison(${line.id})`);
        expect(rows).toHaveLength(1);
        throw new Error('mise en file impossible');
      }),
    ).rejects.toThrow('mise en file impossible');

    expect((await linesOf(id))[0]).toMatchObject({
      statut: 'recue',
      corps: '{"value":[{"id":"m1"}]}',
    });
    expect(await take(line.id)).toHaveLength(1);
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

Un test `unit`, sans base, sur le modèle de `privileges.test.ts`. Il passe dès 0083, avant même que `inbox.ts` existe (chapitre 03), à une condition : aucun autre fichier de production sous `src/` ne nomme la fonction, pas même dans un commentaire (`productionSources` n'écarte que les fichiers `*.test.ts(x)`, `files.ts:20-28`). Le commentaire de `schema/webhooks.ts` la décrit donc sans la nommer (section 14.2), et `src/test/seed-agents.ts`, qui n'est pas un fichier de test au sens de ce filtre, ne la nomme pas. Le contrat reste strict à dessein : un commentaire qui la nomme ailleurs est déjà le signe qu'un second appelant se prépare.

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


### 16.11 `0075-appels-modele-attribution.db.test.ts`

Sur le modèle de `0062-etape-fil.db.test.ts` : chaque insertion est annulée, le tableau des admins ne compte pas les lignes d'essai.

```ts
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { pool } from '@/server/db/client';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

// Migration 0075 : chaque appel au modèle dit pour qui il a été fait (organisation, personne, exécution), et le
// journal accepte les quatre étapes des agents. leon_app insère hors withTenant, comme logUsage ; il ne lit jamais.

const STEPS = ['reponse', 'discussion', 'point', 'resume', 'fil', 'agenda', 'tri', 'lecture', 'decision', 'redaction'];

// Sous leon_app, par le pool de l'app et hors contexte, comme logUsage ; puis annule.
async function insertAsApp(
  step: string,
  who: { tenantId?: string; userId?: string; executionId?: string } = {},
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(
      `insert into appels_modele (step, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                                  tenant_id, user_id, execution_id)
       values ($1, 'claude-haiku-5-5', 1, 1, 0, 0, $2, $3, $4)`,
      [step, who.tenantId ?? null, who.userId ?? null, who.executionId ?? null],
    );
  } finally {
    await client.query('rollback');
    client.release();
  }
}

describe('appels_modele après 0075', () => {
  it.each(STEPS)('accepte l’étape %s', async (step) => {
    await expect(insertAsApp(step)).resolves.toBeUndefined();
  });

  it('refuse une étape inconnue', async () => {
    await expect(insertAsApp('triage')).rejects.toThrow(/appels_modele_step_check/);
  });

  it('leon_app insère avec et sans attribution, hors contexte, et ne lit pas', async () => {
    const { tenantId, members } = await createTestTenant(['Bob']);
    const [bob] = members as [TenantContext];

    await expect(
      insertAsApp('tri', { tenantId, userId: bob.userId, executionId: randomUUID() }),
    ).resolves.toBeUndefined();
    await expect(insertAsApp('lecture')).resolves.toBeUndefined();
    await expect(pool.query('select 1 from appels_modele limit 1')).rejects.toMatchObject({
      code: '42501',
    });
  });

  it('a la sécurité par ligne, sans force, avec la seule règle d’insertion', async () => {
    const { rows } = await adminPool.query(
      `select c.relrowsecurity as rls, c.relforcerowsecurity as force,
              array(select p.polname || ':' || p.polcmd::text from pg_policy p
                     where p.polrelid = c.oid order by 1) as rules
         from pg_class c where c.oid = 'public.appels_modele'::regclass`,
    );
    expect(rows).toEqual([{ rls: true, force: false, rules: ['insertion_seule:a'] }]);
  });

  it('supprimer l’organisation et le compte garde la ligne et son coût, attribution nulle', async () => {
    const { tenantId, members } = await createTestTenant(['Bob']);
    const [bob] = members as [TenantContext];
    const client = await adminPool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query<{ id: string }>(
        `insert into appels_modele (step, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
                                    cost_usd, tenant_id, user_id)
         values ('tri', 'claude-haiku-5-5', 1, 1, 0, 0, 0.002, $1, $2) returning id`,
        [tenantId, bob.userId],
      );
      await client.query('delete from organization where id = $1', [tenantId]);
      await client.query('delete from "user" where id = $1', [bob.userId]);

      const after = await client.query(
        'select tenant_id, user_id, cost_usd from appels_modele where id = $1',
        [rows[0]?.id],
      );
      expect(after.rows).toEqual([{ tenant_id: null, user_id: null, cost_usd: '0.00200' }]);
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
```

### 16.12 `0077-evenements.db.test.ts`

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { evenements } from '@/server/db/schema/agents';
import { members, users } from '@/server/db/schema/auth';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { hex64 } from '@/test/seed-agents';
import { seedRun } from '@/test/seed-search';

// Migration 0077 : les événements du standard, privés au propriétaire de la source, et le rattrapage des runs que le
// standard n'a pas vus. Les deux fonctions de tic travaillent pour toutes les organisations et ne rendent que des
// identifiants.

const REFUSED = { cause: { code: '42501' } };
const CHECK = { cause: { code: '23514' } };
const MINUTE = 60_000;
const DAY = 86_400_000;

// Les runs « à signaler » de ce fichier ne restent pas dans la base partagée : tout part avec l'organisation.
const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

// Bob et Carl dans une organisation, Zoé dans une autre.
async function setup() {
  const team = await createTestTenant(['Bob', 'Carl']);
  const other = await createTestTenant(['Zoé']);
  tenantIds.push(team.tenantId, other.tenantId);
  const [bob, carl] = team.members as [TenantContext, TenantContext];
  const [zoe] = other.members as [TenantContext];
  return { bob, carl, zoe };
}

type Run = { sourceId: string; ingestRunId: string };

// Une source Fathom de la personne et un run d'indexation.
const runOf = async (ctx: TenantContext, input: Parameters<typeof seedRun>[1] = {}): Promise<Run> => {
  const seeded = await seedRun(ctx, { kind: 'fathom', ...input });
  return { sourceId: seeded.sourceId, ingestRunId: seeded.job.ingestRunId };
};

// Un événement tel que l'écrit signalStandard.
const eventOf = (
  ctx: TenantContext,
  run: Run,
  values: Partial<typeof evenements.$inferInsert> = {},
): typeof evenements.$inferInsert => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
  sourceId: run.sourceId,
  ingestRunId: run.ingestRunId,
  outil: 'fathom',
  nature: 'reunion',
  cote: 'externe',
  cleObjet: `fathom:meeting:${randomUUID()}`,
  empreinte: hex64(),
  acl: [ctx.userId],
  ...values,
});

const eventsOf = (sourceId: string) =>
  adminDb.select().from(evenements).where(eq(evenements.sourceId, sourceId));

describe('evenements sous la sécurité par ligne', () => {
  it("n'est lu que par sa personne, et ne s'ouvre à personne d'autre", async () => {
    const { bob, carl } = await setup();
    const run = await runOf(bob);
    const shared = eventOf(bob, await runOf(bob), { acl: [bob.tenantId] });

    await withTenant(bob, (tx) => tx.insert(evenements).values(eventOf(bob, run)));

    const seenBy = async (ctx: TenantContext) =>
      (
        await withTenant(ctx, (tx) =>
          tx.select().from(evenements).where(eq(evenements.sourceId, run.sourceId)),
        )
      ).length;
    expect(await seenBy(bob)).toBe(1);
    expect(await seenBy(carl)).toBe(0);
    await expect(
      withTenant(bob, (tx) => tx.insert(evenements).values(shared)),
    ).rejects.toMatchObject(CHECK);
  });

  it("n'entre que pour une source dont la personne est propriétaire, dans son organisation", async () => {
    const { bob, carl, zoe } = await setup();
    const carlRun = await runOf(carl);

    // La source d'un collègue, à son propre nom : own_source refuse.
    await expect(
      withTenant(bob, (tx) => tx.insert(evenements).values(eventOf(bob, carlRun))),
    ).rejects.toMatchObject(REFUSED);
    // Au nom de Bob, dans l'organisation de Bob, depuis une autre organisation : tenant_acl refuse.
    await expect(
      withTenant(zoe, (tx) => tx.insert(evenements).values(eventOf(bob, carlRun))),
    ).rejects.toMatchObject(REFUSED);
  });

  it('un run ne donne qu’un événement', async () => {
    const { bob } = await setup();
    const run = await runOf(bob);
    await adminDb.insert(evenements).values(eventOf(bob, run));

    await expect(adminDb.insert(evenements).values(eventOf(bob, run))).rejects.toMatchObject({
      cause: { code: '23505' },
    });
  });

  it("l'app change l'étiquette et l'état, ni la clé de l'objet, et ne supprime pas", async () => {
    const { bob } = await setup();
    const run = await runOf(bob);
    const [created] = await adminDb
      .insert(evenements)
      .values(eventOf(bob, run))
      .returning({ id: evenements.id });
    const id = created?.id ?? '';
    const update = (values: Partial<typeof evenements.$inferInsert>) =>
      withTenant(bob, (tx) => tx.update(evenements).set(values).where(eq(evenements.id, id)));

    await expect(
      update({ etiquette: 'fin_reunion_client', triePar: 'regle', confiance: 1, statut: 'trie' }),
    ).resolves.toBeDefined();
    await expect(update({ cleObjet: 'fathom:meeting:autre' })).rejects.toMatchObject(REFUSED);
    await expect(
      withTenant(bob, (tx) => tx.delete(evenements).where(eq(evenements.id, id))),
    ).rejects.toMatchObject(REFUSED);
    expect(await eventsOf(run.sourceId)).toMatchObject([
      { etiquette: 'fin_reunion_client', statut: 'trie' },
    ]);
  });
});

describe('clé composée vers sources', () => {
  it('supprimer la source emporte ses événements', async () => {
    const { bob } = await setup();
    const run = await runOf(bob);
    await adminDb.insert(evenements).values(eventOf(bob, run));

    await adminPool.query('delete from sources where id = $1', [run.sourceId]);

    expect(await eventsOf(run.sourceId)).toEqual([]);
  });

  it("refuse un événement rattaché à la source d'une autre organisation", async () => {
    const { bob, zoe } = await setup();
    const foreign = await runOf(zoe);

    await expect(adminDb.insert(evenements).values(eventOf(bob, foreign))).rejects.toMatchObject({
      cause: { code: '23503' },
    });
  });
});

describe('runs_a_signaler', () => {
  const due = async (minutes: number) =>
    (
      await db.execute<{ ingest_run_id: string; tenant_id: string; user_id: string }>(
        sql`select * from runs_a_signaler(${minutes})`,
      )
    ).rows;
  const ago = (ms: number) => new Date(Date.now() - ms);

  it('rend un run fini, non signalé, de plus de N minutes, avec son organisation et sa personne', async () => {
    const { bob } = await setup();
    const run = await runOf(bob, { status: 'done', updatedAt: ago(10 * MINUTE) });

    expect(await due(5)).toContainEqual({
      ingest_run_id: run.ingestRunId,
      tenant_id: bob.tenantId,
      user_id: bob.userId,
    });
  });

  it("n'en rend ni un signalé, ni un récent, ni un fini depuis plus de 3 jours, ni un en cours", async () => {
    const { bob } = await setup();
    const signaled = await runOf(bob, { status: 'done', updatedAt: ago(10 * MINUTE) });
    await adminPool.query('update ingest_runs set signale_le = now() where id = $1', [
      signaled.ingestRunId,
    ]);
    const others = [
      signaled,
      await runOf(bob, { status: 'done', updatedAt: ago(MINUTE) }),
      await runOf(bob, { status: 'done', updatedAt: ago(4 * DAY) }),
      await runOf(bob, { status: 'running', updatedAt: ago(10 * MINUTE) }),
    ];

    const found = (await due(5)).map((row) => row.ingest_run_id);
    for (const run of others) expect(found).not.toContain(run.ingestRunId);
  });

  it("n'en rend pas pour un membre retiré ni pour un compte supprimé", async () => {
    const { bob, carl } = await setup();
    const gone = await runOf(bob, { status: 'done', updatedAt: ago(10 * MINUTE) });
    const deleted = await runOf(carl, { status: 'done', updatedAt: ago(10 * MINUTE) });
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, bob.userId), eq(members.organizationId, bob.tenantId)));
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, carl.userId));

    const found = (await due(5)).map((row) => row.ingest_run_id);
    expect(found).not.toContain(gone.ingestRunId);
    expect(found).not.toContain(deleted.ingestRunId);
  });
});

describe('purger_evenements', () => {
  it("supprime l'événement échu et garde les autres", async () => {
    const { bob } = await setup();
    const expired = await runOf(bob);
    const kept = await runOf(bob);
    await adminDb
      .insert(evenements)
      .values([
        eventOf(bob, expired, { expireLe: new Date(Date.now() - 1000) }),
        eventOf(bob, kept),
      ]);

    const purged = (await db.execute<{ n: number }>(sql`select purger_evenements() as n`)).rows[0]
      ?.n;

    expect(purged).toBeGreaterThanOrEqual(1);
    expect(await eventsOf(expired.sourceId)).toEqual([]);
    expect(await eventsOf(kept.sourceId)).toHaveLength(1);
  });
});
```

### 16.13 `0082-veilles.db.test.ts`

Il contient le troisième test « supprimer le parent » que demande la règle 7.1 de l'architecture : `veilles.source_id`, en `on delete set null (source_id)`.

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { agentsActives, veilles } from '@/server/db/schema/agents';
import { members } from '@/server/db/schema/auth';
import { reglagesOrganisation } from '@/server/db/schema/organisation';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant, seedSource } from '@/test/fixtures';
import { seedActivation } from '@/test/seed-agents';

// Migration 0082 : les veilles, privées à la personne. La clé vers la source est composée et en
// « set null (source_id) » : supprimer la source ne doit ni échouer ni effacer tenant_id.

const REFUSED = { cause: { code: '42501' } };
const DAY = 86_400_000;

// Les veilles échues de ce fichier ne restent pas dans la base partagée : tout part avec l'organisation.
const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

async function setup() {
  const { tenantId, members: created } = await createTestTenant(['Bob', 'Carl']);
  tenantIds.push(tenantId);
  const [bob, carl] = created as [TenantContext, TenantContext];
  return { bob, carl };
}

const watchOf = (
  ctx: TenantContext,
  activationId: string,
  values: Partial<typeof veilles.$inferInsert> = {},
): typeof veilles.$inferInsert => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
  activationId,
  agentId: 'relance_client',
  motif: 'attend_reponse',
  cleObjet: `outlook:message:${randomUUID()}`,
  echeanceLe: new Date(Date.now() + DAY),
  acl: [ctx.userId],
  ...values,
});

// Par le rôle propriétaire ; une activation neuve par veille, sauf si on en donne une.
async function seedWatch(
  ctx: TenantContext,
  values: Partial<typeof veilles.$inferInsert> = {},
): Promise<string> {
  const activationId = values.activationId ?? (await seedActivation(ctx));
  const [row] = await adminDb
    .insert(veilles)
    .values(watchOf(ctx, activationId, values))
    .returning({ id: veilles.id });
  if (!row) throw new Error('veille de test non créée');
  return row.id;
}

const watchRow = async (id: string) =>
  (await adminDb.select().from(veilles).where(eq(veilles.id, id)))[0];

describe('veilles sous la sécurité par ligne', () => {
  it('la personne ouvre sa veille ; elle seule la lit', async () => {
    const { bob, carl } = await setup();
    const activationId = await seedActivation(bob);

    await withTenant(bob, (tx) => tx.insert(veilles).values(watchOf(bob, activationId)));

    const seenBy = async (ctx: TenantContext) =>
      (await withTenant(ctx, (tx) => tx.select().from(veilles))).length;
    expect(await seenBy(bob)).toBe(1);
    expect(await seenBy(carl)).toBe(0);
  });

  it("n'entre que pour une activation de la personne", async () => {
    const { bob, carl } = await setup();
    const carlActivation = await seedActivation(carl);

    await expect(
      withTenant(bob, (tx) => tx.insert(veilles).values(watchOf(bob, carlActivation))),
    ).rejects.toMatchObject(REFUSED);
  });

  it('une veille par activation, motif et objet : la rouvrir, c’est la remettre à « ouverte »', async () => {
    const { bob } = await setup();
    const activationId = await seedActivation(bob);
    const first = watchOf(bob, activationId, { etat: 'close', closeLe: new Date() });
    await adminDb.insert(veilles).values(first);

    await expect(adminDb.insert(veilles).values(first)).rejects.toMatchObject({
      cause: { code: '23505' },
    });
    const echeance = new Date(Date.now() + 3 * DAY);
    await withTenant(bob, (tx) =>
      tx
        .insert(veilles)
        .values({ ...first, etat: 'ouverte', closeLe: null, echeanceLe: echeance })
        .onConflictDoUpdate({
          target: [veilles.tenantId, veilles.activationId, veilles.motif, veilles.cleObjet],
          set: { etat: 'ouverte', echeanceLe: echeance, closeLe: null },
        }),
    );

    const rows = await adminDb.select().from(veilles).where(eq(veilles.activationId, activationId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ etat: 'ouverte', closeLe: null });
  });

  it("l'app ne change que l'état et l'échéance, et ne supprime pas", async () => {
    const { bob } = await setup();
    const id = await seedWatch(bob);

    await expect(
      withTenant(bob, (tx) =>
        tx.update(veilles).set({ etat: 'close', closeLe: new Date() }).where(eq(veilles.id, id)),
      ),
    ).resolves.toBeDefined();
    await expect(
      withTenant(bob, (tx) =>
        tx.update(veilles).set({ cleObjet: 'outlook:message:autre' }).where(eq(veilles.id, id)),
      ),
    ).rejects.toMatchObject(REFUSED);
    await expect(
      withTenant(bob, (tx) => tx.delete(veilles).where(eq(veilles.id, id))),
    ).rejects.toMatchObject(REFUSED);
  });
});

describe('clés composées', () => {
  it('supprimer la source garde la veille : source_id passe à nul, tenant_id reste', async () => {
    const { bob } = await setup();
    const { sourceId } = await seedSource(bob);
    const id = await seedWatch(bob, { sourceId });

    // Seul le rôle propriétaire supprime une source dans un test ; en production, la suppression d'un document.
    await expect(
      adminPool.query('delete from sources where id = $1', [sourceId]),
    ).resolves.toMatchObject({ rowCount: 1 });

    expect(await watchRow(id)).toMatchObject({
      sourceId: null,
      tenantId: bob.tenantId,
      userId: bob.userId,
    });
  });

  it("supprimer l'activation emporte ses veilles", async () => {
    const { bob } = await setup();
    const activationId = await seedActivation(bob);
    const id = await seedWatch(bob, { activationId });

    await adminDb.delete(agentsActives).where(eq(agentsActives.id, activationId));

    expect(await watchRow(id)).toBeUndefined();
  });
});

describe('veilles_echues', () => {
  const due = async () =>
    (await db.execute<{ veille_id: string }>(sql`select * from veilles_echues(1000)`)).rows.map(
      (row) => row.veille_id,
    );
  const past = () => new Date(Date.now() - 60_000);

  it('rend une veille ouverte échue ; ni une veille à venir, ni une veille close', async () => {
    const { bob } = await setup();
    const echue = await seedWatch(bob, { echeanceLe: past() });
    const later = await seedWatch(bob);
    const closed = await seedWatch(bob, { echeanceLe: past(), etat: 'close', closeLe: new Date() });

    const found = await due();
    expect(found).toContain(echue);
    expect(found).not.toContain(later);
    expect(found).not.toContain(closed);
  });

  it("n'en rend pas pour une activation coupée, un membre retiré, une organisation coupée", async () => {
    const { bob, carl } = await setup();
    const cut = await seedWatch(bob, {
      echeanceLe: past(),
      activationId: await seedActivation(bob, { actif: false }),
    });
    const gone = await seedWatch(carl, { echeanceLe: past() });
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, carl.userId), eq(members.organizationId, carl.tenantId)));
    const { bob: zed } = await setup();
    const stopped = await seedWatch(zed, { echeanceLe: past() });
    await adminDb.insert(reglagesOrganisation).values({ tenantId: zed.tenantId, agentsActifs: false });

    const found = await due();
    for (const id of [cut, gone, stopped]) expect(found).not.toContain(id);
  });
});

describe('purger_veilles', () => {
  it('supprime une veille close depuis 31 jours et une veille jamais close échue depuis 31 jours', async () => {
    const { bob } = await setup();
    const long = new Date(Date.now() - 40 * DAY);
    const closedOld = await seedWatch(bob, {
      etat: 'close',
      closeLe: new Date(Date.now() - 31 * DAY),
      echeanceLe: long,
    });
    const forgotten = await seedWatch(bob, { echeanceLe: new Date(Date.now() - 31 * DAY) });
    const closedRecent = await seedWatch(bob, {
      etat: 'close',
      closeLe: new Date(Date.now() - DAY),
      echeanceLe: long,
    });
    const open = await seedWatch(bob);

    await db.execute(sql`select purger_veilles(30)`);

    expect(await watchRow(closedOld)).toBeUndefined();
    expect(await watchRow(forgotten)).toBeUndefined();
    expect(await watchRow(closedRecent)).toBeDefined();
    expect(await watchRow(open)).toBeDefined();
  });
});

describe('supprimer_agents_du_compte, complétée en 0082', () => {
  it('emporte les veilles de la personne, pas celles d’un collègue', async () => {
    const { bob, carl } = await setup();
    const mine = await seedWatch(bob);
    const theirs = await seedWatch(carl);

    await withTenant(bob, (tx) => tx.execute(sql`select supprimer_agents_du_compte()`));

    expect(await watchRow(mine)).toBeUndefined();
    expect(await watchRow(theirs)).toBeDefined();
  });
});
```

### 16.14 `0084-canaux-sortants.db.test.ts`

```ts
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { db } from '@/server/db/client';
import { members, users } from '@/server/db/schema/auth';
import {
  installationsSlack,
  messagesSortants,
  preferencesCanaux,
} from '@/server/db/schema/channels';
import { withTenant } from '@/server/db/with-tenant';
import { adminDb, adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedAgentAction, seedExecution, setRole } from '@/test/seed-agents';

// Migration 0084 : les canaux sortants. Préférences et journal des messages privés ; l'installation Slack lisible de
// l'organisation, écrite par un administrateur ; le compte Slack d'une personne écrit par lier_slack seulement.

const REFUSED = { cause: { code: '42501' } };

// Les actions en attente de ce fichier ne restent pas dans la base partagée (recaps_dus les rendrait) : tout part
// avec l'organisation.
const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

// Alice est administratrice, Bob et Carl membres ordinaires.
async function setup() {
  const { tenantId, members: created } = await createTestTenant(['Alice', 'Bob', 'Carl']);
  tenantIds.push(tenantId);
  const [alice, bob, carl] = created as [TenantContext, TenantContext, TenantContext];
  await setRole(alice, 'admin');
  return { alice, bob, carl };
}

const slackId = (prefix: 'T' | 'U') =>
  `${prefix}${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;

const link = async (ctx: TenantContext, slackUser: string | null) =>
  (
    await withTenant(ctx, (tx) =>
      tx.execute<{ ok: boolean }>(sql`select lier_slack(${slackUser}) as ok`),
    )
  ).rows[0]?.ok;

// Le formulaire des préférences : refait en place, sans slack_user_id.
const savePreferences = (
  ctx: TenantContext,
  values: { recapEmail?: boolean; recapHeure?: number; fuseau?: string; slack?: boolean },
) =>
  withTenant(ctx, (tx) =>
    tx
      .insert(preferencesCanaux)
      .values({ tenantId: ctx.tenantId, userId: ctx.userId, acl: [ctx.userId], ...values })
      .onConflictDoUpdate({
        target: [preferencesCanaux.tenantId, preferencesCanaux.userId],
        set: values,
      }),
  );

const preferencesOf = async (ctx: TenantContext) =>
  (
    await adminDb
      .select()
      .from(preferencesCanaux)
      .where(
        and(eq(preferencesCanaux.tenantId, ctx.tenantId), eq(preferencesCanaux.userId, ctx.userId)),
      )
  )[0];

describe('preferences_canaux', () => {
  it('est privée, et se refait en place', async () => {
    const { bob, carl } = await setup();

    await savePreferences(bob, { recapHeure: 9 });
    await savePreferences(bob, { recapHeure: 7, fuseau: 'Europe/Brussels' });

    expect(await preferencesOf(bob)).toMatchObject({ recapHeure: 7, fuseau: 'Europe/Brussels' });
    expect(await withTenant(carl, (tx) => tx.select().from(preferencesCanaux))).toEqual([]);
  });

  it("l'app n'écrit jamais slack_user_id : ni à l'insertion, ni à la modification", async () => {
    const { bob } = await setup();

    await expect(
      withTenant(bob, (tx) =>
        tx.insert(preferencesCanaux).values({
          tenantId: bob.tenantId,
          userId: bob.userId,
          slackUserId: slackId('U'),
          acl: [bob.userId],
        }),
      ),
    ).rejects.toMatchObject(REFUSED);
    await savePreferences(bob, { slack: true });
    await expect(
      withTenant(bob, (tx) =>
        tx
          .update(preferencesCanaux)
          .set({ slackUserId: slackId('U') })
          .where(eq(preferencesCanaux.userId, bob.userId)),
      ),
    ).rejects.toMatchObject(REFUSED);
  });
});

describe('lier_slack', () => {
  it('lie la personne à son compte Slack, puis la délie', async () => {
    const { bob } = await setup();
    const id = slackId('U');

    expect(await link(bob, id)).toBe(true);
    expect(await preferencesOf(bob)).toMatchObject({ slackUserId: id, recapEmail: true });
    expect(await link(bob, null)).toBe(true);
    expect(await preferencesOf(bob)).toMatchObject({ slackUserId: null });
  });

  it('un compte Slack ne se lie qu’à une personne par organisation', async () => {
    const { bob, carl } = await setup();
    const { bob: elsewhere } = await setup();
    const id = slackId('U');
    await link(bob, id);

    expect(await link(carl, id)).toBe(false);
    expect(await preferencesOf(carl)).toBeUndefined();
    // Dans une autre organisation, le même compte Slack se lie : l'unicité est par organisation.
    expect(await link(elsewhere, id)).toBe(true);
  });

  it('rend faux sans contexte ; lève sur une forme fausse', async () => {
    const { bob } = await setup();

    const outside = await db.execute<{ ok: boolean }>(sql`select lier_slack('U123') as ok`);
    expect(outside.rows[0]?.ok).toBe(false);
    await expect(link(bob, 'pas un identifiant')).rejects.toMatchObject({
      cause: { code: '23514' },
    });
  });
});

describe('installations_slack', () => {
  const install = (ctx: TenantContext, team = slackId('T')) =>
    withTenant(ctx, (tx) =>
      tx.insert(installationsSlack).values({
        tenantId: ctx.tenantId,
        teamId: team,
        botToken: 'v1:jeton-de-test',
        botUserId: slackId('U'),
        installePar: ctx.userId,
      }),
    );

  it('seul un administrateur installe, modifie ou désinstalle ; tout membre lit', async () => {
    const { alice, bob } = await setup();

    await expect(install(bob)).rejects.toMatchObject(REFUSED);
    await install(alice);
    expect(await withTenant(bob, (tx) => tx.select().from(installationsSlack))).toHaveLength(1);
    const changed = await withTenant(bob, (tx) =>
      tx
        .update(installationsSlack)
        .set({ botUserId: slackId('U') })
        .where(eq(installationsSlack.tenantId, bob.tenantId))
        .returning(),
    );
    const removed = await withTenant(bob, (tx) =>
      tx
        .delete(installationsSlack)
        .where(eq(installationsSlack.tenantId, bob.tenantId))
        .returning(),
    );

    expect(changed).toEqual([]);
    expect(removed).toEqual([]);
  });

  it('un espace Slack ne s’installe que dans une organisation', async () => {
    const { alice } = await setup();
    const { alice: other } = await setup();
    const team = slackId('T');
    await install(alice, team);

    await expect(install(other, team)).rejects.toMatchObject({ cause: { code: '23505' } });
  });
});

describe('messages_sortants et "user".locale', () => {
  const message = (ctx: TenantContext, cle: string) => ({
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    canal: 'email' as const,
    genre: 'recap' as const,
    cle,
    acl: [ctx.userId],
  });

  it("est privé ; une clé ne sert qu'une fois ; l'app ne change que statut et envoye_le", async () => {
    const { bob, carl } = await setup();
    const cle = `recap:${bob.userId}:2026-11-20`;
    const [sent] = await withTenant(bob, (tx) =>
      tx.insert(messagesSortants).values(message(bob, cle)).returning({ id: messagesSortants.id }),
    );
    const id = sent?.id ?? '';

    await expect(
      withTenant(bob, (tx) => tx.insert(messagesSortants).values(message(bob, cle))),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    expect(await withTenant(carl, (tx) => tx.select().from(messagesSortants))).toEqual([]);
    await withTenant(bob, (tx) =>
      tx
        .update(messagesSortants)
        .set({ statut: 'envoye', envoyeLe: new Date() })
        .where(eq(messagesSortants.id, id)),
    );
    await expect(
      withTenant(bob, (tx) =>
        tx.update(messagesSortants).set({ cle: 'autre' }).where(eq(messagesSortants.id, id)),
      ),
    ).rejects.toMatchObject(REFUSED);
  });

  it('"user".locale refuse une langue inconnue', async () => {
    const { bob } = await setup();

    await expect(
      adminPool.query(`update "user" set locale = 'de' where id = $1`, [bob.userId]),
    ).rejects.toThrow(/user_locale_check/);
  });
});

describe('compte_slack', () => {
  async function linked() {
    const { alice, bob } = await setup();
    const team = slackId('T');
    const slackUser = slackId('U');
    await adminDb.insert(installationsSlack).values({
      tenantId: alice.tenantId,
      teamId: team,
      botToken: 'v1:jeton-de-test',
      botUserId: slackId('U'),
      installePar: alice.userId,
    });
    await link(bob, slackUser);
    await savePreferences(bob, { slack: true });
    return { bob, team, slackUser };
  }
  const of = async (team: string, slackUser: string) =>
    (
      await db.execute<{ tenant_id: string; user_id: string }>(
        sql`select * from compte_slack(${team}, ${slackUser})`,
      )
    ).rows;

  it('rend la personne liée ; rien pour un autre espace', async () => {
    const { bob, team, slackUser } = await linked();

    expect(await of(team, slackUser)).toEqual([{ tenant_id: bob.tenantId, user_id: bob.userId }]);
    expect(await of(slackId('T'), slackUser)).toEqual([]);
  });

  it('rien quand la personne a coupé Slack, a quitté l’organisation ou supprimé son compte', async () => {
    const off = await linked();
    await savePreferences(off.bob, { slack: false });
    const gone = await linked();
    await adminDb
      .delete(members)
      .where(and(eq(members.userId, gone.bob.userId), eq(members.organizationId, gone.bob.tenantId)));
    const deleted = await linked();
    await adminDb.update(users).set({ deletedAt: new Date() }).where(eq(users.id, deleted.bob.userId));

    for (const { team, slackUser } of [off, gone, deleted]) {
      expect(await of(team, slackUser)).toEqual([]);
    }
  });
});

describe('recaps_dus', () => {
  const due = async () =>
    (await db.execute<{ user_id: string }>(sql`select * from recaps_dus(1000)`)).rows.map(
      (row) => row.user_id,
    );
  const pending = async (ctx: TenantContext) => seedAgentAction(ctx, await seedExecution(ctx));

  it("rien sans action en attente ; dû avec une, à l'heure passée ; plus rien une fois parti", async () => {
    const { bob, carl } = await setup();
    await savePreferences(bob, { recapHeure: 0 });
    await savePreferences(carl, { recapHeure: 0 });
    await pending(bob);

    expect(await due()).toContain(bob.userId);
    expect(await due()).not.toContain(carl.userId);

    await withTenant(bob, (tx) =>
      tx.insert(messagesSortants).values({
        tenantId: bob.tenantId,
        userId: bob.userId,
        canal: 'email',
        genre: 'recap',
        cle: `recap:${bob.userId}:${randomUUID()}`,
        acl: [bob.userId],
      }),
    );
    expect(await due()).not.toContain(bob.userId);
  });

  it('rien avec recap_email = faux ; un fuseau inconnu ne fait pas échouer la fonction', async () => {
    const { bob, carl } = await setup();
    await savePreferences(bob, { recapHeure: 0, recapEmail: false });
    await adminDb
      .insert(preferencesCanaux)
      .values({ tenantId: carl.tenantId, userId: carl.userId, fuseau: 'Mars/Olympus', acl: [carl.userId] });
    await pending(bob);
    await pending(carl);

    const found = await due();
    expect(found).not.toContain(bob.userId);
    expect(found).not.toContain(carl.userId);
  });

  it('sans ligne de préférences : 8 h, heure de Paris', async () => {
    const { bob } = await setup();
    await pending(bob);
    const { rows } = await adminPool.query<{ past: boolean }>(
      "select extract(hour from now() at time zone 'Europe/Paris') >= 8 as past",
    );

    expect((await due()).includes(bob.userId)).toBe(rows[0]?.past);
  });
});

describe('supprimer_agents_du_compte, complétée en 0084', () => {
  it('emporte les préférences et le journal des messages de la personne', async () => {
    const { bob, carl } = await setup();
    await link(bob, slackId('U'));
    await savePreferences(carl, { recapHeure: 9 });
    await withTenant(bob, (tx) =>
      tx.insert(messagesSortants).values({
        tenantId: bob.tenantId,
        userId: bob.userId,
        canal: 'slack',
        genre: 'validation',
        cle: `validation:${bob.userId}:${randomUUID()}`,
        acl: [bob.userId],
      }),
    );

    await withTenant(bob, (tx) => tx.execute(sql`select supprimer_agents_du_compte()`));

    expect(await preferencesOf(bob)).toBeUndefined();
    expect(
      await adminDb.select().from(messagesSortants).where(eq(messagesSortants.userId, bob.userId)),
    ).toEqual([]);
    expect(await preferencesOf(carl)).toBeDefined();
  });
});
```

### 16.15 `0085-agents-statistiques.db.test.ts`

```ts
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import { withTenant } from '@/server/db/with-tenant';
import { adminPool } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';
import { seedActivation, seedAgentAction, seedExecution, setRole } from '@/test/seed-agents';

// Migration 0085 : le taux d'acceptation, des compteurs par agent pour les administrateurs, jamais par personne :
// aucune ligne en dessous de trois personnes.

const AGENT = 'suivi_echange'; // l'agent de seedExecution
const PAST = new Date(Date.now() - 60_000);

const tenantIds: string[] = [];
afterAll(async () => {
  await adminPool.query('delete from organization where id = any($1)', [tenantIds]);
});

// Alice administre ; les membres nommés ont la fiche en service.
async function organisation(names: string[]): Promise<{ alice: TenantContext; others: TenantContext[] }> {
  const { tenantId, members } = await createTestTenant(['Alice', ...names]);
  tenantIds.push(tenantId);
  const [alice, ...others] = members as [TenantContext, ...TenantContext[]];
  await setRole(alice, 'admin');
  for (const ctx of others) await seedActivation(ctx, { agentId: AGENT });
  return { alice, others };
}

const rates = async (ctx: TenantContext) =>
  (
    await withTenant(ctx, (tx) =>
      tx.execute<Record<string, string | number>>(sql`select * from taux_acceptation_agents(30)`),
    )
  ).rows;

// Bob : une expirée. Carl : une faite au clic, une défaite faite sans clic. Dan : une annulée, une faite sans clic,
// et une simulation qui ne compte pas.
async function threePeople() {
  const { alice, others } = await organisation(['Bob', 'Carl', 'Dan']);
  const [bob, carl, dan] = others as [TenantContext, TenantContext, TenantContext];
  const act = async (ctx: TenantContext, values: Parameters<typeof seedAgentAction>[2]) =>
    seedAgentAction(ctx, await seedExecution(ctx), values);
  await act(bob, { expireLe: PAST });
  await act(carl, { status: 'faite', decidePar: 'personne' });
  await act(carl, { status: 'defaite', decidePar: 'autonomie' });
  await act(dan, { status: 'annulee' });
  await act(dan, { status: 'faite', decidePar: 'autonomie' });
  await seedAgentAction(dan, await seedExecution(dan, { mode: 'simulation' }), { simulation: true });
  return { alice, bob };
}

describe('taux_acceptation_agents', () => {
  it('compte, par agent, ce que trois personnes ont fait de ses propositions', async () => {
    const { alice } = await threePeople();

    expect(await rates(alice)).toEqual([
      {
        agent_id: AGENT,
        proposees: 5,
        faites: 2,
        annulees: 1,
        expirees: 1,
        defaites: 1,
        faites_sans_clic: 2,
      },
    ]);
  });

  it('ne rend rien à un membre ordinaire', async () => {
    const { bob } = await threePeople();

    expect(await rates(bob)).toEqual([]);
  });

  it('ne rend rien quand deux personnes seulement ont la fiche', async () => {
    const { alice, others } = await organisation(['Bob', 'Carl']);
    for (const ctx of others) await seedAgentAction(ctx, await seedExecution(ctx));

    expect(await rates(alice)).toEqual([]);
  });

  it('ne rend rien quand les actions comptées viennent de moins de trois personnes', async () => {
    const { alice, others } = await organisation(['Bob', 'Carl', 'Dan']);
    const [bob] = others as [TenantContext];
    await seedAgentAction(bob, await seedExecution(bob));

    expect(await rates(alice)).toEqual([]);
  });

  it("ne voit ni ne compte une autre organisation", async () => {
    const { alice } = await threePeople();
    const { alice: zoe } = await organisation([]);
    await seedAgentAction(zoe, await seedExecution(zoe), { status: 'faite' });

    expect(await rates(zoe)).toEqual([]);
    expect((await rates(alice))[0]).toMatchObject({ proposees: 5, faites: 2 });
  });
});
```

## 17. Ordre de mise en œuvre

L'ordre est celui de l'architecture (14.3). Ce chapitre fournit la part « données » de chaque PR. Cette part peut partir seule, juste avant le code qui s'en sert : chaque migration est compatible avec le code d'avant (section 2.3, point 5), et une PR de SQL seul se relit mieux. Le chapitre 14 tranche le découpage ; l'ordre ne change pas.

| PR (architecture, 14.3) | Migrations | Fichiers de ce chapitre | Ce que l'autre doit vérifier |
|---|---|---|---|
| 3. Sortie structurée | 0075 | le SQL ; `0075-…db.test.ts` (section 16.11) ; les quatre lignes `LEON_MODEL_*` de `.env.example` (section 15.4) | Le `check` garde la forme `step in (…)`. `0039-tableau-admin.db.test.ts` passe toujours |
| 4. Budget | 0076 | le SQL ; `0076-…db.test.ts` ; `src/test/seed-agents.ts` (`setRole`) | Les deux tables n'ont aucun droit, les deux gestes internes non plus. Une valeur négative lève, un plafond atteint rend faux |
| 5. Événements, règles, routage | 0077, 0078 | les deux SQL et leurs tests (sections 16.12 et 16.4) ; `schema/agents.ts` (`evenements`, `agentsActives`) ; `signaleLe` dans `schema/memory.ts` ; trois colonnes dans `schema/organisation.ts` ; `src/lib/agents.ts` avec ses trois listes ; `COMPOSITE_KEYS` (`evenements`) ; `seed-agents.ts` (`hex64`, `seedActivation`) | La durée de `update ingest_runs` sur la base de production. Les deux règles restrictives de `agents_actives` |
| 6. Moteur linéaire | 0079 | le SQL et son test ; `schema/agents.ts` (`executionsAgent`, `etapesExecution`) ; `seed-agents.ts` (`seedExecution`) | `executions_a_reveiller` sans jointure sur `member` (écart 1). Le budget d'une exécution par `reserver_budget_execution` et `solder_budget_execution` (écart 3), et la borne de trois reprises (écart 22). Le test qui supprime l'activation |
| 7. Actions généralisées | 0080, 0081 | les deux SQL et leurs tests ; `schema/actions.ts` ; `renewLockAt` dans `schema/connections.ts` ; `ACTION_STATUSES` et la carte d'action (section 15.5) ; `VALIDATED_IN_CODE` ; l'appel dans `deleteAccount` et ses deux tests ; `seed-agents.ts` (`seedAgentAction`) | Le défaut de `expire_le`. Les deux contraintes ajoutées. Le test qui supprime l'exécution. L'erreur `28000` sans contexte, et l'appel de `couper_agents_du_membre` sous `withTenant` par `departure.ts` |
| après : veilles et horloge | 0082 | le SQL et son test (section 16.13) ; `veilles` dans `schema/agents.ts` ; `COMPOSITE_KEYS` (`veilles`) | `purger_veilles`, qui n'est pas dans l'architecture. Le test qui supprime la source |
| après : webhooks | 0083 | `docker/postgres/init.sql` ; README ; le SQL et son test ; `schema/webhooks.ts` ; `DELETE_ALLOWED` ; `prendre-livraison.test.ts` | Le rôle `leon_porte` est créé en production **avant** la mise en ligne. Les états `manuelle`, `ignoree`, `echouee` (écarts 2 et 4). `inbox.ts` prend une livraison dans une transaction validée après la mise en file (section 11) |
| après : récapitulatif et Slack | 0084 | le SQL et son test (section 16.14) ; `schema/channels.ts` ; `locale` dans `schema/auth.ts` ; `DELETE_ALLOWED` | Le défaut `recap_email = true`. La forme des identifiants Slack. `linkSlackUser` passe par `lier_slack` (écart 23) |
| après : statistiques | 0085 | le SQL et son test (section 16.15) | Les deux seuils de trois personnes. Le `lock_timeout` avant l'index sur `actions` |

Pour chaque PR, dans cet ordre :

```bash
cd ~/leon && git fetch origin --prune && git pull --ff-only
gh pr list                                   # personne n'a pris le numéro de migration
git worktree add --no-track -b <prenom>/<sujet> .claude/worktrees/<sujet> origin/main
cd .claude/worktrees/<sujet>
# … poser le SQL, le schéma, les tests …
pnpm db:migrate                              # sur la base locale leon
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm test:db
# Si main prend le numéro après ce db:migrate : renuméroter, puis renommer la ligne de leon_migrations dans chaque
# base touchée (leon, leon_test), section 2.3, « Numéros ».
```

Trois choses à savoir avant de fusionner :

- **`pnpm lint` reformate.** Le code de ce chapitre est écrit à la main : quelques lignes de test dépassent les 100 colonnes de Biome (`biome.json`). `pnpm exec biome check --write` les replie.
- **`leon_test` est partagée.** Une migration fusionnée s'applique à la base de test de tous au prochain `pnpm test:db` (`src/test/global-setup.ts`). À partir de 0083, un volume local ancien doit avoir reçu le rôle `leon_porte` (section 15.3) : sinon la migration s'arrête, avec la commande.
- **Aucune de ces migrations n'est destructive** : rien n'entre dans `MIGRATIONS_DESTRUCTIVES` (`src/test/test-env.ts:11`). Il n'y a pas de migration de retour : chaque fichier ne fait qu'ajouter, et l'ancien code tourne sur le nouveau schéma.

À la mise en ligne (chapitre 13) : `web` et `worker` lancent `pnpm db:migrate` avant de démarrer, sous verrou consultatif. Deux cas à surveiller : une migration qui touche une table existante (0075, 0077, 0078, 0080, 0081, 0084, 0085) échoue sur `lock_timeout` si une longue transaction tient cette table (relancer suffit) ; 0083 échoue tant que `leon_porte` n'existe pas.

## 18. Écarts avec l'architecture

Aucun nom de l'architecture n'est changé ni retiré : tables, colonnes, fonctions, paramètres, numéros et noms de fichiers sont les siens. Deux règles écrites en 7.2 sont tenues autrement (écarts 21 et 23), deux fonctions sont doublées par une variante liée à l'exécution (écart 3), et une borne est ajoutée (écart 22) ; l'architecture n'est pas modifiée, la proposition est dans la dernière colonne. Ce qui suit est ce qui ne pouvait pas être suivi à la lettre, puis ce que j'ai ajouté ou tranché là où elle ne dit rien. Les écarts 21 à 23 et les précisions 24 à 30 viennent de la relecture contradictoire (section 20).

### 18.1 Écarts

| # | Ce que dit l'architecture | Ce qui heurte, et la preuve | Ce qui est écrit ici, et ma proposition |
|---|---|---|---|
| 1 | 7.1 : « une fonction de tic qui rend une personne joint `member` et écarte un compte supprimé ». 7.4 : `executions_a_reveiller` rend les exécutions `en-attente` échues et `en-cours` au verrou vieux | 9.10 veut qu'une exécution d'un membre retiré finisse `annulee`, raison `parti`, « au job suivant ». `removeMember` supprime la ligne `member` (`members.ts:116-130`). Si le tic taisait ses exécutions, celle qui attend n'aurait jamais de job suivant (sa réserve de budget, elle, est soldée par `purger_executions` une fois l'exécution finie, écart 3) | `executions_a_reveiller` **ne joint pas `member`**. Le moteur ferme l'exécution, qui sort alors de la liste. À savoir pour le chapitre 04 : `resolveTenantContext` rend `null` pour un membre retiré ; pour écrire `annulee` sur une ligne privée à cette personne, le moteur bâtit le contexte à la main (`{ tenantId, userId, principals: [userId] }`). Autre voie, plus sûre, si les deux fondateurs la préfèrent : `couper_agents_du_membre` ferme aussi les exécutions en cours (un `update` de plus), et le tic reprend la jointure. J'ajoute aussi un troisième cas au tic : `en-file` depuis plus de 15 minutes (job perdu entre l'écriture et l'envoi) |
| 2 | 7.4 : `porte_secret` rend « le secret chiffré d'un abonnement `active` » ; `porte_deposer` compte les abonnements actifs | 8.3 définit l'état `manuelle` : une adresse collée à la main dans l'outil, que `subscribeConnection` ne touche pas. Si la porte la refusait, cet état ne servirait à rien | Les quatre fonctions qui demandent « en service » acceptent `active` et `manuelle` (`porte_secret`, `porte_deposer`, `prendre_livraison`, `connexions_du_compte`). `abonnements_a_renouveler` ne rend que `active`. Si aucun outil du premier lot n'a d'adresse manuelle, retirer l'état de la liste plutôt que de le laisser sans usage |
| 3 | 7.4 : `reserver_budget(p_usd, p_plafond_mois_usd, p_plafond_jour_usd)` réserve « avant chaque exécution et chaque appel de tri » ; `solder_budget(p_reserve_usd, p_reel_usd)` solde « à la fin ». 9.2 : le moteur rejoue un déroulé depuis le début après une panne. 9.3, point 5 : une exécution d'agent d'équipe n'est pas soumise au plafond du jour (`p_plafond_jour_usd` nul) | Rien ne relie une réserve à son exécution. Une reprise qui rappelle `reserver_budget` réserve deux fois ; un `solder_budget` rejoué (panne entre le solde et l'écriture du statut) rend deux fois, et compte deux fois la dépense ; une exécution qui meurt garde sa réserve jusqu'à la fin du mois ; un appelant peut rendre plus qu'il n'a pris. Le plafond du mois, vrai garde-fou de coût, dérive dans les deux sens. Et `solder_budget` ne sait pas si la réserve avait touché la journée : la première version comptait donc toujours la journée, et la dépense d'un agent d'équipe épuisait le plafond personnel de son activateur | Les deux fonctions de l'architecture restent, avec leur signature, pour le tri. Une exécution passe par deux fonctions de plus, en 0079 : `reserver_budget_execution(p_execution uuid, p_usd, p_plafond_mois_usd, p_plafond_jour_usd)` et `solder_budget_execution(p_execution uuid, p_reel_usd)`. La réserve est écrite sur la ligne (`reserve_usd`, `reserve_jour`, `solde_le`, trois colonnes de plus à `executions_agent`, sans droit d'écriture pour l'app) : prise une fois, soldée une fois, et soldée par `purger_executions` si l'exécution finit sans solde. La journée n'est comptée que pour un agent personnel : la fonction lit la portée de l'activation, ce qui tient 9.3, point 5, à la lettre. Le tri garde le solde non idempotent, borné par `TRIAGE_RESERVE_USD`. Proposition : remplacer en 7.4 et 9.3 « `reserver_budget` avant chaque exécution » par `reserver_budget_execution`, et ajouter les trois colonnes en 7.2 |
| 4 | 7.2 : `boite_entree_webhooks.statut` vaut `recue`, `traitee`, `ignoree` ou `echouee`. 7.4 : `prendre_livraison` « rend le corps une seule fois : le même geste le vide et passe la ligne à `traitee` » | `leon_app` n'a aucun droit sur la table. Aucune fonction de 7.4 ne pose `ignoree` ni `echouee`. Et un geste validé tout de suite perdrait la livraison si le worker mourait avant la mise en file : le job rejoué trouverait 0 ligne | `prendre_livraison` pose `ignoree` (abonnement plus en service, personne partie). `purger_boite_entree` pose `echouee` (restée `recue` 24 heures). Le geste reste unique, comme l'écrit 7.4, mais `inbox.ts` l'appelle dans une transaction qu'il ne valide qu'après `match` et la mise en file (section 11) : un échec annule la prise. Limite : un échec de la relève ciblée, après la validation, laisse la ligne `traitee`. Si le poste de contrôle doit le montrer : une fonction `marquer_livraison(p_id uuid, p_statut text)`, à ajouter au chapitre 03 |
| 5 | 10.1 : le tic `standard-lot` trie « les événements restés `recu`, 20 au plus par appel, par personne » | Un tic n'a pas de contexte, et `evenements` est privée : aucune fonction de 7.4 ne lui dit pour qui travailler (`runs_a_signaler` ne sert que le rattrapage) | Rien n'est créé : c'est après le jalon 1 et hors de ma liste. Proposition, à poser dans la migration du lot « tri par le modèle » : `evenements_a_trier(p_max integer) returns table (tenant_id uuid, user_id uuid)`, les personnes membres qui ont un événement `recu` de plus de 2 minutes, sur l'index `evenements_recus_idx` déjà créé par 0077. Corps en 18.3 |
| 6 | 9.3, point 8 : à 80 % du plafond du mois, les administrateurs sont prévenus (`messages_sortants`, genre `alerte`) | `budget_du_mois()` ne répond qu'à un administrateur, et le plafond est un paramètre du code. L'exécution qui passe le seuil tourne au nom d'un membre ordinaire. Et une ligne de `messages_sortants` est privée à son destinataire : elle ne s'écrit que sous son contexte | Rien n'est créé. À concevoir aux chapitres 07 et 11. Piste : `reserver_budget` reste telle quelle ; un tic lit une fonction hors contexte qui rend, par organisation, le réservé plus le dépensé du mois et le plafond réglé ; le worker écrit l'alerte sous le contexte de chaque administrateur |
| 7 | 7.4 liste les fonctions à écrire | 9.6, point 10 : « une veille close [est supprimée] après 30 jours », et l'app ne supprime pas dans `veilles`. `recaps_dus` lit un fuseau par personne : un nom inconnu de Postgres fait lever `at time zone`, donc échouer le tic de tout le monde | Deux fonctions de plus : `purger_veilles(p_jours integer)` (0082), appelée une fois par heure par `agent-veilles` ; `heure_locale(p_fuseau text)` (0084), interne, sans droit pour `leon_app` |
| 21 | 7.2, `agents_actives` : « unique `(tenant_id, agent_id, user_id)` » | Un administrateur qui a la fiche pour lui ne peut plus l'activer pour l'équipe, ni l'inverse : le cas se produit dès qu'un fondateur essaie une fiche seul, puis la propose à tous. `reprendre_agent_equipe` échouait de même pour un repreneur qui avait la fiche à titre personnel, et rendait faux comme pour « activateur encore valable » | La clé est `unique (tenant_id, agent_id, user_id, portee)`. L'index partiel `agents_actives_equipe_idx` garde une seule activation d'équipe par fiche ; `reprendre_agent_equipe` n'a plus de refus caché. Au routage (chapitre 02), un administrateur qui a les deux activations peut recevoir deux propositions sur le même objet. Proposition : corriger la clé en 7.2 |
| 22 | 7.4 : `executions_a_reveiller` rend les exécutions « `en-cours` dont `verrou_le` a plus de 2 minutes » ; 7.2 ne borne pas les reprises | Une exécution qui fait tomber le moteur à chaque passage serait reprise sans fin, chaque fois aux frais des étapes non journalisées. Et un `en-cours` sans verrou, écrit en deux temps, serait pris pour mort | Colonne `reprises smallint`, comptée par la requête du verrou ; `executions_a_reveiller` ne rend plus une exécution reprise 3 fois, et `purger_executions` la ferme (`echouee`, raison `erreur`, `erreur = 'reprises'`). Contrainte `executions_agent_verrou_check` : `en-cours` porte toujours son verrou ; le cas `verrou_le is null` sort du tic. Proposition : ajouter `reprises` en 7.2 et la borne en 7.4 |
| 23 | 7.2, `preferences_canaux` : `slack_user_id` « posé par `linkSlackUser`, jamais par un formulaire », sans règle qui le tienne ; 7.1 : `grant update (colonnes)` colonne par colonne | Avec la colonne dans le droit de modification, un membre pouvait s'attribuer l'identifiant Slack d'un collègue : l'index unique le réservait, le collègue ne pouvait plus lier son compte, et ses clics Slack arrivaient sous le contexte de l'autre | Fonction `lier_slack(p_slack_user text)`, seule écriture de la colonne, appelée par `linkSlackUser` ; colonne hors du droit de modification ; règle restrictive `slack_par_lier_slack` à l'insertion (pas de droit d'insertion colonne par colonne : Drizzle nomme toutes les colonnes). `compte_slack` exige en plus `slack = vrai`. Proposition : ajouter `lier_slack` en 7.4 |

### 18.2 Ajouts et précisions

Rien ici ne contredit l'architecture. C'est ce qu'elle ne fixe pas et qu'il fallait écrire.

| # | Sujet | Ce qui est écrit | Pourquoi |
|---|---|---|---|
| 8 | `actions.expire_le` | `not null`, avec un défaut d'une heure | L'ancien `proposeAction` insère sans la colonne pendant le recouvrement (architecture, 4.1, règle 6) |
| 9 | Règles et contraintes de plus | `own_source` (`evenements`) ; `own_activation` (`executions_agent`, `veilles`) ; `own_connection` est celle que demande l'architecture. `actions_origine_cle_check`, `actions_simulation_statut_check`. `reserver_execution` vérifie que l'activation est en service et que la personne peut la déclencher. La sécurité par ligne est activée aussi sur `executions_par_jour` et `creneaux_ecriture` | Les clés étrangères se vérifient hors sécurité par ligne (carte 07, piège 4). Les deux contraintes tiennent en base ce que le code promet (9.2, 9.7) |
| 10 | `supprimer_agents_du_compte` | Supprime aussi le compteur du jour (`budgets_personne_jour`) et le journal des messages (`messages_sortants`) de la personne, et rend au mois de l'organisation les réserves encore ouvertes de ses exécutions | Deux tables qui portent `user_id` : sans cela elles survivraient au compte, dont la ligne `"user"` reste (carte 07, piège 7). Une réserve d'exécution supprimée resterait comptée jusqu'à la fin du mois |
| 11 | Actions de simulation | Quand `purger_executions` supprime une simulation, ses actions restent, `execution_id` nul | `actions` ne se supprime jamais. Le chapitre 12 dit si elles s'affichent encore |
| 12 | Activation d'équipe | Tout administrateur peut la régler ou la réactiver ; elle tourne toujours au nom de son activateur | C'est la règle de mise à jour de l'architecture (7.2), appliquée telle quelle. À relire avec la question Q4 |
| 13 | `taux_acceptation_agents` | Deux seuils : trois personnes ont la fiche en service, **et** les actions comptées viennent de trois personnes. Un agent d'équipe n'a jamais de ligne | Le premier seuil seul laisserait lire l'activité d'une personne (9.11) |
| 14 | `preferences_canaux.recap_email` | Vrai par défaut ; sans ligne, le récapitulatif part à 8 h, heure de Paris. « Quelque chose à dire » : une action d'agent en attente et pas expirée, ou une action faite sans clic depuis 24 heures | L'architecture fixe l'heure et le fuseau, pas ce défaut. À confirmer : un e-mail part sans que la personne ait rien réglé |
| 15 | Abonnements d'un membre qui revient | Ils restent `resiliee`, donc jamais recréés ; la relève de 15 minutes continue | Conforme à 8.3. À traiter au chapitre 03 : « Reconnecter » supprime les abonnements `resiliee` de la connexion |
| 16 | Listes fermées en SQL | `veilles.motif` est fermée (un motif de plus : une migration). `evenements.etiquette`, `outil` et `nature` ne le sont pas | 8.4 : ajouter une étiquette est « une PR » dans `labels.ts`. Un motif, lui, change le standard |
| 17 | Bornes internes | `runs_a_signaler` : fenêtre de 3 jours, pas de plafond. Les fonctions à `p_max` : 1 000 au plus. `connexions_du_compte` : 20. `reserver_creneau` : pas de 10 minutes, retard d'une heure. `webhooks_a_traiter` : 30 secondes. `executions_a_reveiller` : 15 minutes en file, 3 reprises (écart 22). `porte_deposer` : `dernier_recu_le` écrit toutes les 10 minutes au plus | Aucune n'est dans l'architecture ; toutes évitent qu'une valeur aberrante ou une ligne oubliée gèle un tic |
| 18 | Solde à minuit | Une exécution à cheval sur minuit, ou sur la fin du mois, est soldée sur le jour et le mois du solde (`budget_rendre`) | La réserve ne garde pas sa date. L'écart est borné par une réservation (0,50 $ au plus) |
| 19 | `actions.decide_par` | Reste nul pour une action annulée par `couper_agents_du_membre` ou `supprimer_agents_du_compte` | Ni un clic, ni l'autonomie |
| 20 | `ACTION_STATUSES` | Gagne `'defaite'` dans la PR de 0080, et la carte d'action de la discussion l'affiche (section 15.5) | 7.5 ne le liste pas, 8.2 le dit. Sans cela `schema-contract` échoue ; sans la carte, une action défaite s'afficherait « Expirée » |
| 24 | `reserver_budget` « rejette une valeur négative » (7.4) | Lève `22023` sur une valeur négative ou absente, ou un plafond négatif, comme `solder_budget` ; rend faux pour un plafond atteint ou sans contexte | Le moteur distingue ainsi un plafond atteint (`ignoree`, raison `budget`) d'une faute de calcul de `limits.maxUsd`, qui sinon passerait en silence pour un refus |
| 25 | Fonctions « pour soi » sans contexte | `couper_agents_du_membre` et `supprimer_agents_du_compte` lèvent `28000` sans contexte, au lieu de rendre 0 | `removeMember` et `setMemberRole` travaillent sur `db` nu : un appel sans `withTenant` ne couperait rien, sans erreur, comme pour un non-administrateur |
| 26 | `prendre_livraison` | Appelée hors contexte, mais dans une transaction validée après `match` et la mise en file (section 11) | Sans cela une livraison est perdue quand le worker meurt entre la prise et la mise en file (écart 4) |
| 27 | Verrou d'une migration | `set local lock_timeout = '5s'` aussi devant le `create index` de 0085 sur `actions` | Un `create index` bloque les écritures de la table et attend derrière les transactions en cours, comme un `alter` |
| 28 | Renumérotation | Une ligne de `leon_migrations` renommée par base touchée, plutôt que des fichiers rejouables (section 2.3) | Le runner compare par nom de fichier. La carte 07 (piège 15) rend le fichier rejouable ; ici, les formes `if not exists` cacheraient un vrai écart entre deux bases |
| 29 | Listes de 7.5 | Les lignes `PUBLIC` et `.env.example` sont écrites ici, avec la PR où chacune entre (section 15.4) | Aucun chapitre ne les avait dans sa colonne « Fixe ». Leurs contrats exigent qu'elles entrent avec le code qu'elles gardent |
| 30 | `compte_slack` | Aucune ligne si la personne a coupé Slack (`slack = faux`) | Une personne qui coupe Slack ne valide plus rien depuis un ancien message |

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

- **Rien n'a tourné sur la base du projet, ni sur Postgres 17.** Le banc est un Postgres 16.15 jetable, monté hors du dépôt (rôles et bases de `docker/postgres/init.sql` plus les lignes de la section 15.2), qui porte les 61 fichiers de migration du dépôt puis les onze de ce chapitre, une transaction par fichier. Une retouche à l'existant, dans une copie de travail seulement : `0011-passages.sql` y prend `vector(1024)` et `vector_cosine_ops` au lieu de `halfvec`, que pgvector 0.6.0 (le seul paquet installable ici ; le dépôt de PGDG et GitHub sont fermés à cette machine) n'a pas. Aucune erreur de SQL.
- **Ce qui a tourné sur ce banc.** Les schémas Drizzle de la section 14, les fixtures de 16.1 et les tests de 16.3 à 16.9 et 16.11 à 16.15, compilés par TypeScript 5.9 (`tsc --noEmit`, sans erreur) et lancés par vitest 3.2.7 avec Drizzle 0.45.4 et `pg` 8 : 152 tests, tous passent. Les fichiers du dépôt qu'ils importent (`fixtures.ts`, `seed-search.ts`, `db.ts`, `with-tenant.ts`, `tenant-context.ts`, les schémas existants) sont des copies, avec des bouchons pour `client.ts` et `test-env.ts`. Le contrat de schéma (`schema-contract`) rejoué sur ce banc ne trouve qu'un écart, celui de la retouche de `0011`. Vérifié aussi en SQL : les 28 fonctions `security definer` nouvelles posent `search_path = public, pg_temp` (test 0046) ; `leon_app` n'a `delete` que sur `abonnements_webhook` et `installations_slack` ; `leon_porte` n'a reçu que deux droits ; le corps de `evenements_a_trier` (18.3) se crée et s'exécute.
- **Ce qui n'a pas tourné.** `pnpm test:db` lui-même (son `global-setup.ts`, les autres tests du dépôt ; `rls-coverage`, `tenant-integrity` et `0046` ont été rejoués ici en SQL seulement, et rendent les listes de la section 15.4) ; les deux cas de `delete-account.db.test.ts` (16.10), qui demandent le vrai `deleteAccount` ; `pnpm lint` (Biome repliera quelques lignes, section 17) ; le contrat `route-guards` et `env-contract` avec les lignes de 15.4, qui n'entrent qu'avec le code des chapitres 03, 07, 11 et 13 ; le libellé de 15.5 dans `translation-keys.test.ts`.
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
- **Les autres chapitres.** Ils sont écrits en parallèle : je n'ai pas vérifié que le chapitre 04 ferme bien l'exécution d'un membre parti (écart 1), réserve et solde par `reserver_budget_execution` et `solder_budget_execution` dans des `withTenant` courts (écart 3) et prend le verrou par la requête de la section 7 ; que le chapitre 02 reprend `evenements_a_trier` (écart 5) ; que le chapitre 03 prend une livraison dans une transaction (écart 4) ; que le chapitre 06 appelle `couper_agents_du_membre` sous `withTenant` ; que le chapitre 07 lie le compte Slack par `lier_slack` (écart 23) ; ni que les chapitres 03 et 07 emploient les états et les clés tels que posés ici. Le chapitre 02 écrit (sa section « ce qu'il reçoit », point 3) que `schema/agents.ts` importe `RoutingLabel` : ce n'est plus le cas (section 14.1), et `labels.ts` n'a plus à entrer dans la même PR.

## 20. Relecture contradictoire

Deux critiques ont attaqué la première version : le fond et la faisabilité (11 objections, F1 à F11), la fidélité au code (10 objections, C1 à C10). Chacune a été revérifiée dans le dépôt, dans l'architecture ou sur le banc de la section 19. Dix-neuf sont retenues, dont deux avec une autre correction que celle proposée (F4, C3) ; une l'est en partie (F8) ; une est écartée (F1). L'architecture n'est pas modifiée : ce qui touche une de ses règles est en section 18 (écarts 3, 4, 21, 22, 23 ; précisions 24 à 30).

| # | Objection | Sort | Ce qui a changé, ou pourquoi rien |
|---|---|---|---|
| F1 | Bloquante : `prendre_livraison` ne lit pas `app_tenant()` ; toute session `leon_app` liste les livraisons de toutes les organisations et lit leur corps | Écartée | C'est l'exception écrite de l'architecture (7.1 et E18 : « garde contre une erreur de code, pas contre un processus hostile »). La menace citée, une injection SQL sous `leon_app`, pose elle-même `app.tenant` et `app.principals` par `set_config` (`0001-base.sql:5-9`) et lit déjà toute la mémoire : un rôle `leon_inbox` ne fermerait rien de ce côté ; une erreur de code est gardée par le contrat de 16.9. Le raisonnement est écrit en section 11 |
| F2 | La réserve n'est liée à aucune exécution : `solder_budget` rejoué rend deux fois, une exécution morte garde sa réserve | Retenue | `reserver_budget_execution` et `solder_budget_execution` (0079), réserve écrite sur la ligne (`reserve_usd`, `reserve_jour`, `solde_le`), prise et soldée une fois ; `purger_executions` solde une réserve oubliée, `supprimer_agents_du_compte` rend celles d'un compte supprimé. Tests en 16.5 et 16.6. Écart 3 |
| F3 | `unique (tenant_id, agent_id, user_id)` empêche d'avoir une fiche pour soi et pour l'équipe | Retenue | Clé `(tenant_id, agent_id, user_id, portee)` ; `reprendre_agent_equipe` n'a plus de refus caché. Deux tests en 16.4. Écart 21 |
| F4 | `prendre_livraison` vide le corps avant que la mise en file réussisse : une panne perd la livraison | Retenue, autre correction | La fonction ne change pas (7.4 veut un seul geste) ; `inbox.ts` l'appelle dans une transaction validée après `match` et la mise en file, et un échec annule la prise. Code et règles en section 11, test de l'annulation en 16.8. Écart 4 |
| F5 | Rien ne borne les reprises d'une exécution qui fait tomber le moteur ; `verrou_le is null` rend un déroulé vivant | Retenue | Colonne `reprises`, comptée par la requête du verrou ; trois au plus, puis `purger_executions` ferme `echouee`. Contrainte `executions_agent_verrou_check`, et le cas `is null` sort du tic. Tests en 16.5. Écart 22 |
| F6 | Les tests de 0075, 0077, 0082, 0084, 0085 ne sont que décrits | Retenue | Code complet en 16.11 à 16.15, lancé sur le banc. Les tests « autre organisation » demandés pour `reserver_creneau`, `reserver_execution` et `reprendre_agent_equipe` existaient déjà (16.7, 16.4) ; `runs_a_signaler` et `purger_evenements` travaillent hors contexte par construction, et 16.12 teste l'insertion depuis une autre organisation |
| F7 | Tout membre peut écrire `slack_user_id` et prendre le compte Slack d'un collègue | Retenue | `lier_slack`, seule écriture ; colonne hors du droit de modification ; règle restrictive `slack_par_lier_slack` à l'insertion (un droit d'insertion colonne par colonne casserait Drizzle, essayé) ; `compte_slack` exige `slack = vrai`. Tests en 16.14. Écart 23 |
| F8 | Personne ne désabonne chez l'éditeur, ni à la suppression d'un compte, ni au départ d'un membre | Retenue en partie | Suppression d'un compte : 15.1 disait déjà « relever avant, désabonner après » (architecture, 9.10) ; il précise maintenant ce que le relevé doit porter, puisque la cascade efface `externe_id` et les jetons. Départ d'un membre : écarté, l'architecture (9.10) refuse de se servir des jetons d'un parti, et la porte refuse ses livraisons |
| F9 | La dépense d'un agent d'équipe épuise le plafond du jour de son activateur | Retenue | `reserver_budget_execution` ne compte la journée que pour un agent personnel (portée de l'activation), comme le veut 9.3, point 5. Test en 16.5. L'ancien écart 3 tombe |
| F10 | `reserver_budget` rend faux pour une valeur négative : une faute de code passe pour un plafond atteint | Retenue | Lève `22023` comme `solder_budget` ; faux seulement pour un plafond atteint ou sans contexte. Tests en 16.3. Précision 24 |
| F11 | pgvector est installable : le « schéma minimal » affaiblit l'assurance | Retenue | Chaîne complète rejouée : les 61 fichiers du dépôt puis les onze, `0011` adaptée à pgvector 0.6.0 dans une copie. Introduction et section 19 réécrites |
| C1 | Le test « leon_porte n'a que deux fonctions » échoue : trois fonctions de trigger sont exécutables par PUBLIC | Retenue | Le test lit les droits accordés (`aclexplode(proacl)`) ; la phrase devient « ne reçoit que deux droits ». Ligne ajoutée en 2.2 |
| C2 | Le contrat `prendre-livraison` échoue sur le commentaire de `schema/webhooks.ts` | Retenue | Le commentaire décrit la fonction sans la nommer ; 16.9 dit qu'aucun fichier de production ne doit la nommer. Le contrat reste strict |
| C3 | Une renumérotation après un `db:migrate` local casse la base : le runner compare par nom | Retenue, autre correction | Renommer la ligne de `leon_migrations` dans chaque base touchée (2.3, 17), plutôt que des fichiers rejouables qui cacheraient un écart entre bases. Précision 28 |
| C4 | `couper_agents_du_membre` sur `db` nu rend 0 sans erreur : les agents d'un membre retiré restent actifs | Retenue | Lève `28000` sans contexte, comme `supprimer_agents_du_compte` ; l'appel sous `withTenant` est écrit en section 8. Tests en 16.6. Précision 25 |
| C5 | Le test « supprimer le parent » de 0082 et d'autres tests promis ne sont pas écrits | Retenue | 16.13 supprime la source et vérifie `source_id` nul, `tenant_id` gardé ; 16.11 à 16.15 en code complet. Test « autre organisation » ajouté pour `budget_du_mois` (16.3) ; celui de `taux_acceptation_agents` est en 16.15 |
| C6 | `schema/agents.ts` importe `RoutingLabel` de `src/server/standard/`, qui n'existe pas encore | Retenue | `etiquette` est un `text`, revalidé à la lecture par le chapitre 02 |
| C7 | Le `create index` de 0085 sur `actions` n'a pas de `lock_timeout` | Retenue | `set local lock_timeout = '5s'` en tête de 0085 ; 0085 entre dans les listes de 2.3 et 17. Précision 27 |
| C8 | Le commentaire de `reserver_budget` dit faux : les réservations d'une organisation s'attendent | Retenue | Commentaire corrigé (`budget_prendre`) ; règle d'appel dans un `withTenant` court, en 2.5 et en section 4 |
| C9 | `defaite` s'afficherait « Expirée » dans la carte d'action | Retenue | Section 15.5 : une branche et une clé `undone` en français et en anglais, dans la PR de 0080 |
| C10 | Les lignes `PUBLIC` et `.env.example` de 7.5 n'ont pas de propriétaire | Retenue | Écrites en 15.4, avec la PR où chacune entre. Précision 29 |
