# L'extension sur le Chrome Web Store : plan d'implémentation

19 novembre 2026 · Amos (avec Claude) · A1 à A3 tranchées par Amos le 19/11 ; O1 à O6 proposées, à confirmer par Amos à la relecture de ce plan

> **Pour les agents :** SOUS-SKILL REQUISE : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Chaque tâche est exécutée par un sous-agent neuf qui reçoit ce plan et son identifiant de tâche, rien d'autre. Lire en entier l'en-tête, les « Décisions », les « Règles », les « Contrats partagés » et « La sécurité », puis **sa** tâche. Tests d'abord (`superpowers:test-driven-development`), preuves avant de conclure (`superpowers:verification-before-completion`). Commiter **seulement ses fichiers**, ajoutés un par un (`git add <fichier>`, jamais `-A` ni `.`), en un commit « Wxx · titre ». Une erreur de type ou de lint dans un fichier qui n'est pas à soi se signale, elle ne se corrige pas.

**But :** une personne ajoute Leon depuis le Chrome Web Store, accepte l'écran d'accord, clique « Autoriser » dans une fenêtre Leon, et c'est fini : rien à construire, aucun jeton à copier. L'extension capte ChatGPT et claude.ai (réparé avant la publication, A1), et dit à quel compte et à quel espace elle envoie.

