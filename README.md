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

Sans session, `/` sert la page d'accueil publique (`src/proxy.ts`) ; le site public (accueil, cas d'usage, connecteurs, sécurité, tarifs, et les trois maquettes de l'accueil sur `/maquettes`) est décrit dans [`docs/specs/2026-10-23-site-public.md`](docs/specs/2026-10-23-site-public.md).

La checklist de vérification manuelle du premier jet est dans [`docs/guides/premier-jet-verification.md`](docs/guides/premier-jet-verification.md) (périmée depuis le deuxième jet, sauf le démarrage, le jeton et l'extension), celle des connecteurs dans [`docs/guides/connecteurs-verification.md`](docs/guides/connecteurs-verification.md).

## Une instance, un modèle

**Une seule instance de Leon par base, un seul modèle de vecteurs à la fois.** Les tâches de fond (relève des outils,
indexation, vecteurs) et quelques gardes (réponses en cours, nombre de réponses par personne) vivent dans le processus.

- En production, une mise à jour arrête l'ancienne version dès que la nouvelle est prête (voir « En ligne »).
- En local, chaque worktree qui lance un serveur a sa propre base (`DATABASE_URL`).
- Changer de modèle de vecteurs (`LEON_EMBEDDINGS_MODEL`) : arrêter le serveur, changer le réglage, relancer. Le tic
  revectorise alors tout, sauf les textes que le fournisseur refuse et ceux d'un membre parti (le plein texte les
  trouve toujours), puis retire tous les vecteurs de l'ancien modèle.

Deux instances sur la même base (ou deux modèles actifs) ne cassent pas les droits, mais doublent des appels payants et
peuvent effacer les vecteurs l'une de l'autre. Passer à plusieurs instances sera un chantier à part.

## En ligne (Railway)

Pour mettre Leon en ligne sur [Railway](https://railway.com) : un seul service, allumé en continu, branché sur la base
Supabase partagée. Pas de Vercel : ses fonctions s'endorment entre deux requêtes, et les tâches de fond (relève,
indexation, point du matin) ne tourneraient plus.

- `railway.json` décrit le service : `pnpm build`, les migrations avant chaque mise en ligne (`pnpm db:migrate`, avec
  `DATABASE_URL_ADMIN`), puis `pnpm start`, et `/api/health` pour savoir qu'il est prêt.
- Railway démarre la nouvelle version avant d'arrêter l'ancienne. `overlapSeconds: "0"` réduit ce recouvrement au
  temps du démarrage (quelques dizaines de secondes, pendant lesquelles deux instances tournent). Éviter de mettre en
  ligne pendant une relève ou un changement de modèle de vecteurs.
- Le pooler de Supabase en mode session (port 5432) accepte 15 clients par rôle (la « Pool Size » de ses réglages).
  Une instance en ouvre 7 au plus (`src/server/db/client.ts`), deux en ouvrent donc 14 pendant le recouvrement. Au-delà,
  la nouvelle instance s'arrête au démarrage sur `EMAXCONNSESSION` et Railway la déclare en échec au healthcheck.
- **Tant que le site tourne, personne ne branche son serveur local sur la base Supabase** : ce serait une seconde
  instance (voir plus haut).
- Variables : les mêmes que `.env.example`, collées dans l'éditeur brut des variables du service. En plus :
  `BETTER_AUTH_URL` = l'adresse publique du site, `LEON_IP_HEADER=x-real-ip` (le proxy de Railway le remplace par
  l'adresse du client), `NODE_ENV=production`. Dans les deux adresses de la base, `sslrootcert` pointe vers le
  certificat public de Supabase, versionné dans le repo : `sslrootcert=/app/certs/supabase-ca-2021.crt`.
- L'inscription est ouverte à qui a l'adresse : chaque réponse de l'IA se paie sur notre clé Anthropic.

## Secrets dans les conversations captées

