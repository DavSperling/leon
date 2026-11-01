# Sessions de code partagées à l'équipe, et l'espace Développeurs

01/11/2026. Décisions de David par questionnaire. C'est le chantier 1 de la mémoire d'équipe des développeurs ; le chantier 2 (la fiche du projet) aura sa propre spec. S'appuie sur la passation ([spec](2026-11-01-passation-equipe.md), PR #106). Ce qui est marqué « (choix de Claude) » est à relire par Amos.

## Pourquoi

Les sessions Claude Code captées sont privées à leur auteur (`src/server/ingest/ingest-turns.ts:26` et `:95`, `acl: [ctx.userId]`). L'agent d'un développeur ne peut donc pas répondre « comment Amos a réglé ça la semaine dernière ». L'étude graphe (E1) supposait que le partage suffisait à régler l'essentiel des questions de reprise : ce chantier le rend possible.

## Décisions de David

1. **Tout est partagé par défaut**, avec un retrait possible après coup.
2. **Les sessions passées sont partagées aussi**, pas seulement les nouvelles.
3. **Le retrait se fait depuis l'interface et depuis l'agent** (outil MCP).
4. **L'interface vit dans un espace « Développeurs »** de l'application, réservé aux membres qui codent.

## La règle de partage

- Une session de type `claude_code` **avec une clé de projet** (`metadata.project`, de la forme `github.com/<propriétaire>/<dépôt>`, `src/cli/project-key.ts`) est partagée à l'organisation : `acl = [organisation]`, comme les données des connecteurs partagés.
- Une session `claude_code` **sans clé de projet** (hors d'un dépôt git) reste privée : `acl = [auteur]`.
- Les sessions `claude_ai`, `chatgpt` et `mcp_remember` restent privées : elles ne sont pas liées à un dépôt.
- Exception : un dépôt que l'auteur a rendu privé (voir plus bas). Ses sessions sur ce dépôt restent privées, les nouvelles comme les anciennes.
- Le partage se décide **à la capture**, dans `ingest-turns.ts`. Une session qui reçoit sa clé de projet plus tard (`recordProject`) est partagée à ce moment-là, sur toutes ses lignes.
- Les secrets sont déjà masqués à la capture (`prepareTurnText`). Rien ne change là-dessus.

## Données

Migration `0044-sessions-partagees.sql`.

- **L'ACL vit sur cinq tables** : `sources`, `turns`, `ingest_runs`, `passages`, `passage_vectors`. Changer le partage d'une session, c'est mettre à jour ces cinq tables pour sa source, dans une transaction. La sécurité par ligne existante (`acl && app_principals()`) fait le reste : `search`, `fetch` et la discussion voient les sessions partagées sans changement.
- **`depots_prives`** : `tenant_id`, `user_id`, `project`, `created_at`, clé primaire `(tenant_id, user_id, project)`. Sécurité par ligne : chacun ne voit et ne modifie que ses propres lignes.
- **Fonction `regler_partage_session(p_source uuid, p_partage boolean)`**, en `security definer` sur le modèle de `supprimer_document` (0042). Elle n'agit que si l'appelant est l'auteur de la source, si la source est de type `claude_code` et si elle a une clé de projet. Elle met `acl = [organisation]` ou `[auteur]` sur les cinq tables, et rend vrai si elle a agi.
- **Fonction `regler_partage_depot(p_project text, p_partage boolean)`**, en `security definer` : elle ajoute ou retire la ligne de `depots_prives` de l'appelant, puis applique `regler_partage_session` à toutes ses sessions `claude_code` sur ce projet.
- **Partage des sessions passées** : la migration passe en `acl = [organisation]` toutes les sessions `claude_code` existantes qui ont une clé de projet, sur les cinq tables (choix de Claude : par la migration et non à la première visite, pour que l'équipe ait la matière dès le déploiement).

Le point du matin (`src/server/briefing/gather.ts:181-182`) filtre déjà sur l'auteur. Il continue de ne lire que les sessions de l'utilisateur : rien à changer.

## Prévenir l'équipe

- Le texte de consentement de `leon installer-crochets` (`src/cli/install-hooks.ts`) dit : « Tes sessions Claude Code dans un dépôt git sont visibles par ton équipe sur Leon. Tu peux en rendre une privée, ou tout un dépôt, dans l'espace Développeurs. »
- Pour les sessions déjà captées, la description de la PR indique que le déploiement les partage. Chaque membre concerné (aujourd'hui David et Amos) est prévenu avant la fusion (choix de Claude).

## Rendre privé depuis l'agent

Outil MCP **`session_rendre_privee(session?, depot?)`** :

- avec `session` (l'identifiant d'une source) : rend cette session privée ;
- avec `depot` seul : rend privé tout le dépôt pour l'appelant, ses sessions passées et futures ;
- sans argument : rend privée la dernière session partagée de l'appelant.

Il renvoie ce qui a été rendu privé (titre, date). Un outil `session_partager` fait l'inverse, avec les mêmes arguments (choix de Claude : on doit pouvoir revenir sur un retrait). `MCP_INSTRUCTIONS` signale les deux outils.

## L'espace Développeurs

Nouvelle page de l'application : `src/app/(app)/developpeurs/`.

- **Qui la voit** : un membre qui a au moins une session `claude_code` ou une note de passation dans l'organisation. Pour les autres, l'entrée n'apparaît pas dans la navigation et la page renvoie 404.
- **Contenu** :
  - **les dépôts de l'équipe**, c'est-à-dire les clés de projet qui ont au moins une session partagée ou une note de passation visible par le lecteur ;
  - **pour chaque dépôt** :
    - les sessions partagées, triées de la plus récente à la plus ancienne (auteur, date, titre, lien vers la session) ;
    - les dernières notes de passation (`readBranchState` sans branche) ;
    - pour ses propres sessions, un bouton « Rendre privée » ;
    - un interrupteur « Mes sessions sur ce dépôt : partagées / privées » ;
  - **ses sessions privées liées à un dépôt**, avec un bouton « Partager », pour revenir sur un retrait.
- Les actions passent par les deux fonctions en base, via des actions serveur comme celles de `src/app/(app)/reglages/actions.ts`.
- Le design suit l'interface existante (Verre + signal). Pas de nouveau composant si un composant de la maison convient.

## Droits

- Seul l'auteur rend sa session privée ou la partage. Un administrateur ne peut pas le faire à sa place (choix de Claude : la session est la sienne). Si l'auteur a supprimé son compte, ses sessions partagées restent à l'équipe, comme ses autres contributions (spec du 28/10).
- Un membre retiré de l'organisation ne voit plus rien.
- Une autre organisation ne voit jamais rien.

## Tests

- **Capture** (en base) : une session `claude_code` avec une clé de projet est visible par un collègue ; sans clé de projet, elle ne l'est pas ; une session `claude_ai` ne l'est pas ; un dépôt rendu privé garde privées ses nouvelles sessions ; une autre organisation ne voit rien.
- **Retrait** :
  - rendre une session privée la retire de `search`, passages et vecteurs compris, pour un collègue ;
  - seul l'auteur peut le faire ;
  - la partager de nouveau la rend visible ;
  - le réglage par dépôt s'applique aux sessions passées et suivantes.
- **Migration** : les sessions existantes avec une clé de projet sont partagées, les autres non. Contrats `rls-coverage` et `schema-contract` pour `depots_prives`.
- **MCP** : `session_rendre_privee` et `session_partager` avec chacun des trois jeux d'arguments.
- **Espace Développeurs** : invisible pour un membre sans session de code ; les boutons appellent les bonnes actions.

## Hors périmètre

- La fiche du projet (chantier 2).
- Un filtre par dépôt dans `search`.
- La capture des sessions Codex et Cursor (Leon ne les capte pas encore).
- Un partage plus fin qu'à l'organisation (par équipe, ou seulement à ceux qui ont accès au dépôt GitHub).
