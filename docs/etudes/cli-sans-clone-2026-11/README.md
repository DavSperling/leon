# La CLI sans clone : brancher Leon à ses outils de code en une commande

3 novembre 2026 · Amos (avec Claude) · tranché par Amos le 3 novembre

Plan d'implémentation : [`docs/plans/2026-11-03-cli-sans-clone.md`](../../plans/2026-11-03-cli-sans-clone.md), qui fait foi pour le détail. Cette étude répond à la question A6 du [plan de la mémoire des sessions](../../plans/2026-11-02-memoire-sessions.md) : « la distribution de la CLI hors d'un clone de Leon, comme chantier à part ? ». Elle reprend aussi la partie « installation chez un client » du plan du 28/10 (synchro des assistants, jamais fusionné), en en changeant deux choix (sections 3 et 4).

## La question

Pour que Leon capte ses sessions de code et lui rende la fiche des dernières au démarrage, un utilisateur doit aujourd'hui cloner le dépôt de Leon, lancer `pnpm install`, créer un jeton dans Réglages, le coller avec l'adresse du serveur dans `~/leon/.env.local`, puis lancer `pnpm leon installer-crochets`. Amos l'a fait le 02/11 pour essayer le lot 1 : c'est trop lourd pour un développeur, et impossible pour quelqu'un qui ne l'est pas.

Comment un utilisateur branche-t-il Leon à Claude Code, puis à Codex, Cursor et Antigravity, en une commande, sans clone et sans copier de jeton ?

## La réponse courte

1. **Une seule commande, sans secret**, la même pour tout le monde, affichée dans l'onboarding et dans Réglages :
   ```bash
   curl -fsSL https://<adresse de Leon>/install | sh
   ```
2. **Une autorisation dans le navigateur.** La commande ouvre une page de Leon, où l'on est déjà connecté : on clique sur « Autoriser cet ordinateur ». La CLI reçoit son accès toute seule. Le jeton est créé sur l'ordinateur, ne passe ni par le presse-papiers ni par l'historique du shell, et le serveur n'en garde que l'empreinte, comme aujourd'hui. Chaque ordinateur a son jeton, visible et révocable dans Réglages.
3. **La CLI tient dans un seul fichier de 135 Ko**, construit par le Vite déjà installé et servi par le serveur de Leon. Elle tourne sur un Node 24 que l'installation pose dans `~/.leon` (27,5 Mo à télécharger une fois, vérifié par son empreinte). Elle démarre en 50 ms, contre 1 à 1,4 s pour `pnpm leon` aujourd'hui. Aucune dépendance nouvelle.
4. **Tous les crochets appellent `~/.leon/bin/leon`**, le lanceur de D10, qui ne dépend plus d'un clone. La CLI se met à jour toute seule, sans changer la commande des crochets ni l'accord de l'utilisateur. Un développeur peut garder son clone.
5. **Les installations actuelles** (Amos, David) migrent en relançant la même commande. Si on ne fait rien, rien ne casse.

## 1. Aujourd'hui

| Étape | Ce qu'il faut | Ce qui coince |
|---|---|---|
| Avoir la CLI | un clone de Leon, `pnpm install`, Node 24 et pnpm 11 | un non-développeur n'a ni git, ni Node, ni pnpm |
| Se connecter | un jeton créé dans Réglages, collé avec `LEON_URL` dans `~/leon/.env.local` | le jeton passe par le presse-papiers ; un fichier à écrire à la main |
| Brancher l'outil | `pnpm leon installer-crochets` | les crochets lancent `pnpm --dir <clone>` : déplacer ou supprimer le clone les casse, et un `git pull` change le code sous eux |
| Lancer un crochet | `pnpm`, puis `node` avec `tsx`, trouvés dans le `PATH` de l'outil | 1,0 à 1,4 s de démarrage (mesuré le 03/11) ; une application lancée depuis le Dock (Codex Desktop, Cursor, Antigravity) n'a souvent pas le `PATH` du terminal, donc ni `pnpm` ni le Node de nvm |

Les crochets vivent avec des délais courts : SessionStart 10 s et SessionEnd 30 s chez Claude Code, SessionEnd coupé à 3 s chez Codex. Une seconde perdue au démarrage de `pnpm` à chaque crochet, c'est un tiers du budget de Codex.