**Ce que la personne verra :**
1. Sur la fiche publique du Store (A2), elle clique « Ajouter à Chrome ».
2. Chrome affiche sa propre confirmation, qui liste les sites que l'extension pourra lire (les deux sites captés et leonmemory.com ; le mot à mot de Chrome n'est pas vérifié). Elle clique « Ajouter l'extension ». La permission `identity` n'y ajoute aucun avertissement (cadrage, d'après https://developer.chrome.com/docs/extensions/reference/permissions-list).
3. L'onglet de Leon s'ouvre seul sur l'écran d'accord de Leon (`extension/entrypoints/background.ts:84-89`, `extension/entrypoints/options/index.html:11-66`). Google en exige le principe, pas le texte. Elle clique « J'accepte et je continue ».
4. Le même clic ouvre la fenêtre de connexion de Leon. Si cette fenêtre ne voit pas sa session de leonmemory.com (non vérifié), elle s'y connecte : mot de passe, Google, Microsoft ou SSO, double authentification comprise.
5. La fenêtre montre « Connecter l'extension » : la question avec le nom de l'espace, un avertissement, « Autoriser » et « Annuler ». Elle clique « Autoriser ».
6. La fenêtre se ferme. L'onglet et la petite fenêtre de Leon disent « Connecté à <espace> en tant que <e-mail> ». Réglages > Assistants montre une carte « Extension navigateur », avec « Déconnecter ».
7. Sans compte, la fenêtre ne va pas au bout (voir W11). L'onglet de Leon dit : « Pas de compte ? Créez-le sur leonmemory.com, puis cliquez de nouveau Se connecter. »

**Pourquoi :** aujourd'hui il faut le dépôt, `pnpm ext:build`, « Charger l'extension non empaquetée », puis coller un jeton personnel (`src/components/verre/reglages/extension.tsx:26-56`, `messages/fr.json:838-849`). Ce jeton n'expire pas et ouvre presque toute l'API (`src/server/api/require-api-token.ts:19-35`). Le cadrage du 19/11 (six lecteurs, une synthèse, une critique, hors dépôt) est repris ici ; la critique corrige la synthèse, et chacun de ses points est traité (voir « Points de la critique »).

**Architecture :**
- On reprend l'autorisation « ordinateur » de la CLI (`/computer/authorize`, `POST /api/v1/ordinateurs`), avec une variante « extension » : le retour se fait vers `https://<identifiant>.chromiumapp.org/`, que `chrome.identity.launchWebAuthFlow` attrape, au lieu de `http://127.0.0.1:<port>` (`src/server/auth/computer-authorize.ts:57-64`).
- L'extension tire elle-même son jeton et n'envoie à la page que son empreinte SHA-256, comme la CLI (`src/cli/login.ts:328-330`).
- Le jeton est enregistré sous une sorte nouvelle, `extension`, imposée par le code signé et limitée à `/me`, `/ingest` (sources `chatgpt` et `claude_ai`) et sa révocation.
- claude.ai : un lot à part lit le nouveau protocole binaire du site, ou la page, selon une étude par témoin.
- Le paquet du Store est construit une fois, avec `https://leonmemory.com`, des icônes, une version et des traductions.

**Stack :** celle de main. Aucune dépendance nouvelle : `node:crypto` côté serveur ; `crypto.getRandomValues`, `crypto.subtle`, `DataView`, `TextDecoder` et, s'il le faut, `DecompressionStream` dans l'extension. Une migration (0075 le 19/11 : la dernière est `0074-points-lignes-retirees.sql` ; prendre le prochain numéro libre le jour de la tâche).

## Lots, PR et ordre

| Lot | Ce que ça change | Tâches | Part de main après | Taille |
|---|---|---|---|---|
| 0. Ce plan | les décisions et l'ordre, rien dans le code | aucune | main d'aujourd'hui | court |
| 1. claude.ai | l'extension capte de nouveau claude.ai | W01 à W03 | ce plan | inconnue avant l'étude |
| 2. Le paquet | un zip prêt pour le Store ; l'écran d'accord nomme leonmemory.com | W04, W05 | ce plan | petit |
| 3. Le serveur | Leon autorise une extension ; une carte dans Réglages | W06 à W09 | ce plan | moyen |
| 4. « Se connecter » | plus de jeton collé ; compte et espace affichés | W10 à W13 | les lots 2 et 3 | moyen |
| 5. Confidentialité et fiche | la page /privacy ; les textes à coller dans la console | W14, W15 | ce plan | petit (la relecture d'Amos est le vrai travail) |
| 6. Le site renvoie vers le Store | Réglages : « Ajouter à Chrome » | W16 | la publication | petit |

**Ordre :**
1. Ce plan est fusionné (A3).
2. Les lots 1, 2, 3 et 5 partent de main tout de suite, chacun dans sa PR. Ils touchent des fichiers différents, sauf `messages/en.json` et `messages/fr.json` (lots 3 et 5) : le second à fusionner se rebase.
3. Après la fusion du lot 2, Amos crée l'article en brouillon et donne l'identifiant et la clé publique (« Ce qui revient à Amos », geste 6).
4. Le lot 4 part de main après la fusion des lots 2 et 3. Il se code et s'essaie en local avec l'identifiant de développement (O2), sans attendre l'article : l'essai local d'Amos (W13 a) a lieu avant sa fusion ; l'identifiant et la clé du Store y entrent avant sa fusion.
5. La relecture de Google ne commence qu'avec les lots 1 à 5 fusionnés, déployés, les deux essais de W13 réussis et le zip final envoyé (geste 10).
6. Le lot 6 attend la publication et le contrôle du geste 16.

**Une PR par lot**, jamais empilées. Si la porte de sortie du lot 1 s'ouvre et qu'Amos choisit « ChatGPT seul », un lot de plus retire claude.ai (hôtes, scripts, interrupteurs, titre de l'écran d'accord, description) avant l'envoi.

## Décisions

**D'Amos, le 19/11 (questionnaire) :**
- **A1.** claude.ai est réparé **avant** la publication. Depuis le 19/11, l'extension ne le capte plus ; seul ChatGPT est capté (essai réel du 19/11, 15:10 UTC, PR #210).
- **A2.** La fiche du Store est **publique** dès le début.
- **A3.** On commence maintenant, par ce plan, dans une PR courte, avant de coder.

**Proposées, à confirmer par Amos à la relecture du plan :**
- **O1. La connexion reprend l'autorisation « ordinateur » de la CLI**, avec `chrome.identity.launchWebAuthFlow` et un retour fixe vers `https://<identifiant>.chromiumapp.org/`. Le jeton est d'une sorte nouvelle, `extension`, limitée à `/me`, à `/ingest` pour les seules sources `chatgpt` et `claude_ai`, et à sa propre révocation.
- **O2. Deux identifiants d'extension acceptés par le serveur :** celui de l'article du Store (une constante, ajoutée dès qu'Amos a créé l'article), et un identifiant de développement tiré d'une clé publique de développement commitée, accepté seulement hors production. Les lots 3 et 4 se codent et s'essaient en local sans attendre le compte développeur. Le champ `key` n'entre jamais dans le zip envoyé au Store.
- **O3. Pas de secours par jeton collé** dans la première version : le champ « Jeton personnel » disparaît de l'extension. Brave et Edge sont essayés à l'essai réel (W13) ; si la fenêtre de connexion n'y marche pas, on le dit et on décide alors.
- **O4. Le texte d'accord nomme la destination** (« Leon (leonmemory.com) » au lieu de « votre serveur Leon ») ; la version d'accord passe à 5. Leon n'a pas encore d'utilisateurs : redemander l'accord ne gêne personne. Le mot à mot final est validé par Amos dans la PR du lot 2 ; un agent ne change jamais seul un mot d'un texte d'accord.
- **O5. L'extension affiche le compte et l'espace branchés** (« Connecté à <espace> en tant que <e-mail> »), et un texte pour la personne sans compte (« Pas de compte ? Créez-le sur leonmemory.com, puis cliquez de nouveau Se connecter »).
- **O6. Le compte Google et la déclaration « commerçant »** reviennent à Amos quand il crée le compte développeur (gestes 2 à 4), avec la recommandation et la source.

**Écartées (une ligne chacune) :**
- **Le fournisseur OAuth du MCP distant :** ses jetons `assistant` sont refusés exprès sur `/ingest` (F9, `require-api-token.ts:16-28`), et l'extension devrait renouveler un jeton d'une heure.
- **Le jeton « ordinateur » tel quel :** Réglages le montrerait comme un ordinateur qui « envoie les sessions de code » (`messages/fr.json:905`), et il ouvre toutes les routes et `/api/mcp`.
- **Le site qui écrit à l'extension (`externally_connectable`) ou un script de contenu sur leonmemory.com :** pas moins sûrs si l'on n'y passe qu'un code lié à l'empreinte (critique), mais plus de pièces (une clé de manifeste ou un script de plus, du code dans le site) ; ils restent le secours possible si la fenêtre échoue dans un navigateur (O3).
- **Le code d'appareil (RFC 8628) :** plus de code serveur, hameçonnage à distance (section 5.4), service worker arrêté après 30 s d'inactivité.
- **Les cookies de session du site :** il faudrait affaiblir la règle « même origine » (`src/server/api/session-routes.ts:40-56`) ; la capture s'arrêterait à la déconnexion du site.
- **Publier en gardant le jeton collé :** ce n'est pas « on se connecte, et voilà ».
- **Verrouiller `storage.local` (`setAccessLevel`) :** le script isolé y lit les réglages pour décider s'il relaie un échange (`extension/entrypoints/bridge.content.ts:17`, `extension/lib/capture.ts:23-31`) ; le verrou casserait la capture. Le jeton reste lisible de ce script, comme aujourd'hui (voir « Risques »).
- **Hors de ce chantier :** Firefox et Safari (publications à part), une page ouverte à la désinstallation, le badge d'éditeur vérifié, les envois signés (« Verified CRX Uploads »), la publication par l'API.

## Règles propres à ce chantier

- **Le jeton ne se montre jamais.** Il naît dans l'extension et n'apparaît que dans l'en-tête `Authorization` de ses requêtes et dans `browser.storage.local`. Jamais dans une adresse, un journal ni un message.
- **Un texte d'accord ne change qu'avec le mot à mot validé par Amos** (O4). Changer le texte français de `#consent` monte `CONSENT_VERSION` et note son empreinte (`extension/lib/consent-version.test.ts:9-13`) ; l'anglais (`data-en`) change dans la même PR, le test ne le surveille pas.
- **claude.ai : aucun texte de conversation** dans un relevé, une donnée de test, un journal ni une PR. Le témoin ne garde que la forme ; les données de test ont des textes et des identifiants inventés, comme `extension/lib/parsers/fixtures/chatgpt-reel.sse`.
- **Une seule histoire partout :** la fiche, l'onglet Privacy, la page /privacy, l'écran d'accord et ce que fait l'extension disent la même chose. Un écart peut aller jusqu'à la suspension de l'éditeur (https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
- **Langue :** anglais par défaut, français à côté : `messages/en.json` et `messages/fr.json` pour le site, `t(fr, en)` et `data-en` dans l'extension (`extension/lib/i18n.ts:1-23`), `_locales/en` et `_locales/fr` pour le manifeste.
- **Le projet :** une PR par lot, jamais empilées ; tests d'abord ; noms de fichiers en ASCII ; aucune dépendance nouvelle ; le plus petit changement complet, sans option « pour plus tard ».
- **Vérifications** (méthode d'Amos) : après chaque tâche, un validateur ; avant chaque PR, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` et, pour les lots 3 et 4, `pnpm test:db` (hors sandbox), puis `auditing-runtime-contracts` et `security-review`. Chaque PR passe aussi la CI (`.github/workflows/tests.yml:5-8`, `:32-37`, `:75`) : types, lint, tests unitaires, build et tests en base ; on ne fusionne pas une PR dont la CI est rouge. La CI ne construit pas l'extension : la vérification du zip (W04) reste à la main.
- **Raccourcis :** tout raccourci connu porte un commentaire `shortcut: <la limite>, <quand passer à mieux>`.

## Contrats partagés

**X1. La variante de la page d'autorisation :** `GET /computer/authorize?extension=<id>&etat=<e>&empreinte=<h>`.
- `extension` : un identifiant de X2 ; `etat` et `empreinte` : les règles d'aujourd'hui (`computer-authorize.ts:32-33`). Exactement un des deux, `port` ou `extension` ; jamais `usages` avec `extension`.
- `parseAuthorizeParams` rend l'une ou l'autre forme ; `authorizeQuery`, `authorizePath` et `pathAfterSignIn` (`computer-authorize.ts:40-88`) servent les deux. Ainsi tous les endroits qui relisent ces paramètres suivent : la page (`src/app/(auth)/computer/authorize/page.tsx:40`, `:50`, champs cachés `:67-69`), son action (`actions.ts:13-18`), la connexion (`src/app/(auth)/sign-in/page.tsx:37-40`), la double authentification et les connexions Google, Microsoft et SSO (`src/app/(auth)/actions.ts:114`, `:141`, `:290`).
- Textes propres à la variante, sous `computer.authorize.extension` : `title`, `question`, `warning`, `invalidText` (EN et FR ; à valider dans la PR). Proposés : « Connecter l'extension » ; « Autoriser l'extension Leon de ce navigateur à envoyer vos conversations claude.ai et ChatGPT à Leon, dans l'espace {space}, en tant que {email} ? » (la page a déjà l'e-mail : `getViewerProfile`, `src/app/(auth)/computer/authorize/page.tsx:53`) ; « Si vous ne venez pas d'accepter l'écran de Leon ou de cliquer Se connecter dans l'extension Leon, annulez. » (les deux départs de W11, comme l'avertissement de la CLI couvre les siens, `messages/fr.json:1924`). Pas de cases d'usages.

**X2. Les identifiants acceptés :** `EXTENSION_IDS = { store: <32 lettres a à p> | null, dev: <32 lettres> }`, dans `src/server/auth/computer-authorize.ts`. En production (`env.NODE_ENV === 'production'`, la règle déjà suivie dans `src/server/env.ts:101`) : `store` seul, rien tant qu'il est `null`. Ailleurs : les deux. Les clés publiques (base64, une ligne) : `DEV_PUBLIC_KEY` et `STORE_PUBLIC_KEY` dans `extension/lib/extension-keys.ts`. Seules les clés publiques sont commitées : le chargement non empaqueté n'utilise que `key` (la doc ne parle que de la clé publique, https://developer.chrome.com/docs/extensions/reference/manifest/key) ; la clé privée de développement n'est pas gardée.

**X3. Le retour :** « Autoriser » renvoie vers `https://<id>.chromiumapp.org/?code=<X4>&etat=<e>`, « Annuler » vers `https://<id>.chromiumapp.org/?refus=1&etat=<e>`. L'adresse est bâtie par `returnUrl` à partir d'un `id` de X2, jamais copiée de la requête.

**X4. Le code signé :** la charge d'aujourd'hui (`src/server/auth/computer-code.ts:21-31`) gagne `k`, facultatif : `'extension'`, posé par l'action de la variante. Absent, c'est un ordinateur, comme avant. 120 s, signé par `signComputerCode`, vérifié par `verifyComputerCode`.

**X5. L'échange :** `POST /api/v1/ordinateurs`, inchangé pour la CLI (`src/server/api/computer-routes.ts:49-107`). L'extension envoie `Authorization: Bearer <son jeton>` et `{ code, nom: "extension" }`. Pour un code `k: 'extension'`, le serveur ignore `nom`, enregistre la ligne sous `kind = 'extension'` et le nom fixe `Extension`, et rend la même 201 `{ espace, ordinateur, compte, usages: [], refus: [] }` (`ComputerResponseSchema`, `src/capture/api-contract.ts:36-42`). La sorte vient du code, jamais du corps.

**X6. La sorte `extension` :**
- Migration `0075-jetons-extension.sql` : la contrainte CHECK de `api_tokens.kind` (`src/server/db/migrations/0049-jetons-assistants.sql:11-12`) admet aussi `'extension'`. Elle est sans nom dans 0049 ; Postgres la nomme d'ordinaire `api_tokens_kind_check` (à vérifier dans la base avant d'écrire le `drop constraint`). Le schéma Drizzle suit (`src/server/db/schema/api-tokens.ts:20-22`).
- `registerApiToken(ctx, name, token, kind)` : `kind` vaut `'ordinateur'` ou `'extension'` (`src/server/auth/api-tokens.ts:82-102`).
- `apiTokenGuard({ assistant?, extension? })` (`require-api-token.ts:19-35`) refuse un jeton `extension` sauf monté avec `extension: true`, avec le même 401 qu'un jeton inconnu, et pose `c.var.tokenKind`. Monté ainsi sur `POST /ingest`, `GET /me` (`src/server/api/ingest-routes.ts:23-45`) et `DELETE /jeton` (`computer-routes.ts:110-113`), nulle part ailleurs ; `/api/mcp` le refuse.
- `/ingest` : avec un jeton `extension`, une source autre que `chatgpt` ou `claude_ai` reçoit 403 `{ "error": "Source kind not allowed for this token" }` (aujourd'hui, toute sorte de capture sauf `mcp_remember`, `ingest-routes.ts:16-19`).

**X7. Le stockage de l'extension :** `leon.settings` garde `token` et gagne `account: { space, email } | null`, écrit à l'échange (201 de X5) et rafraîchi par `/me` (`organizationName`, `email`, `ViewerProfileSchema`, `api-contract.ts:45-51`). Le tampon d'envoi appartient au compte, pas à l'organisation. Aujourd'hui seul `tenantId` est comparé, et un tampon capté sans jeton part avec le premier jeton venu (`extension/lib/outbox.ts:106-136`, `extension/entrypoints/background.ts:25-30`) : après « Se déconnecter », ou après un 401 puis la connexion d'un autre compte du même espace, les conversations de A partiraient chez B. Deux changements :
- rien n'est capté sans jeton : `canCapture` exige aussi `settings.token !== null` (`extension/lib/settings.ts:82-84`) ;
- le tampon note `userId` et `tenantId` (tous deux dans `/me`) : un autre compte, même du même espace, le vide et le compte comme perdu.

**X8. Le paquet :** `extension/lib/manifest.ts` exporte `manifestFor({ serverUrl, store })`, appelée par `extension/wxt.config.ts`. Permissions `storage`, `alarms` (et `identity` au lot 4), `host_permissions` = `CAPTURE_HOSTS` + le serveur, `incognito: 'not_allowed'`, `default_locale: 'en'`, nom et description en `__MSG_extName__` et `__MSG_extDescription__`, `version` écrite dans le code. `key` : la clé du Store si le serveur est `https://leonmemory.com`, sinon celle de développement ; jamais quand `store` est vrai. `pnpm ext:zip` construit avec `https://leonmemory.com` et `store` vrai, et sort le zip dans `extension/.output/` (ignoré, `.gitignore:32`). La version monte à chaque envoi au Store : `1.0.0` pour le brouillon du geste 6 (W04), `1.0.1` pour le zip final du geste 10 (W10).

**X9. Le contrat d'un analyseur, pour claude.ai :** aujourd'hui `SiteParser.parse` reçoit `requestBody: string | null` et `sseText: string` (`extension/lib/parsers/site-parser.ts:7-16`), et `intercept.ts` lit du texte et rejette toute réponse qui n'est pas `text/event-stream`. Le lot 1 le change selon le choix de W02 (voir W03) ; un analyseur rend toujours un échange, un rejet `format` ou `incomplet` sans contenu, ou rien.

## La sécurité : ce qui protège, et ce qui reste

**Ce qui voyage :**
- La page d'autorisation ne voit que l'empreinte du jeton, jamais le jeton.
- Le serveur, lui, reçoit le jeton en clair : à l'échange (en-tête `Bearer` de `POST /api/v1/ordinateurs`, `computer-routes.ts:42-47`), puis à chaque envoi vers `/ingest` et `/me` (`extension/lib/api.ts:10-16`). Il n'en garde que le SHA-256, plus les 4 derniers caractères qui servent à reconnaître la carte dans Réglages (`api-tokens.ts:95-96`). Cette phrase-là, et pas « le serveur n'en voit que l'empreinte », va dans /privacy (W14) et dans la fiche (W15).

**Ce qui protège :**
- **Un code volé ne vaut rien sans le jeton :** il porte l'empreinte du jeton, et l'échange vérifie que le jeton présenté a cette empreinte (`computer-routes.ts:65-66`). Il vit 120 s et ne sert qu'une fois (unicité de `token_hash`, 409).
- **Le retour est fixé par le serveur** (X3) : une autre extension ne peut pas demander un retour vers son propre `chromiumapp.org`.
- **La sorte est imposée par le code signé** (X4, X5), et le jeton `extension` n'écrit que des conversations ChatGPT et claude.ai : il ne lit pas la mémoire (X6).
- **L'utilisateur et l'espace viennent de la session**, jamais du formulaire (`actions.ts:23-35`) ; l'adhésion est revérifiée à l'échange et à chaque appel.
- **La page n'est jamais dans un cadre** et n'est pas indexée (`next.config.ts:25-26`, `src/app/(auth)/computer/authorize/page.tsx:17-20`).
- **On voit ce qui est branché :** le compte et l'espace dans l'extension (O5) ; la carte « Extension navigateur » dans Réglages ; « Se déconnecter » dans l'extension, « Déconnecter » dans Réglages.

**Le branchement forcé (relevé par la critique) :** une faille XSS sur une page de leonmemory.com ouverte dans la fenêtre de connexion lit l'`etat` et l'empreinte dans l'adresse. L'attaquant, connecté à son propre compte, fait signer un code pour cette empreinte, puis le script envoie la fenêtre vers `https://<id>.chromiumapp.org/?code=…&etat=…`. L'`etat` correspond et l'empreinte aussi : le jeton de l'extension est enregistré sur le compte de l'attaquant. Le dommage : tant que la victime ne remarque rien, toutes ses conversations ChatGPT et claude.ai partent dans l'espace de l'attaquant, sans date de fin (le jeton n'expire pas). Le jeton limité (X6) n'y change rien : envoyer ces conversations est justement ce qu'il sait faire ; il ne borne qu'un jeton volé. Le code ne lie que l'empreinte, l'utilisateur, l'espace et la sorte. Ce risque vaut aussi pour les approches écartées. Parades :
1. l'extension affiche le compte et l'espace branchés (O5) : c'est la parade principale, mais elle se trompe facilement, car l'attaquant choisit le nom de son espace (`src/app/(onboarding)/welcome/actions.ts:92`) et peut prendre une adresse qui ressemble à celle de la victime ;
2. la victime ne trouve aucune carte « Extension navigateur » dans ses propres Réglages.
La sortie : « Se déconnecter » dans l'extension révoque le jeton, même posé sur le compte de l'attaquant (`DELETE /jeton` révoque le jeton qui fait la requête, `computer-routes.ts:110-113`, `api-tokens.ts:246-253`), et coupe le branchement.
Il reste que la victime doit regarder. Aucune faille XSS n'est connue ; le site n'a pas de `script-src` dans sa politique de sécurité (seulement `frame-ancestors`, `next.config.ts:26`).

## Lot 1 : claude.ai

**Ce que ça change :** l'extension capte de nouveau les échanges de claude.ai. **Dépend de :** ce plan. **N'en fait pas partie :** le serveur, l'écran d'accord, le manifeste.

**Ce qu'on sait déjà** (relevé par témoin du 19/11 dans le Chrome d'Amos, forme seulement, note de travail hors dépôt) :
- L'ancienne adresse, `POST /api/organizations/<org>/chat_conversations/<conv>/completion` (flux SSE), n'est plus appelée. `claude-ai.ts` ne vise qu'elle (`extension/lib/parsers/claude-ai.ts:7`) : il ne reconnaît plus rien, et la petite fenêtre ne montre même pas de rejet (aucun analyseur ne correspond, `extension/lib/intercept.ts:26-27`).
- Pour un message, la page appelle `POST /claudeai-rpc/anthropic.bard.api.v1alpha.ConversationService/PerformAction` (corps binaire, réponse `application/proto`), puis `…/StreamTimeline` (corps binaire, réponse `application/connect+proto`, un flux), puis `…/ReportViewing`. Au rechargement d'une conversation, l'historique vient aussi de `StreamTimeline`.
- Ce que disent les protocoles (vérifié le 19/11 sur les pages officielles) :
  - Connect (https://connectrpc.com/docs/protocol) : en `application/proto` (appel simple), le corps est le message nu, sans enveloppe. En `application/connect+proto` (flux), le corps est une suite d'enveloppes : un octet de drapeaux (bit 0 : message compressé ; bit 1 : fin de flux), la longueur sur 4 octets big-endian, puis le message. Le message de fin de flux est du JSON. La compression d'un flux s'annonce par `connect-content-encoding`.
  - Protobuf (https://protobuf.dev/programming-guides/encoding/) : chaque champ commence par une étiquette `(numéro << 3) | type`, en varint (7 bits par octet). Six types : VARINT 0, I64 1, LEN 2, SGROUP 3, EGROUP 4, I32 5. Un champ LEN peut être une chaîne UTF-8, des octets, un sous-message ou une liste compactée : sans le schéma, on ne peut pas les distinguer, et on n'a que les numéros de champs. L'ordre des champs n'est pas garanti.
  - Aucun schéma public de claude.ai n'est connu. Rien d'autre sur claude.ai n'est établi.

### W01 · L'étude par témoin

**Fichiers :** aucun dans le dépôt ; une note des formes hors dépôt, comme celle de la PR #210.

**Comment :** avec l'accord d'Amos, dans son Chrome connecté à claude.ai, un témoin posé dans la page ne garde que la forme. Pour chaque appel : chemin, méthode, statut, `content-type`, en-têtes de compression, longueurs ; pour chaque enveloppe : drapeaux et longueur ; pour chaque message, l'arbre des champs : numéro, type, longueur, et pour un champ LEN seulement « se lit comme un sous-message » et « UTF-8 valide ». Jamais un octet de contenu. **C'est Amos qui tape et envoie** les messages : « test » dans une conversation neuve, puis une suite, puis une demande de réponse longue, puis un rechargement de la conversation. Un agent n'écrit rien dans claude.ai.

**Ce que l'étude doit établir :**
- quel appel porte le texte de la personne, et lequel la réponse (un seul flux, ou plusieurs) ;
- les chemins de champs (par exemple `1.3.2`) de : l'identifiant de conversation, l'identifiant et le texte du message de la personne, l'identifiant et le texte de la réponse, le rôle, et la marque de fin (drapeau de fin de flux, champ d'état) ;
- si la réponse arrive par morceaux ou entière, et comment se lisent la réflexion, les outils et les pièces jointes, pour les écarter ;
- si la compression par message sert ;
- comment distinguer l'échange nouveau de l'historique rejoué au rechargement : on ne capte que l'échange nouveau, comme pour ChatGPT ;
- si la page montre les messages avec des repères stables (identifiants, attributs), pour l'option « lire la page » ;
- si ces formes restent les mêmes d'un message à l'autre.

**Fait quand :** la note répond à chaque point, ou dit qu'elle ne le peut pas.

### W02 · Le choix

**Critères**, dans l'ordre :
1. **Fiable :** on distingue sans doute le message de la personne, la réponse finale et la fin de la réponse, avec des identifiants de message (le dédoublonnage en dépend, `src/server/ingest/ingest-turns.ts:72`).
2. **Exact :** le texte tel que la personne l'a écrit et que l'assistant l'a rendu, sans réflexion, outils ni pièces jointes.
3. **Le moins fragile :** des numéros de champs vus stables sur plusieurs messages, plutôt que des classes de page qui changent souvent.
4. **Le moins de code, sans permission nouvelle.** Lire la page passe par le script isolé qui tourne déjà sur claude.ai (`extension/entrypoints/bridge.content.ts`), lire les trames par l'interception de `fetch` (`extension/entrypoints/network-capture.content.ts:15`).

**Choix par défaut :** décoder les trames (enveloppes Connect, puis protobuf sans schéma, par chemins de champs), si l'étude trouve des chemins stables pour les points de W01. Sinon lire la page, si elle a des repères stables. **Porte de sortie :** si aucune lecture n'est fiable, on revient vers Amos avec ce qu'on a trouvé : publier avec ChatGPT seul (puis un lot qui retire claude.ai), ou attendre.

### W03 · Le correctif

**Fichiers (option trames) :** `extension/lib/connect-proto.ts` (nouveau : lire les enveloppes et parcourir un message protobuf sans schéma, sans rien évaluer), `extension/lib/intercept.ts`, `extension/lib/parsers/site-parser.ts`, `extension/lib/parsers/claude-ai.ts`, `extension/lib/parsers/chatgpt.ts` (le contrat seulement), des données de test inventées dans `extension/lib/parsers/fixtures/`, leurs tests. **Option page :** un script de contenu de plus ou le script isolé actuel ; le contrat `host-permissions.test.ts:14-20` (deux scripts de contenu) change alors.

**Ce que le correctif touchera :**
- `intercept.ts` lit aujourd'hui du texte : `TextDecoder` (`:34-52`), une borne en caractères (`:9`), un corps de requête qui n'est lu que s'il est une chaîne (`:12-16`), et un rejet `format` de toute réponse qui n'est pas `text/event-stream` (`:64-68`). Il lira des octets pour un analyseur qui le demande, avec une borne en octets, et c'est l'analyseur qui dit quel `content-type` il attend.
- `site-parser.ts:7-16` : le contrat reçoit les octets (requête et réponse) et le `content-type`, ou l'analyseur déclare son format. ChatGPT garde son comportement.
- `claude-ai.ts` : réécrit sur les chemins de W01.

**Tests :** les données de test reprennent la structure relevée (mêmes enveloppes, mêmes chemins, mêmes types), avec des textes et des identifiants inventés ; un échange complet est lu ; une réponse sans fin de flux donne `incomplet` ; une forme inconnue donne `format` ; l'historique rejoué ne donne aucun échange ; une varint trop longue, une longueur qui dépasse le message, une enveloppe tronquée ne lèvent jamais ; la page reçoit toujours la réponse d'origine ; les tests de ChatGPT restent verts.

**Essai :** Amos, dans son Chrome, avec l'extension construite depuis la branche (adresse `leonmemory.com`, son jeton actuel) : conversation neuve, suite, réponse longue, rechargement. Un agent vérifie les journaux de production (`POST /api/v1/ingest` en 202) et, en base, les métadonnées seulement (une source `claude_ai`, des tours, aucun texte lu). Le rechargement n'envoie rien de nouveau.

## Lot 2 : le paquet prêt pour le Store

**Ce que ça change :** un zip accepté par la console, et un écran d'accord qui nomme leonmemory.com. **Dépend de :** ce plan. **N'en fait pas partie :** `identity`, `key`, la connexion (lot 4).

### W04 · Le manifeste et `pnpm ext:zip`

**Fichiers :** `extension/lib/manifest.ts` (nouveau, X8) et son test, `extension/wxt.config.ts`, `extension/public/icon/16.png`, `48.png`, `128.png` (nouveaux), `extension/public/_locales/en/messages.json` et `fr/messages.json` (nouveaux), `package.json` (`ext:zip`).

**Fait quand :**
- **Version :** `1.0.0` (le build sort `0.0.0` aujourd'hui : `wxt.config.ts:7-14` n'en fixe pas, et `extension/` n'a pas de `package.json`).
- **Icônes :** trois PNG tirés de `src/app/icon.svg`, le seul logo du dépôt ; WXT les trouve sous `public/icon/<taille>.png` (`node_modules/wxt/dist/core/utils/manifest.mjs:210-232`). Produites une fois et commitées, sans dépendance nouvelle ; l'outil (`sips` sait-il lire ce SVG ?) et la lisibilité à 16 px sont à vérifier à la tâche.
- **Traductions :** `_locales/en` et `_locales/fr`, nom et description en `__MSG_…__`, `default_locale: 'en'` (exigé dès qu'il y a `_locales`, https://developer.chrome.com/docs/extensions/reference/api/i18n). C'est ce qui donne une fiche en deux langues : « Each locale corresponds to one of the _locales/LOCALE_CODE directories » (https://developer.chrome.com/docs/webstore/cws-dashboard-listing).
- **Description** (132 caractères au plus) : l'actuelle dit « into your team's memory » (`wxt.config.ts:10`), alors que l'écran d'accord dit que la conversation n'est pas partagée avec l'équipe (`options/index.html:38-39`). Nouvelle description en anglais et en français, validée par Amos dans la PR ; elle ne nomme que des sites réellement captés à l'envoi.
- **`pnpm ext:zip`** (X8) ; la variable du shell doit l'emporter sur `.env.local` (non vérifié).

**Tests :** `manifestFor({ serverUrl: 'https://leonmemory.com', store: true })` : pas de `key`, version `1.0.0`, `host_permissions` exactement les deux sites et `https://leonmemory.com/*`, `incognito: 'not_allowed'`, `default_locale: 'en'`, nom et description en `__MSG_` ; chaque clé `__MSG_` existe dans les deux `messages.json` ; `host-permissions.test.ts` reste vert.

**Essai :** l'agent lance `pnpm ext:zip` et relit le `manifest.json` du zip (version, icônes, `_locales`, hôtes, aucun `key`). Le vrai juge est la console, au geste 6 d'Amos.

### W05 · L'écran d'accord nomme leonmemory.com (O4)

**Fichiers :** `extension/entrypoints/options/index.html` (section `#consent`), `extension/lib/settings.ts:7-16` (`CONSENT_VERSION` 5 et son historique), `extension/lib/consent-version.test.ts:9-13`, `src/test/contracts/consent-text.test.ts:22`.

**Fait quand :** « votre serveur Leon » et « votre serveur » (`options/index.html:25-30`, `:41-45`) deviennent la destination nommée, au mot à mot validé par Amos dans la PR, en français et en anglais ; version 5 et son empreinte notées ; `consent-text.test.ts` attend le nouveau texte. Le texte s'écrit sans `https://` : `host-permissions.test.ts:22-26` interdit une adresse dans les points d'entrée. Une version construite pour `localhost` affichera aussi « leonmemory.com » : accepté, elle ne sert qu'au développement.

**Tests :** les deux tests de l'accord, d'abord rouges sur le nouveau texte, puis verts.

## Lot 3 : le serveur autorise l'extension

**Ce que ça change :** Leon sait autoriser une extension et la montrer dans Réglages. **Dépend de :** ce plan. **N'en fait pas partie :** l'extension elle-même (lot 4), l'identifiant du Store (ajouté au lot 4).

**Ordre des tâches :** W06, W09, W07, W08 : W07 se sert de l'identifiant de développement (`EXTENSION_IDS.dev`) que W09 crée.

### W06 · La sorte `extension`

**Fichiers :** `src/server/db/migrations/0075-jetons-extension.sql` (nouveau) et son test `.db.test.ts`, `src/server/db/schema/api-tokens.ts`, `src/server/auth/api-tokens.ts`, `src/server/api/require-api-token.ts`, `src/server/api/ingest-routes.ts`, `src/server/api/computer-routes.ts` (garde de `DELETE /jeton`), `src/server/auth/api-tokens.db.test.ts`, `src/server/api/require-api-token.db.test.ts`, `src/server/api/ingest-routes.db.test.ts`.

**Fait quand :** X6.

**Tests :** la migration accepte `extension` et garde les trois autres ; un jeton `extension` ouvre `/me`, `/ingest` (`chatgpt`, `claude_ai`) et `DELETE /jeton`, reçoit 403 sur `/ingest` avec `claude_code`, et 401 sur `/briefing`, `/chercher`, `/noter`, `/usages` et `/api/mcp` ; manuel, ordinateur et assistant gardent leurs droits ; `route-guards.db.test.ts` reste vert.

### W07 · La variante de la page et l'échange

**Fichiers :** `src/server/auth/computer-authorize.ts` (X1 à X3) et son test, `src/server/auth/computer-code.ts` (X4) et son test, `src/app/(auth)/computer/authorize/page.tsx`, `actions.ts` et leurs tests, `src/app/(auth)/sign-in/page.test.ts`, `src/server/api/computer-routes.ts` (X5) et `computer-routes.db.test.ts`, `messages/en.json`, `messages/fr.json` (`computer.authorize.extension`).

**Fait quand :**
- X1 à X5. La page de la variante montre son titre, sa question, son avertissement, sans cases ; un lien invalide qui porte `extension` montre `extension.invalidText` (le texte actuel dit de relancer `leon login`, `messages/en.json:1950`) ;
- sans session : connexion, puis retour sur la même demande, rebâtie, par chacun des chemins de X1 ; sans espace, `/welcome` (`page.tsx:52`) ;
- en production, l'identifiant de développement est refusé (page d'erreur, aucune redirection).

**Tests :** un identifiant hors de X2, une adresse de retour glissée dans la requête, `port` et `extension` ensemble, `usages` avec `extension` : refusés ; « Autoriser » : redirection vers `https://<dev>.chromiumapp.org/?code=…&etat=…` dont le code se vérifie et porte `k: 'extension'` ; « Annuler » : `refus=1` ; la connexion, la double authentification et `pathAfterSignIn` rendent le chemin de la variante ; un code `k: 'extension'` échangé donne une ligne `extension` nommée `Extension` ; un code d'ordinateur donne toujours `ordinateur` ; le même code deux fois : 409 ; textes EN et FR (`translation-keys.test.ts`) ; l'avertissement de la variante nomme les deux gestes (accepter l'écran de Leon, cliquer Se connecter), en EN et en FR.

**Essai :** l'agent, sur `pnpm dev`, ouvre l'adresse de la variante avec l'identifiant de développement, se connecte avec un compte de test, clique « Autoriser » : l'adresse finale porte `code` et `etat` (la page de `chromiumapp.org` ne s'affiche pas, c'est attendu). Que la fenêtre de `launchWebAuthFlow` attrape bien la redirection d'une action serveur se voit à l'essai local du lot 4 (W13 a), avant sa fusion.

### W08 · La carte dans Réglages

**Fichiers :** `src/app/(app)/settings/page.tsx:103-116`, `src/components/verre/reglages/integrations.tsx:22-31` et `:90`, `src/components/verre/reglages/tokens.tsx:26-46`, `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :** les jetons `extension` non révoqués forment une liste à part, ajoutée aux cartes « Connectés ». Une carte : l'icône de la tuile (`Puzzle`), le nom traduit `kindExtension`, la légende `leon_…<4 derniers>` (deux navigateurs se distinguent), une phrase de panneau (« envoie à Leon les conversations captées sur claude.ai et ChatGPT »), « Déconnecter » avec ses mots de confirmation. `GLYPHS`, `REVOKE_WORDS` et `NOTES` ont leur entrée `extension`.

**Tests :** un jeton `extension` a sa carte, ni parmi les ordinateurs ni parmi les jetons ; déconnecté, la carte disparaît et `/me` le refuse.

### W09 · La clé et l'identifiant de développement

**Fichiers :** `extension/lib/extension-keys.ts` (nouveau : `DEV_PUBLIC_KEY`), `EXTENSION_IDS.dev` (X2), `src/test/contracts/extension-id.test.ts` (nouveau).

**Fait quand :** une paire de clés RSA tirée une fois (`openssl` est sur le poste), seule la clé publique commitée ; le test calcule l'identifiant à partir de la clé et le compare à `EXTENSION_IDS.dev`. Le calcul est celui de Chromium (SHA-256 de la clé, 32 premiers chiffres hexadécimaux, `0-f` changés en `a-p`), qu'aucune page officielle lue ne décrit : l'essai du lot 4 le confirme en comparant à l'identifiant affiché par `chrome://extensions`, comme la doc le demande (« They should match »).

**Tests :** le test de contrat ; une clé changée d'un caractère le fait échouer.

## Lot 4 : « Se connecter » dans l'extension

**Ce que ça change :** plus de jeton collé ; l'extension se connecte, dit à quel compte, et se déconnecte. **Dépend de :** les lots 2 et 3 fusionnés ; l'identifiant et la clé du Store (geste 6 d'Amos) avant la fusion. **N'en fait pas partie :** le lien vers le Store (lot 6).

### W10 · Le manifeste et l'identifiant du Store

**Fichiers :** `extension/lib/manifest.ts` et son test, `extension/lib/extension-keys.ts` (`STORE_PUBLIC_KEY`), `src/server/auth/computer-authorize.ts` (`EXTENSION_IDS.store`), `src/test/contracts/extension-id.test.ts`.

**Fait quand :** `identity` entre dans les permissions ; `key` suit X8 ; la version passe à `1.0.1`, car le brouillon du geste 6 est en `1.0.0` et « Each new version that you upload to the Chrome Web Store must have a larger version number than the previous version » (https://developer.chrome.com/docs/webstore/prepare ; la page ne dit pas si un brouillon jamais soumis compte) ; le test de contrat couvre aussi le Store. **Tests :** `store: true` n'a jamais `key` ; version `1.0.1` (le test de W04 suit) ; un build pour `leonmemory.com` porte la clé du Store, un build pour `localhost` celle de développement.

### W11 · Se connecter, se déconnecter

**Fichiers :** `extension/lib/sign-in.ts` (nouveau, les navigateurs injectés pour les tests) et son test, `extension/lib/api.ts` (l'échange et la révocation), `extension/lib/settings.ts` (X7) et son test, `extension/lib/outbox.ts` (X7) et son test, `extension/entrypoints/options/index.html` et `main.ts`, `extension/entrypoints/background.ts` (rafraîchir `account` par `/me`).

**Fait quand :**
- **Se connecter**, depuis la page d'options seulement (la petite fenêtre se ferme pendant la connexion ; son bouton ouvre les options) : tirer le jeton (`leon_` + 32 octets), l'`etat` (16 octets) et l'empreinte ; `launchWebAuthFlow({ url, interactive: true })` avec X1 et `browser.runtime.id` ; à l'adresse rendue, vérifier l'origine de `browser.identity.getRedirectURL()` et l'`etat`, puis `refus=1` ou `code` ; X5 ; garder le jeton et `account` ; révoquer l'ancien jeton s'il y en avait un (`DELETE /api/v1/jeton`, comme `src/cli/login.ts:191`).
- « J'accepte et je continue » enregistre l'accord puis lance la connexion s'il n'y a pas de jeton enregistré (`main.ts:70-76`) : l'écran d'accord se rouvre aussi à une mise à jour qui monte `CONSENT_VERSION` (`background.ts:84-88`), et une extension déjà connectée ne doit pas changer de jeton. Si le clic ne suffit pas à ouvrir la fenêtre après l'écriture de l'accord (non vérifié), le bouton « Se connecter » reste.
- **Se déconnecter :** `DELETE /api/v1/jeton`, puis effacer jeton et `account`. Si le serveur ne répond pas, effacer quand même et dire de déconnecter l'extension dans Réglages.
- **Fenêtre fermée, refus, 401 ou serveur injoignable :** un message, rien d'enregistré.
- **Personne sans compte :** dans la fenêtre, l'inscription ne garde pas la demande (`src/app/(auth)/sign-up/page.tsx:15-27`), l'adresse doit être vérifiée sans connexion automatique (`src/server/auth/auth.ts:147`, `:151`, `:161-162`), et un compte neuf passe par `/welcome` (`computer/authorize/page.tsx:52`) : la demande est perdue, comme pour la CLI (`login.ts:350`). D'où le texte d'O5 sous le bouton, avec l'hôte du serveur de la version.
- Le formulaire « Jeton personnel » et le bloc « Adresse du serveur » (`options/index.html:70-91`, `main.ts:34-68`, `:90-127`) laissent la place au bloc de connexion : « Connecté à <espace> en tant que <e-mail> », la ligne « Pour changer de compte : Se déconnecter, changez de compte sur leonmemory.com, puis Se connecter » et « Se déconnecter », ou « Se connecter » et le texte d'O5.
- **Le tampon** suit X7 : rien n'est capté sans jeton ; il appartient à `userId` et `tenantId`.

**Tests :** un `etat` différent, une autre origine, `refus=1`, une 401 à l'échange : rien d'enregistré ; une 201 : jeton et `account` gardés, l'ancien jeton révoqué ; la déconnexion efface même sans serveur ; aucun jeton dans une adresse ni un message ; A se déconnecte, une capture a lieu, B se connecte : rien de A ne part ; après un 401, B du même espace se connecte : le tampon est vidé et compté comme perdu ; A se reconnecte après un 401 : son tampon part ; accord accepté avec un jeton présent : aucune fenêtre ouverte.

### W12 · Les textes, dans l'extension et sur le site

**Fichiers :** `extension/entrypoints/popup/index.html` et `main.ts`, `src/components/verre/reglages/extension.tsx`, `src/app/(app)/settings/page.tsx:151-154`, `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :**
- petite fenêtre : « Connecté » montre le compte et l'espace (`popup/main.ts:20`) ; « collez un jeton dans les options » (`:24-27`) et « Jeton refusé / Collez un nouveau jeton » (`:29-33`) deviennent « Se connecter » et « Déconnecté : reconnectez l'extension » ; la perte « quand le jeton a changé » (`:89-92`) devient « quand le compte a changé » ;
- Réglages, dans la même PR, pour qu'aucun texte ne renvoie vers un champ disparu : l'étape 3 (`step3`, `tokenLink`, `messages/fr.json:845` et `:816`) et le point 3 de `extensionPrompt` (`:849`) disent « Dans l'extension, cliquez Se connecter » ; les étapes 1 et 2 restent jusqu'au lot 6.

### W13 · Les essais réels (Amos)

**a. En local, avant la fusion du lot 4.** L'agent lance `pnpm dev`, construit l'extension pour `localhost` (clé de développement) et donne à Amos le chemin complet du dossier ; Amos la charge à la main (mode développeur) :
- Chrome : accord, la fenêtre s'ouvre (le clic sur « J'accepte » suffit-il ?) ; voit-on « Autoriser » directement ou la connexion (session partagée, non vérifiée) ; « Autoriser » : la fenêtre attrape-t-elle la redirection de l'action serveur, se ferme-t-elle ; compte et espace affichés ; la carte dans Réglages ; un échange ChatGPT capté ; « Déconnecter » dans Réglages, puis la petite fenêtre redemande la connexion ; « Se connecter » de nouveau, l'ancien jeton est révoqué ; « Se déconnecter » ; « Annuler » dans la fenêtre ; l'identifiant de `chrome://extensions` égale `EXTENSION_IDS.dev` ;
- un profil Chrome sans session : la connexion dans la fenêtre, et le texte d'O5 ;
- Edge (`edge://extensions`, mode développeur) et Brave : « Se connecter » jusqu'au bout.

La PR du lot 4 note chaque résultat. Si la fenêtre échoue quelque part, Amos tranche O3 avant la fusion.

**b. En production, après la fusion et le déploiement des lots 3 et 4**, l'ancienne extension retirée (geste 8). L'agent construit depuis main l'extension pour `leonmemory.com` (clé du Store) et donne le chemin complet du dossier ; Amos la charge à la main : « Se connecter » jusqu'au bout ; compte et espace affichés ; un échange ChatGPT capté (journaux : `POST /api/v1/ingest` en 202), et claude.ai seulement si le lot 1 est fusionné ; Google ou Microsoft dans la fenêtre si Amos s'en sert ; l'identifiant de `chrome://extensions` égale celui de la console. Les résultats vont en commentaire de la PR du lot 4, déjà fusionnée (une PR de suite s'il faut corriger).

## Lot 5 : la page de confidentialité et les textes de la fiche

**Ce que ça change :** une page /privacy en ligne, liée du pied du site, et les textes prêts à coller dans la console. **Dépend de :** ce plan ; le contenu final suit le lot 1 et O4. **N'en fait pas partie :** l'avis juridique, qui revient au conseil d'Amos.

### W14 · La page /privacy

**Fichiers :** `src/app/(site)/privacy/page.tsx` (nouveau), `src/components/site/site-footer.tsx:62-68` (lien « Confidentialité » dans la colonne Confiance), `messages/en.json`, `messages/fr.json` (`site.privacy`, `site.meta`), `src/test/contracts/page-links.test.ts` si la page y entre.

**Fait quand :**
- **Ce que le Store exige :** ce qui est collecté, comment, à quoi ça sert, avec qui c'est partagé, dit comme l'écran d'accord ; la phrase « Limited Use » que propose la règle (https://developer.chrome.com/docs/webstore/program-policies/limited-use) ; la phrase juste sur le jeton (voir « La sécurité »).
- **Ce que le RGPD demande, à valider par le conseil d'Amos :** le responsable du traitement et son contact, les finalités et la base légale, les destinataires (la personne, ses managers en remontant), les sous-traitants et transferts hors UE (hébergement, base, Sentry `next.config.ts:37-45`, le fournisseur du modèle d'IA, l'envoi d'e-mails), la durée de conservation, les droits et comment les exercer, la suppression du compte. Aucun de ces points n'est dans un texte du site aujourd'hui ; `src/components/site/content.ts:23` interdit de promettre le RGPD dans les textes marketing : la page dit des faits, elle ne promet pas.
- **Aligner l'anglais et le français sur la navigation privée :** « Jamais en navigation privée » contre « Pauses in private windows » (`messages/fr.json:1303` et `messages/en.json:1303`, `content.ts:547` et `:1243`), alors que l'extension y est interdite (`wxt.config.ts:13`).

**Tests :** la page répond en EN et en FR ; le lien du pied de page mène à elle ; les clés existent dans les deux langues.

### W15 · Les textes de la console

**Fichiers :** `docs/etudes/extension-store-2026-11/fiche.md` (nouveau).

**Fait quand :** prêts à coller, en anglais et en français : la description ; le but unique ; la justification de chaque permission (`storage`, `alarms`, `identity`, `claude.ai`, `chatgpt.com`, `leonmemory.com`, et pourquoi un script tourne dans le monde MAIN) ; « pas de code distant » ; les données collectées ; les instructions pour les relecteurs, avec des repères à remplacer (`ADRESSE`, `MOT_DE_PASSE`), jamais les vrais identifiants du compte de test du geste 11 (`CLAUDE.md:58`) ; la liste des captures d'écran 1280x800 à faire. **Point pour Amos et son conseil :** le site ne nomme jamais claude.ai ni ChatGPT (publicité comparative, `docs/etudes/founder-pme-2026-10/marketing.md:90`), mais la fiche, /privacy et l'écran d'accord doivent dire quels sites sont lus. Le plan ne tranche pas.

## Lot 6 : le site renvoie vers le Store

**Ce que ça change :** Réglages propose « Ajouter à Chrome ». **Dépend de :** la publication, le lien de l'article (geste 15) et le contrôle du geste 16.

### W16 · « Ajouter à Chrome »

**Fichiers :** `src/components/verre/reglages/extension.tsx`, `integrations.tsx:22-31` et `:202-213`, `src/app/(app)/settings/page.tsx:117` et `:151-154`, `messages/en.json`, `messages/fr.json` (`settings`, lignes 838-849 ; `site.connectors.channels.extension`), `src/components/site/pages/connecteurs.tsx`, `README.md:24`, `docs/guides/premier-jet-verification.md:13`.

**Fait quand :** le panneau dit « Ajouter à Chrome » (le lien de l'article, une constante) puis « cliquez Se connecter dans l'extension » ; la demande pour Claude Code, les étapes à la main et l'encart `WXT_PUBLIC_LEON_URL` disparaissent, avec leurs clés ; la carte Extension de la page Connecteurs porte le même lien. Le README et le guide gardent la construction locale pour les développeurs. `WXT_PUBLIC_LEON_URL` reste dans `.env.example:126` : le code la lit et un test l'exige (`src/test/contracts/env-contract.test.ts:49-51`).

**Tests :** le lien est l'adresse de l'article ; aucune clé de message n'est orpheline ; l'ancre `#extension` ouvre toujours le panneau (`settings-tabs.test.ts:7`).

## Ce qui revient à Amos

Des gestes qu'un agent ne peut pas faire, dans l'ordre :

1. **Maintenant :** relire ce plan ; confirmer ou changer O1 à O6.
2. **Maintenant, en parallèle des lots :** choisir le compte Google de publication (O6). Recommandation : une adresse dédiée de leonmemory.com, comme le conseille Google ; l'e-mail du compte ne se change plus ensuite. Sources : https://developer.chrome.com/docs/webstore/set-up-account, https://developer.chrome.com/docs/webstore/register.
3. **Puis :** créer le compte développeur : validation en deux étapes, e-mail de contact vérifié, frais d'inscription payés une fois (5 $ selon la note de Google du 30/04/2026, https://developer.chrome.com/docs/extensions/whats-new ; non relu ici), contrat accepté. Source : https://developer.chrome.com/docs/webstore/register.
4. **À la création du compte :** la déclaration « commerçant ou non » (DSA, O6), avec son conseil. Un commerçant donne son nom légal, une adresse et un téléphone vérifié par SMS, publiés en bas de la fiche ; seul le compte qui a lancé la vérification peut la finir. Recommandation du cadrage : commerçant, au nom de la société, si Leon vend son service (page Tarifs), avec une ligne professionnelle. Sources : https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure, https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq.
5. **Au début du lot 1 :** donner son accord pour le témoin dans son Chrome, puis taper et envoyer lui-même les messages de l'étude (W01). Trancher W02 si la porte de sortie s'ouvre.
6. **Après la fusion du lot 2 :** un agent construit le zip (`pnpm ext:zip`) depuis main à jour et vous donne son chemin complet ; créer l'article en brouillon : envoyer ce zip dans la console, **sans le soumettre** ; copier l'identifiant (32 lettres) et la clé publique (onglet Package, « View public key ») ; les donner à l'agent du lot 4 (ce ne sont pas des secrets). Source : https://developer.chrome.com/docs/extensions/reference/manifest/key.
7. **Dans les PR des lots 2 et 5 :** valider le mot à mot du texte d'accord (O4), de la description, de /privacy et des textes de la fiche ; le fond RGPD avec son conseil.
8. **Avant le contrôle en production (W13 b) :** retirer de son Chrome l'extension chargée à la main (`chrome://extensions`, « Supprimer »), puis révoquer son jeton personnel dans Réglages (sa carte, « Révoquer »). Ce n'est pas la même extension (sans `key`, elle a un autre identifiant) et son jeton ouvre presque toute l'API sans expirer (`require-api-token.ts:27`). Un échange envoyé deux fois ne fait pas de doublon (`ingest-turns.ts:29`, `:72`).
9. **Avant la fusion du lot 4 :** l'essai local W13 a (Chrome, Edge, Brave). **Après la fusion et le déploiement des lots 3 et 4 :** le contrôle en production W13 b.
10. **Une fois les lots 1 à 5 fusionnés :** un agent lance `pnpm ext:zip` depuis main à jour, relit le `manifest.json` du zip (`identity` présent, aucun `key`, version `1.0.1`) et vous donne le chemin complet du fichier ; vous l'envoyez dans l'onglet Package de l'article (« Upload new package », libellé non vérifié). C'est ce zip-là qui part à la relecture (geste 14).
11. **Avant l'envoi :** créer sur leonmemory.com un compte et un espace de test pour les relecteurs de Google ; taper l'adresse et le mot de passe seulement dans l'onglet « Test instructions » de la console, jamais dans le dépôt (`fiche.md` n'a que des repères, W15). Source : https://developer.chrome.com/docs/webstore/publish.
12. **La fiche :** description EN et FR, icône 128x128, au moins une capture 1280x800 (5 au plus ; un agent peut les préparer), catégorie. Source : https://developer.chrome.com/docs/webstore/cws-dashboard-listing.
13. **L'onglet Privacy :** but unique, justification de chaque permission, « No, I am not using remote code », données collectées et certifications, lien vers /privacy (W15). Source : https://developer.chrome.com/docs/webstore/cws-dashboard-privacy.
14. **La distribution et l'envoi :** visibilité publique (A2), pays ; soumettre à la relecture (le zip du geste 10) en publication différée (case décochée). Garder leonmemory.com en ligne pendant la relecture : un serveur en panne vaut un refus (« Yellow Magnesium »). Sources : https://developer.chrome.com/docs/webstore/cws-dashboard-distribution, https://developer.chrome.com/docs/webstore/troubleshooting, https://developer.chrome.com/docs/webstore/review-process.
15. **Après l'accord de Google :** cliquer « Publier », dans les 30 jours ; donner le lien de l'article pour le lot 6. Source : https://developer.chrome.com/docs/webstore/update.
16. **Juste après la publication :** supprimer la copie chargée à la main (`chrome://extensions`, « Supprimer » : elle porte la clé du Store, donc le même identifiant), cliquer « Ajouter à Chrome » sur la fiche, puis accepter, se connecter et capter un échange. Le lot 6 ne part qu'après ce contrôle.
17. **Facultatif :** inviter David comme membre de l'éditeur (gratuit). Source : https://developer.chrome.com/docs/webstore/group-publishers.

## Points de la critique

| Point | Traité par |
|---|---|
| « Le serveur n'en voit que l'empreinte » est faux | « La sécurité » : il reçoit le jeton en clair à l'échange et à chaque envoi |
| L'argument XSS ne départage pas les approches | « Écartées » et « Le branchement forcé » ; parade O5 |
| Il manquait la confirmation de Chrome | « Ce que la personne verra », étape 2 |
| `_locales` pour une fiche en deux langues | W04 |
| `setAccessLevel` casserait la capture | « Écartées », avec sa raison ; « Risques » |
| La personne sans compte | O5, W11 |
| Le compte et l'espace jamais affichés | O5, W11, W12 |
| La description du manifeste promet claude.ai | W04 (description revue) et A1 |
| Les autres lecteurs des paramètres | X1 (tous cités), W07 |
| `key` dans le zip | O2, X8, W10 |
| Aucun test entre la clé et l'identifiant | W09, W10 |
| Aucun secours si la fenêtre échoue | O3 (décidé exprès), W13 |
| Restreindre les sortes de source | X6 |
| L'ordre des lots et les textes du site | W12, dans la PR du lot 4 |
| L'extension déjà installée à la main | Geste 8 |
| /privacy suit le Store, pas le RGPD | W14, avec le conseil d'Amos |

## Risques et ce qui n'est pas vérifié

**Risques :**
- **La relecture :** un nouveau développeur et une extension qui lit les réponses de chatgpt.com et claude.ai : relecture plus longue, refus possible. Chaque mise à jour est relue, un correctif urgent compris (https://developer.chrome.com/docs/webstore/review-process, page datée du 10/12/2021).
- **claude.ai change sans prévenir** (le 19/11 en est la preuve). Un décodage par numéros de champs peut casser du jour au lendemain ; la petite fenêtre le montre (rejet `format`), mais chaque correctif attend une relecture de Google.
- **Le lot 1 peut échouer :** alors la publication attend, ou part avec ChatGPT seul (décision d'Amos).
- **La lecture par les managers et « Limited Use »** (pas de lecture humaine) : les exemples de Google visent les employés de l'éditeur, pas les managers du client. C'est une interprétation qu'un relecteur peut contester ; l'écran d'accord le dit (`options/index.html:38-39`).
- **Le jeton n'expire pas** et reste en clair dans `storage.local`, lisible du script isolé qui tourne sur les sites captés, pas de la page ni d'une autre extension, comme aujourd'hui. Désinstaller l'extension ne le révoque pas : « Déconnecter » dans Réglages.
- **Le branchement forcé et l'hameçonnage du consentement** (une extension malveillante qui ouvre la page avec sa propre empreinte et lit l'adresse de retour dans un onglet) : parades plus haut ; il reste que la personne doit regarder ce qu'elle autorise et ce que l'extension affiche.
- **La clé publique du Store est commitée :** n'importe qui peut charger à la main une extension qui porte l'identifiant de Leon. Il faut que la victime l'installe elle-même en mode développeur ; la clé est de toute façon lisible dans le paquet publié.
- **L'identifiant est écrit dans le serveur :** supprimer puis recréer l'article casse la connexion jusqu'à une nouvelle version du serveur.
- **Aucune limite de débit** sur `/computer/authorize` ni sur `POST /api/v1/ordinateurs` (seulement la taille du corps, `computer-routes.ts:53-56`) : inchangé.
- **Arc s'arrête le 22/12/2026** (https://arc.net/faq).

**Non vérifié :**
- que la fenêtre de `launchWebAuthFlow` suive la redirection d'une action serveur Next vers `chromiumapp.org` (le même mécanisme marche vers `127.0.0.1` pour la CLI) ;
- que cette fenêtre partage la session de leonmemory.com (une seule lecture du code de Chromium, https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/extensions/api/identity/web_auth_flow.cc), et que Google, Microsoft, le SSO et la double authentification y marchent ;
- qu'un clic sur « J'accepte » suffise à ouvrir la fenêtre après l'écriture de l'accord (la doc demande un lancement « initiated by UI », sans parler de geste) ;
- Brave (son réglage « Allow Google login for extensions » toucherait `chrome.identity`, https://github.com/brave/brave-browser/wiki/Allow-Google-login---Third-Parties-and-Extensions) et Edge en vrai (https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support dit que `launchWebAuthFlow` est pris en charge) ;
- ce que fait le Store d'un manifeste avec `key` : seulement des témoignages de forum (https://groups.google.com/a/chromium.org/g/chromium-extensions/c/x_NBS6_-NKs) ; on le retire du zip ;
- le calcul de l'identifiant à partir de la clé (W09) : celui de Chromium, sans page officielle ;
- le mot à mot de la confirmation de Chrome à l'installation ;
- l'outil qui fera les PNG et leur lisibilité à 16 px ;
- les conditions d'utilisation de claude.ai sur la lecture de son protocole interne ;
- les frais de 5 $ (repris du cadrage) ;
- le nom de la contrainte CHECK de 0049 en base ;
- qu'une variable du shell l'emporte sur `.env.local` pour `pnpm ext:zip` ;
- qu'un brouillon jamais soumis compte comme version précédente (la version monte quand même, W10), et le libellé « Upload new package » de la console ;
- rien n'a été lancé pour écrire ce plan : ni serveur, ni build, ni navigateur, ni extension. Les citations `chemin:ligne` ont été relues sur main (18d68ebd), après la PR #210.

## Sources

Relues le 19/11 pour ce plan : https://connectrpc.com/docs/protocol, https://protobuf.dev/programming-guides/encoding/, https://developer.chrome.com/docs/extensions/reference/api/identity, https://developer.chrome.com/docs/extensions/reference/manifest/key, https://developer.chrome.com/docs/extensions/reference/api/i18n, https://developer.chrome.com/docs/webstore/cws-dashboard-listing, https://developer.chrome.com/docs/webstore/prepare (la phrase sur la version).

Reprises du cadrage, non relues ici :
- Extensions : https://developer.chrome.com/docs/extensions/reference/permissions-list, https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings, https://developer.chrome.com/docs/extensions/reference/manifest/icons, https://developer.chrome.com/docs/extensions/reference/manifest/version, https://developer.chrome.com/docs/extensions/reference/api/storage, https://developer.chrome.com/docs/extensions/whats-new.
- Store : https://developer.chrome.com/docs/webstore/register, https://developer.chrome.com/docs/webstore/set-up-account, https://developer.chrome.com/docs/webstore/publish, https://developer.chrome.com/docs/webstore/cws-dashboard-privacy, https://developer.chrome.com/docs/webstore/cws-dashboard-distribution, https://developer.chrome.com/docs/webstore/review-process, https://developer.chrome.com/docs/webstore/troubleshooting, https://developer.chrome.com/docs/webstore/update, https://developer.chrome.com/docs/webstore/group-publishers, https://developer.chrome.com/docs/webstore/using-api.
- Règles : https://developer.chrome.com/docs/webstore/program-policies/policies, https://developer.chrome.com/docs/webstore/program-policies/user-data-faq, https://developer.chrome.com/docs/webstore/program-policies/limited-use, https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements, https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure, https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq, https://developer.chrome.com/blog/cws-policy-updates-2026.
- Autres navigateurs et protocoles : https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support, https://github.com/brave/brave-browser/wiki/Allow-Google-login---Third-Parties-and-Extensions, https://arc.net/faq, https://www.rfc-editor.org/rfc/rfc8628, https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/extensions/api/identity/web_auth_flow.cc, https://groups.google.com/a/chromium.org/g/chromium-extensions/c/x_NBS6_-NKs.
