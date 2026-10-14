# Gestionnaire de tâches v1 : quel code open source reprendre, et comment l'alimenter

14 octobre 2026 · Amos (avec Claude) · à relire par David

Annexes : [licences vérifiées](annexes/01-licences.md), [carte du code de Kaneo](annexes/02-carte-kaneo.md), [conception détaillée](annexes/03-conception.md). Cette étude ne contient pas de code : c'est du repérage et un plan.

## La question

Le 11/10, on a noté qu'il nous fallait un gestionnaire de tâches (« Notion plutôt que Linear »). Amos propose d'en faire une **fonctionnalité de Leon** : un gestionnaire de tâches façon Linear (tâches, statuts, kanban) et Notion (une page riche par tâche), adapté aux développeurs, et surtout **qui s'alimente presque tout seul** à partir du contexte que Leon capte déjà (sessions Claude Code, claude.ai, ChatGPT, outil MCP `remember`). On s'en servirait nous-mêmes pour développer Leon.

Plutôt que de tout écrire, peut-on repartir d'un projet open source ? Lequel, et qu'a-t-on le droit d'en faire, sachant que Leon est un SaaS fermé ?

## La réponse courte

1. **La licence décide de tout.** La plupart des clones de Linear et de Notion sont sous AGPL (Plane, AppFlowy, Docmost, Logseq, SiYuan, Vikunja…). Reprendre leur code obligerait à publier tout Leon. On peut s'inspirer de ces produits, pas de leur code. On a déjà écarté `pg_search` pour la même raison ([architecture, § stockage](../architecture-2026-10/README.md)).
2. **Kaneo (MIT) est notre base de code.** Il est très actif (v2.46.2 du 12/10/2026) et sa pile est presque celle de Leon : Hono, Drizzle, Postgres, better-auth, éditeur TipTap, kanban dnd-kit, palette cmdk. On reprend sa numérotation `LEO-12`, son kanban, son éditeur, ses raccourcis et l'idée de ses outils MCP. Il faut l'adapter à Next.js et y ajouter notre RLS.
3. **Plane, Linear et Notion servent d'inspiration produit**, à partir de captures d'écran et de leur documentation, sans jamais ouvrir leur code source.
4. **L'alimentation automatique se branche sur le pipeline existant.** Le triage et l'extraction repèrent les tâches dans les mêmes appels qu'aujourd'hui. Une nouvelle étape compare ensuite aux tâches existantes : nouvelle tâche, doublon, tâche terminée. Ce qui n'est pas sûr va dans « À trier ». Une PR GitHub fusionnée ferme la tâche, et le briefing de Claude Code affiche les tâches en cours.
5. **Dix lots, une PR chacun.** Le socle (données, API, MCP, interface simple) passe avant l'automatique. La création automatique ne s'active qu'après un essai réel qui mesure le bruit et le coût.

## 1. Ce qu'on a le droit de faire

- **S'inspirer est libre.** Les idées, les fonctionnalités et l'organisation des écrans ne sont pas protégées, seul le code l'est. Utiliser Plane, faire des captures, lire sa documentation et son API publique, puis refaire à notre façon : c'est permis.
- **Réécrire du code AGPL ne l'est pas.** Une traduction, une reformulation ou une réorganisation du code reste une œuvre dérivée, et Leon hériterait des obligations de l'AGPL. Avec des agents, le risque est concret : donner le source de Plane à un agent en lui demandant « refais ça pour Leon » produit une copie déguisée. **Règle : on n'ouvre jamais le source d'un projet AGPL, GPL ou BSL dans une session d'agent.**
- **Le code MIT ou Apache se copie librement.** Seule obligation : garder l'avis de licence de Kaneo dans un fichier des codes tiers, à créer au premier lot qui en reprend.
- **Faire tourner Plane à côté de Leon** sans le modifier, et l'appeler par son API, serait permis. On l'écarte : on veut des tâches dans la mémoire, avec ses droits et ses fiches, pas un second outil à synchroniser.

Ce n'est pas un avis juridique, mais c'est la lecture courante de ces licences.

## 2. Ce qu'on reprend, et d'où

| Besoin | Source | Licence | Ce qu'on prend |
|---|---|---|---|
| Logique serveur des tâches | **Kaneo** | MIT | numérotation par projet, positions, réordonnancement du kanban avec verrou et refus si le tableau a changé |
| Interface Linear | **Kaneo** | MIT | kanban, listes, panneau de détail, propriétés, palette, raccourcis |
| Page riche (Notion) | **Kaneo** (TipTap) | MIT | extensions de l'éditeur, menu `/`, stockage en Markdown |
| Composants kanban shadcn | Kibo UI ou Dice UI | MIT | en secours si l'adaptation du kanban de Kaneo coûte trop |
| Organisation des écrans, fonctions | Plane, Linear, Notion | — | inspiration seulement, à partir des captures d'Amos |

Détail des licences des 30 projets regardés : [annexe 1](annexes/01-licences.md). Chemins précis du code Kaneo à reprendre et effort d'adaptation : [annexe 2](annexes/02-carte-kaneo.md).

## 3. Ce que le code de Leon impose

Vérifié sur `main` (4e8d36c) :