Avant stockage, la capture et les connecteurs masquent ce qui se reconnaît à sa forme (`src/capture/mask-secrets.ts`) :
clés à préfixe connu (`sk-ant-`, `ghp_`, `GOCSPX-`…), clés privées, `utilisateur:mot@hôte` dans une URL, en-têtes
`Authorization`, lignes de `.env` (`DB_PASSWORD=…`). Le texte ordinaire n'est jamais touché : **un mot de passe écrit
en langage courant (« le mdp c'est … ») ou passé dans du code peut passer.** Les conversations captées restent privées
à leur auteur ; un élément d'outil (page, ticket, mail d'équipe) garde la visibilité qu'il a dans l'outil : un mot de
passe écrit en clair dans une page d'équipe y reste lisible de l'équipe, comme dans l'outil d'origine.

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
- **Visibilité** : tout ce qu'une connexion lit est visible de toute l'équipe (le deuxième jet y ajoute les droits « public ou personnel » ; GitHub se borne aux dépôts d'équipe, voir plus bas), et la recherche l'affiche avec un lien « Ouvrir dans » suivi du nom de l'outil ; la santé de la capture se voit dans l'alerte « Mémoire en retard » de la barre latérale et dans le schéma de Connexions. Supprimer une connexion efface sa clé, mais garde les sources déjà captées.
- **Aucun modèle à l'entrée** : chaque élément est gardé tel quel, sans clé Anthropic, et son indexation est mise en file. Le worker de l'indexation (démarré avec l'application, sans condition sur la clé Anthropic) découpe les tours en passages pour la recherche ; si `LEON_EMBEDDINGS` règle un fournisseur de vecteurs, il en fabrique aussi, et une panne du fournisseur ne retarde jamais le plein texte. Un tic par minute reprend les éléments restés en attente plus de 5 minutes et les vecteurs manquants. `LEON_EMBEDDINGS=voyage`, `mistral` ou `bge-m3` empêche le démarrage tant que leur adaptateur n'est pas livré.
- **Modèle d'IA** : la réponse en tête, la discussion et le point du matin passent par `ANTHROPIC_API_KEY` ; sans clé, la recherche par le texte marche et ces trois fonctions disent qu'aucun modèle n'est branché. Le modèle de chaque étape se règle par `LEON_MODEL_REPONSE` (Haiku 5.5 par défaut), `LEON_MODEL_DISCUSSION` et `LEON_MODEL_POINT` (Sonnet 5.5 par défaut), celui du résumé des sessions de code par `LEON_MODEL_RESUME` et celui de l'état des fils de travail par `LEON_MODEL_FIL` (Haiku 5.5 par défaut), parmi `claude-haiku-5-5`, `claude-sonnet-5-5` et `claude-opus-5-5` : un autre nom empêche le démarrage, parce que chaque appel enverrait au modèle un réglage (repli des refus, effort) que son API peut refuser. `LEON_LLM=factice` branche un faux modèle, sans réseau ni clé, pour voir l'interface en démonstration ; l'application refuse de démarrer en production avec ce réglage.

Les 42 outils branchables. « Essayé en réel » : quelqu'un de l'équipe l'a branché avec une vraie clé ; sinon le connecteur est testé sur des réponses d'exemple tirées de la doc officielle, rien de plus.

| Outil | Famille | Essayé en réel |
| --- | --- | --- |
| GitHub | Dev | oui |
| GitLab | Dev | non |
| Linear | Dev | non |
| Notion | Dev | non |
| Sentry | Dev | non |
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
| Google Drive | Projet | oui |
| Jira | Projet | non |
| Miro | Projet | non |
| monday.com | Projet | non |
| Plane | Projet | non |
| Productboard | Projet | non |
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
| Gmail | Mails, chat et agenda | oui |
| Outlook | Mails, chat et agenda | non |
| Slack | Mails, chat et agenda | non |

Pour chaque connecteur, l'en-tête de `src/server/connectors/<outil>/connector.ts` note les pages de doc lues et ce qui n'a pas pu être vérifié. Les conditions d'utilisation de Fathom, tl;dv, ClickUp, Front, monday.com et Sentry sont à faire confirmer par écrit avant tout client. Les instances hébergées chez le client (GitLab, Jira Data Center, Mattermost) ne sont pas prises en charge : l'adresse de chaque outil est fixée dans le connecteur.

La vérification pas à pas (GitHub, Notion, Linear, outil de réunion) est dans [`docs/guides/connecteurs-verification.md`](docs/guides/connecteurs-verification.md).

## Brancher par bouton

Pour les outils dont l'éditeur le permet sans vérification de sa part, le panneau de la page Connexions propose « Se connecter avec <outil> » en premier : Leon envoie chez l'éditeur, qui demande d'autoriser la lecture, puis la connexion est créée au retour. Coller une clé reste possible en secours (« ou coller une clé ») pour les outils qui en acceptent une ; Basecamp, Miro, Productboard, Outlook, Gmail, Google Drive et Slack ne se branchent que par bouton. Les réglages qui ne sont pas des secrets (les dépôts GitHub, la période à reprendre) se choisissent avant le clic.

- **Une appli par éditeur, créée une fois** par Amos ou David dans la console développeur de l'éditeur. Le guide [`docs/guides/applis-oauth.md`](docs/guides/applis-oauth.md) dit, éditeur par éditeur, où la créer, l'adresse de retour exacte, les droits à cocher et ce qu'il faut activer pour que d'autres comptes s'en servent. L'adresse de retour est `<BETTER_AUTH_URL>/api/v1/connexions/oauth/<appli>/retour`, soit `http://localhost:3000/…` en local ; `<appli>` est `atlassian` pour Jira et Confluence, l'identifiant de l'outil pour les autres.
- **Deux variables par appli**, dans `.env.local` : `LEON_OAUTH_<APPLI>_ID` et `LEON_OAUTH_<APPLI>_SECRET` (`ATLASSIAN` pour Jira et Confluence), listées vides dans `.env.example`. Une paire vide ou incomplète désactive le bouton de l'outil (la console l'écrit au démarrage) : son panneau garde le formulaire de clé, ou dit que l'appli n'est pas encore configurée sur ce serveur. Le secret d'appli ne quitte jamais le serveur.
- **Le déroulé** : un cookie signé de 10 minutes garde l'utilisateur, l'outil, le `state` et le vérificateur PKCE. Un refus chez l'éditeur, un lien trop vieux ou un cookie absent ramènent sur Connexions avec un message simple, sans rien créer.
- **Les jetons** sont chiffrés comme une clé et renouvelés avant chaque passage quand ils expirent bientôt. Un renouvellement refusé met la connexion en erreur (« Reconnectez <outil> ») sans nouvelle échéance, et le panneau propose « Reconnecter », qui refait le déroulé sur la même connexion.
- **Les droits** demandés sont la lecture seule, les plus étroits que l'éditeur propose. Outlook demande en plus l'accord, une fois, de l'administrateur Microsoft de l'entreprise (le panneau donne le lien).
- **Gmail, Google Drive et Slack passent par Pipedream Connect** : l'appli OAuth est celle de Pipedream, déjà validée par Google et Slack, et chaque requête passe par son proxy, qui y ajoute l'accès du compte (les jetons restent chez Pipedream). Il faut `PIPEDREAM_PROJECT_ID`, `PIPEDREAM_CLIENT_ID`, `PIPEDREAM_CLIENT_SECRET` et `PIPEDREAM_ENVIRONMENT` dans `.env.local`. Chaque requête coûte un crédit Pipedream : ces connexions se relèvent à 8 h, 11 h, 14 h et 17 h (heure de Paris), jamais la nuit, et Gmail lit ses courriers par lots de 20. Les droits accordés sont ceux de Pipedream, plus larges que ce que Leon lit (Gmail : lire, écrire et envoyer ; Drive : tout le Drive). Supprimer la connexion supprime aussi le compte chez Pipedream. Étude et coûts : [`docs/etudes/pipedream-2026-10`](docs/etudes/pipedream-2026-10).

La vérification pas à pas (GitHub et Linear par bouton, un refus chez l'éditeur, « Reconnecter ») est dans [`docs/guides/connecteurs-verification.md`](docs/guides/connecteurs-verification.md).

## Dépôts d'équipe

Sur GitHub, Leon ne relève que les dépôts que l'équipe partage (décision D du [plan des sessions](docs/plans/2026-11-02-memoire-sessions.md)) : un dépôt perso branché par un membre ne devient visible des autres que si un administrateur qui le lit lui-même sur GitHub le coche.

- **Qui coche** : un propriétaire ou un administrateur, dans Réglages, onglet Équipe, section « Dépôts d'équipe ». La liste reprend les dépôts déjà cochés (y compris ceux saisis à la main ou cochés par un autre administrateur) et ceux que voient ses propres connexions GitHub, lus ou non, jamais ceux des autres membres ; un autre dépôt se saisit sous la forme `propriétaire/nom`. Pour cocher un dépôt, il faut le lire soi-même sur GitHub : Leon le vérifie par l'une de ses propres connexions GitHub, et refuse sinon. La base refuse l'écriture à tout autre membre (`0047-depots-equipe.sql`). Toute l'équipe lit la liste.
- **Ce qui est relevé** : un dépôt coché n'est relevé que par les connexions qui ont une permission dessus.
- **Sans aucun dépôt coché**, GitHub n'est plus relevé : rien de nouveau n'entre, quelle que soit la connexion. La section le dit à l'administrateur par un bandeau, tant que rien n'est coché et qu'un membre de l'équipe a branché GitHub. Juste après le déploiement, il faut donc cocher les dépôts.
- **Ce qui devient privé** : les sources GitHub déjà relevées d'un dépôt qui n'est pas coché ne sont plus visibles que de la personne qui a branché la connexion. Un dépôt coché ensuite redevient visible de toute l'équipe.

## L'IA à jour chaque matin

Deux crochets de Claude Code font le travail, sans rien demander en séance (trois avec le rappel) :

- **au démarrage d'une session** (`SessionStart`), `leon briefing` affiche vos dernières sessions sur ce dépôt (4 au plus, sur 7 jours, la branche courante d'abord : branche, PR, commits, fichiers, reste à faire ; avec l'accord en version 2 seulement, voir plus bas ; avec l'usage `lecture`, à la place, le sommaire de vos fils de travail sur ce dépôt, en clés, et une consigne de lire le fil de la tâche), puis le point du matin du projet du dossier courant : ce qu'on a fait dans ses dernières sessions, ce qui a bougé depuis (le dépôt, les tickets, les messages qui nous mentionnent) et ce qui reste ouvert, avec ses sources, en 250 mots au plus. Claude Code l'ajoute au contexte de la session. Le serveur prépare le point à l'avance, avec le modèle réglé (`ANTHROPIC_API_KEY`) : la commande affiche le dernier point prêt, sinon « No briefing for this project yet: it will be ready at your next session. », ou, sans modèle sur le serveur, un message qui le dit. Elle ne bloque jamais la session (3 secondes au serveur au plus) et sort toujours avec le code 0.
- **à la fin d'une session** (`SessionEnd`), `leon capter-session` envoie la conversation et ses gestes à Leon avec son projet, pour qu'ils servent au bloc de démarrage, au point du matin et à la recherche. Elle sort aussi toujours avec le code 0.
- **à chaque message**, seulement avec l'usage `rappel` (voir « Ce qui est envoyé »), un troisième crochet (`UserPromptSubmit`, délai 5 s), posé une fois l'usage donné : `leon reminder` affiche une ligne de clés sur un ou deux de vos fils que le message touche, pas encore cités dans la session, ou rien. Claude Code l'ajoute au contexte. Un serveur lent, absent ou plus ancien ne donne rien, en 1,5 seconde au plus d'attente, et la commande sort toujours avec le code 0.

Les commandes s'écrivent `leon <commande>` : une fois Leon installé, c'est `~/.leon/bin/leon <commande>` (Leon n'ajoute rien à votre `PATH`) ; depuis un clone de Leon, `pnpm leon <commande>`.

### Installer

Une seule commande, sur l'ordinateur où tourne Claude Code (l'adresse est celle de votre Leon) :

```bash
curl -fsSL <adresse de Leon>/install | sh
```

Ni clone, ni pnpm, ni Node à installer d'abord : la commande pose tout dans `~/.leon` et n'écrit que là, plus les réglages de vos outils de code après votre accord ; rien dans votre `PATH` ni votre profil de shell. Dans l'ordre :

1. elle télécharge le Node officiel de la version que Leon a épinglée et la CLI de Leon (un seul fichier, servi par Leon), vérifie l'empreinte SHA-256 de Node et la taille et l'empreinte SHA-256 de la CLI, puis les pose dans `~/.leon/runtime` et `~/.leon/cli`. Plateformes : macOS (Apple silicon et Intel) et Linux (x64 et arm64) avec la glibc. Windows et Linux musl (Alpine) sont refusés avec un message, avant d'écrire quoi que ce soit ;
2. elle lance `leon setup` sur votre terminal : il écrit le lanceur `~/.leon/bin/leon`, **connecte l'ordinateur** (il ouvre le navigateur, voir plus bas), cherche vos outils de code (Claude Code, Codex, Cursor et Antigravity), montre pour chacun ce qui part et ce qui est donné au modèle, demande confirmation, puis pose les crochets et l'accord. Sans terminal, elle s'arrête après l'étape 1 et dit la commande à lancer dans un terminal.

On peut relancer `~/.leon/bin/leon setup` à volonté : ce qui est en place n'est pas réécrit (`--yes` ne demande rien, sauf pour remplacer un lanceur qui n'est pas celui de la forme installée ; `--url <adresse>` désigne le serveur de `leon login`). Relancer la commande d'installation met aussi la CLI à la version que sert Leon. `leon setup` relance aussi `leon login` (et le dit) quand l'ordinateur n'est plus connecté : jeton révoqué dans Réglages, `--url` d'un autre serveur que celui de la connexion, ou seulement `LEON_URL` et `LEON_TOKEN` posées dans le terminal (un Claude Code lancé depuis le Dock ne les voit pas). Un serveur qui ne répond pas ne bloque pas l'installation.