## 2. Ce qu'il faut

- **Une commande**, sans clone, sans fichier à écrire, utilisable par quelqu'un qui n'a jamais ouvert un terminal autrement que pour la coller.
- **Aucun secret copié** : ni dans la commande, ni dans le presse-papiers, ni dans l'historique du shell, ni dans une adresse.
- **Rien à installer avant** : ni Node, ni git, ni pnpm.
- **Un démarrage court**, sans dépendre du `PATH` de l'outil.
- **Des mises à jour** sans geste de l'utilisateur et sans réapprouver les crochets de Codex.
- **Le consentement inchangé** : versionné par outil dans `~/.leon/accord.json`, il dit seul ce qui part (C7 du plan mémoire).
- **Un jeton par ordinateur**, nommé, visible et révocable dans Réglages.
- **Aucune dépendance nouvelle** sans raison forte.

## 3. Distribuer la CLI

| Option | Node sur l'ordinateur ? | Démarrage d'un crochet | Mises à jour | Ce que ça coûte |
|---|---|---|---|---|
| **a. Paquet npm lancé par `npx`** | oui, avec npm, dans le `PATH` de l'outil | npx résout le paquet à chaque appel : quelques centaines de ms à quelques secondes, avec le réseau si la version n'est pas fixée | à chaque publication | un compte npm et son jeton à protéger, un nom à réserver, des publications à la main (il n'y a pas de CI) |
| **b. Paquet npm installé une fois** (`npm install --prefix ~/.leon`) | oui | environ 100 ms | `npm update`, à la main | mêmes coûts que a, et npm reste requis |
| **c. Binaire autonome** (exécutable unique de Node, ou `bun build --compile`) | non | environ 50 ms | un binaire d'une centaine de Mo à retélécharger à chaque version | un binaire par plateforme à construire et à resigner (macOS) à chaque version, sans CI ; Bun serait une dépendance nouvelle, et un autre moteur que celui des tests |
| **d. Script d'installation, fichier unique, Node posé par Leon** | non : un Node 24 officiel est posé dans `~/.leon` | 50 à 60 ms (mesuré) | un fichier de 135 Ko ; Node rarement | un fichier de configuration Vite, un script shell, deux routes |
| **e. Greffon Claude Code** (`/plugin install`) | oui | selon a, b ou d | par Claude Code | ne couvre que Claude Code ; le dépôt est privé |

**Recommandation : d.**

- **Le fichier unique.** Vite, déjà installé, construit `src/cli/leon.ts` et tout ce qu'il importe en un seul fichier `leon.mjs`. L'essai du 03/11, hors du dépôt, donne 135 Ko (42 Ko compressé), et `node leon.mjs help` répond en 50 à 60 ms. Il faudra retirer un import de `drizzle-orm` (par `server/log.ts`) et le dossier `public/` que Vite recopie par défaut.
- **Node posé par Leon, pas celui de l'ordinateur.** Celui qui utilise Claude Code par son installateur natif, Codex, Cursor ou Antigravity n'a pas besoin de Node, donc souvent ne l'a pas. Et quand il l'a, celui de nvm n'est pas dans le `PATH` d'une application lancée depuis le Dock, et celui de Homebrew change de version tout seul. L'installation pose donc le seul exécutable `node` de la version 24 officielle (27,5 Mo à télécharger pour la 24.22.2 sur Mac M1 et suivants) dans `~/.leon/runtime/`. Son empreinte SHA-256 est écrite dans le dépôt de Leon, pas lue sur nodejs.org au moment de l'installation. Les crochets l'appellent par son chemin absolu : plus de `PATH`.
- **Servi par le serveur de Leon.** `pnpm build`, que Railway lance déjà à chaque déploiement, construit aussi le fichier unique et un petit manifeste (version, empreinte, taille). Le serveur sert le script (`/install`), le fichier et le manifeste. Ni npm, ni GitHub Releases, ni compte à protéger. La CLI et le serveur sortent donc toujours ensemble : la règle « le serveur avant la CLI » du plan mémoire tient d'elle-même.
- **Plateformes.** macOS (Apple et Intel) et Linux (x64 et arm64) dès la v1, par le même script (`tar`, `sha256sum`, `xdg-open` sous Linux), Linux vérifié dans un conteneur. Linux avec la glibc seulement : les archives officielles de Node ne démarrent pas sur musl (Alpine), que le script refuse avec un message clair. Windows plus tard.

Le plan du 28/10 gardait le Node de l'ordinateur (22.15 ou plus) et le Mac seul. Il visait des développeurs ; ce chantier vise aussi ceux qui ne le sont pas.

## 4. Se connecter par le navigateur

C'est la question d'Amos du 03/11 : « on peut pas juste le faire avec une autorisation ? ». Oui.

| Option | Rien à copier | Ni presse-papiers ni historique | Résiste à l'hameçonnage | Marche à distance (SSH) | Ce que ça coûte |
|---|---|---|---|---|---|
| **a. Jeton créé dans Réglages, collé à la main** (aujourd'hui) | non | non | oui | oui | rien |
| **b. Code à usage unique dans la commande** (plan du 28/10) | une commande à coller | non : le code y passe, valable 10 min | moyen : une commande partagée peut brancher l'ordinateur d'un autre sur l'espace de celui qui l'a créée | oui | une table, une route |
| **c. Flux d'appareil** (RFC 8628 : le terminal affiche un code, on le tape dans le navigateur) | un code à taper | oui | faible : l'hameçonnage par code d'appareil est une attaque connue (l'attaquant lance le flux et fait taper son code à la victime) | oui | une table, une route interrogée en boucle, une page |
| **d. Renvoi vers l'ordinateur** (RFC 8252, le navigateur revient sur `127.0.0.1`) | un clic | oui | oui, sauf sur une machine partagée : l'autorisation revient à la machine dont le navigateur a cliqué, pas forcément à celui qui a lancé la commande (voir les limites) | non | une page, deux routes, aucune table |
| **e. Serveur OAuth complet** (#56) | un clic | oui | oui | non | trois dépendances, des jetons qui expirent et se renouvellent, à gérer dans la CLI ; #56 attend depuis le 26/10 |

**Recommandation : d**, avec un repli sur a pour qui travaille à distance.

Le déroulé :

1. La CLI tire au hasard le futur jeton (`leon_` suivi de 32 octets, le format d'aujourd'hui) et en calcule l'empreinte SHA-256, celle que `api_tokens.token_hash` stocke déjà. Elle tire aussi un `etat` et écoute sur `127.0.0.1`, sur un port libre.
2. Elle ouvre le navigateur sur `https://<leon>/ordinateur/autoriser?port=…&etat=…&empreinte=…`. Aucun de ces trois paramètres n'est un secret : un port, une valeur qui protège le retour local, et une empreinte dont on ne peut pas retrouver le jeton.
3. La page de Leon (après la connexion si besoin) demande : « Autoriser cet ordinateur à envoyer vos sessions de code à Leon, dans l'espace Acme ? », avec un avertissement : « Si vous ne venez pas de lancer la commande vous-même, annulez. »
4. « Autoriser » produit un code signé par le serveur : l'empreinte, l'utilisateur, l'espace et une expiration à 2 minutes. Le navigateur est renvoyé vers `http://127.0.0.1:<port>/retour?code=…&etat=…`. Le serveur construit cette adresse à partir d'un port entier ; il ne suit jamais une adresse reçue.
5. La CLI vérifie `etat`, renvoie le navigateur vers la page « C'est fait » de Leon, puis envoie le code au serveur avec son jeton en en-tête. Le serveur vérifie la signature, l'expiration, que l'empreinte du jeton est celle du code, et que l'utilisateur est toujours membre. Il crée alors la ligne de `api_tokens` avec cette empreinte et le nom « Ordinateur : <nom de la machine> ». Un code déjà servi échoue sur l'unicité de `token_hash`.
6. La CLI range l'adresse et le jeton dans `~/.leon/connexion.json`, en 0600, dans un dossier en 0700.

Pourquoi c'est sûr :
- **Le jeton naît sur l'ordinateur** et n'en sort que dans l'en-tête des requêtes de la CLI, comme aujourd'hui. Il n'apparaît dans aucune adresse, aucun argument de commande, aucun journal.
- **Le code du retour** ne sert qu'à qui détient le jeton dont il porte l'empreinte, pendant 2 minutes, une seule fois : c'est le principe d'un code d'autorisation protégé par PKCE.
- **Un lien piégé ne donne rien.** Si un attaquant envoie son lien d'autorisation à une victime qui clique, le code revient sur le `127.0.0.1` de la victime, où rien n'attend, et l'attaquant ne le reçoit jamais.
- **Révocable** : chaque ordinateur a son jeton dans Réglages. Une nouvelle connexion du même ordinateur révoque l'ancien jeton, et `leon logout` révoque le sien.

Les limites :
- **Le navigateur et le terminal doivent être sur la même machine.** En SSH ou dans un conteneur distant, le repli est `leon login --with-token` : on crée un jeton dans Réglages, et la CLI le demande sans l'afficher, jamais en argument. Un flux d'appareil (c) viendra si des utilisateurs travaillent vraiment à distance.
- **Sur une machine où d'autres comptes sont ouverts en même temps, l'autorisation peut être donnée par un autre.** L'adresse d'autorisation (port, `etat`, empreinte) se lit dans la liste des processus (sous Linux, `/proc/<pid>/cmdline`) ; un autre utilisateur de la machine peut l'ouvrir et l'autoriser avec son propre compte Leon : le jeton de la victime est alors enregistré sur le compte de l'attaquant. Le lien piégé ci-dessus ne protège pas de ce cas : sur une machine partagée, `127.0.0.1` est commun à tous les comptes ouverts, et le code arrive donc quand même à la CLI de la victime. Parade : `leon login` affiche « Connected to <espace> as <compte> » (le serveur renvoie l'e-mail du compte autorisé), à vérifier ; sur une machine partagée, le repli `leon login --with-token` ne passe par aucune adresse d'autorisation.
- **Les navigateurs pourraient un jour filtrer les navigations vers le réseau local.** Chrome filtre déjà les requêtes d'une page publique vers `127.0.0.1` (« Local Network Access »), mais pas les navigations, que l'explication de la proposition range parmi les « changements possibles ». Le repli est le même.

Le plan du 28/10 avait choisi b, « au plus simple, sans faire ouvrir le navigateur par le terminal ». d coûte à peine plus (ni table ni migration), ne fait rien copier, et ferme l'hameçonnage dans les deux sens, hors machine partagée (voir les limites).

## 5. Le lanceur stable `~/.leon/bin/leon`

Le plan mémoire avait déjà prévu (D10) une commande stable pour les crochets hors Claude Code, mais pointée vers le clone. Elle devient la seule porte d'entrée :

```text
~/.leon/                         0700
  bin/leon                       0700  le lanceur, que les crochets appellent par son chemin absolu
  runtime/node-v24.22.2/node           le Node officiel, vérifié par empreinte
  cli/<version>/leon.mjs               le fichier unique de la CLI (la version en cours et la précédente)
  cli/actuelle -> <version>            lien changé d'un coup à chaque mise à jour
  connexion.json                 0600  l'adresse du serveur et le jeton de cet ordinateur
  accord.json                    0600  l'accord par outil (C7), inchangé
```

- **Deux formes**, écrites par `leon setup` :
  - *installée* (par défaut) : `exec '<home>/.leon/runtime/node-v24.22.2/node' '<home>/.leon/cli/actuelle/leon.mjs' "$@"` ;
  - *clone*, pour un développeur (`leon setup --depot ~/leon`) : `exec pnpm -s --config.verify-deps-before-run=false --dir '<clone>' leon "$@"`, la commande d'aujourd'hui.
- **Tous les crochets l'appellent**, ceux de Claude Code compris : `'<home>/.leon/bin/leon' briefing` et `'<home>/.leon/bin/leon' capter-session`. Pour Codex, Cursor et Antigravity, ce sera `crochet <outil> <evenement>` (C6 du plan mémoire).
- **Sa commande ne change jamais** : une mise à jour ne touche que `cli/actuelle`. Codex prend l'empreinte de la définition du crochet (sa commande), pas du fichier lancé : rien à réapprouver après une mise à jour (à confirmer à l'essai T15 du plan mémoire).
- **Le détachement de Codex en fin de session** (D11 et T16 du plan mémoire) reste dans le lanceur, avant node.