- **Le triage écarte les sessions de code.** Il met `keep: false` pour « du code pur, du débogage sans décision » (`src/server/pipeline/prompts/triage.ts:28`). C'est pourtant là que naissent les tâches de dev : il faudra l'ouvrir, sans faire passer le bruit dans Sonnet (c'est ce qui faisait exploser les coûts, voir l'[étude de coûts](../couts-2026-10/README.md)).
- **Pas d'embeddings.** Seules `btree_gist` et `pg_trgm` sont créées (`src/server/db/migrations/0001-base.sql`). Les doublons se repèrent par similarité de titre (`pg_trgm`), titre normalisé, puis décision de Haiku.
- **Les étapes du pipeline sont figées.** `STEPS` dans `src/server/pipeline/worker.ts:17` et le CHECK de `ingest_runs.step` (`0003-memoire.sql`) : une étape `tasks` demande une migration.
- **Le briefing a un budget de 3 000 caractères** (`src/server/memory/briefing.ts:10`) : les tâches y prennent au plus un tiers.
- **Pas de nouvelle dépendance sans exception écrite** (règles du [plan du premier jet](../../plans/2026-10-13-premier-jet.md)) : TipTap et dnd-kit, tous MIT, devront être justifiés dans leur lot.

## 4. La conception en bref

Détail, esquisse SQL et politique complète : [annexe 3](annexes/03-conception.md).

- **Données** (migration `0007`, même motif `tenant_id` + `acl` + RLS que la mémoire) : projets (clé `LEO`), statuts configurables rangés par catégorie (à trier, backlog, à faire, en cours, terminé, annulé), tâches (numéro, sous-tâches, description Markdown, priorité, assigné, échéance), étiquettes, commentaires, liens vers les fiches et les faits, et un journal d'événements qui garde la **provenance** de chaque changement automatique (source, tour, citation).
- **Alimentation automatique** :
  1. le triage (Haiku) signale aussi les tours qui contiennent des tâches ;
  2. l'extraction (Sonnet) sort des candidats tâches avec citation vérifiée et échéance résolue (« vendredi » → une date) ;
  3. une étape `tasks` (Haiku) compare aux tâches existantes et décide : nouvelle, doublon, terminée, mise à jour, ignorer ;
  4. un engagement ou une demande sûrs créent la tâche directement ; le reste va dans « À trier », privé à l'auteur ; une tâche refusée n'est jamais reproposée ;
  5. GitHub : PR ouverte → « En cours », fusionnée → « Terminé », grâce à l'identifiant `LEO-12` dans la branche ou le titre ;
  6. le briefing de Claude Code affiche « Tes tâches », le nombre de tâches à trier et ce que Leon a fermé tout seul.
- **Surfaces** : pages `/taches` (liste et tableau), `/taches/triage`, `/taches/LEO-12` ; tâches liées sur une fiche ; ⌘K. Outils MCP pour que les agents gèrent leurs tâches (`task_start` renvoie le nom de branche). Commandes `pnpm leon tasks`. Webhook GitHub signé.
- **Hors V1** : temps réel, co-édition, cycles, relations « bloque », notifications, GitLab, GitHub App, embeddings, pièces jointes.

## 5. Les lots

Une PR chacun, dans cet ordre. Chaque lot suit notre méthode : sous-agents, validateur, audit des contrats d'exécution, revue de sécurité, bilan.

| # | Lot | Repris de Kaneo |
|---|---|---|
| 1 | Socle : migration, schéma, `src/server/tasks/*`, tests RLS | numérotation, positions |
| 2 | API, outils MCP, CLI | forme des outils MCP |
| 3 | Interface : liste, page de tâche, triage, ⌘K, réglages (description en simple zone de texte) | listes, propriétés |
| 4 | Détection dans le triage et l'extraction, sans rien appliquer ; essai réel (précision, coût) | |
| 5 | Étape `tasks` : comparaison, politique, application | |
| 6 | Briefing et consignes MCP | |
| 7 | GitHub : webhook, liens vers les PR, statuts | idée du plugin GitHub |
| 8 | Kanban glisser-déposer | logique du kanban, réordonnancement |
| 9 | Éditeur riche TipTap, menu `/`, mention `@fiche` | extensions, commandes `/` |
| 10 | Raccourcis clavier (compatibles AZERTY) | registre de raccourcis |

Les lots 1 à 3 donnent un gestionnaire de tâches utilisable à la main et par les agents. Les lots 4 à 7 le rendent automatique. Les lots 8 à 10 apportent le confort de Linear et de Notion.

## 6. Questions à trancher dans la spec

| Question | Recommandation |
|---|---|
| Une tâche détectée est-elle assignée d'office à son auteur ? | Oui |
| Projet par défaut créé à la première tâche ? | Oui, clé dérivée du nom de l'organisation, modifiable |
| Les tâches « À trier » comptent-elles dans « À vérifier » ? | Non, compteur à part |
| Une tâche d'équipe peut-elle citer une conversation privée ? | Même règle que les faits partagés |
| Seuil de création directe | 0,8, à valider sur l'essai réel du lot 4 avant de l'activer |
| Équipes façon Linear | Hors V1 |

## 7. Prochaines étapes

1. **David** relit cette étude et confirme qu'on fait du gestionnaire de tâches une fonctionnalité de Leon, et pas seulement notre outil interne.
2. **Amos** envoie des captures de Plane, Linear et Notion (liste, détail, kanban, palette, statuts ; pages et bases Notion).
3. Spec `docs/specs/` à partir des captures et des réponses aux questions ci-dessus, puis plan d'implémentation par lots.
4. Lot 1.
