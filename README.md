# Leon

Mémoire unifiée pour les entreprises (nom de travail). Leon se branche sur les outils de l'entreprise (mails, docs, CRM…) et sur les conversations avec les LLMs (Claude, ChatGPT, Gemini, Cursor, Copilot). Il garde cette donnée telle quelle (le brut), avec des droits d'accès, et l'indexe pour qu'on la retrouve d'une seule recherche, avec les sources à l'appui. Il n'extrait plus de faits et ne tient plus de fiches : le deuxième jet (voir [`docs/plans/2026-10-19-deuxieme-jet.md`](docs/plans/2026-10-19-deuxieme-jet.md)) construit la recherche, la discussion et le point du matin sur ce brut, tâche par tâche.

## Dans ce repo

- `docs/reunions/` : comptes-rendus de réunion
- `docs/etudes/` : études et décisions
- `docs/specs/` : specs et design (premier jet, connecteurs, deuxième jet)
- `docs/plans/` : plans d'implémentation (premier jet, connecteurs, deuxième jet)
- `docs/guides/` : guides pas à pas (checklists de vérification manuelle, création des applis OAuth)

## Démarrer en local

Prérequis : Docker (ou Colima) pour Postgres 17, Node 26 (`engines` : 24 au minimum), pnpm 11.

```bash
docker compose up -d                  # Postgres 17 sur 127.0.0.1:54329, bases leon et leon_test
cp .env.example .env.local            # puis renseigner BETTER_AUTH_SECRET (openssl rand -base64 32), ANTHROPIC_API_KEY et, pour les connecteurs, LEON_CONNECTORS_KEY
pnpm install
pnpm db:migrate                       # applique src/server/db/migrations/*.sql sur la base leon
pnpm dev                              # http://localhost:3000 ; les tâches de fond (connecteurs) démarrent avec l'app si leur clé est là
pnpm leon import-claude-code --dry-run
pnpm ext:build                        # extension non empaquetée dans extension/.output/chrome-mv3
```

