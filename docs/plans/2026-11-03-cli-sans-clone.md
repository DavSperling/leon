# La CLI sans clone : plan d'implémentation

3 novembre 2026 · Amos (avec Claude) · à relire par David

> **Pour les agents :** SOUS-SKILL REQUISE : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Chaque tâche est exécutée par un sous-agent neuf qui reçoit ce plan et son identifiant de tâche, rien d'autre. Lire en entier l'en-tête, les « Règles », les « Contraintes globales », les « Décisions » et les « Contrats partagés », puis **sa** tâche. Tests d'abord (`superpowers:test-driven-development`), preuves avant de conclure (`superpowers:verification-before-completion`). Commiter **seulement ses fichiers**, ajoutés un par un (`git add <fichier>`, jamais `-A` ni `.`), en un commit « Sxx · titre ». Une erreur de type ou de lint dans un fichier qui n'est pas à soi se signale, elle ne se corrige pas.

**But :** un utilisateur branche Leon à ses outils de code en une commande, `curl -fsSL https://<leon>/install | sh`, sans clone et sans copier de jeton. La commande pose un Node 24 et la CLI dans `~/.leon`, ouvre le navigateur pour autoriser l'ordinateur, puis installe les crochets des outils acceptés. Les crochets appellent tous `~/.leon/bin/leon`.

**Pourquoi :** l'[étude](../etudes/cli-sans-clone-2026-11/README.md), qui répond à la question A6 du [plan de la mémoire des sessions](2026-11-02-memoire-sessions.md). Aujourd'hui il faut un clone, pnpm, Node 24 dans le `PATH` de l'outil et un `.env.local` écrit à la main avec un jeton copié depuis Réglages.

**Architecture :**
- La CLI est construite en un seul fichier `leon.mjs` par le Vite déjà installé, à chaque `pnpm build` (donc à chaque déploiement sur Railway), et servie par le serveur avec un manifeste (version, empreinte).
- Le serveur sert aussi le script d'installation, qui porte l'adresse du serveur et les empreintes : celle du fichier de la CLI, et celles du Node officiel, écrites dans le dépôt.
- La connexion se fait par le navigateur, avec un retour vers `127.0.0.1` : la CLI tire le jeton, le navigateur n'en voit que l'empreinte, et la page de Leon signe un code de 2 minutes que seule la CLI qui détient le jeton peut échanger.
- Le lanceur `~/.leon/bin/leon` (D10 du plan mémoire, amendé) appelle le Node posé et la version en cours de la CLI, ou le clone d'un développeur.

**Stack :** celle du deuxième jet. Aucune dépendance nouvelle, aucune migration.

## Lots, PR et ordre

| Lot | Ce que ça change | Tâches | PR | Effort |
|---|---|---|---|---|
| 1. Connexion par le navigateur | `leon login` remplace le jeton collé dans `.env.local`, y compris pour qui garde son clone | S01 à S05 | suivante | 2 j |
| 2. La CLI sans clone | `curl … \| sh` installe Node, la CLI et le lanceur, connecte et pose les crochets ; mises à jour automatiques ; migration des installations actuelles | S06 à S12 | suivante | 2,5 j |
| 3. Onboarding et Réglages | la commande dans « Vos outils » et dans Réglages, la liste des ordinateurs connectés | S13 et S14 | suivante | 1 j |

Total : environ 5,5 jours.

**Ordre :** les lots 1 et 2 sont indépendants et peuvent avancer en parallèle. Ils se croisent sur `src/cli/leon.ts`, `src/cli/briefing.ts`, `src/cli/install-hooks.ts` et `README.md`, par des ajouts voisins : le second à fusionner se rebase sur le premier. S10 (`leon setup`) appelle `leon login` : s'il passe avant le lot 1, il s'arrête sur le message du repli (`--with-token`). Le lot 3 attend le lot 2. Ce plan passe avant le lot 4 du plan mémoire, qui reprend le lanceur de S08 (voir E7).

**Une PR par lot**, conformément au CLAUDE.md. L'étude et ce plan partent dans leur propre PR, sans code, à valider par Amos avant tout le reste.

## Règles propres à ce chantier