## 6. Les mises à jour

- **Automatiques**, parce qu'un utilisateur qui n'est pas développeur ne lancera jamais `leon update`. Au plus une fois par 24 h, `leon briefing` lance, après avoir écrit le bloc de démarrage et sans l'attendre, un `leon update` détaché. Celui-ci lit le manifeste du serveur, télécharge la nouvelle version, vérifie son empreinte et sa taille, vérifie que `node leon.mjs --version` répond, puis bascule `cli/actuelle` d'un coup. La version précédente reste sur le disque. Le Node posé suit le même chemin, avec l'empreinte du dépôt, quand le manifeste en demande un autre.
- **L'accord ne bouge pas.** Une CLI mise à jour lit toujours `accord.json` avant d'envoyer quoi que ce soit : elle n'envoie rien de plus que ce que l'utilisateur a accepté. Un nouvel outil (Codex quand son lot arrive) demande de relancer `leon setup`, qui montre son texte d'accord.
- **La forme clone ne se met jamais à jour toute seule** : c'est `git pull`, comme aujourd'hui.
- **Le risque**, à dire clairement : une PR fusionnée, ou un accès au déploiement de Railway, arrive sur tous les ordinateurs à leur session suivante. C'est le même risque que `curl | sh` à l'installation, et que toute application qui se met à jour seule. En v1, on s'en tient au HTTPS vers l'adresse fixée à la connexion et à l'empreinte du manifeste. Une signature par une clé qui ne vit pas sur Railway viendrait ensuite (question pour David).