La recherche demande l'extension Postgres `vector` (pgvector, migration `0011-passages.sql`), que seul un superutilisateur peut créer. Un volume neuf l'a dans toutes ses bases (`docker/postgres/init.sql` la crée dans `template1`). Pour un volume créé avant, il faut la créer une fois, puis relancer `pnpm db:migrate` (qui sinon s'arrête et rappelle cette commande) :

```bash
for base in template1 leon leon_test; do
  docker compose exec -T postgres psql -U postgres -d "$base" -c "create extension if not exists vector"
done
```

La checklist de vérification manuelle du premier jet est dans [`docs/guides/premier-jet-verification.md`](docs/guides/premier-jet-verification.md) (périmée depuis le deuxième jet, sauf le démarrage, le jeton et l'extension), celle des connecteurs dans [`docs/guides/connecteurs-verification.md`](docs/guides/connecteurs-verification.md).

## Tester

```bash
pnpm test                             # unitaires + intégration ; la base de test est migrée automatiquement (sur cette branche : LEON_TEST_DATABASE=leon_test_glean, voir plus bas)
```

Les tests d'intégration (`*.db.test.ts`) se connectent à Postgres : il faut que `docker compose up -d` tourne. Dans un agent Claude Code sandboxé, lancer `pnpm test` hors sandbox.

`LEON_TEST_DATABASE` choisit la base des tests d'intégration (défaut `leon_test`, partagée par les branches). Une branche qui supprime ou change des tables prend la sienne, créée une fois : `LEON_TEST_DATABASE=leon_test_glean pnpm test:db` (le deuxième jet travaille ainsi, voir son plan). Le nom doit commencer par `leon_test`. Sans cette variable, `pnpm test:db` s'arrête avec un message tant que la migration `0010-suppression-tri.sql` (qui supprime les tables du tri) n'est pas appliquée à `leon_test` : rien n'est migré. Seul un accord de l'équipe (`LEON_TEST_ACCEPTE_MIGRATIONS_DESTRUCTIVES=oui`) lève ce garde-fou.

## Connecteurs

Leon lit aussi les outils de l'équipe (tickets, pages, réunions, notes de CRM, conversations de support) et les garde tels quels, comme les conversations, avec un lien vers l'original. On branche un outil en collant une clé d'API ou un jeton personnel, ou, quand l'éditeur le permet sans vérification de sa part, par un bouton « Se connecter avec… » (voir « Brancher par bouton » plus bas).

```bash
openssl rand -base64 32               # à coller dans .env.local : LEON_CONNECTORS_KEY=…
pnpm db:migrate                       # applique 0008-connecteurs.sql et 0009-connecteurs-oauth.sql
pnpm dev                              # puis la page « Connexions » de la barre latérale
```

- **`LEON_CONNECTORS_KEY`** chiffre les clés collées et les jetons obtenus par bouton (AES-256-GCM, liés à leur ligne). Sans elle, la page Connexions l'explique, ne permet pas de brancher, et la relève ne démarre pas. Changer cette clé rend toutes les clés enregistrées illisibles : chaque connexion passe en erreur (« Clé illisible : remplacez-la ») jusqu'à ce qu'on recolle sa clé.
- **Brancher** : sur la page Connexions, choisir l'outil, coller la clé (l'aide dit où la trouver, avec un lien vers la doc de l'éditeur), choisir la période à lire (7, 30, 90 ou 365 jours ; 30 par défaut), puis « Tester et brancher ». La connexion n'est enregistrée que si le test réussit.
- **Relève** : Leon va chercher ce qui a changé toutes les 15 minutes, sans webhook. Un passage lit 200 éléments au plus et reprend une minute plus tard s'il en reste. « Synchroniser maintenant » force un passage ; une clé refusée (ou une autorisation retirée chez l'éditeur) arrête la connexion jusqu'à son remplacement (ou sa reconnexion), toute autre erreur est retentée dans une heure.
- **Visibilité** : tout ce qu'une connexion lit est visible de toute l'équipe (le deuxième jet y ajoute les droits « public ou personnel »), et la page Sources l'affiche avec un lien « Ouvrir dans » suivi du nom de l'outil. Supprimer une connexion efface sa clé, mais garde les sources déjà captées.
- **Aucun modèle à l'entrée** : chaque élément est gardé tel quel, sans clé Anthropic, et son indexation est mise en file. Le worker de l'indexation (démarré avec l'application, sans condition sur la clé Anthropic) découpe les tours en passages pour la recherche ; si `LEON_EMBEDDINGS` règle un fournisseur de vecteurs, il en fabrique aussi, et une panne du fournisseur ne retarde jamais le plein texte. Un tic par minute reprend les éléments restés en attente plus de 5 minutes et les vecteurs manquants. `LEON_EMBEDDINGS=voyage`, `mistral` ou `bge-m3` empêche le démarrage tant que leur adaptateur n'est pas livré.

Les 39 outils branchables. « Essayé en réel » : quelqu'un de l'équipe l'a branché avec une vraie clé ; sinon le connecteur est testé sur des réponses d'exemple tirées de la doc officielle, rien de plus.

| Outil | Famille | Essayé en réel |
| --- | --- | --- |
| GitHub | Dev | non |
| Linear | Dev | non |
| Notion | Dev | non |
| Circleback | Réunions | non |
| Claap | Réunions | non |
| Fathom | Réunions | non |
| Fireflies | Réunions | non |
| Gong | Réunions | non |
| Granola | Réunions | non |
| Leexi | Réunions | non |
| tl;dv | Réunions | non |
| Airtable | Projet | non |
| Asana | Projet | non |
| Basecamp | Projet | non |
| ClickUp | Projet | non |
| Confluence | Projet | non |
| GitLab | Projet | non |
| Jira | Projet | non |
| Miro | Projet | non |
| monday.com | Projet | non |
| Plane | Projet | non |
| Productboard | Projet | non |
| Sentry | Projet | non |
| Shortcut | Projet | non |
| Trello | Projet | non |
| Attio | CRM | non |
| Close | CRM | non |
| folk | CRM | non |
| HubSpot | CRM | non |
| Pipedrive | CRM | non |
| Crisp | Support | non |
| Freshdesk | Support | non |
| Front | Support | non |
| Help Scout | Support | non |
| Intercom | Support | non |
| Missive | Support | non |
| Plain | Support | non |
| Zendesk | Support | non |
| Outlook | Mails et agenda | non |

Pour chaque connecteur, l'en-tête de `src/server/connectors/<outil>/connector.ts` note les pages de doc lues et ce qui n'a pas pu être vérifié. Les conditions d'utilisation de Fathom, tl;dv, ClickUp, Front, monday.com et Sentry sont à faire confirmer par écrit avant tout client. Les instances hébergées chez le client (GitLab, Jira Data Center, Mattermost) ne sont pas prises en charge : l'adresse de chaque outil est fixée dans le connecteur.

La vérification pas à pas (GitHub, Notion, Linear, outil de réunion) est dans [`docs/guides/connecteurs-verification.md`](docs/guides/connecteurs-verification.md).

## Brancher par bouton

Pour les outils dont l'éditeur le permet sans vérification de sa part, le panneau de la page Connexions propose « Se connecter avec <outil> » en premier : Leon envoie chez l'éditeur, qui demande d'autoriser la lecture, puis la connexion est créée au retour. Coller une clé reste possible en secours (« ou coller une clé ») pour les outils qui en acceptent une ; Basecamp, Miro, Productboard et Outlook ne se branchent que par bouton. Les réglages qui ne sont pas des secrets (les dépôts GitHub, la période à reprendre) se choisissent avant le clic.

- **Une appli par éditeur, créée une fois** par Amos ou David dans la console développeur de l'éditeur. Le guide [`docs/guides/applis-oauth.md`](docs/guides/applis-oauth.md) dit, éditeur par éditeur, où la créer, l'adresse de retour exacte, les droits à cocher et ce qu'il faut activer pour que d'autres comptes s'en servent. L'adresse de retour est `<BETTER_AUTH_URL>/api/v1/connexions/oauth/<appli>/retour`, soit `http://localhost:3000/…` en local ; `<appli>` est `atlassian` pour Jira et Confluence, l'identifiant de l'outil pour les autres.
- **Deux variables par appli**, dans `.env.local` : `LEON_OAUTH_<APPLI>_ID` et `LEON_OAUTH_<APPLI>_SECRET` (`ATLASSIAN` pour Jira et Confluence), listées vides dans `.env.example`. Une paire vide ou incomplète désactive le bouton de l'outil (la console l'écrit au démarrage) : son panneau garde le formulaire de clé, ou dit que l'appli n'est pas encore configurée sur ce serveur. Le secret d'appli ne quitte jamais le serveur.
- **Le déroulé** : un cookie signé de 10 minutes garde l'utilisateur, l'outil, le `state` et le vérificateur PKCE. Un refus chez l'éditeur, un lien trop vieux ou un cookie absent ramènent sur Connexions avec un message simple, sans rien créer.
- **Les jetons** sont chiffrés comme une clé et renouvelés avant chaque passage quand ils expirent bientôt. Un renouvellement refusé met la connexion en erreur (« Reconnectez <outil> ») sans nouvelle échéance, et le panneau propose « Reconnecter », qui refait le déroulé sur la même connexion.
- **Les droits** demandés sont la lecture seule, les plus étroits que l'éditeur propose. Outlook demande en plus l'accord, une fois, de l'administrateur Microsoft de l'entreprise (le panneau donne le lien).

La vérification pas à pas (GitHub et Linear par bouton, un refus chez l'éditeur, « Reconnecter ») est dans [`docs/guides/connecteurs-verification.md`](docs/guides/connecteurs-verification.md).

## Briefing au démarrage de Claude Code

Pour qu'une nouvelle session Claude Code reçoive le point sur son projet sans appeler d'outil, ajouter ce hook dans `~/.claude/settings.json`. Le serveur ne prépare pas encore ce point (tâche T13 du deuxième jet) : en attendant, la commande ne renvoie rien (elle écrit seulement « ce serveur ne prépare pas encore de point du matin » sur la sortie d'erreur) et ne bloque jamais la session.

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pnpm -s --dir <chemin du dépôt leon> leon briefing",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

`LEON_URL` et `LEON_TOKEN` sont lus dans le `.env.local` du dépôt (voir `.env.example`). Le jeton se crée dans Réglages.

## Travailler à deux

Les règles (branches, worktrees, PR, synchronisation avec `main`) sont dans [`CLAUDE.md`](CLAUDE.md). À lire avant le premier commit.