- **Le jeton ne se montre jamais.** Il naît sur l'ordinateur et n'apparaît que dans l'en-tête `Authorization` des requêtes de la CLI et dans `~/.leon/connexion.json` (0600). Jamais dans une adresse, un argument de commande, une sortie, un journal ni un message d'erreur. `--with-token` le lit sur l'entrée, sans écho quand c'est un terminal.
- **Aucune dépendance nouvelle.** `node:crypto` (HMAC, HKDF, SHA-256), `node:http` (le retour local), `node:child_process` (`open`, `xdg-open`), Vite pour construire.
- **Aucune migration.** Le code d'autorisation est signé, pas stocké ; l'usage unique tient à l'unicité de `api_tokens.token_hash`.
- **Le serveur ne suit jamais une adresse reçue.** Le retour est construit par le serveur à partir d'un port entier.
- **Le consentement ne change pas.** `~/.leon/accord.json` reste la seule source de ce qui part (C7 du plan mémoire). Une mise à jour automatique n'y touche pas ; un outil nouveau passe par `leon setup` et son texte d'accord.
- **Leon n'écrit que dans `~/.leon`**, plus les fichiers de crochets des outils après accord, comme aujourd'hui. Ni `~/.zshrc`, ni `PATH`, ni rien d'autre.
- **Le script d'installation** est en `sh` POSIX, avec `set -eu`. Il lit les réponses sur `/dev/tty`, puisque son entrée standard est le script lui-même.
- **Langue :** la CLI et le script parlent anglais (commandes nouvelles : `setup`, `login`, `logout`, `update`). Les pages web ont leurs textes dans `messages/en.json` et `messages/fr.json`. Les routes et les fichiers locaux suivent l'usage de main (`/api/v1/ordinateurs`, `connexion.json`).
- **Journaux :** `logError` et des compteurs seulement. Jamais le jeton, l'empreinte, le code, l'`etat`, ni le nom de l'ordinateur.
- **Vérifications** (méthode d'Amos) :
  - après chaque tâche, un validateur ;
  - avant chaque PR, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` et `pnpm test:db` (hors sandbox), puis l'audit `auditing-runtime-contracts` et la revue `security-review` ;
  - il n'y a pas de CI.
- **Raccourcis :** tout raccourci connu porte un commentaire `shortcut: <la limite>, <quand passer à mieux>`.

## Contraintes globales

- **Démarrage d'un crochet** sous la forme installée : 150 ms au plus pour `leon --version` (50 à 60 ms mesurés le 03/11). La vérification de mise à jour n'est jamais sur le chemin d'un crochet : elle part détachée, après la sortie.
- **Délais :** SessionStart 10 s et SessionEnd 30 s (Claude Code), SessionEnd 3 s (Codex, détaché dans le lanceur). Inchangés.
- **Connexion :** la CLI attend le retour 5 minutes au plus ; le code signé vit 2 minutes ; le retour local n'accepte qu'une requête.
- **Fichier de la CLI :** 1 Mo au plus (135 Ko le 03/11). Le manifeste en donne la taille exacte, vérifiée au téléchargement.
- **Node :** 24 (le champ `engines` de `package.json`), version exacte et empreintes par plateforme dans `src/cli/runtime.json`.
- **Plateformes :** `darwin-arm64`, `darwin-x64`, `linux-x64`, `linux-arm64` (Linux selon la réponse à A4). Toute autre plateforme s'arrête avec un message clair, sans rien écrire.
- **Versions gardées :** la version en cours de la CLI et la précédente ; un seul Node.

## Décisions prises pour ce plan

Les décisions qui attendent encore une réponse portent « proposé ».

- **E1. La CLI en un seul fichier, servie par le serveur (proposé, voir A2).** Vite construit `src/cli/leon.ts` en `public/cli/leon-<version>.mjs` et `public/cli/version.json` à chaque `pnpm build`. Ni npm, ni binaire autonome, ni GitHub Releases.
- **E2. Un Node posé par Leon (proposé, voir A2).** Le seul exécutable `node` de la version officielle épinglée, dans `~/.leon/runtime/node-v<version>/node`, vérifié par l'empreinte écrite dans le dépôt. Jamais le Node de l'ordinateur sous la forme installée.
- **E3. La connexion par renvoi vers l'ordinateur (proposé, voir A1)**, avec le repli `leon login --with-token`. Pas de flux d'appareil en v1, pas de serveur OAuth (#56).
- **E4. Un jeton par ordinateur**, dans `api_tokens`, nommé « Ordinateur : <nom> » par le serveur. Une nouvelle connexion du même ordinateur révoque l'ancien jeton ; `leon logout` révoque le sien.
- **E5. Les variables gagnent.** `LEON_URL` et `LEON_TOKEN`, si elles sont posées toutes les deux, passent avant `~/.leon/connexion.json` : les tests et le clone (son `.env.local`) gardent leur réglage.
- **E6. Tous les crochets appellent le lanceur**, ceux de Claude Code compris : `'<home>/.leon/bin/leon' briefing` et `'<home>/.leon/bin/leon' capter-session`. Les anciens crochets `pnpm … leon …` restent reconnus, pour la migration et le retrait.
- **E7. D10 du plan mémoire est amendé.** Le lanceur a deux formes : installée (par défaut) et clone (`leon setup --depot <clone>`). Il ne change que par `leon setup`. `launcher.ts` est écrit ici (S08) ; T16 du plan mémoire garde les adaptateurs par outil et y ajoute le détachement de Codex.
- **E8. Mises à jour automatiques (proposé, voir A3)**, au plus une fois par 24 h, lancées détachées par `leon briefing`, jamais sous la forme clone. Empreinte, taille et `--version` vérifiées avant de basculer.
- **E9. Hors de ce chantier :** Windows ; le trousseau de macOS ; un flux d'appareil pour le travail à distance ; une signature des versions hors de Railway (QD1) ; des jetons aux droits réduits ; un état de santé de chaque ordinateur dans Réglages (dernière capture, échecs).

## Contrats partagés

**K1. `~/.leon/`** :

```text
~/.leon/                               0700
  bin/leon                             0700  le lanceur (K8)
  runtime/node-v24.22.2/node           0755  le Node officiel
  cli/<version>/leon.mjs               0644  la CLI ; la version en cours et la précédente
  cli/actuelle -> <version>                  lien remplacé d'un coup (nouveau lien, puis rename)
  connexion.json                       0600  K2
  accord.json                          0600  C7 du plan mémoire, inchangé
  maj.json                             0600  { "verifie_le": "<ISO 8601>" }
```

Toute écriture passe par un fichier voisin puis un `rename`, et refuse un lien symbolique là où elle écrit (sauf `cli/actuelle`, qu'elle crée).

**K2. `~/.leon/connexion.json`** (0600) :

```json
{ "url": "https://leon.example", "jeton": "leon_…", "ordinateur": "MacBook-Pro", "espace": "Acme", "cree_le": "2026-11-03T10:00:00Z" }
```

`url` passe le même contrôle que `LEON_URL` (`isAllowedServerUrl`, `env.ts`) ; `jeton` passe `API_TOKEN_PATTERN`. Un fichier illisible ou invalide vaut « pas connecté », avec un message fixe qui ne recopie aucune valeur.

**K3. La page d'autorisation** : `GET /ordinateur/autoriser?port=<p>&etat=<e>&empreinte=<h>`.
- `port` : entier de 1024 à 65535 ;
- `etat` : 22 à 64 caractères `[A-Za-z0-9_-]` ;
- `empreinte` : 64 caractères hexadécimaux minuscules (SHA-256 du jeton, comme `hashApiToken`).

Un paramètre invalide affiche une erreur, sans bouton. « Autoriser » est une action serveur (POST, même origine) qui rend K4 et renvoie le navigateur vers `http://127.0.0.1:<port>/retour?code=<K4>&etat=<e>`. « Annuler » renvoie vers `http://127.0.0.1:<port>/retour?refus=1&etat=<e>`. La page n'est jamais affichée dans un cadre (déjà le cas, `next.config.ts`).

**K4. Le code signé** : `<charge>.<signature>`, deux parties en base64url.
- `charge` = JSON `{ "v": 1, "e": <empreinte>, "u": <userId>, "t": <tenantId>, "x": <expiration, secondes epoch> }`, expiration à 2 minutes ;
- `signature` = HMAC-SHA256 de `charge` (sa forme base64url), avec la clé HKDF-SHA256(`BETTER_AUTH_SECRET`, sel vide, info `leon:ordinateur:v1`, 32 octets) ;
- vérifiée en temps constant (`timingSafeEqual`), puis l'expiration.

**K5. `POST /api/v1/ordinateurs`** (en-tête `Authorization: Bearer <jeton tiré par la CLI>`, qui n'existe pas encore en base) :
- entrée `{ code, nom }` en `.strict()`, 2 Ko au plus ; `nom` : 1 à 60 caractères après retrait des caractères de contrôle, sinon « ordinateur » ;
- vérifie K4, puis `hashApiToken(jeton) === charge.e`, puis l'adhésion en cours de `charge.u` à `charge.t` (comme `verifyApiToken`) ;
- crée la ligne `api_tokens` par `registerApiToken` (S01), nommée « Ordinateur : <nom> » ;
- réponses : 201 `{ espace, ordinateur }` ; 400 (entrée) ; 401 (code faux, expiré, empreinte différente, membre parti), sans dire lequel ; 409 (empreinte déjà en base).

Elle n'est pas montée derrière `requireApiToken`, puisque le jeton n'existe pas encore.

**K6. `DELETE /api/v1/jeton`** (jeton) : révoque le jeton qui fait la requête. 204, ou 401.

**K7. `/cli/version.json`** (public) :

```json
{ "version": "<12 premiers caractères hexadécimaux de l'empreinte>", "sha256": "<64 hex>", "taille": 134981,
  "node": { "version": "24.22.2", "plateformes": { "darwin-arm64": "<64 hex>", "darwin-x64": "…", "linux-x64": "…", "linux-arm64": "…" } } }
```

Le fichier est servi à `/cli/leon-<version>.mjs`. `node.plateformes` porte les empreintes des archives `node-v<version>-<plateforme>.tar.xz` de nodejs.org, recopiées de `src/cli/runtime.json`.

**K8. Le lanceur** (`sh`), deux formes, chemins absolus mis entre apostrophes par `shellQuote` :

```sh
#!/bin/sh
# Written by Leon (leon setup). Installed form.
exec '/Users/a/.leon/runtime/node-v24.22.2/node' '/Users/a/.leon/cli/actuelle/leon.mjs' "$@"
```

```sh
#!/bin/sh
# Written by Leon (leon setup --depot). Clone form.
exec pnpm -s --config.verify-deps-before-run=false --dir '/Users/a/leon' leon "$@"
```

Le détachement de `crochet codex fin` (T16 du plan mémoire) s'insère avant `exec`, dans les deux formes.

**K9. Les commandes des crochets** : `<lanceur> briefing`, `<lanceur> capter-session`, puis `<lanceur> crochet <outil> <evenement>` (C6 du plan mémoire), où `<lanceur>` est le chemin absolu de `bin/leon`, mis entre apostrophes s'il le faut. `isLeonHandler` reconnaît cette forme et l'ancienne (`pnpm … leon <sous-commande>`).

## Points de vigilance

1. **Le navigateur n'est pas sur la machine** (SSH, conteneur distant, Codespaces) : le retour vers `127.0.0.1` n'arrive jamais. Parade : `leon login` le dit après l'ouverture (« If your browser is on another computer, run leon login --with-token »), et `--with-token`.
2. **Un navigateur qui filtrerait un jour les navigations vers le réseau local.** Parade : le même repli ; l'essai de S05 note le comportement de Safari, Chrome et Firefox.
3. **`curl | sh` sans terminal** (`/dev/tty` absent) : le script installe Node et la CLI, puis s'arrête en disant de lancer `~/.leon/bin/leon setup` dans un terminal.
4. **Un proxy d'entreprise qui bloque nodejs.org** : le script s'arrête avec l'adresse à autoriser. Servir Node depuis Leon viendra si un client le demande.
5. **Une mise à jour cassée** : `--version` est lancé avant de basculer ; la version précédente reste sur le disque. Parade manuelle : `leon update --previous`.
6. **Une PR fusionnée arrive sur tous les ordinateurs** à leur session suivante (QD1). Parade v1 : HTTPS vers l'adresse fixée à la connexion, empreinte et taille du manifeste.
7. **Le nom de l'ordinateur** peut porter un prénom (« MacBook-Pro-de-Amos »). Il n'est lisible que de son propriétaire (`listApiTokens` filtre par utilisateur) et n'est jamais journalisé.
8. **Conflits avec le lot 4 du plan mémoire** sur `install-hooks.ts`, `hook-commands.ts` et `leon.ts`. Parade : ce plan passe avant ; T16 se rebase sur S08.
9. **`import.meta.url`** pointe, dans le fichier construit, vers `~/.leon/cli/<version>/` et non plus vers le dépôt : `CLI_REPO_DIR` (`leon.ts`) ne vaut que sous la forme clone (S06, S10).

## Lot 1 : la connexion par le navigateur

### S01 · Enregistrer un jeton tiré par la CLI

**Fichiers :** `src/server/auth/api-tokens.ts` (`registerApiToken`), `src/server/auth/api-tokens.db.test.ts`.

**Fait quand :** `registerApiToken(ctx, name, token)` vérifie `API_TOKEN_PATTERN`, puis insère la ligne comme `createApiToken`, mais avec le jeton reçu : `token_hash = hashApiToken(token)`, `token_hint = token.slice(-4)`. Il rend `{ id }`, ou `null` sur une violation d'unicité de `token_hash` (code 23505), sans lever. `createApiToken` ne change pas, et le jeton n'est jamais renvoyé.

**Tests :** jeton déjà en base : `null`, aucune ligne de plus ; le jeton enregistré passe `verifyApiToken` ; le nom et l'indice sont gardés ; un jeton mal formé est refusé.

### S02 · Le code signé

**Fichiers :** `src/server/auth/computer-code.ts` (nouveau : `signComputerCode`, `verifyComputerCode`), `src/server/auth/computer-code.test.ts` (nouveau).

**Fait quand :** K4, avec une horloge injectable. `verifyComputerCode` rend la charge, ou `null` pour une signature fausse, une charge illisible, une version autre que 1, une empreinte mal formée ou une expiration passée.

**Tests :** aller-retour ; un octet changé dans la charge ou la signature : `null` ; expiré d'une seconde : `null` ; une clé dérivée d'un autre secret : `null`.

### S03 · Les pages `/ordinateur/autoriser` et `/ordinateur/connecte`

**Fichiers :** `src/app/(auth)/ordinateur/autoriser/page.tsx` (nouveau), `src/app/(auth)/ordinateur/autoriser/actions.ts` (nouveau), `src/app/(auth)/ordinateur/connecte/page.tsx` (nouveau), `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :**
- les paramètres sont validés par K3 ; invalides, la page dit pourquoi, sans bouton ;
- sans session, la page renvoie vers `/connexion` et y revient avec ses trois paramètres. Faire comme `/invitation/[token]` revient déjà après la connexion ; le chemin de retour est fixe, jamais tiré de l'adresse ;
- la page dit : « Autoriser cet ordinateur à envoyer vos sessions de code à Leon, dans l'espace <espace> ? », l'avertissement « Si vous ne venez pas de lancer la commande vous-même dans un terminal, annulez », puis « Autoriser » et « Annuler » ;
- l'action relit la session et l'espace (`getUserContext`), signe K4 et renvoie vers le retour de K3 ;
- `/ordinateur/connecte` dit « C'est fait. Vous pouvez fermer cet onglet et revenir au terminal. », ou, avec `?refus=1`, « Rien n'a été autorisé. ».

**Tests :** paramètres invalides (port 80, port 70000, empreinte de 63 caractères, `etat` trop court) : pas de bouton ; l'action rend une adresse `http://127.0.0.1:<port>/retour?…` dont le code se vérifie avec l'empreinte reçue ; un `port` de la forme `1234@evil.example` est refusé. Les textes en anglais et en français.

### S04 · Les routes `POST /api/v1/ordinateurs` et `DELETE /api/v1/jeton`

**Fichiers :** `src/server/api/computer-routes.ts` (nouveau), `src/server/api/app.ts`, `src/capture/api-contract.ts` (`API_PATHS.ordinateurs`, `API_PATHS.jeton`), `src/server/api/computer-routes.db.test.ts` (nouveau), `src/server/api/api-contract.db.test.ts`.

**Fait quand :** K5 et K6. Les erreurs 401 ont un seul message, qui ne dit pas laquelle des vérifications a échoué. `DELETE /api/v1/jeton` passe par `requireApiToken` et révoque son propre jeton (`revokeApiToken` avec le `tokenId` reçu).

**Tests :**
- code valide : 201, le jeton marche ensuite sur `/api/v1/me` ;
- même code une seconde fois : 409 ;
- jeton dont l'empreinte diffère du code : 401, aucune ligne ;
- code expiré, signature fausse, membre retiré entre l'autorisation et l'échange : 401 ;
- entrée de plus de 2 Ko ou avec un champ inconnu : 400 ;
- un nom avec des caractères de contrôle est nettoyé ; vide, il devient « ordinateur » ;
- `DELETE /api/v1/jeton` : 204, puis 401 avec le même jeton ; le jeton d'un autre utilisateur n'est jamais touché.

### S05 · `leon login`, `leon logout`, et la connexion lue par la CLI

**Fichiers :** `src/cli/login.ts` (nouveau), `src/cli/connection.ts` (nouveau : lire et écrire K2), `src/cli/env.ts` (`resolveServerEnv`), `src/cli/leon.ts` (`login [--with-token] [--url <adresse>]`, `logout`, l'aide), `src/cli/briefing.ts`, `src/cli/install-hooks.ts` (l'avertissement sur `.env.local` devient « pas connecté »), `README.md`, leurs tests.

**Fait quand :**
- `resolveServerEnv(env, home)` applique E5 : les deux variables si elles sont posées, sinon K2, sinon l'erreur fixe d'aujourd'hui, complétée par « run leon login » ;
- `leon login` :
  - prend l'adresse de `--url`, sinon de K2, sinon de `LEON_URL` ; elle passe `isAllowedServerUrl` ;
  - tire le jeton (`leon_` + 32 octets en base64url) et `etat` (16 octets), calcule l'empreinte ;
  - écoute sur `127.0.0.1`, port 0 (jamais `localhost`, jamais `0.0.0.0`) ;
  - ouvre l'adresse K3 par `open` (macOS) ou `xdg-open` (Linux), et l'écrit aussi dans le terminal ;
  - au retour, compare `etat` en temps constant, répond par une redirection vers `/ordinateur/connecte` (avec `?refus=1` si refus), ferme l'écoute, puis appelle K5 avec le nom de la machine (`os.hostname()`) ;
  - écrit K2, puis révoque l'ancien jeton s'il y en avait un (K6) ;
  - s'arrête au bout de 5 minutes, ou sur Ctrl+C, sans rien écrire ;
- `leon login --with-token` lit le jeton sur l'entrée : sur un terminal, sans écho ; sinon, une ligne. Il vérifie le jeton par `/api/v1/me`, puis écrit K2 ;
- `leon logout` appelle K6, puis efface `connexion.json` (même si le serveur ne répond pas, en le disant) ;
- aucun message ne recopie le jeton, l'empreinte, le code ni `etat`.

**Tests :**
- `connection.test.ts` : 0600 ; un fichier illisible vaut « pas connecté » ; un lien symbolique à la place du fichier est refusé ;
- `env.test.ts` : E5 dans les quatre cas ;
- `login.test.ts`, avec un faux serveur et un faux navigateur : le parcours complet écrit K2 ; un `etat` faux est refusé et l'écoute reste ouverte jusqu'au bon ; un refus n'écrit rien ; le délai dépassé n'écrit rien ; une requête qui n'est pas `GET /retour` reçoit 404 ; l'ancien jeton est révoqué après l'écriture du nouveau ; le jeton n'apparaît dans aucune sortie (on capture `out` et `err`) ;
- `--with-token` : jeton refusé par `/api/v1/me`, rien n'est écrit.

**Essai réel :** sur le Mac d'Amos, contre `pnpm dev`, puis contre la production après déploiement : Safari, Chrome et Firefox. Noter dans la PR ce que chacun affiche au retour vers `127.0.0.1`.

## Lot 2 : la CLI sans clone

### S06 · Construire la CLI en un seul fichier

**Fichiers :** `vite.cli.config.ts` (nouveau), `package.json` (`build:cli` ; `build` devient `pnpm build:cli && next build --webpack`), `.gitignore` (`/public/cli/`), `src/cli/leon.ts` (`--version`), `src/cli/import-claude-code.ts` (plus d'import de `server/log`), `src/cli/build-cli.contrat.test.ts` (nouveau).

**Fait quand :**
- Vite construit `src/cli/leon.ts`, tout inclus (`ssr.noExternal: true`), pour `node24`, en un fichier ESM, sans découpage, avec `publicDir: false` ;
- la construction écrit `public/cli/leon-<version>.mjs` et `public/cli/version.json` (K7), où `version` vient de l'empreinte du fichier et `node` de `src/cli/runtime.json` (S07) ;
- `leon --version` écrit cette version, injectée à la construction (`define`), et `dev` sous le clone ;
- la CLI n'importe plus rien de `src/server` : `logError` est remplacé, dans `import-claude-code.ts`, par un message fixe sur la sortie d'erreur.

**Tests :** `build-cli.contrat.test.ts` lance `pnpm build:cli` dans un dossier temporaire, puis vérifie :
- le fichier fait moins de 1 Mo ;
- `node leon.mjs --version` rend la version du manifeste ;
- `node leon.mjs help` répond en moins de 300 ms (la marge d'une machine lente ; 150 ms visés) ;
- le manifeste a l'empreinte et la taille du fichier ;
- le fichier ne contient ni `Failed query:` (le message de `DrizzleQueryError`, que l'essai du 03/11 y trouvait par `server/log.ts`), ni `pg-boss`, ni `DATABASE_URL` : des chaînes que la minification garde.

### S07 · Le Node épinglé

**Fichiers :** `src/cli/runtime.json` (nouveau), `src/cli/runtime.test.ts` (nouveau), `README.md` (comment changer de version).

**Fait quand :** `runtime.json` porte `{ "version": "24.22.2", "plateformes": { "darwin-arm64": "1f5ac075…", "darwin-x64": "6965578f…", "linux-x64": "48cc0e21…", "linux-arm64": "eb187837…" } }`, recopiés de `SHASUMS256.txt` de nodejs.org le jour de la tâche (les empreintes du 03/11 sont dans l'étude). Le README dit comment changer de version : relire `SHASUMS256.txt`, vérifier sa signature GPG, recopier les quatre empreintes.

**Tests :** la version majeure satisfait `engines.node` ; quatre plateformes ; chaque empreinte fait 64 caractères hexadécimaux.

### S08 · Le lanceur

**Fichiers :** `src/cli/launcher.ts` (nouveau), `src/cli/launcher.test.ts` (nouveau), `src/cli/hook-commands.ts` (`launcherPath`, `launcherHookCommand`), `src/cli/install-hooks.ts` (`isLeonHandler` reconnaît K9), `src/cli/uninstall-hooks.ts`, leurs tests.

**Fait quand :**
- `writeLauncher(home, forme)` écrit K8 en 0700, par fichier voisin puis `rename`, en refusant un lien symbolique, et rend `{ etat: 'neuf' | 'identique' | 'remplace', ancienne }`. Le cas `remplace` ne s'écrit qu'avec la confirmation de l'appelant (S10) ;
- `launcherHookCommand(home, sousCommande)` écrit K9 avec `shellQuote` ;
- `isLeonHandler` reconnaît la forme K9 et l'ancienne ; le retrait aussi ;
- `leon retirer-crochets` efface aussi le lanceur quand plus aucun outil n'est installé dans `accord.json`.

**Tests :** un home qui contient une espace et une apostrophe : la commande écrite est reconnue et le lanceur tourne ; un lien symbolique à la place de `bin/leon` est refusé ; les deux formes rendent `leon --version` ; les entrées de l'utilisateur dans `settings.json` sont intactes. Contrat : `src/cli/hook-commands.contrat.test.ts` (le lanceur réel, lancé par `sh -c` comme le fait Claude Code).

### S09 · Le script d'installation

**Fichiers :** `src/server/cli/installer-script.ts` (nouveau : le texte du script, l'adresse et les empreintes en paramètres), `src/app/install/route.ts` (nouveau : `GET /install`, `text/plain`, lit `public/cli/version.json` et `BETTER_AUTH_URL`), `src/server/cli/installer-script.test.ts` (nouveau).

**Fait quand :** le script, en `sh` POSIX avec `set -eu` :
1. détecte la plateforme (`uname -s`, `uname -m`) ; une autre que celles de K7 s'arrête sans rien écrire ;
2. crée `~/.leon` en 0700 ;
3. si `~/.leon/runtime/node-v<version>/node` manque, télécharge `https://nodejs.org/dist/v<version>/node-v<version>-<plateforme>.tar.xz` dans un dossier temporaire, vérifie son empreinte (`shasum -a 256` sur macOS, `sha256sum` sur Linux) contre celle du script, puis n'en extrait que `bin/node` ;
4. télécharge `/cli/leon-<version>.mjs` depuis l'adresse du serveur, vérifie empreinte et taille, le pose dans `~/.leon/cli/<version>/`, et remplace `cli/actuelle` ;
5. si `/dev/tty` s'ouvre, lance `node leon.mjs setup --url <adresse> </dev/tty` ; sinon, dit de lancer `~/.leon/bin/leon setup` dans un terminal ;
6. une empreinte fausse arrête tout et efface le téléchargement ; rien n'est laissé à moitié écrit.

**Tests :**
- le texte passe `sh -n`, et `shellcheck` s'il est installé sur le poste ;
- l'adresse et les empreintes y sont, échappées ;
- `GET /install` répond `text/plain` ;
- un essai de bout en bout dans un `HOME` temporaire, contre un faux serveur local et une fausse archive Node : tout est posé, en bons modes ; avec une empreinte fausse, rien n'est posé.

### S10 · `leon setup` : une commande pour tout

**Fichiers :** `src/cli/setup.ts` (nouveau), `src/cli/leon.ts` (`setup [--url <adresse>] [--depot <clone>] [--yes]`), `src/cli/install-hooks.ts` (les commandes K9 au lieu de `hookCommand`), `src/cli/setup.test.ts` (nouveau), `src/cli/install-hooks.test.ts`.

**Fait quand :** `leon setup`, sans rien demander de plus que ce qui suit :
1. écrit le lanceur (S08) : forme installée, ou forme clone avec `--depot` (le dossier doit contenir `src/cli/leon.ts`). S'il en existe un autre, montre l'ancienne et la nouvelle forme et demande confirmation ;
2. si l'ordinateur n'est pas connecté (`resolveServerEnv` échoue), lance `leon login` ;
3. détecte les outils (`~/.claude` ou `CLAUDE_CONFIG_DIR` ; `~/.codex` ou `CODEX_HOME` ; `~/.cursor` ; `~/.gemini`) et ne propose que ceux dont l'installateur existe (Claude Code au lot 1 du plan mémoire ; les autres à leurs lots), en disant les autres « not supported yet » ;
4. pour chaque outil proposé, montre son texte d'accord, inchangé, et installe ses crochets par `installHooks`, avec les commandes K9 ;
5. finit par une ligne par outil et le chemin du lanceur (« To run Leon later: ~/.leon/bin/leon <command> »).

`--yes` accepte tout, sauf le remplacement d'un lanceur pointé vers un autre clone. `installer-crochets` reste, pour la forme clone, et écrit lui aussi les commandes K9.

**Tests :** ordinateur déjà connecté : pas de `login` ; Claude Code absent : rien n'est écrit dans `~/.claude` ; Codex présent : « not supported yet », rien n'est écrit dans `~/.codex` ; l'accord n'est écrit qu'après la confirmation ; relancé, `setup` n'écrit rien (idempotent).

### S11 · Migrer les installations actuelles

**Fichiers :** `src/cli/install-hooks.ts`, `src/cli/setup.ts`, `src/cli/install-hooks.test.ts`, `README.md`.

**Fait quand :**
- des crochets `pnpm … leon briefing|capter-session` sont remplacés sur place par K9 : même groupe, même position, mêmes délais. La sauvegarde `settings.json.leon-sauvegarde` suit la règle d'aujourd'hui (jamais remplacée) ;
- `accord.json` est gardé tel quel ; s'il est déjà en version 2, rien n'est redemandé ;
- `setup` dit : « Your hooks used to run Leon from <clone>; they now run ~/.leon/bin/leon. The token in <clone>/.env.local is no longer needed: revoke it in Settings › Connected computers. » Il ne lit jamais ce `.env.local` ;
- le README remplace la section d'installation (l. 180 à 245 environ) : la commande unique d'abord, puis la forme clone pour les développeurs de Leon.

**Tests :** des réglages avec les anciens crochets et un crochet de l'utilisateur entre eux : ordre gardé, crochet de l'utilisateur intact, plus aucun `pnpm … leon` ; deux passages donnent le même fichier.

### S12 · Les mises à jour automatiques

**Fichiers :** `src/cli/self-update.ts` (nouveau), `src/cli/leon.ts` (`update [--background] [--previous]`), `src/cli/briefing.ts` (le lancement détaché), `src/cli/self-update.test.ts` (nouveau).

**Fait quand :**
- `leon briefing`, une fois sa sortie écrite, lance `leon update --background` détaché (`spawn` avec `detached`, `stdio: 'ignore'`, `unref`) si `maj.json` a plus de 24 h ou manque, et jamais sous la forme clone ;
- `leon update` :
  - lit K7 à l'adresse de K2 (HTTPS, ou `http` local en développement) ;
  - même version : met `maj.json` à jour, rien d'autre ;
  - sinon : télécharge, vérifie la taille puis l'empreinte, écrit dans `cli/<version>/`, lance `node leon.mjs --version` et compare, puis remplace `cli/actuelle` (nouveau lien puis `rename`) et efface les versions plus anciennes que la précédente ;
  - si `node.version` a changé : même chemin pour Node (archive de nodejs.org, empreinte de K7), avant la CLI ;
  - `--previous` revient à la version précédente ;
- rien ne touche à `accord.json`, à `connexion.json`, au lanceur ni aux crochets ;
- `--background` n'écrit rien, nulle part, sauf `maj.json`.

**Tests :** même version : aucun téléchargement ; empreinte fausse : `actuelle` inchangé, rien de laissé ; `--version` qui échoue : `actuelle` inchangé ; succès : `actuelle` pointe sur la nouvelle et la précédente reste ; forme clone : rien ; `briefing` rend la main sans attendre la mise à jour (sa durée ne bouge pas avec un serveur de mise à jour lent).

## Lot 3 : onboarding et Réglages

### S13 · « Vos outils de code » dans l'onboarding

**Fichiers :** `src/components/verre/onboarding/code-tools-card.tsx` (nouveau), `src/components/verre/onboarding/tools-step.tsx`, `src/app/(onboarding)/bienvenue/outils/page.tsx`, `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :**
- un bloc « Vos outils de code » s'ajoute à l'étape Vos outils : les logos de Claude Code, Codex, Cursor et Antigravity, la phrase « Ouvrez un terminal sur votre ordinateur et collez cette commande. Votre navigateur s'ouvrira pour autoriser cet ordinateur. », la commande (`CodeLine` et `CopyButton` de `ui/copy.tsx`) et un lien « Ce qui part » vers la section de Réglages (S14) ;
- la commande est construite côté serveur à partir de `BETTER_AUTH_URL` : `curl -fsSL <adresse>/install | sh` ;
- le bloc vient en tête quand les outils conseillés du service comprennent `github` ou `gitlab`, à la fin sinon (réponse à A5) ;
- il ne change ni les cases cochées ni le bouton Continuer.

**Tests :** la commande porte l'adresse du serveur et aucun autre paramètre ; l'ordre selon le service ; les textes en anglais et en français.

### S14 · Réglages : « Ordinateurs connectés »

**Fichiers :** `src/components/verre/reglages/computers.tsx` (nouveau), `src/app/(app)/reglages/page.tsx`, `src/components/verre/reglages/tokens.tsx`, `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :**
- une section « Ordinateurs connectés » (ancre `#ordinateurs`) montre la commande de S13 et la liste des jetons dont le nom commence par « Ordinateur : », avec leur création, leur dernière utilisation et « Révoquer » (l'action existante) ;
- la liste des jetons ne les montre plus ;
- aucune requête nouvelle : la page filtre ce que `listApiTokens` rend déjà.

`shortcut: les ordinateurs sont reconnus au préfixe du nom (un jeton manuel nommé « Ordinateur : x » s'y range), une colonne kind dans api_tokens le jour où ça gêne.`

**Tests :** un jeton « Ordinateur : MacBook » est dans la section, pas dans la liste des jetons ; révoqué, il disparaît.

## Bout en bout (avant la PR du lot 3)

1. Sur un compte macOS neuf (sans Node, sans pnpm, sans clone) : coller la commande de Réglages, cliquer « Autoriser », accepter Claude Code. Ouvrir Claude Code dans un dépôt : la fiche arrive au démarrage ; fermer la session : elle remonte.
2. Sur le Mac d'Amos, avec ses anciens crochets : relancer la commande. Les crochets passent au lanceur, l'accord ne bouge pas, tout remonte comme avant. Révoquer le jeton de `.env.local`.
3. Déployer une nouvelle version : elle est dans `~/.leon/cli/` le lendemain, et `cli/actuelle` pointe dessus.
4. Révoquer l'ordinateur dans Réglages : les crochets ne renvoient plus rien (401 sur la sortie d'erreur), Claude Code n'est pas gêné.
5. `leon logout`, puis `leon retirer-crochets` : plus rien ne part, `~/.leon/bin/leon` est effacé.

## Questions ouvertes

**Pour Amos (avant le code) :**
- A1. La connexion par renvoi vers l'ordinateur (un clic) plutôt que le code collé du plan du 28/10 ?
- A2. La CLI servie par le serveur, sur un Node posé par Leon dans `~/.leon` (27,5 Mo une fois), plutôt qu'un paquet npm ou le Node de l'ordinateur ?
- A3. Les mises à jour automatiques ?
- A4. Linux dès la v1 ?
- A5. Le bloc « Vos outils de code » pour tous les services, en tête pour ceux qui codent ?

**Pour David :**
- QD1. La CLI servie par le serveur de production : une PR fusionnée arrive sur tous les ordinateurs à leur session suivante. D'accord en v1, ou une signature par une clé hors de Railway d'abord ?
- QD2. L'adresse publique de l'installation : `BETTER_AUTH_URL` ?
- QD3. #56 : ce plan ne s'en sert pas. On la ferme, ou elle reste pour le MCP distant ?