## 7. L'étape « Vos outils » de l'onboarding (#112), et Réglages

- **Dans l'onboarding**, un bloc « Vos outils de code » s'ajoute à l'étape Vos outils : les logos de Claude Code, Codex, Cursor et Antigravity, une phrase (« Ouvrez un terminal sur votre ordinateur et collez cette commande. Votre navigateur s'ouvrira pour autoriser cet ordinateur. »), la commande avec son bouton Copier (`CodeLine` et `CopyButton` existent), et un lien « Ce qui part ». Il vient en tête pour les services dont les outils conseillés comprennent GitHub ou GitLab, à la fin pour les autres. Il ne bloque jamais l'étape.
- **Dans Réglages**, une section « Ordinateurs connectés » reprend la commande et liste les jetons nommés « Ordinateur : … », avec leur dernière utilisation et un bouton Révoquer. L'onboarding ne se voit qu'une fois ; Réglages reste.
- **La commande ne porte aucun secret** : elle peut aussi figurer dans la documentation et sur le site.
- **Les textes** vont dans `messages/en.json` et `messages/fr.json`, comme tout le site ; la CLI reste en anglais.

## 8. Migrer les installations actuelles

Seuls Amos et David ont des crochets de la forme `pnpm … --dir <clone> leon briefing|capter-session`.