Quand `leon setup` ouvre le navigateur, la page « Autoriser » montre aussi, en cases cochées par défaut, les usages qui manquent sans avoir été refusés aux outils trouvés (aujourd'hui `lecture` et `rappel`, jamais `rappel` pour Antigravity seul, voir « Ce qui est envoyé »). Ces cases sont à vous : ce que vous y cochez ou décochez s'écrit pour chacun de ces outils, après son accord, et n'est pas redemandé dans le terminal. `--yes` n'ajoute jamais un usage de lui-même. Avec `--yes`, sur un ordinateur déjà connecté (le serveur reconnaît son jeton), `leon setup` rouvre la page quand l'un de ces usages manque encore, vers le serveur de la connexion enregistrée (jamais `LEON_URL`), et attend le clic 100 secondes au plus : sans réponse, la connexion d'avant reste, et l'installation continue sans usage. Une case décochée vaut un refus, gardé : le `setup --yes` suivant ne rouvre pas la page pour elle. Après `leon login --with-token`, la page ne se rouvre pas : une ligne dit de lancer `~/.leon/bin/leon setup` dans un terminal pour choisir les usages.

#### Connecter l'ordinateur

`leon setup` lance la connexion tout seul. On peut aussi la faire ou la défaire à la main :

```bash
~/.leon/bin/leon login --url https://<votre-leon>   # ouvre le navigateur ; sans --url : LEON_URL, puis la connexion enregistrée
~/.leon/bin/leon logout                             # révoque le jeton de cet ordinateur et efface la connexion
```

`leon login` ouvre la page d'autorisation de Leon (connexion si besoin, puis « Autoriser »). La commande tire un jeton sur votre ordinateur, n'en montre que l'empreinte au navigateur, reçoit le retour sur `127.0.0.1` et écrit `~/.leon/connexion.json` (en 0600) : l'adresse du serveur et le jeton, que lisent les crochets et `import-claude-code`. Elle attend le navigateur 5 minutes au plus (100 secondes quand `leon setup --yes` la relance sur un ordinateur déjà connecté) ; Ctrl+C l'annule sans rien écrire. Lancée seule, elle ne montre aucune case et n'écrit rien dans `~/.leon/accord.json`. Le jeton ne passe jamais dans une adresse, un argument de commande ni un message. Chaque ordinateur a son jeton (« Ordinateur : <nom> » dans Réglages) : se reconnecter révoque l'ancien. Deux cas demandent autre chose :

- **Le navigateur n'est pas sur cet ordinateur** (SSH, conteneur distant) : le retour vers `127.0.0.1` n'arrive jamais. `leon login --with-token` colle à la place un jeton créé dans Réglages (sans écho dans un terminal, sinon une ligne lue sur l'entrée) et le vérifie auprès du serveur ; `connexion.json` porte alors `"par": "jeton"`, pour que `leon setup --yes` ne rouvre pas la page d'autorisation.
- **Vous avez dû créer un espace ou réinitialiser votre mot de passe en chemin** : l'autorisation en cours est perdue, relancez `leon login`.

Une limite : l'adresse d'autorisation (port, `etat`, empreinte) est lisible par les autres comptes d'une machine partagée (sous Linux, dans `/proc/<pid>/cmdline`), et l'un d'eux pourrait l'autoriser avec son propre compte Leon, ce qui enregistrerait votre jeton sur le sien. `leon login` affiche donc le compte connecté (« Connected to <espace> as <compte> ») : sur une machine où d'autres comptes sont ouverts en même temps, vérifiez-le, ou utilisez `leon login --with-token`.

`LEON_URL` et `LEON_TOKEN`, si les deux sont posées (l'environnement, ou le `.env.local` d'un clone : voir `.env.example`), passent avant la connexion enregistrée : c'est le réglage des essais et de qui développe sur Leon, et `leon login` le rappelle. Sans connexion ni variables, les crochets ne font rien et ne le disent que sur la sortie d'erreur, que Claude Code ne montre pas ; la commande d'installation prévient alors « pas connecté » (elle ne recopie jamais les valeurs de la connexion ni d'un `.env.local`).

#### Mises à jour

La CLI se met à jour seule, depuis le serveur de la connexion (`~/.leon/connexion.json`), au plus une fois par jour : au démarrage d'une session, `leon briefing` lance `leon update` en arrière-plan si le dernier contrôle date de 24 h ou plus. La mise à jour vérifie la taille et l'empreinte, lance la nouvelle version avant de basculer, et ne touche ni à la connexion, ni à l'accord, ni au lanceur, ni aux crochets. `~/.leon/bin/leon update` la lance à la main, et `~/.leon/bin/leon update --previous` revient à la version d'avant, sans réseau. Le retour ne tient que jusqu'à la mise à jour suivante (24 h) si le serveur sert toujours la même version : elle remet alors celle du serveur. Les mises à jour automatiques ne se font qu'en https ; une installation reliée à un Leon local (http://localhost) se met à jour par `~/.leon/bin/leon update`. Sous la forme clone, rien n'est mis à jour : un clone se met à jour avec git.

#### Ce que la commande écrit dans Claude Code

Dans `~/.claude/settings.json` (ou dans `settings.json` du dossier `CLAUDE_CONFIG_DIR` quand cette variable est posée), avec `/Users/vous` à la place de votre dossier personnel (le chemin est mis entre apostrophes s'il a une espace ou une apostrophe) :

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/vous/.leon/bin/leon briefing",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/Users/vous/.leon/bin/leon capter-session",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- Les deux crochets appellent le lanceur `~/.leon/bin/leon`, qui sait où est la CLI : le Node posé par Leon, ou un clone (voir plus bas). Ils ne dépendent donc ni de pnpm ni du `PATH` de Claude Code.
- Vos autres réglages et crochets restent tels quels : leurs valeurs et l'ordre des clés ne changent pas, mais le fichier est réécrit avec une indentation de 2 espaces, donc sa mise en page peut changer. Avant d'écrire, la commande copie le fichier dans `settings.json.leon-sauvegarde`, à côté, **seulement si cette copie n'existe pas encore** : c'est la première copie, celle d'avant Leon, et elle n'est jamais remplacée (une mise à jour de vos crochets n'y met donc pas ceux de Leon). La commande dit quand elle garde une copie existante.
- Si l'écriture échoue (droits, disque plein), la commande le dit, ne modifie rien (la copie qu'elle venait de faire est retirée) et sort avec le code 1 : on peut alors coller le JSON ci-dessus à la main.
- **L'accord** : après la confirmation, la commande écrit aussi `~/.leon/accord.json` (droits 0600), `{ "outils": { "claude_code": { "version": 2, "installe_le": "…" } } }`. La version 2 couvre les gestes de chaque session et, au démarrage, le bloc de vos dernières sessions (voir « Ce qui est envoyé ») ; la CLI relit ce fichier avant chaque envoi, donc une CLI plus récente n'envoie rien de plus que ce que vous avez accepté. Sans accord (crochets installés avant lui), les crochets n'envoient que ce qu'ils envoyaient avant lui : la clé du projet au démarrage, pour le point du matin seul, et le texte des échanges à la fin. Si les crochets sont déjà en place mais que l'accord manque ou est plus ancien, la commande montre ce qui part, demande la confirmation, puis écrit seulement `accord.json`, sans toucher à `settings.json`. Un accord plus récent n'est jamais rabaissé. Une fois la version 2 en place, et seulement dans un terminal (jamais avec `--oui` ou `--yes`, ni sur une réponse envoyée par un tube), la commande propose à part, un à un, les **usages** qui manquent sans avoir été refusés (voir « Ce qui est envoyé ») : d'abord **`lecture`**, lire Leon, coché par défaut (`[Y/n]` : Entrée, `y`, `yes`, `o` ou `oui` l'acceptent ; `n`, `no` ou `non` le refusent ; toute autre réponse ne tranche rien et la question reviendra), puis **`rappel`**, le rappel à chaque message, coché par défaut de même (accepté, il pose le crochet `UserPromptSubmit`, même quand les deux autres sont déjà en place ; refusé, aucun crochet), puis **`resume`**, le résumé de chaque session (`[y/N]` : seul un oui l'accepte). `leon setup` pose une seule question par usage pour tous les outils du passage, et la réponse s'écrit pour chacun ; un usage tranché sur la page « Autoriser » n'est pas redemandé. Accepté, un usage s'écrit daté sous `usages` (`"usages": { "lecture": "…" }`), sans toucher à la version ni à sa date ; refusé, rien ne change dans ce qui part, et le refus s'écrit daté sous `refus` (`"refus": { "resume": "…" }`) : la question n'est plus posée, ni par `leon setup` ni par `installer-crochets`, ni sur la page. Un refus n'ouvre rien : un usage absent de `usages` reste refusé. Pour revenir sur un refus : `leon retirer-crochets`, qui efface usages et refus, puis `leon setup`. Hors d'un terminal, ou avec `--oui` ou `--yes`, la question n'est pas posée et rien n'est écrit, ni usage ni refus, sauf ce que les cases de la page ont tranché. Des refus illisibles (retouchés à la main) se lisent comme aucun refus, sans faire perdre l'accord ni les usages. Si `accord.json` ne peut pas s'écrire, les crochets restent en place et la commande sort avec le code 1 : tant qu'on ne l'a pas relancée, seul le texte des échanges part à la fin de session. Un `accord.json` présent mais illisible (retouché à la main) vaut un retrait : plus rien ne part tant que la commande ne l'a pas réécrit.
- Relancer la commande ne change rien quand les crochets et l'accord sont en place (« déjà en place »), sauf dans un terminal tant qu'un usage (`lecture`, `rappel`, `resume`) n'est ni accepté ni refusé, ou quand l'usage `rappel` est là sans son crochet (il est remis) : elle le propose alors ; relancée, elle garde l'accord tel quel, usages et refus compris ; si le lanceur a changé de place (autre dossier personnel), elle met à jour ses deux entrées au lieu d'en ajouter d'autres.
- Un `settings.json` illisible (Claude Code lit du JSON strict : ni commentaire ni virgule finale) n'est pas touché : la commande dit pourquoi et s'arrête. On peut alors coller le JSON ci-dessus à la main.
- Les délais sont en secondes : 10 au démarrage, 30 à la fin (Claude Code n'en laisse que 1,5 par défaut à un crochet de fin de session ; l'envoi s'interrompt de lui-même au bout de 15 secondes).

#### Si Leon était déjà installé avant (clone, pnpm, jeton dans `.env.local`)

Relancez la commande d'installation. `leon setup` repère vos anciens crochets (`pnpm … --dir <clone> leon briefing` et `… leon capter-session`) et les **remplace sur place** par ceux du lanceur : même groupe, même position, mêmes délais (10 s au démarrage, 30 s à la fin) ; un crochet à vous, avant, entre ou après, n'est pas touché, et il ne reste aucun `pnpm … leon`. `settings.json.leon-sauvegarde` suit la même règle qu'à la première installation : elle n'est jamais remplacée. `~/.leon/accord.json` est gardé tel quel, et s'il est déjà en version 2 l'accord n'est pas redemandé : seule l'écriture des réglages est confirmée. Comme l'ordinateur n'est pas encore connecté (le jeton n'était que dans le `.env.local`), `leon setup` lance aussi `leon login`.

Une fois les crochets écrits, la commande dit : « Your hooks used to run Leon from <clone>; they now run ~/.leon/bin/leon. The token in <clone>/.env.local is no longer needed: revoke it in Settings › Personal tokens. » Elle ne lit jamais ce `.env.local` : elle ne le connaît que par le chemin du clone que citaient les anciens crochets. Ce jeton a été créé à la main : il est sous « Personal tokens » (« Jetons personnels ») dans Réglages, pas sous « Ordinateurs connectés ». Révoquez-le comme elle le dit ; le clone et son `.env.local` ne sont pas touchés.

#### Depuis un clone de Leon (pour qui développe sur Leon)

Le lanceur a alors sa forme clone : au lieu du Node posé par Leon, il lance `pnpm -s --config.verify-deps-before-run=false --dir <clone> leon …`, donc le code de votre clone. Les crochets, eux, sont les mêmes : ils appellent `~/.leon/bin/leon`.

```bash
pnpm leon setup --depot <clone>       # le lanceur (forme clone), la connexion et les crochets, comme la commande unique
pnpm leon installer-crochets          # le lanceur (forme clone) et les crochets de Claude Code seulement ; montre ce qui sera écrit, puis demande confirmation [y/N]
pnpm leon installer-crochets --oui    # écrit sans demander
```

(`--depot <chemin>` désigne le clone ; sans lui, `installer-crochets` prend celui qui lance la commande.) Les crochets lancent `pnpm` puis `node` (24 au moins) avec le `PATH` de Claude Code, qui n'est pas toujours celui de votre terminal quand il est lancé depuis un éditeur ou une application. `pnpm` doit être de la version du champ `packageManager` de `package.json` : une autre version irait chercher la bonne sur le réseau avant de lancer la commande, ce qui dépasse le délai du crochet. Lancer la commande depuis le **clone principal** de Leon : un dossier de travail Git temporaire (`.claude/worktrees/…`) est supprimé après la fusion, et les crochets cesseraient de marcher (la commande prévient). Sous cette forme, `LEON_URL` et `LEON_TOKEN` du `.env.local` du clone servent toujours, et la commande prévient s'ils manquent sans connexion.

`--config.verify-deps-before-run=false` empêche pnpm d'installer les dépendances avant la commande quand elles ne correspondent plus au verrou (après un `git pull`) : cette installation écrirait dans le contexte de la session et serait coupée au bout du délai du crochet.

### Codex

`leon setup` propose aussi Codex quand il trouve son dossier (`$CODEX_HOME`, sinon `~/.codex`) ; depuis un clone : `pnpm leon installer-crochets --outil codex`. Codex **reçoit** le bloc de démarrage, comme Claude Code (vos sessions récentes sur le dépôt, tous outils confondus, et le point du matin), et ses sessions **sont captées** : leurs échanges et leurs gestes remontent dans Leon, sous l'outil « Codex ».

- La commande ajoute à `hooks.json` de Codex trois groupes, chacun en fin de la liste de son évènement : `SessionStart` lance `~/.leon/bin/leon crochet codex demarrage` (délai 10 s, `additionalContextLimit` 8000 : le bloc n'est jamais tronqué, donc jamais recopié sur le disque par Codex) ; `Stop`, en tâche de fond (`async`, 60 s), lance `crochet codex tour` après chaque tour ; `SessionEnd` (3 s, le plafond de Codex) lance `crochet codex fin`. Vos autres crochets ne bougent pas.
- **Codex ne lance un crochet qu'une fois approuvé** : au prochain lancement, tapez `/hooks` et approuvez ceux de Leon (dans l'app : Réglages › Hooks). Un crochet de démarrage déjà approuvé le reste : seuls `Stop` et `SessionEnd` sont à approuver. Les mises à jour de Leon ne redemandent rien tant que les commandes ne changent pas.
- **Ce qui part** : à chaque tour, les échanges nouveaux (vos messages et les réponses de Codex ; les messages que Codex écrit lui-même à votre place, comme le rapport d'un sous-agent, une notification ou une commande `!` avec sa sortie, marqués comme écrits par Codex et non par vous ; pas le contexte que Codex ajoute lui-même) et les gestes de la session, relevés dans son fichier `~/.codex/sessions/…/rollout-….jsonl` comme pour Claude Code (fichiers écrits, commandes réduites à leur exécutable, branche, commits, PR, plan, et si la session est allée sur le web, sur un serveur MCP, dans un sous-agent ou sur le réseau). Un curseur local par fichier (`~/.leon/curseurs/codex/`, sans aucun texte) évite de renvoyer ce qui est déjà parti ; les gestes, eux, sont recalculés sur toute la session.
- Codex ne lance pas `SessionEnd` après `/quit` dans le terminal, ni `Stop` en `codex exec` : ce qu'un crochet a manqué part en tâche de fond la prochaine fois que le crochet de démarrage de Leon tourne sur ce poste, dans n'importe lequel de vos outils : au démarrage d'une session Claude Code ou Codex, ou au premier message d'une conversation Cursor ou Antigravity, par `leon rattraper`. Il ne lit que les sessions Codex modifiées depuis l'accord de capture.
- La fin de session se détache dans le lanceur, avant Node : il copie l'entrée du crochet dans `~/.leon/entrees/` (0600), rend la main à Codex, et la commande efface ce fichier une fois lu. Après une mise à jour de Leon, relancez `~/.leon/bin/leon setup` pour que le lanceur l'apprenne.
- L'accord s'écrit dans `~/.leon/accord.json` sous `codex`, avec la date de l'accord de capture (`capture_le`). Sans elle (l'accord d'avant, qui ne couvrait que le démarrage), rien n'est capté. Les usages `lecture`, `rappel` et `resume` se proposent ensuite, avec les mêmes textes que pour Claude Code ; après un refus, `~/.leon/bin/leon retirer-crochets --outil codex` puis `~/.leon/bin/leon setup` permettent d'y revenir. Avec `rappel`, un quatrième groupe s'ajoute en fin de liste : `UserPromptSubmit` (5 s) lance `crochet codex prompt`, qui demande le rappel à chaque message ; comme tout crochet nouveau, il est à approuver par `/hooks`, et le retrait l'enlève avec les autres.
- Retirer : `~/.leon/bin/leon retirer-crochets --outil codex` (depuis un clone : `pnpm leon retirer-crochets --outil codex`) retire les entrées de Leon de `hooks.json` et passe Codex en version 0 : plus rien ne part, ni ne revient.
- Ce que l'essai réel a établi : [annexe 3 de l'étude mémoire des sessions](docs/etudes/memoire-sessions-2026-11/annexes/03-essai-codex.md).

### Cursor

`leon setup` propose aussi Cursor quand il trouve `~/.cursor` ; depuis un clone : `pnpm leon installer-crochets --outil cursor`. Cursor **reçoit** le bloc de démarrage au premier message de chaque conversation, et ses conversations **sont captées**, sous l'outil « Cursor ».

> Essayé pour de vrai le 08/11 ([annexe 4 de l'étude mémoire des sessions](docs/etudes/memoire-sessions-2026-11/annexes/04-essai-cursor.md)) : le texte injecté au premier message arrive au modèle, et il le voit encore aux messages suivants. Cursor lance aussi les crochets de Claude Code : Leon s'y tait, le bloc n'arrive pas deux fois. Sur macOS, ne rangez pas un clone de Leon dans Documents, Bureau ou Téléchargements : Cursor ne peut pas y lancer de script (l'installateur prévient).

- La commande ajoute à `~/.cursor/hooks.json` (forme plate, `version: 1`) deux entrées, chacune en fin de la liste de son évènement : `beforeSubmitPrompt` (5 s) lance `~/.leon/bin/leon crochet cursor prompt`, qui donne le bloc au premier message de la conversation, une seule fois (un témoin vide dans `~/.leon/temoins/cursor/`), et répond toujours `"continue": true` ; `stop` (30 s) lance `crochet cursor tour`, qui capte le tour et ne répond que `{}`. Vos autres entrées ne bougent pas.
- **Ce qui part** : à chaque tour, les échanges nouveaux de la conversation (vos messages et les réponses de l'agent ; les messages que Cursor écrit lui-même à votre place, comme le rapport d'un sous-agent, marqués comme écrits par Cursor et non par vous) et ses gestes, relevés dans son transcript `~/.cursor/projects/<projet>/agent-transcripts/<conversation>/<conversation>.jsonl` : fichiers écrits, commandes réduites à leur exécutable, branche, liste de tâches, et si la conversation est allée sur le web, sur un serveur MCP, dans un sous-agent ou sur le réseau. Le transcript n'écrit ni la sortie des outils ni l'heure des réponses : pas de commit ni de PR relevés, et les tours sont datés à l'heure du fichier. Les bases internes de Cursor (`state.vscdb`) ne sont jamais lues.
- Ce qu'un crochet a manqué part en tâche de fond la prochaine fois que le crochet de démarrage de Leon tourne sur ce poste, dans n'importe lequel de vos outils : au démarrage d'une session Claude Code ou Codex, ou au premier message d'une conversation Cursor ou Antigravity, par `leon rattraper`, pour les seules conversations modifiées depuis l'accord de capture.
- L'accord s'écrit dans `~/.leon/accord.json` sous `cursor`, avec la date de l'accord de capture. Les usages `lecture`, `rappel` et `resume` se proposent ensuite, comme pour Codex (`--outil cursor` pour revenir sur un refus). Le rappel n'ajoute aucun crochet : `beforeSubmitPrompt` le demande à chaque message, avec l'usage, et au premier message en même temps que le bloc.
- Retirer : `~/.leon/bin/leon retirer-crochets --outil cursor` (depuis un clone : `pnpm leon retirer-crochets --outil cursor`).

### Antigravity

`leon setup` propose aussi Antigravity quand il trouve l'un de ses dossiers (`~/.gemini/antigravity`, `antigravity-ide` ou `antigravity-cli`) ; depuis un clone : `pnpm leon installer-crochets --outil antigravity`. `~/.gemini` seul, celui de Gemini CLI, ne suffit pas. Un Antigravity jamais ouvert n'a pas encore son dossier : relancez `leon setup` après son premier lancement. Sur un poste qui n'a que Gemini CLI, un `leon setup` d'avant cette règle a pu poser Antigravity quand même : `leon setup` le dit maintenant, et donne `~/.leon/bin/leon retirer-crochets --outil antigravity` pour le retirer (depuis un clone : `pnpm leon retirer-crochets --outil antigravity`). Antigravity **reçoit** le bloc de démarrage une fois par conversation, et ses conversations **sont captées**, sous l'outil « Antigravity ».

> Essayé pour de vrai dans l'appli Antigravity 2.0.1 le 08/11 ([annexe 5 de l'étude mémoire des sessions](docs/etudes/memoire-sessions-2026-11/annexes/05-essai-antigravity.md)) : le texte injecté par PreInvocation arrive au modèle. L'IDE et `agy` restent à essayer.

- La commande écrit dans `~/.gemini/config/hooks.json` une seule entrée, nommée `leon` : `PreInvocation` (10 s) lance `~/.leon/bin/leon crochet antigravity prompt`, qui donne le bloc (`injectSteps`, forme `ephemeralMessage`) avant le premier appel au modèle de la conversation, une seule fois (un témoin vide dans `~/.leon/temoins/antigravity/`) ; `Stop` (30 s) lance `crochet antigravity tour`, qui capte la conversation une fois inactive (`fullyIdle`). Pas de `SessionStart` : l'appli 2.0.1 ne l'appelle pas. Les autres entrées du fichier ne bougent pas, et un fichier que `JSON.parse` refuse (des commentaires) n'est jamais réécrit. Relancez Antigravity pour qu'il relise le fichier.
- **Ce qui part** : les échanges nouveaux (vos demandes et les réponses de l'agent ; les messages qu'Antigravity écrit lui-même à votre place, marqués comme écrits par Antigravity et non par vous ; pas le contexte qu'Antigravity ajoute lui-même) et les gestes, relevés dans `~/.gemini/{antigravity,antigravity-ide,antigravity-cli}/brain/<conversation>/.system_generated/logs/transcript_full.jsonl` (ou `transcript.jsonl`) : fichiers écrits, commandes réduites à leur exécutable, commits, branche, et si la conversation a cherché sur le web, appelé un serveur MCP, un sous-agent ou une commande réseau. Les conversations `.pb` et les bases d'Antigravity ne sont jamais lues.
- Ce qu'un crochet a manqué part en tâche de fond la prochaine fois que le crochet de démarrage de Leon tourne sur ce poste, dans n'importe lequel de vos outils : au démarrage d'une session Claude Code ou Codex, ou au premier message d'une conversation Cursor ou Antigravity, par `leon rattraper`, pour les seules conversations modifiées depuis l'accord de capture.
- L'accord s'écrit dans `~/.leon/accord.json` sous `antigravity`, avec la date de l'accord de capture. Les usages `lecture` et `resume` se proposent ensuite, comme pour Codex (`--outil antigravity` pour revenir sur un refus). `rappel` n'est jamais proposé ni écrit pour Antigravity : son crochet `PreInvocation` ne reçoit pas le message.
- Retirer : `~/.leon/bin/leon retirer-crochets --outil antigravity` (depuis un clone : `pnpm leon retirer-crochets --outil antigravity`) retire l'entrée `leon`.

### Ce qui est envoyé

- **Au démarrage** : la clé du projet et le jeton, rien de la conversation ; avec l'accord en version 2, aussi la branche Git courante et l'identifiant de la session. La clé est `github.com/<propriétaire>/<dépôt>`, tirée du `remote origin` du dossier de la session, sinon `dossier:` suivi de 16 caractères calculés à partir de son chemin. En retour, le serveur rend le point du matin et, avec l'accord, vos dernières sessions sur ce dépôt : Claude Code ajoute ce bloc au contexte de la session, il est donc donné au **modèle de Claude Code**. Avec l'usage `lecture` de l'outil, la CLI envoie aussi les usages de l'outil et la commande Leon du poste (`~/.leon/bin/leon`), et le serveur rend, à la place de vos dernières sessions, le sommaire de vos fils de travail sur ce dépôt (des clés seulement : id, branche, outils, dates, numéros et états des PR, nombre de sources liées ; 8 fils au plus, celui de la branche courante d'abord) et une consigne, en français, de lire le fil de la tâche par `<commande> thread <id>` ou l'outil `thread` du MCP ; sans fil, le bloc reste celui d'avant. Au même démarrage, avec ou sans l'usage, le serveur avance, sans l'attendre, le rangement en fils de vos autres sessions de code sur ce projet dont les gestes sont arrivés depuis moins de 15 minutes.
- **La lecture**, seulement avec l'usage `lecture` : l'agent peut lire vos fils, leurs résumés et leur état, et la mémoire du dépôt que vous voyez (voir « Lire Leon depuis une session ») ; le fournisseur du modèle de l'outil voit ce qu'il lit. L'usage ne permet jamais d'écrire. Le jeton est celui de l'ordinateur : une fois l'usage accepté dans un outil, les commandes de lecture marchent pour tout agent du poste ; le refuser dans un outil n'y retire que ce qui est placé au démarrage.
- **À la fin** : le texte des échanges (vos messages et les réponses de Claude ; les messages que Claude Code ajoute à votre place, comme le résultat d'une tâche de fond, la sortie d'une commande `!` ou `/`, le message d'une autre session ou le prompt d'un script, marqués comme non tapés par vous ; une commande `!` que vous tapez part entière), sans les pensées, les appels d'outils du modèle et leurs résultats, ni les images, avec la clé du projet. Avant l'envoi, les secrets reconnaissables (clés d'API, jetons, clés privées…) sont masqués, les rappels du système retirés et chaque message est coupé à 20 000 caractères ; le serveur refait le masquage. Tout part vers le serveur de votre connexion (`leon login`, ou `LEON_URL`). La conversation est **privée à son auteur** : personne d'autre ne la voit.
- **Les gestes**, à la fin aussi, avec l'accord en version 2 : relevés dans le transcript par la CLI, sans modèle. Ce sont les fichiers écrits (chemins relatifs à la racine du dépôt du dossier de départ, ceux d'un worktree de `.claude/worktrees/` compris ; aucun pour une session ouverte hors de tout dépôt), les commandes lancées réduites à leur exécutable (et, pour une liste fermée d'outils comme git, gh, pnpm ou docker, à leur sous-commande ; jamais leurs autres arguments), la branche, les commits et les PR, la liste des tâches, et quelques repères (début et fin, nombre de messages et d'erreurs d'outils, si la session a lu du web, un serveur MCP, un sous-agent ou une commande réseau). Les secrets sont masqués sur le poste, puis de nouveau par le serveur ; les gestes restent privés à leur auteur, comme la conversation. `leon import-claude-code` n'envoie les gestes que des sessions dont le fichier a bougé après l'accord (`installe_le`).
- **Le rappel**, seulement avec l'usage `rappel` de l'outil (Claude Code, Codex, Cursor ; jamais Antigravity) : à chaque message, la CLI envoie au seul serveur de Leon les 2 000 premiers caractères du message, masqués (puis de nouveau par le serveur), avec la clé du projet, la branche, la session, l'outil et ses usages. Le serveur ne stocke ni ne journalise le message : il y cherche vos fils de ce projet qu'il touche, et rend au plus une ligne de clés (`<rappel-leon>…</rappel-leon>`) sur un ou deux fils pas encore cités dans la session, que l'outil ajoute au contexte, donc au **modèle de l'outil**. Il garde la liste des fils déjà cités par session (jamais le message) 24 heures, effacée dans l'heure qui suit. Au-delà de 1,5 seconde, la CLI abandonne et le message part sans rappel.
- **Le résumé**, seulement avec l'usage `resume` : la CLI envoie ses usages avec les gestes, et le serveur ne résume que les sessions dont l'outil l'a accepté. Une fois une session d'au moins 6 de vos messages close (60 s après la fin, ou 15 min sans nouveau tour), le serveur envoie au **fournisseur du modèle de Leon** ses gestes, l'état de ses PR et la fin de ses échanges (40 000 caractères au plus, secrets déjà masqués) ; le résumé revient dans la session, privé à son auteur, et la recherche de Leon le trouve. Il n'entre jamais dans le bloc de démarrage. Le même usage sert aussi à tenir à jour l'état de vos fils de travail (un fil réunit les sessions, les PR et les sources d'un même travail) : le serveur envoie au fournisseur du modèle de Leon les gestes, les échanges et les résumés des sessions qui ont l'usage, l'état de leurs PR et les sources liées au fil que vous voyez ; cet état reste privé à son auteur, comme le résumé. Le texte de l'usage le disait avant que l'état ne s'écrive : l'accord déjà donné le couvre. Une session qui reprend est résumée à nouveau, et le nouveau résumé remplace l'ancien ; si la reprise n'a rien à retenir, l'ancien est retiré, sans nouveau résumé. `leon import-claude-code` n'envoie l'usage qu'avec les sessions dont le fichier a bougé après son acceptation (sa date dans `usages`) : il ne fait pas résumer celles d'avant. Le serveur n'écrit un résumé que dans l'heure qui suit le dernier envoi des gestes de la session. `leon retirer-crochets` prévient le serveur de la connexion du moment, qui vide les usages de vos sessions de l'outil déjà envoyées : plus rien n'en est résumé, ni envoyé au modèle pour l'état des fils. Si le poste est hors ligne à ce moment-là, un résumé déjà prévu peut encore s'écrire dans l'heure, et l'état des fils peut encore envoyer au modèle les sessions déjà envoyées : le retrait ne l'arrête qu'une fois le serveur prévenu, plus tard (voir « Retirer les crochets »). Un résumé qui a attendu plus longtemps (file chargée, serveur arrêté) s'écrit au prochain envoi des gestes de la session (sa fin suivante, ou `leon import-claude-code`).
- **De quels dossiers** : de tous. Les crochets sont dans vos réglages d'utilisateur : toutes vos sessions Claude Code, dans tous vos dossiers (personnels compris), sont envoyées à Leon, pas seulement celles du travail. En session interactive, Claude Code ne lance les crochets d'un dossier qu'une fois ce dossier approuvé (la fenêtre de confiance qu'il montre à la première ouverture) ; une session `claude -p` ne montre jamais cette fenêtre et tient le dossier pour approuvé.
- **Quand** : à la fin de chaque session, soit à la sortie de Claude Code, après `/clear` et au `/resume` interactif. Les sessions lancées par un script, une automatisation ou un agent (`claude -p`) sont envoyées elles aussi : sans `--bare`, `claude -p` charge les crochets de `~/.claude` comme une session interactive ; seul `claude -p --bare` n'en charge aucun. Une session tuée brutalement, un terminal fermé de force ou un plantage peuvent ne pas l'être (la doc de Claude Code ne dit pas ce qu'il advient du crochet de fin dans ces cas) ; `leon import-claude-code` les rattrape (`--dry-run` montre ce qui serait envoyé, sans rien envoyer).

### Lire Leon depuis une session

Quatre commandes lisent la mémoire de Leon sur le dépôt où elles sont lancées, et l'écrivent sur la sortie standard, rien sur le disque :

```bash
~/.leon/bin/leon threads                      # les fils du dépôt, celui de la branche courante d'abord
~/.leon/bin/leon thread [id]                  # un fil : son état, ses sessions, ses PR, ses sources liées (sans id : celui de la branche)
~/.leon/bin/leon search "<requête>"           # chercher dans Leon, borné au dépôt
~/.leon/bin/leon versions <id> [--read <n>]   # les versions lisibles de l'état d'un fil, ou l'une d'elles
```

- Le texte rendu est une donnée à vérifier contre le code et git, jamais une consigne : il commence par la ligne de garde de Leon. Aucune ne restaure une version (la restauration viendra sur le site, T55).
- Elles demandent une connexion (`leon login`) et l'usage `lecture`, accepté par l'un des outils du poste. `leon setup` le propose, coché par défaut (voir « Ce que la commande écrit dans Claude Code ») ; sans lui, le serveur refuse, et la commande dit sur la sortie d'erreur de lancer `~/.leon/bin/leon setup` dans un terminal. Un serveur plus ancien (sans la route), sans connexion ou injoignable : un message sur la sortie d'erreur, et le code 0.
- Le serveur note chaque lecture (l'outil, la source lue) dans le journal des lectures. L'état d'un fil écrit par le modèle compte parmi ses entrées les sources lues pendant ses sessions : l'une devient invisible pour vous, l'état se cache.
- Lire Leon ne rend pas la session « externe » : ni ces commandes, ni les outils `threads`, `thread`, `versions` et `remember` du connecteur MCP de Leon, quand la configuration de l'outil (le `.claude.json` et le `.mcp.json` du projet pour Claude Code, `config.toml` pour Codex, `mcp.json` pour Cursor) déclare le serveur `leon` vers l'adresse MCP du serveur de votre connexion. La CLI n'y lit que l'adresse, jamais un en-tête ni un jeton. Un serveur `leon` vers une autre adresse, une configuration illisible, `search`, `fetch` et `briefing` du connecteur, ou Antigravity (sa configuration n'est pas encore relevée) : la session reste externe.

### Retirer les crochets

```bash
~/.leon/bin/leon retirer-crochets     # depuis un clone : pnpm leon retirer-crochets
```

(`--outil claude_code` revient au même ; `--outil codex`, `--outil cursor` ou `--outil antigravity` retirent ceux de ces outils, voir plus haut ; un outil inconnu est refusé.) La commande retire de `settings.json` les seules entrées de Leon, reconnues comme à l'installation (avec leur groupe s'il ne contient plus rien), et garde tout le reste, dans son ordre. Elle n'écrit rien quand il n'y a rien à retirer : on peut la relancer sans risque. Elle passe aussi Claude Code en **version 0** dans `~/.leon/accord.json` : dès lors, plus rien ne part de Claude Code, ni le bloc de démarrage, ni la session à la fin, ni `leon import-claude-code`. Elle efface aussi les usages acceptés et les refus : un `leon setup` suivant les propose de nouveau. Elle prévient ensuite le **serveur de la connexion du moment** (`connexion.json`, ou `LEON_URL` et `LEON_TOKEN` ; les deux quand leurs jetons diffèrent, puisqu'un crochet lancé hors du terminal ne voit pas ces variables), qui vide les usages (`resume` compris) de vos sessions de cet outil déjà envoyées ; un autre serveur, ou une autre organisation, où ce poste aurait envoyé des sessions n'en sait rien. Sans connexion, serveur injoignable ou plus ancien : une ligne le dit, le retrait sur le poste reste fait et le code de sortie ne change pas ; le serveur l'apprend la prochaine fois que le crochet de démarrage d'un outil qui garde ses crochets tourne (`leon rattraper`, lancé en tâche de fond), ou quand on relance la commande ; sans connexion, ni l'un ni l'autre ne le joint avant `leon login`, que la ligne dit aussi. Un retrait resté en attente se dit au serveur de la connexion du moment où il part : après un changement de connexion (`leon setup --url`, `leon login` vers un autre serveur ou un autre compte), l'ancien serveur n'en sait rien. Pour le dernier outil, aucun crochet ne reste : la ligne dit de relancer la commande une fois en ligne, et le lanceur est gardé jusque-là. Un jeton refusé (ordinateur révoqué dans Réglages) : `leon login`, puis relancer la commande. Chaque appel dit aussi au serveur les retraits d'autres outils restés en attente. Ce qu'il a appris s'écrit à part, dans `~/.leon/retraits-serveur.json` (la date de chaque retrait appris), pour ne le lui dire qu'une fois : le rattrapage, lancé en tâche de fond, ne réécrit jamais `accord.json`. Un nouvel accord met fin à l'attente, et `leon setup` (ou `installer-crochets`) dit donc d'abord au serveur un retrait qu'il n'a pas appris : en cas d'échec, une ligne le dit, et les sessions envoyées avant ce retrait gardent sur le serveur les usages que vous leur aviez donnés. Elle ne demande pas de confirmation et ne fait pas de nouvelle copie des réglages ; un `settings.json` illisible n'est pas touché (code 1), mais l'accord est retiré quand même. Claude Code reprend le changement tout seul. Pour remettre les crochets : `leon setup` (depuis un clone : `pnpm leon installer-crochets`), qui redemande l'accord ; si le lanceur a été effacé (voir plus bas), relancez d'abord la commande d'installation.

À la main : ouvrir `settings.json` et supprimer les deux entrées dont la commande finit par `leon briefing` et `leon capter-session` (avec leur groupe `{ "hooks": [...] }` s'il ne contient plus rien). La commande `/hooks`, dans Claude Code, liste les crochets actifs et dit dans quel fichier chacun est défini. Pour tout éteindre un moment sans rien supprimer : `"disableAllHooks": true` dans `settings.json` (cela éteint aussi vos autres crochets).

- `settings.json.leon-sauvegarde` est la première copie, celle de vos réglages d'avant la première installation de Leon : la remettre retire Leon, mais annule aussi tous les changements faits dans les réglages depuis. Une fois les crochets retirés, supprimez cette copie, pour qu'une prochaine installation en refasse une à jour.
- Côté Claude Code, les deux commandes ne lisent et ne modifient que vos réglages d'utilisateur : les réglages du projet (`.claude/settings.json` et `.claude/settings.local.json` d'un dossier) ne sont pas touchés. Un crochet de Leon qui s'y trouverait avec une autre commande s'exécuterait en plus de celui-ci (Claude Code ne fusionne que deux gestionnaires strictement identiques), d'où deux envois ; après le retrait, il reste là mais n'envoie plus rien. `/hooks` montre tous les crochets actifs et leur fichier.
- Des crochets retirés à la main laissent l'accord tel quel : `leon import-claude-code` enverrait encore les textes et, en version 2, les gestes. Supprimer `accord.json` ne suffit pas (sans accord, l'import envoie les textes, comme avant lui) : `leon retirer-crochets` le passe en version 0.
- **Le lanceur** `~/.leon/bin/leon` est effacé avec le dernier outil dont l'accord est retiré (Claude Code, Codex, Cursor ou Antigravity), et seulement si les réglages et l'accord ont bien été retirés : des crochets restés en place appelleraient un lanceur disparu. Il est aussi gardé tant que le serveur n'a pas appris chaque retrait : c'est par lui qu'on relance la commande. Un fichier qui n'est pas un lanceur écrit par Leon est gardé. Le Node, la CLI et la connexion (`~/.leon/runtime`, `~/.leon/cli`, `connexion.json`) restent. Pour partir complètement : `leon retirer-crochets` d'abord, tant que la connexion lui permet de prévenir le serveur (`leon logout` l'effacerait), et relancée tant qu'elle dit que le serveur n'a pas pu être prévenu, puis révoquez cet ordinateur dans Réglages (« Ordinateur : <nom> »), puis supprimez le dossier `~/.leon`.
- Les sessions déjà envoyées restent chez Leon : il n'y a pas encore de bouton pour les effacer.

### Changer de version de Node (CLI sans clone)

Le Node que Leon pose sur les ordinateurs est épinglé dans `src/cli/runtime.json` : sa version exacte, et pour chaque plateforme (`darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64`) l'empreinte SHA-256 de l'archive officielle `node-v<version>-<plateforme>.tar.xz` de nodejs.org. La construction de la CLI recopie ces valeurs dans `/cli/version.json`. Pour changer de version :

1. télécharger `https://nodejs.org/dist/v<version>/SHASUMS256.txt` et `SHASUMS256.txt.sig` ;
2. vérifier la signature GPG : `gpg --verify SHASUMS256.txt.sig SHASUMS256.txt`, avec les clés des publieurs de Node (liste dans le README de [nodejs/node](https://github.com/nodejs/node#release-keys)) ;
3. recopier la version (sans le `v`) et les quatre empreintes dans `runtime.json` ;
4. lancer `pnpm -s vitest run --project unit src/cli/runtime.test.ts`. Pour une nouvelle version majeure, changer aussi `engines.node` dans `package.json`.

## Travailler à deux

Les règles (branches, worktrees, PR, synchronisation avec `main`) sont dans [`CLAUDE.md`](CLAUDE.md). À lire avant le premier commit.
