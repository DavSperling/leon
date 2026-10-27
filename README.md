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
- **Visibilité** : tout ce qu'une connexion lit est visible de toute l'équipe (le deuxième jet y ajoute les droits « public ou personnel »), et la recherche l'affiche avec un lien « Ouvrir dans » suivi du nom de l'outil ; la santé de la capture se voit dans l'alerte « Mémoire en retard » de la barre latérale et dans le schéma de Connexions. Supprimer une connexion efface sa clé, mais garde les sources déjà captées.
- **Aucun modèle à l'entrée** : chaque élément est gardé tel quel, sans clé Anthropic, et son indexation est mise en file. Le worker de l'indexation (démarré avec l'application, sans condition sur la clé Anthropic) découpe les tours en passages pour la recherche ; si `LEON_EMBEDDINGS` règle un fournisseur de vecteurs, il en fabrique aussi, et une panne du fournisseur ne retarde jamais le plein texte. Un tic par minute reprend les éléments restés en attente plus de 5 minutes et les vecteurs manquants. `LEON_EMBEDDINGS=voyage`, `mistral` ou `bge-m3` empêche le démarrage tant que leur adaptateur n'est pas livré.
- **Modèle d'IA** : la réponse en tête, la discussion et le point du matin passent par `ANTHROPIC_API_KEY` ; sans clé, la recherche par le texte marche et ces trois fonctions disent qu'aucun modèle n'est branché. Le modèle de chaque étape se règle par `LEON_MODEL_REPONSE` (Haiku 5.5 par défaut), `LEON_MODEL_DISCUSSION` et `LEON_MODEL_POINT` (Sonnet 5.5 par défaut), parmi `claude-haiku-5-5`, `claude-sonnet-5-5` et `claude-opus-5-5` : un autre nom empêche le démarrage, parce que chaque appel enverrait au modèle un réglage (repli des refus, effort) que son API peut refuser. `LEON_LLM=factice` branche un faux modèle, sans réseau ni clé, pour voir l'interface en démonstration ; l'application refuse de démarrer en production avec ce réglage.

Les 42 outils branchables. « Essayé en réel » : quelqu'un de l'équipe l'a branché avec une vraie clé ; sinon le connecteur est testé sur des réponses d'exemple tirées de la doc officielle, rien de plus.

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
| Google Drive | Projet | oui |
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

## L'IA à jour chaque matin

Deux crochets de Claude Code font le travail, sans rien demander en séance :

- **au démarrage d'une session** (`SessionStart`), `pnpm leon briefing` affiche le point du matin du projet du dossier courant : ce qu'on a fait dans ses dernières sessions, ce qui a bougé depuis (le dépôt, les tickets, les messages qui nous mentionnent) et ce qui reste ouvert, avec ses sources, en 250 mots au plus. Claude Code l'ajoute au contexte de la session. Le serveur prépare le point à l'avance, avec le modèle réglé (`ANTHROPIC_API_KEY`) : la commande affiche le dernier point prêt, sinon « No briefing for this project yet: it will be ready at your next session. », ou, sans modèle sur le serveur, un message qui le dit. Elle ne bloque jamais la session (3 secondes au serveur au plus) et sort toujours avec le code 0.
- **à la fin d'une session** (`SessionEnd`), `pnpm leon capter-session` envoie la conversation à Leon avec son projet, pour qu'elle serve au point du matin et à la recherche. Elle sort aussi toujours avec le code 0.

### Installer

```bash
pnpm leon installer-crochets          # montre ce qui sera écrit, puis demande confirmation [y/N]
pnpm leon installer-crochets --oui    # écrit sans demander
```

Avant : `LEON_URL` et `LEON_TOKEN` dans le `.env.local` du dépôt (voir `.env.example` ; le jeton se crée dans Réglages). Les crochets les lisent là à chaque lancement ; sans eux, ils ne font rien et ne le disent que sur la sortie d'erreur, que Claude Code ne montre pas. La commande d'installation prévient quand ces deux réglages manquent ou sont invalides (elle ne recopie jamais leurs valeurs). Les crochets lancent `pnpm` puis `node` (24 au moins) avec le `PATH` de Claude Code, qui n'est pas toujours celui de votre terminal quand il est lancé depuis un éditeur ou une application. `pnpm` doit être de la version du champ `packageManager` de `package.json` : une autre version irait chercher la bonne sur le réseau avant de lancer la commande, ce qui dépasse le délai du crochet. Lancer la commande depuis le **clone principal** de Leon : un dossier de travail Git temporaire (`.claude/worktrees/…`) est supprimé après la fusion, et les crochets cesseraient de marcher (la commande prévient). `--depot <chemin>` désigne un autre dépôt.

La commande écrit dans `~/.claude/settings.json` (ou dans `settings.json` du dossier `CLAUDE_CONFIG_DIR` quand cette variable est posée), avec le chemin absolu du dépôt à la place de `/chemin/vers/leon` :

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "pnpm -s --config.verify-deps-before-run=false --dir /chemin/vers/leon leon briefing",
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
            "command": "pnpm -s --config.verify-deps-before-run=false --dir /chemin/vers/leon leon capter-session",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- Vos autres réglages et crochets restent tels quels : leurs valeurs et l'ordre des clés ne changent pas, mais le fichier est réécrit avec une indentation de 2 espaces, donc sa mise en page peut changer. Avant d'écrire, la commande copie le fichier dans `settings.json.leon-sauvegarde`, à côté, **seulement si cette copie n'existe pas encore** : c'est la première copie, celle d'avant Leon, et elle n'est jamais remplacée (une mise à jour de vos crochets n'y met donc pas ceux de Leon). La commande dit quand elle garde une copie existante.
- Si l'écriture échoue (droits, disque plein), la commande le dit en français, ne modifie rien (la copie qu'elle venait de faire est retirée) et sort avec le code 1 : on peut alors coller le JSON ci-dessus à la main.
- Relancer la commande ne change rien (« déjà en place ») ; si le dépôt a changé de place, elle met à jour ses deux entrées au lieu d'en ajouter d'autres.
- Un `settings.json` illisible (Claude Code lit du JSON strict : ni commentaire ni virgule finale) n'est pas touché : la commande dit pourquoi et s'arrête. On peut alors coller le JSON ci-dessus à la main.
- `--config.verify-deps-before-run=false` empêche pnpm d'installer les dépendances avant la commande quand elles ne correspondent plus au verrou (après un `git pull`) : cette installation écrirait dans le contexte de la session et serait coupée au bout du délai du crochet.
- Les délais sont en secondes : 10 au démarrage, 30 à la fin (Claude Code n'en laisse que 1,5 par défaut à un crochet de fin de session ; l'envoi s'interrompt de lui-même au bout de 15 secondes).

### Ce qui est envoyé

- **Au démarrage** : la clé du projet et le jeton, rien de la conversation. La clé est `github.com/<propriétaire>/<dépôt>`, tirée du `remote origin` du dossier de la session, sinon `dossier:` suivi de 16 caractères calculés à partir de son chemin.
- **À la fin** : le texte des échanges (vos messages et les réponses de Claude), sans les pensées, les appels et les sorties d'outils, ni les images, avec la clé du projet. Avant l'envoi, les secrets reconnaissables (clés d'API, jetons, clés privées…) sont masqués, les rappels du système retirés et chaque message est coupé à 20 000 caractères ; le serveur refait le masquage. Tout part vers le serveur de `LEON_URL`. La conversation est **privée à son auteur** : personne d'autre ne la voit.
- **De quels dossiers** : de tous. Les crochets sont dans vos réglages d'utilisateur : toutes vos sessions Claude Code, dans tous vos dossiers (personnels compris), sont envoyées à Leon, pas seulement celles du travail. En session interactive, Claude Code ne lance les crochets d'un dossier qu'une fois ce dossier approuvé (la fenêtre de confiance qu'il montre à la première ouverture) ; une session `claude -p` ne montre jamais cette fenêtre et tient le dossier pour approuvé.
- **Quand** : à la fin de chaque session, soit à la sortie de Claude Code, après `/clear` et au `/resume` interactif. Les sessions lancées par un script, une automatisation ou un agent (`claude -p`) sont envoyées elles aussi : sans `--bare`, `claude -p` charge les crochets de `~/.claude` comme une session interactive ; seul `claude -p --bare` n'en charge aucun. Une session tuée brutalement, un terminal fermé de force ou un plantage peuvent ne pas l'être (la doc de Claude Code ne dit pas ce qu'il advient du crochet de fin dans ces cas) ; `pnpm leon import-claude-code` les rattrape (`--dry-run` montre ce qui serait envoyé, sans rien envoyer).

### Retirer les crochets

Ouvrir `settings.json` et supprimer les deux entrées dont la commande finit par `leon briefing` et `leon capter-session` (avec leur groupe `{ "hooks": [...] }` s'il ne contient plus rien) ; Claude Code reprend le changement tout seul. La commande `/hooks`, dans Claude Code, liste les crochets actifs et dit dans quel fichier chacun est défini. Pour tout éteindre un moment sans rien supprimer : `"disableAllHooks": true` dans `settings.json` (cela éteint aussi vos autres crochets).

- `settings.json.leon-sauvegarde` est la première copie, celle de vos réglages d'avant la première installation de Leon : la remettre retire Leon, mais annule aussi tous les changements faits dans les réglages depuis. Une fois les crochets retirés, supprimez cette copie, pour qu'une prochaine installation en refasse une à jour.
- Côté Claude Code, la commande ne lit et ne modifie que vos réglages d'utilisateur : les réglages du projet (`.claude/settings.json` et `.claude/settings.local.json` d'un dossier) ne sont pas touchés. Un crochet de Leon qui s'y trouverait avec une autre commande s'exécuterait en plus de celui-ci (Claude Code ne fusionne que deux gestionnaires strictement identiques), d'où deux envois : `/hooks` montre tous les crochets actifs et leur fichier.
- Les sessions déjà envoyées restent chez Leon : il n'y a pas encore de bouton pour les effacer.

## Travailler à deux

Les règles (branches, worktrees, PR, synchronisation avec `main`) sont dans [`CLAUDE.md`](CLAUDE.md). À lire avant le premier commit.