- **Relancer la même commande suffit.** `leon setup` reconnaît ces crochets (`isLeonHandler` les reconnaît déjà) et les remplace sur place par la commande du lanceur, à la même position et avec les mêmes délais. Il garde `accord.json` tel quel : le texte d'accord n'a pas changé, il ne redemande rien. Il connecte l'ordinateur par le navigateur s'il ne l'est pas encore, puis rappelle de révoquer dans Réglages le jeton créé à la main.
- **Garder son clone** : `leon setup --depot ~/leon` écrit le lanceur sous sa forme clone. Les crochets appellent quand même le lanceur.
- **Ne rien faire** ne casse rien : les anciens crochets marchent tant que le clone et son `.env.local` existent. Les variables `LEON_URL` et `LEON_TOKEN` gardent la priorité sur `connexion.json`, pour les tests et pour le clone.

## 9. Ce que ça coûte

Trois PR, environ 5,5 jours, détaillées dans le [plan](../../plans/2026-11-03-cli-sans-clone.md) :

| PR | Ce que ça change | Effort |
|---|---|---|
| 1. Connexion par le navigateur | `leon login` remplace le `.env.local` écrit à la main, y compris pour qui garde son clone | 2 j |
| 2. La CLI sans clone | `curl … \| sh` installe Node, la CLI et le lanceur, connecte l'ordinateur et pose les crochets ; mises à jour automatiques ; migration | 2,5 j |
| 3. Onboarding et Réglages | la commande dans « Vos outils » et dans Réglages, la liste des ordinateurs | 1 j |

Les PR 1 et 2 peuvent avancer en parallèle : elles ne se croisent que par des ajouts voisins dans trois fichiers de la CLI et le README. La PR 3 attend la 2.

Aucune migration de base, aucune dépendance nouvelle. Côté serveur : une page, deux routes et une fonction de signature (HMAC de `node:crypto`, clé dérivée de `BETTER_AUTH_SECRET`).

## 10. Ce que ça change au plan de la mémoire des sessions

- **A6 : oui, chantier à part**, celui-ci.
- **D10 est amendé** : le lanceur pointe par défaut vers le Node et le fichier posés dans `~/.leon`, et vers le clone seulement à la demande. Les crochets de Claude Code passent eux aussi par le lanceur, une seule fois, à la migration.
- **T16** : la partie « lanceur » (`launcher.ts`) passe dans ce plan (PR 2), qui doit donc arriver avant le lot 4 du plan mémoire. T16 garde les adaptateurs par outil et le détachement de Codex dans le lanceur.
- **« Une CLI mise à jour par `git pull` »** devient « une CLI mise à jour toute seule » : la règle d'accord est la même.
- **« Le serveur avant la CLI »** tient d'elle-même : la CLI est servie par le serveur qu'elle appelle.

## 11. Tranché

Amos a tranché le 3 novembre ; il porte ce chantier seul.

- A1. La connexion par renvoi vers l'ordinateur, en un clic, et non le code collé du 28/10.
- A2. Un Node posé par Leon dans `~/.leon`, et non celui de l'ordinateur.
- A3. Les mises à jour automatiques.
- A4. Linux (x64 et arm64, glibc) dès la v1 ; musl (Alpine) refusé avec un message clair.
- A5. Le bloc « Vos outils de code » montré à tous les services, en tête pour ceux qui codent.
- QD1. La CLI servie par le serveur de production, sans signature hors de Railway en v1 : HTTPS, empreinte et taille du manifeste.
- QD2. L'adresse publique de l'installation est celle de `BETTER_AUTH_URL`.
- QD3. #56 reste ouverte : le MCP distant viendra en plus de ce chantier, pour que Claude, ChatGPT et tout autre LLM se branchent à Leon. Ce chantier ne l'attend pas.

## Sources

- Mesures du 03/11 sur le Mac d'Amos (Node 26.5, pnpm 11.0.8) : `pnpm -s --dir ~/leon leon help`, 1,0 à 1,4 s ; le fichier unique construit par Vite 8.3.4 hors du dépôt, 135 Ko, `node leon.mjs help` en 50 à 60 ms ; `node -e 0`, 30 à 40 ms.
- [Node 24.22.2, empreintes officielles](https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt) : `node-v24.22.2-darwin-arm64.tar.xz`, 27 508 812 octets.
- [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) (OAuth pour les applications natives, renvoi vers `127.0.0.1`), [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636) (PKCE), [RFC 8628](https://www.rfc-editor.org/rfc/rfc8628) (flux d'appareil).
- [Chrome, Local Network Access](https://developer.chrome.com/docs/modern-web-guidance/guides/security/local-network-access) et [l'explication de la proposition](https://github.com/WICG/local-network-access/blob/main/explainer.md) : les navigations de premier niveau n'y sont pas filtrées, seulement citées comme un changement possible.
- [Applications à exécutable unique de Node](https://nodejs.org/api/single-executable-applications.html) : l'exécutable officiel est signé, l'injection impose de le resigner sur macOS.
- Le code : `src/server/auth/api-tokens.ts` (jetons hachés, révocables, adhésion revérifiée à chaque appel), `src/cli/env.ts`, `src/cli/hook-commands.ts`, `src/cli/install-hooks.ts`, `src/cli/consent.ts`, `src/app/(onboarding)/bienvenue/outils/page.tsx`.
