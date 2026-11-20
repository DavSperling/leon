# L'extension sur les magasins des navigateurs : plan d'implémentation

19 novembre 2026, corrigé le 20 novembre · Amos (avec Claude) · A1 à A3 tranchées par Amos le 19/11 ; B1 à B5 tranchées le 19/11 au soir et le 20/11 (O1 confirmée par B4) ; O2 à O6 et P1 à P5 proposées, à confirmer par Amos à la relecture de cette correction

> **Pour les agents :** SOUS-SKILL REQUISE : `superpowers:subagent-driven-development` (recommandé) ou `superpowers:executing-plans`, tâche par tâche. Chaque tâche est exécutée par un sous-agent neuf qui reçoit ce plan et son identifiant de tâche, rien d'autre. Lire en entier l'en-tête, les « Décisions », les « Règles », les « Contrats partagés » et « La sécurité », puis **sa** tâche. Tests d'abord (`superpowers:test-driven-development`), preuves avant de conclure (`superpowers:verification-before-completion`). Commiter **seulement ses fichiers**, ajoutés un par un (`git add <fichier>`, jamais `-A` ni `.`), en un commit « Wxx · titre ». Une erreur de type ou de lint dans un fichier qui n'est pas à soi se signale, elle ne se corrige pas.

**But :** une personne ajoute Leon depuis le magasin de son navigateur (P1) : le Chrome Web Store pour Chrome et sa famille, addons.mozilla.org pour Zen et Firefox. Elle accepte l'écran d'accord, clique « Autoriser » dans une fenêtre Leon, et c'est fini : rien à construire, aucun jeton à copier. Coller un jeton reste possible, à côté (B2, P3). L'extension capte ChatGPT et claude.ai, et dit à quel compte et à quel espace elle envoie. D'ici là, le système actuel reste tel quel (B2) : claude.ai y est réparé d'abord (A1), puis Amos reçoit dans Zen une version Firefox de cette extension, signée par Mozilla sans être listée (B5).

**Ce que la personne verra :**

*Chrome et sa famille* (Brave, Edge, Dia, Vivaldi, Comet, Opera ; Arc jusqu'à son arrêt) :
1. Sur la fiche publique du Store (A2), elle clique « Ajouter à Chrome ». Edge demande d'abord d'accepter les extensions d'autres magasins (https://support.microsoft.com/en-us/microsoft-edge/add-turn-off-or-remove-extensions-in-microsoft-edge-9c0ec68c-2fbc-2f2c-9ff0-bdc76f46b026, second cadrage).
2. Chrome affiche sa propre confirmation, qui liste les sites que l'extension pourra lire (les deux sites captés et leonmemory.com ; le mot à mot de Chrome n'est pas vérifié). Elle clique « Ajouter l'extension ». La permission `identity` n'y ajoute aucun avertissement (cadrage, d'après https://developer.chrome.com/docs/extensions/reference/permissions-list).
3. L'onglet de Leon s'ouvre seul sur l'écran d'accord de Leon (`extension/entrypoints/background.ts:84-89`, `extension/entrypoints/options/index.html:11-66`). Google en exige le principe, pas le texte. Elle clique « J'accepte et je continue ».
4. Le même clic ouvre la fenêtre de connexion de Leon. Si cette fenêtre ne voit pas sa session de leonmemory.com (non vérifié), elle s'y connecte : mot de passe, Google, Microsoft ou SSO, double authentification comprise.
5. La fenêtre montre « Connecter l'extension » : la question avec le nom de l'espace, un avertissement, « Autoriser » et « Annuler ». Elle clique « Autoriser ».
6. La fenêtre se ferme. L'onglet et la petite fenêtre de Leon disent « Connecté à <espace> en tant que <e-mail> ». Réglages > Assistants montre une carte « Extension navigateur », avec « Déconnecter ».
7. Sans compte, la fenêtre ne va pas au bout (voir W14). L'onglet de Leon dit : « Pas de compte ? Créez-le sur leonmemory.com, puis cliquez de nouveau Se connecter. »

*Zen et Firefox* (et LibreWolf, Waterfox) :
1. Sur la fiche publique d'addons.mozilla.org, elle clique « Ajouter à Firefox » (le libellé dans Zen n'est pas vérifié).
2. Firefox affiche sa propre confirmation : les sites que l'extension pourra lire, accordés à l'installation depuis Firefox 127 mais retirables ensuite, et, depuis Firefox 140, les données « requises » que l'extension transmet (les catégories du manifeste, X8). Refuser ces données, c'est annuler l'installation (https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Le mot à mot n'est pas vérifié.
3. à 7. Comme dans Chrome. La fenêtre de connexion est une fenêtre ordinaire de Firefox, sans mode privé ni conteneur ; Firefox essaie d'abord la page en arrière-plan avec les cookies, sans effet ici puisque la page attend « Autoriser » (https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/parent/ext-identity.js, lignes 9-59, relues le 20/11).

*Partout :* le champ « Jeton personnel » reste dans les options, sous « Se connecter » (P3). Coller un jeton marche comme aujourd'hui.

*Amos dans Zen, avant les magasins (lot 2) :* il installe le fichier signé de la version non listée, voit la même confirmation de Firefox, accepte l'écran d'accord et colle un jeton, comme aujourd'hui dans Chrome.

**Pourquoi :** aujourd'hui il faut le dépôt, `pnpm ext:build`, « Charger l'extension non empaquetée », puis coller un jeton personnel (`src/components/verre/reglages/extension.tsx:26-56`, `messages/fr.json:838-849`). Ce jeton n'expire pas et ouvre presque toute l'API (`src/server/api/require-api-token.ts:19-35`). Le 19/11 au soir, Amos a élargi la demande à « un maximum de navigateurs » (B1), en gardant le système actuel d'ici là (B2). Deux cadrages hors dépôt sont repris ici : celui du 19/11 (Chrome Web Store, connexion) et celui du 19/11 au soir (Firefox et Zen, Safari, navigateurs Chromium, cibles de WXT, connexion sur tous les moteurs). Chaque fois, la critique corrige la synthèse, et ses points sont traités (voir « Points des critiques »).

**Architecture :**
- On reprend l'autorisation « ordinateur » de la CLI (`/computer/authorize`, `POST /api/v1/ordinateurs`), avec une variante « extension » : le retour se fait vers l'adresse que le navigateur réserve à l'extension de Leon, que `launchWebAuthFlow` attrape, au lieu de `http://127.0.0.1:<port>` (`src/server/auth/computer-authorize.ts:57-64`). Sous Chromium, `https://<identifiant>.chromiumapp.org/` ; sous Firefox, `https://<SHA-1 de gecko.id>.extensions.allizom.org/` (P2). Les deux identifiants sont fixés d'avance (la clé du manifeste, `gecko.id`) : le serveur connaît leurs adresses.
- L'extension tire elle-même son jeton et n'envoie à la page que son empreinte SHA-256, comme la CLI (`src/cli/login.ts:328-330`).
- Le jeton est enregistré sous une sorte nouvelle, `extension`, imposée par le code signé et limitée à `/me`, `/ingest` (sources `chatgpt` et `claude_ai`) et sa révocation. Le jeton collé reste possible à côté (P3).
- claude.ai : un lot à part lit le nouveau protocole binaire du site, ou la page, selon une étude par témoin.
- Un paquet par moteur, depuis le même code (WXT, `-b chrome` et `-b firefox`, MV3 pour les deux) : un zip pour le Chrome Web Store, un zip et le zip des sources pour addons.mozilla.org, construits avec `https://leonmemory.com`, des icônes, une version et des traductions.

**Stack :** celle de main. Aucune dépendance nouvelle : `node:crypto` côté serveur (SHA-256, et SHA-1 pour l'adresse de retour de Firefox) ; `crypto.getRandomValues`, `crypto.subtle`, `DataView`, `TextDecoder` et, s'il le faut, `DecompressionStream` dans l'extension ; WXT 0.21.4, déjà installé, pour les deux cibles. Une migration (0075 le 20/11 : la dernière est `0074-points-lignes-retirees.sql` ; prendre le prochain numéro libre le jour de la tâche).

## Lots, PR et ordre

| Lot | Ce que ça change | Tâches | Part de main après | Taille |
|---|---|---|---|---|
| 0. Ce plan et sa correction | les décisions et l'ordre, rien dans le code | aucune | main d'aujourd'hui | court |
| 1. claude.ai | l'extension d'aujourd'hui capte de nouveau claude.ai | W01 à W03 | ce plan | inconnue avant l'étude |
| 2. Zen avec le système actuel | un paquet Firefox de l'extension d'aujourd'hui, signé non listé pour le Zen d'Amos | W04 à W06 | le lot 1 | petit |
| 3. Le paquet des deux magasins | deux zips prêts ; l'écran d'accord nomme leonmemory.com | W07, W08 | le lot 2 | petit |
| 4. Le serveur | Leon autorise une extension, sous Chrome ou Firefox ; une carte dans Réglages | W09 à W12 | ce plan | moyen |
| 5. « Se connecter » | à côté du jeton collé, qui reste ; compte et espace affichés | W13 à W16 | les lots 3 et 4 | moyen |
| 6. Confidentialité et fiches | la page /privacy ; les textes des deux consoles | W17, W18 | ce plan | petit (la relecture d'Amos est le vrai travail) |
| 7. Le site renvoie vers les magasins | Réglages : « Ajouter à Chrome », « Ajouter à Firefox » | W19 | les publications | petit |

**Ordre (P5) :**
1. Ce plan est fusionné (A3), puis cette correction.
2. Le lot 1 part de main tout de suite : c'est la priorité (B2), pour l'extension d'aujourd'hui.
3. Le lot 2 part de main après la fusion du lot 1 (B5). L'essai W05 a lieu avant sa fusion, la signature W06 après.
4. En même temps (B2), sans passer devant les lots 1 et 2 : les lots 4 et 6 peuvent partir de main dès que quelqu'un est libre. Ils ne touchent pas aux fichiers des lots 1 et 2 ; entre eux et avec le lot 5, seulement `messages/en.json` et `messages/fr.json` : le second à fusionner se rebase. Le lot 3 attend la fusion du lot 2 : ils touchent les mêmes fichiers (`extension/lib/manifest.ts`, `extension/wxt.config.ts`, `package.json`).
5. Après la fusion du lot 3, Amos crée l'article Chrome en brouillon et donne l'identifiant et la clé publique (geste 9).
6. Le lot 5 part de main après la fusion des lots 3 et 4. Il se code et s'essaie en local avec les identifiants de développement (O2), sans attendre l'article : l'essai local d'Amos (W16 a) a lieu avant sa fusion ; l'identifiant et la clé du Store Chrome y entrent avant sa fusion.
7. Les relectures de Google et de Mozilla ne commencent qu'avec les lots 1 à 6 fusionnés, déployés, les deux essais de W16 réussis et les zips finals envoyés (gestes 13 à 18). Les deux envois partent le même jour ; les relectures courent en parallèle.
8. Le lot 7 attend les deux publications et le contrôle du geste 21. Si l'une tarde beaucoup, il part avec un seul lien, et l'autre suit dans une petite PR.

**Une PR par lot**, jamais empilées. Si la porte de sortie du lot 1 s'ouvre et qu'Amos choisit « ChatGPT seul », un lot de plus retire claude.ai (hôtes, scripts, interrupteurs, titre de l'écran d'accord, description) avant l'envoi ; Amos dit alors si le lot 2 attend ou part avec ChatGPT seul.

## Décisions

**D'Amos, le 19/11 (questionnaire) :**
- **A1.** claude.ai est réparé **avant** la publication. Depuis le 19/11, l'extension ne le capte plus ; seul ChatGPT est capté (essai réel du 19/11, 15:10 UTC, PR #210).
- **A2.** La fiche du Store est **publique** dès le début.
- **A3.** On commence maintenant, par ce plan, dans une PR courte, avant de coder.

**D'Amos, le 19/11 au soir et le 20/11 :**
- **B1.** « J'ai envie de publier l'extension sur un maximum de navigateurs, Zen, Arc, Safari, etc. Je ne peux pas me focus que sur Google. Moi j'utilise Zen au quotidien. » Le but : couvrir le plus de navigateurs possible.
- **B2.** « Pour le moment on garde le système tel qu'il est, avec les extensions telles qu'elles sont. Il faut quand même réparer claude.ai, comme ça on peut avoir des utilisateurs, même avec ce système un peu archaïque, et en même temps on construit des extensions plus propres directement sur les magasins des navigateurs. » Rien n'est retiré du système actuel (extension à construire, jeton personnel collé) ; la priorité est le correctif claude.ai dans cette extension-là ; les extensions des magasins avancent en parallèle.
- **B3.** Safari : « Plus tard ». Ni lot Safari ni compte Apple dans ce chantier ; on y revient quand un client le demande.
- **B4.** La connexion : « La fenêtre spéciale » (`launchWebAuthFlow`). O1 est confirmée. L'onglet ordinaire proposé par le second cadrage est écarté : Amos a préféré le retour fixé vers l'extension de Leon, malgré plus de code.
- **B5.** Zen avec le système actuel : « Après claude.ai ». Une version Firefox de l'extension actuelle (jeton collé) est préparée pour être signée par Mozilla, et Amos crée son compte Mozilla.

**O1, confirmée par B4. La connexion reprend l'autorisation « ordinateur » de la CLI**, avec `launchWebAuthFlow` et un retour fixe vers l'adresse que le navigateur réserve à l'extension de Leon (X3). Le jeton est d'une sorte nouvelle, `extension`, limitée à `/me`, à `/ingest` pour les seules sources `chatgpt` et `claude_ai`, et à sa propre révocation.

**Proposées, à confirmer par Amos à la relecture :**
- **O2. Deux identifiants par moteur, acceptés par le serveur (étendue à Firefox par P2) :** pour Chrome, celui de l'article du Store (une constante, ajoutée dès qu'Amos a créé l'article) et un identifiant de développement tiré d'une clé publique de développement commitée ; pour Firefox, deux `gecko.id` choisis d'avance, celui des magasins et un de développement. Ceux de développement ne sont acceptés que hors production. Les lots 4 et 5 se codent et s'essaient en local sans attendre le compte développeur Google. Le champ `key` n'entre jamais dans un zip envoyé à un magasin.
- **O3. Remplacée par P3.**
- **O4. Le texte d'accord nomme la destination** (« Leon (leonmemory.com) » au lieu de « votre serveur Leon ») ; la version d'accord passe à 5. Leon n'a pas encore d'utilisateurs : redemander l'accord ne gêne personne. Le mot à mot final est validé par Amos dans la PR du lot 3 ; un agent ne change jamais seul un mot d'un texte d'accord.
- **O5. L'extension affiche le compte et l'espace branchés** (« Connecté à <espace> en tant que <e-mail> »), et un texte pour la personne sans compte (« Pas de compte ? Créez-le sur leonmemory.com, puis cliquez de nouveau Se connecter »).
- **O6. Les comptes de publication reviennent à Amos :** le compte Google et la déclaration « commerçant » quand il crée le compte développeur (gestes 6 à 8), le compte Mozilla avec sa double authentification (geste 3), chacun avec la recommandation et la source.
- **P1. Deux magasins dans ce chantier, avec le même code :** le Chrome Web Store (Chrome, Brave, Arc jusqu'à son arrêt, Dia, Vivaldi, Comet, Opera, Edge) et addons.mozilla.org (Zen, Firefox, LibreWolf, Waterfox). Ni Edge Add-ons, ni Opera Add-ons, ni mobile.
- **P2. Le retour sous Firefox :** `launchWebAuthFlow` n'y accepte que `https://<SHA-1 de gecko.id>.extensions.allizom.org/` (ou une adresse locale). Comme `gecko.id` est fixé dans le manifeste, c'est une constante connue d'avance, que le serveur accepte à côté de celle du Chrome Web Store (X2, X3). Le calcul, relu le 20/11 dans la source de Firefox, est dans X3 ; ce qui en reste non vérifié est dans « Non vérifié ».
- **P3. Le jeton collé reste.** Le champ « Jeton personnel » reste dans l'extension, à côté de « Se connecter » (B2), et les étapes à la main restent sur le site. Rien ne disparaît, et aucun texte ne renvoie vers un champ disparu. Son retrait sera une décision d'Amos, plus tard. Si la fenêtre de connexion échoue dans un navigateur (W16), le jeton collé y reste le chemin, et on le dit.
- **P4. Le lot 2, « Zen avec le système actuel », juste après claude.ai :** un paquet Firefox en MV3 de l'extension actuelle, un essai de la capture dans Zen en extension temporaire, puis une version non listée signée par Mozilla avec le compte d'Amos, d'un numéro de version plus bas que la future version listée (X8).
- **P5. L'ordre :** claude.ai (B2), puis Zen avec le système actuel (B5), puis les lots des magasins (le paquet pour les deux moteurs, le serveur, « Se connecter », la confidentialité et les deux fiches), puis l'envoi au Chrome Web Store et à addons.mozilla.org, et le site une fois les fiches publiées. Un lot qui ne touche pas aux mêmes fichiers peut partir plus tôt (B2), sans passer devant. Aucune PR empilée.

**Écartées (une ligne chacune) :**
- **L'onglet ordinaire** (proposé par le second cadrage, écarté par B4) : son avantage est réel. Il marche de la même façon dans tous les moteurs, Safari compris, sans permission `identity`, sans identifiant d'extension côté serveur, sans `key`, sans brouillon ni W12 : moins de code. Il perdait le retour fixé : une fausse « Leon » qui n'a que l'hôte leonmemory.com obtenait un vrai jeton `extension` dès que la personne clique « Autoriser » (critique du second cadrage) ; le code passait aussi par le serveur et l'historique du navigateur.
- **Le fournisseur OAuth du MCP distant :** ses jetons `assistant` sont refusés exprès sur `/ingest` (F9, `require-api-token.ts:16-28`), et l'extension devrait renouveler un jeton d'une heure.
- **Le jeton « ordinateur » tel quel :** Réglages le montrerait comme un ordinateur qui « envoie les sessions de code » (`messages/fr.json:905`), et il ouvre toutes les routes et `/api/mcp`.
- **Le site qui écrit à l'extension (`externally_connectable`) ou un script de contenu sur leonmemory.com :** pas moins sûrs si l'on n'y passe qu'un code lié à l'empreinte (critique), mais plus de pièces (une clé de manifeste ou un script de plus, du code dans le site), et `externally_connectable` n'existe pas sous Firefox, donc dans Zen (https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/externally_connectable.json). Si la fenêtre échoue dans un navigateur, le secours est le jeton collé, qui reste (P3).
- **Le code d'appareil (RFC 8628) :** plus de code serveur, hameçonnage à distance (section 5.4), service worker arrêté après 30 s d'inactivité.
- **Les cookies de session du site :** il faudrait affaiblir la règle « même origine » (`src/server/api/session-routes.ts:40-56`) ; la capture s'arrêterait à la déconnexion du site.
- **Publier avec le jeton collé seul :** ce n'est pas « on se connecte, et voilà ». Il reste, mais à côté de « Se connecter » (P3).
- **Verrouiller `storage.local` (`setAccessLevel`) :** le script isolé y lit les réglages pour décider s'il relaie un échange (`extension/entrypoints/bridge.content.ts:17`, `extension/lib/capture.ts:23-31`) ; le verrou casserait la capture. Le jeton reste lisible de ce script, comme aujourd'hui (voir « Risques »).

**Hors de ce chantier :**
- **Safari (B3, « plus tard »).** Ce que le second cadrage en dit, pour le jour où l'on y reviendra :
  - pas d'API `identity` (Apple : « Not supported. Initiate an OAuth flow in a new tab. », https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility) : il faudra une seconde connexion, par un onglet ordinaire ;
  - une petite app autour de l'extension (App Store Connect ou `xcrun safari-web-extension-packager`), le programme Apple à 99 USD par an (un numéro D-U-N-S pour une société), sa déclaration de commerçant, une relecture à chaque version (https://developer.apple.com/support/enrollment/, https://developer.apple.com/distribute/app-review/) ;
  - la capture : monde MAIN dès Safari 18, chaque site accordé à la main (sans l'accord sur leonmemory.com, ni capture ni envoi : le serveur n'a pas de CORS), `incognito: 'not_allowed'` ignoré, `storage.local` à 5 Mo, le bug WebKit 320812 (https://bugs.webkit.org/show_bug.cgi?id=320812).
- **Edge Add-ons et Opera Add-ons (P1) :** Edge et Opera installent depuis le Chrome Web Store ; chaque magasin ajoute une relecture à chaque correctif, et l'identifiant d'Edge Add-ons est tiré au sort, donc une adresse de retour de plus (https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/alternate-distribution-options).
- **Le mobile (P1) :** Firefox pour Android (`gecko_android`, et pas d'`identity`), Safari sur iPhone ; Chrome sur Android n'a pas d'extensions.
- Une page ouverte à la désinstallation, le badge d'éditeur vérifié, les envois signés (« Verified CRX Uploads »), la publication par une API (celle du Chrome Web Store, `web-ext sign` ou `wxt submit` pour Mozilla).

## Règles propres à ce chantier

- **Le jeton tiré par l'extension ne se montre jamais.** Il naît dans l'extension et n'apparaît que dans l'en-tête `Authorization` de ses requêtes et dans `browser.storage.local`. Jamais dans une adresse, un journal, un message ni le champ « Jeton personnel » (X7).
- **Un texte d'accord ne change qu'avec le mot à mot validé par Amos** (O4). Changer le texte français de `#consent` monte `CONSENT_VERSION` et note son empreinte (`extension/lib/consent-version.test.ts:9-13`) ; l'anglais (`data-en`) change dans la même PR, le test ne le surveille pas. Les catégories de données de Firefox (X8) en sont un aussi : Firefox les montre à l'installation.
- **claude.ai : aucun texte de conversation** dans un relevé, une donnée de test, un journal ni une PR. Le témoin ne garde que la forme ; les données de test ont des textes et des identifiants inventés, comme `extension/lib/parsers/fixtures/chatgpt-reel.sse`.
- **Une seule histoire partout :** la fiche du Chrome Web Store et son onglet Privacy, la fiche d'addons.mozilla.org et les catégories de Firefox, la page /privacy, l'écran d'accord et ce que fait l'extension disent la même chose. Un écart peut aller jusqu'à la suspension de l'éditeur (https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
- **Langue :** anglais par défaut, français à côté : `messages/en.json` et `messages/fr.json` pour le site, `t(fr, en)` et `data-en` dans l'extension (`extension/lib/i18n.ts:1-23`), `_locales/en` et `_locales/fr` pour le manifeste.
- **Le projet :** une PR par lot, jamais empilées ; tests d'abord ; noms de fichiers en ASCII ; aucune dépendance nouvelle ; le plus petit changement complet, sans option « pour plus tard » ; un agent ne crée pas de compte et ne paie rien.
- **Vérifications** (méthode d'Amos) : après chaque tâche, un validateur ; avant chaque PR, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit` et, pour les lots 4 et 5, `pnpm test:db` (hors sandbox), puis `auditing-runtime-contracts` et `security-review`. Chaque PR passe aussi la CI (`.github/workflows/tests.yml:5-8`, `:32-37`, `:75`) : types, lint, tests unitaires, build et tests en base ; on ne fusionne pas une PR dont la CI est rouge. La CI ne construit pas l'extension : la vérification des zips (W04, W07) reste à la main.
- **Raccourcis :** tout raccourci connu porte un commentaire `shortcut: <la limite>, <quand passer à mieux>`.

## Contrats partagés

**X1. La variante de la page d'autorisation :** `GET /computer/authorize?extension=<id>&etat=<e>&empreinte=<h>`.
- `extension` : un identifiant de X2 (32 lettres sous Chrome, un `gecko.id` encodé dans l'adresse sous Firefox) ; `etat` et `empreinte` : les règles d'aujourd'hui (`computer-authorize.ts:32-33`). Exactement un des deux, `port` ou `extension` ; jamais `usages` avec `extension`. Aucun `redirect_uri` : Firefox prend alors l'adresse de retour de l'extension (X3).
- `parseAuthorizeParams` rend l'une ou l'autre forme ; `authorizeQuery`, `authorizePath` et `pathAfterSignIn` (`computer-authorize.ts:40-88`) servent les deux. Ainsi tous les endroits qui relisent ces paramètres suivent : la page (`src/app/(auth)/computer/authorize/page.tsx:40`, `:50`, champs cachés `:67-69`), son action (`actions.ts:13-18`), la connexion (`src/app/(auth)/sign-in/page.tsx:37-40`), la double authentification et les connexions Google, Microsoft et SSO (`src/app/(auth)/actions.ts:114`, `:141`, `:290`).
- Textes propres à la variante, sous `computer.authorize.extension` : `title`, `question`, `warning`, `invalidText` (EN et FR ; à valider dans la PR). Proposés : « Connecter l'extension » ; « Autoriser l'extension Leon de ce navigateur à envoyer vos conversations claude.ai et ChatGPT à Leon, dans l'espace {space}, en tant que {email} ? » (la page a déjà l'e-mail : `getViewerProfile`, `src/app/(auth)/computer/authorize/page.tsx:53`) ; « Si vous ne venez pas d'accepter l'écran de Leon ou de cliquer Se connecter dans l'extension Leon, annulez. » (les deux départs de W14, comme l'avertissement de la CLI couvre les siens, `messages/fr.json:1924`). Pas de cases d'usages.

**X2. Les identifiants acceptés :** `EXTENSION_IDS = { chrome: { store: <32 lettres a à p> | null, dev: <32 lettres> }, firefox: { store: <gecko.id>, dev: <gecko.id> } }`, dans `src/server/auth/computer-authorize.ts`. En production (`env.NODE_ENV === 'production'`, la règle déjà suivie dans `src/server/env.ts:101`) : les deux `store`, rien pour Chrome tant que le sien est `null`. Ailleurs : les quatre.
- Chrome : les clés publiques (base64, une ligne), `DEV_PUBLIC_KEY` et `STORE_PUBLIC_KEY`, dans `extension/lib/extension-keys.ts`. Seules les clés publiques sont commitées : le chargement non empaqueté n'utilise que `key` (la doc ne parle que de la clé publique, https://developer.chrome.com/docs/extensions/reference/manifest/key) ; la clé privée de développement n'est pas gardée.
- Firefox : `gecko.id` n'est tiré d'aucune clé ; addons.mozilla.org n'en donne pas et vérifie qu'il est unique (second cadrage, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings). Proposés : `leon@leonmemory.com` (magasins) et `leon-dev@leonmemory.com` (développement), choisis par Amos au geste 1. Celui des magasins ne change plus après le premier envoi à Mozilla (W06). Celui de développement évite qu'une version d'essai remplace, dans le même profil Zen, la version signée de tous les jours.

**X3. Le retour :** « Autoriser » renvoie vers `<retour>?code=<X4>&etat=<e>`, « Annuler » vers `<retour>?refus=1&etat=<e>`. `<retour>` est bâti par `returnUrl` à partir d'un `id` de X2, jamais copié de la requête :
- Chrome : `https://<id>.chromiumapp.org/` ;
- Firefox : `https://<h>.extensions.allizom.org/`, où `<h>` est le SHA-1 des octets UTF-8 de l'`id`, en hexadécimal (`createHash('sha1')`). C'est le calcul de `getRedirectURL` dans Firefox : `computeHash(extension.id)` puis `https://${hash}.${redirectDomain}/`, `redirectDomain` valant `extensions.allizom.org` par défaut (https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/child/ext-identity.js, lignes 26-43 ; https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/all.js, ligne 3112 ; relus le 20/11). `launchWebAuthFlow` y refuse tout retour qui ne commence pas par cette adresse ou par `http://127.0.0.1/mozoauth2/<h>` (même fichier, lignes 51-67).

**X4. Le code signé :** la charge d'aujourd'hui (`src/server/auth/computer-code.ts:21-31`) gagne `k`, facultatif : `'extension'`, posé par l'action de la variante. Absent, c'est un ordinateur, comme avant. 120 s, signé par `signComputerCode`, vérifié par `verifyComputerCode`.

**X5. L'échange :** `POST /api/v1/ordinateurs`, inchangé pour la CLI (`src/server/api/computer-routes.ts:49-107`). L'extension envoie `Authorization: Bearer <son jeton>` et `{ code, nom: "extension" }`. Pour un code `k: 'extension'`, le serveur ignore `nom`, enregistre la ligne sous `kind = 'extension'` et le nom fixe `Extension`, et rend la même 201 `{ espace, ordinateur, compte, usages: [], refus: [] }` (`ComputerResponseSchema`, `src/capture/api-contract.ts:36-42`). La sorte vient du code, jamais du corps.

**X6. La sorte `extension` :**
- Migration `0075-jetons-extension.sql` : la contrainte CHECK de `api_tokens.kind` (`src/server/db/migrations/0049-jetons-assistants.sql:11-12`) admet aussi `'extension'`. Elle est sans nom dans 0049 ; Postgres la nomme d'ordinaire `api_tokens_kind_check` (à vérifier dans la base avant d'écrire le `drop constraint`). Le schéma Drizzle suit (`src/server/db/schema/api-tokens.ts:20-22`).
- `registerApiToken(ctx, name, token, kind)` : `kind` vaut `'ordinateur'` ou `'extension'` (`src/server/auth/api-tokens.ts:82-102`).
- `apiTokenGuard({ assistant?, extension? })` (`require-api-token.ts:19-35`) refuse un jeton `extension` sauf monté avec `extension: true`, avec le même 401 qu'un jeton inconnu, et pose `c.var.tokenKind`. Monté ainsi sur `POST /ingest`, `GET /me` (`src/server/api/ingest-routes.ts:23-45`) et `DELETE /jeton` (`computer-routes.ts:110-113`), nulle part ailleurs ; `/api/mcp` le refuse.
- `/ingest` : avec un jeton `extension`, une source autre que `chatgpt` ou `claude_ai` reçoit 403 `{ "error": "Source kind not allowed for this token" }` (aujourd'hui, toute sorte de capture sauf `mcp_remember`, `ingest-routes.ts:16-19`). Un jeton collé garde ses droits d'aujourd'hui.

**X7. Le stockage de l'extension :** `leon.settings` garde `token` et gagne :
- `account: { space, email } | null`, écrit à l'échange (201 de X5) et rafraîchi par `/me` (`organizationName`, `email`, `ViewerProfileSchema`, `api-contract.ts:45-51`), pour tout jeton, collé ou non ;
- `signedIn: boolean`, vrai seulement pour un jeton tiré par « Se connecter ». L'extension ne révoque que les jetons qu'elle a tirés : un jeton collé peut servir ailleurs, et `DELETE /jeton` révoque tout jeton qui le demande (`computer-routes.ts:110-113`, monté avec `requireApiToken`). Un jeton tiré n'est jamais recopié dans le champ « Jeton personnel ».

Le tampon d'envoi appartient au compte, pas à l'organisation. Aujourd'hui seul `tenantId` est comparé, et un tampon capté sans jeton part avec le premier jeton venu (`extension/lib/outbox.ts:106-136`, `extension/entrypoints/background.ts:25-30`) : après « Se déconnecter », ou après un 401 puis la connexion d'un autre compte du même espace, les conversations de A partiraient chez B. Deux changements, pour les deux façons de brancher l'extension :
- rien n'est capté sans jeton : `canCapture` exige aussi `settings.token !== null` (`extension/lib/settings.ts:82-84`) ;
- le tampon note `userId` et `tenantId` (tous deux dans `/me`) : un autre compte, même du même espace, le vide et le compte comme perdu.

**X8. Les paquets :** `extension/lib/manifest.ts` exporte `manifestFor({ serverUrl, browser, store })`, appelée par `extension/wxt.config.ts` sous la forme `manifest: ({ browser }) => manifestFor(…)` : la cible vient de WXT, jamais de `import.meta.env.FIREFOX`, que refuserait `src/test/contracts/env-contract.test.ts:22-27`.
- **Commun aux deux :** permissions `storage`, `alarms` (et `identity` au lot 5), `host_permissions` = `CAPTURE_HOSTS` + le serveur, `incognito: 'not_allowed'`, `default_locale: 'en'`, nom et description en `__MSG_extName__` et `__MSG_extDescription__`, `version` écrite dans le code, la même pour les deux.
- **Chrome (`chrome-mv3`) :** `key` : la clé du Store si le serveur est `https://leonmemory.com`, sinon celle de développement ; jamais quand `store` est vrai. Aucun `browser_specific_settings`.
- **Firefox (`firefox-mv3`) :** MV3 forcé, car WXT vise MV2 par défaut pour Firefox (`node_modules/wxt/dist/core/resolve-config.mjs:49`). `browser_specific_settings.gecko` : `id` (X2 : celui des magasins si le serveur est `https://leonmemory.com`, sinon celui de développement, à partir du lot 5 ; le lot 2 n'a que celui des magasins), `strict_min_version: '140.0'` (l'écran de données de Firefox existe depuis la 140, le monde MAIN depuis la 128) et `data_collection_permissions`. L'arrière-plan en `background.scripts`, que WXT écrit seul (`node_modules/wxt/dist/core/utils/manifest.mjs:106-119`) : Firefox n'a pas de service worker d'extension (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background). Jamais `key`.
- **Les zips :** `pnpm ext:zip` construit avec `https://leonmemory.com` et `store` vrai, et sort dans `extension/.output/` (ignoré, `.gitignore:32`) le zip Chrome, le zip Firefox et le zip des sources pour Mozilla. WXT fait ce dernier d'office pour Firefox (`resolve-config.mjs:200`), mais à partir d'`extension/` seulement (`:196`), alors que l'extension importe `../src/capture` : sa racine devient celle du dépôt, et il ne prend que `extension/`, `src/capture/`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` et une notice de construction. Mozilla reconstruit l'extension depuis ces sources et compare ; ses relecteurs ont Node 24.14.0 et npm 11.9.0 sur Ubuntu 24.04 ARM64, et tout écart se dit dans la notice (https://extensionworkshop.com/documentation/publish/source-code-submission/, relue le 20/11).
- **Les numéros :** chaque envoi à un magasin monte, et addons.mozilla.org refuse un numéro déjà pris, listé ou non (https://discourse.mozilla.org/t/mixing-listed-and-unlisted-add-ons/13968, forum, d'après la critique du second cadrage). `0.9.0` pour la version non listée du lot 2 (`0.9.1`, `0.9.2` pour ses correctifs), `1.0.0` pour le brouillon Chrome (W07), `1.0.1` pour les zips finals envoyés aux deux magasins (W13).

**X9. Le contrat d'un analyseur, pour claude.ai :** aujourd'hui `SiteParser.parse` reçoit `requestBody: string | null` et `sseText: string` (`extension/lib/parsers/site-parser.ts:7-16`), et `intercept.ts` lit du texte et rejette toute réponse qui n'est pas `text/event-stream`. Le lot 1 le change selon le choix de W02 (voir W03) ; un analyseur rend toujours un échange, un rejet `format` ou `incomplet` sans contenu, ou rien.

## La sécurité : ce qui protège, et ce qui reste

**Ce qui voyage :**
- La page d'autorisation ne voit que l'empreinte du jeton, jamais le jeton.
- Le serveur, lui, reçoit le jeton en clair : à l'échange (en-tête `Bearer` de `POST /api/v1/ordinateurs`, `computer-routes.ts:42-47`), puis à chaque envoi vers `/ingest` et `/me` (`extension/lib/api.ts:10-16`). Il n'en garde que le SHA-256, plus les 4 derniers caractères qui servent à reconnaître la carte dans Réglages (`api-tokens.ts:95-96`). Cette phrase-là, et pas « le serveur n'en voit que l'empreinte », va dans /privacy (W17) et dans les fiches (W18). Un jeton collé voyage de la même façon.

**Ce qui protège :**
- **Un code volé ne vaut rien sans le jeton :** il porte l'empreinte du jeton, et l'échange vérifie que le jeton présenté a cette empreinte (`computer-routes.ts:65-66`). Il vit 120 s et ne sert qu'une fois (unicité de `token_hash`, 409).
- **Le retour est fixé par le serveur, un par moteur** (X3), bâti depuis un identifiant de la liste, jamais copié de la requête. Une autre extension ne peut pas obtenir un retour vers sa propre adresse : la fenêtre de Chrome n'attrape que l'adresse de l'extension qui l'ouvre, et Firefox refuse un retour qui n'est pas celui de l'extension qui appelle (`child/ext-identity.js`, lignes 58-67). Une copie de Leon publiée sur un magasin a forcément un autre identifiant (le Chrome Web Store le tire de sa clé, addons.mozilla.org refuse un `gecko.id` déjà pris) : pour voler un branchement, il lui faut en plus lire l'onglet (`tabs`, `<all_urls>`, ou l'hôte `chromiumapp.org` ou `extensions.allizom.org`). C'est ce que l'onglet ordinaire aurait perdu (B4).
- **La sorte est imposée par le code signé** (X4, X5), et le jeton `extension` n'écrit que des conversations ChatGPT et claude.ai : il ne lit pas la mémoire (X6).
- **L'utilisateur et l'espace viennent de la session**, jamais du formulaire (`actions.ts:23-35`) ; l'adhésion est revérifiée à l'échange et à chaque appel.
- **La page n'est jamais dans un cadre** et n'est pas indexée (`next.config.ts:25-26`, `src/app/(auth)/computer/authorize/page.tsx:17-20`).
- **On voit ce qui est branché :** le compte et l'espace dans l'extension (O5) ; la carte « Extension navigateur » dans Réglages ; « Se déconnecter » dans l'extension, « Déconnecter » dans Réglages.

**Le branchement forcé (relevé par la critique) :** une faille XSS sur une page de leonmemory.com ouverte dans la fenêtre de connexion lit l'`etat` et l'empreinte dans l'adresse. L'attaquant, connecté à son propre compte, fait signer un code pour cette empreinte, puis le script envoie la fenêtre vers le retour (`chromiumapp.org` ou `extensions.allizom.org`) avec `?code=…&etat=…`. L'`etat` correspond et l'empreinte aussi : le jeton de l'extension est enregistré sur le compte de l'attaquant. Le dommage : tant que la victime ne remarque rien, toutes ses conversations ChatGPT et claude.ai partent dans l'espace de l'attaquant, sans date de fin (le jeton n'expire pas). Le jeton limité (X6) n'y change rien : envoyer ces conversations est justement ce qu'il sait faire ; il ne borne qu'un jeton volé. Le code ne lie que l'empreinte, l'utilisateur, l'espace et la sorte. Ce risque vaut aussi pour les approches écartées, et pour les deux moteurs. Parades :
1. l'extension affiche le compte et l'espace branchés (O5) : c'est la parade principale, mais elle se trompe facilement, car l'attaquant choisit le nom de son espace (`src/app/(onboarding)/welcome/actions.ts:92`) et peut prendre une adresse qui ressemble à celle de la victime ;
2. la victime ne trouve aucune carte « Extension navigateur » dans ses propres Réglages.
La sortie : « Se déconnecter » dans l'extension révoque le jeton, même posé sur le compte de l'attaquant (`DELETE /jeton` révoque le jeton qui fait la requête, `computer-routes.ts:110-113`, `api-tokens.ts:246-253`), et coupe le branchement.
Il reste que la victime doit regarder. Aucune faille XSS n'est connue ; le site n'a pas de `script-src` dans sa politique de sécurité (seulement `frame-ancestors`, `next.config.ts:26`).

**Le jeton collé reste (B2, P3), et c'est le plus large.** Un jeton personnel d'aujourd'hui (créé dans Réglages par `createApiToken`, sans date de fin, `src/server/auth/api-tokens.ts:59-77`) n'expire jamais : `verifyApiToken` ne vérifie une date de fin que si elle existe (`:278`). Il ouvre presque toute l'API : seul le jeton d'assistant est refusé hors de `/api/mcp` (`require-api-token.ts:19-35`), si bien qu'un jeton personnel lit toute la mémoire de la personne (par exemple `/briefing`, `/chercher`, `/fil`, `src/server/api/briefing-routes.ts:16`, `read-routes.ts:75-81`), écrit des notes (`notes-routes.ts:29`) et envoie à `/ingest` toute sorte de capture sauf `mcp_remember` (`ingest-routes.ts:16-19`). Collé dans l'extension, il est en clair dans `storage.local`, lisible du script isolé qui tourne sur claude.ai et chatgpt.com, comme aujourd'hui. Volé là, il donne tout cela, sans date de fin, jusqu'à ce que la personne le révoque dans Réglages. Une page qui dit « collez votre jeton Leon ici » est aussi un hameçonnage possible. Le branchement forcé ne le touche pas : rien ne passe par la fenêtre. Ce que le plan fait : rien n'est retiré (B2) ; « Se connecter » vient en premier dans les options ; l'extension ne révoque jamais un jeton collé (X7) ; un jeton tiré ne se montre jamais dans le champ. Retirer le champ, ou limiter les jetons personnels, reste une décision d'Amos, plus tard (P3).

## Lot 1 : claude.ai

**Ce que ça change :** l'extension d'aujourd'hui capte de nouveau les échanges de claude.ai : c'est la priorité (A1, B2). **Dépend de :** ce plan. **N'en fait pas partie :** le serveur, l'écran d'accord, le manifeste.

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

## Lot 2 : Zen avec le système actuel

**Ce que ça change :** un paquet Firefox en MV3 de l'extension d'aujourd'hui (jeton collé), essayé dans Zen, puis signé par Mozilla sans être listé, pour le Zen d'Amos (B5, P4). **Dépend de :** le lot 1 fusionné. **N'en fait pas partie :** `identity` et la connexion (lot 5), les icônes, les traductions et la description (lot 3), la fiche d'addons.mozilla.org (lot 6).

**Ce qu'on sait déjà** (second cadrage ; rien n'a été construit ni essayé) :
- Zen 1.24.3b repose sur Firefox 160.0.1 et installe ses extensions depuis addons.mozilla.org (https://zen-browser.app/release-notes, https://docs.zen-browser.app/user-manual/extensions). Il refuse une extension non signée installée pour de bon ; une extension temporaire disparaît au redémarrage, avec son jeton (https://github.com/zen-browser/desktop/discussions/8961).
- Le code n'appelle jamais `chrome.*` : tout passe par l'objet `browser` de WXT, et l'arrière-plan n'utilise rien qui soit propre à un service worker (`extension/entrypoints/background.ts:84-107` et ce qu'il importe). Firefox a le monde MAIN depuis la 128, et `storage`, `alarms`, les options, la petite fenêtre, `_locales` et `incognito: 'not_allowed'`. Un script de contenu n'y fait pas de `fetch` vers une autre origine ; le relais passe déjà par l'arrière-plan (`extension/entrypoints/bridge.content.ts:17`).

### W04 · Le paquet Firefox

**Fichiers :** `extension/lib/manifest.ts` (nouveau, X8) et son test, `extension/wxt.config.ts`, `package.json` (`ext:zip:firefox`), `extension/build-firefox.md` (nouveau : la notice de construction pour les relecteurs de Mozilla).

**Fait quand :**
- `wxt.config.ts` appelle `manifest: ({ browser }) => manifestFor({ serverUrl, browser })` (X8). Le manifeste Chrome ne change pas, sauf la version.
- Firefox : MV3 forcé (`node_modules/wxt/dist/core/resolve-config.mjs:49`) ; `browser_specific_settings.gecko` avec l'`id` des magasins (X2, choisi par Amos au geste 1), `strict_min_version: '140.0'` et `data_collection_permissions`. Catégories proposées : `required: ['personalCommunications', 'websiteContent']` (les messages et les réponses, lus dans les réponses du site) ; `authenticationInfo` à trancher (le jeton que la personne colle) (https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/). Firefox les montre à l'installation : Amos les valide dans la PR (Règles).
- L'arrière-plan : rien à changer dans le code ; WXT écrit `background.scripts` (`node_modules/wxt/dist/core/utils/manifest.mjs:106-119`).
- La version : `0.9.0` (le build sort `0.0.0` aujourd'hui : `wxt.config.ts:7-14` n'en fixe pas), plus bas que la future version listée (X8).
- `pnpm ext:zip:firefox` construit avec `https://leonmemory.com` et sort dans `extension/.output/` le zip Firefox et le zip des sources (X8), sous des noms fixés : les modèles de WXT prennent nom et version dans un `package.json` qu'`extension/` n'a pas (`resolve-config.mjs:194-195`).
- La notice dit Node (`engines`, `package.json:7-8`) et pnpm (`packageManager`, `package.json:6`), `pnpm install --frozen-lockfile`, puis la commande exacte, avec `WXT_PUBLIC_LEON_URL=https://leonmemory.com`.

**Tests :** `manifestFor({ serverUrl: 'https://leonmemory.com', browser: 'firefox' })` : `gecko.id`, `strict_min_version`, les catégories, version `0.9.0`, les hôtes d'aujourd'hui ; avec `'chrome'`, aucun `browser_specific_settings` ; `host-permissions.test.ts` et `env-contract.test.ts` restent verts.

**Essai (agent) :** `pnpm ext:zip:firefox`, puis relire le `manifest.json` du zip : `manifest_version` 3, `background.scripts` sans `service_worker`, les clés `gecko`, la version. Puis, s'il le peut (l'installation demande le réseau), déballer le zip des sources dans un dossier vide, suivre la notice, et comparer les fichiers construits à ceux du zip Firefox : Mozilla refuse une construction qui ne redonne pas le même paquet. Sinon, le dire dans la PR.

### W05 · L'essai dans Zen (Amos)

**Comment :** l'agent donne à Amos le chemin complet du zip Firefox de la branche. Amos crée dans Réglages un jeton personnel pour Zen seul (une carte à part, qu'il pourra révoquer seule). Dans Zen : `about:debugging`, « Ce Firefox », « Charger un module complémentaire temporaire… » (libellés non vérifiés), et il choisit le zip. Il tape lui-même les messages ; un agent n'écrit rien dans claude.ai ni ChatGPT.

**Les points à voir** (la capture n'a jamais tourné hors de Chrome) :
- l'extension se charge : `strict_min_version` est comparé à la version que Zen annonce (non vérifié qu'il annonce celle de Firefox ; sinon on l'abaisse, l'écran d'accord de Leon précédant déjà toute capture) ;
- l'écran d'accord s'ouvre seul ; le jeton se colle, « Tester la connexion » répond ;
- les trois sites sont accordés (`about:addons`, Leon, Permissions) : depuis Firefox 127 la personne peut les retirer, et le code ne le vérifie jamais (https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/) ;
- une conversation ChatGPT neuve, puis une suite : la petite fenêtre dit l'échange capté ; l'agent voit `POST /api/v1/ingest` en 202 dans les journaux de production, et rien d'autre ;
- la même chose sur claude.ai ;
- si rien n'est capté : le script du monde MAIN passe-t-il à `document_start` sous la CSP du site (`extension/entrypoints/network-capture.content.ts:10-14`), et le relais reconnaît-il le message (`event.source`, `extension/lib/bridge.ts:29`) ?
- après quelques minutes sans rien faire, un nouvel échange part encore (l'arrière-plan de Firefox s'endort et se réveille ; l'alarme reprend les envois) ;
- dans un onglet d'un autre espace de travail ou conteneur de Zen, la capture marche aussi.

**Fait quand :** la PR du lot 2 note chaque point. Si la capture échoue, on corrige dans le lot 2, avant sa fusion.

### W06 · La version non listée signée (Amos)

**Comment :**
- après la fusion du lot 2, l'agent lance `pnpm ext:zip:firefox` depuis main à jour et donne à Amos le chemin complet des deux zips ;
- Amos, sur https://addons.mozilla.org/developers/, avec son compte (geste 3) : « Submit a New Add-on », « On your own » (non listée), le zip Firefox, puis le zip des sources quand la page le demande (libellés non vérifiés). La signature suit une validation automatique, jusqu'à 24 h ; une relecture humaine peut venir ensuite, à tout moment (https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/, relue le 20/11) ;
- Amos télécharge le fichier signé (`.xpi`) et l'installe dans Zen (`about:addons`, la roue, « Installer un module depuis un fichier… »), accepte la confirmation de Firefox et l'écran d'accord, puis colle son jeton « Zen » ;
- l'envoi se fait à la main, sans clé d'API : aucun secret ne quitte le navigateur d'Amos.

**Fait quand :** Leon tourne dans le Zen d'Amos après un redémarrage, et capte. Un correctif de cette version (claude.ai qui change encore) prend le même chemin, en `0.9.1`, puis `0.9.2` (X8).

## Lot 3 : le paquet des deux magasins

**Ce que ça change :** deux zips acceptés par les consoles, et un écran d'accord qui nomme leonmemory.com. **Dépend de :** le lot 2 fusionné (mêmes fichiers). **N'en fait pas partie :** `identity`, `key`, le `gecko.id` de développement, la connexion (lot 5).

### W07 · Les manifestes et `pnpm ext:zip`

**Fichiers :** `extension/lib/manifest.ts` (X8) et son test, `extension/wxt.config.ts`, `extension/public/icon/16.png`, `48.png`, `128.png` (nouveaux), `extension/public/_locales/en/messages.json` et `fr/messages.json` (nouveaux), `package.json` (`ext:zip`).

**Fait quand :**
- **Version :** `1.0.0`, pour les deux cibles (X8).
- **Icônes :** trois PNG tirés de `src/app/icon.svg`, le seul logo du dépôt ; WXT les trouve sous `public/icon/<taille>.png` (`node_modules/wxt/dist/core/utils/manifest.mjs:210-232`). Produites une fois et commitées, sans dépendance nouvelle ; l'outil (`sips` sait-il lire ce SVG ?) et la lisibilité à 16 px sont à vérifier à la tâche.
- **Traductions :** `_locales/en` et `_locales/fr`, nom et description en `__MSG_…__`, `default_locale: 'en'` (exigé dès qu'il y a `_locales`, https://developer.chrome.com/docs/extensions/reference/api/i18n). C'est ce qui donne une fiche Chrome en deux langues : « Each locale corresponds to one of the _locales/LOCALE_CODE directories » (https://developer.chrome.com/docs/webstore/cws-dashboard-listing). Firefox lit les mêmes `_locales`.
- **Description** (132 caractères au plus) : l'actuelle dit « into your team's memory » (`wxt.config.ts:10`), alors que l'écran d'accord dit que la conversation n'est pas partagée avec l'équipe (`options/index.html:38-39`). Nouvelle description en anglais et en français, validée par Amos dans la PR ; elle ne nomme que des sites réellement captés à l'envoi.
- **`pnpm ext:zip`** (X8) : le zip Chrome, puis `pnpm ext:zip:firefox` ; la variable du shell doit l'emporter sur `.env.local` (non vérifié).

**Tests :** `manifestFor({ serverUrl: 'https://leonmemory.com', browser: 'chrome', store: true })` : pas de `key`, version `1.0.0`, `host_permissions` exactement les deux sites et `https://leonmemory.com/*`, `incognito: 'not_allowed'`, `default_locale: 'en'`, nom et description en `__MSG_` ; avec `'firefox'`, la même chose plus les clés `gecko` de W04 ; chaque clé `__MSG_` existe dans les deux `messages.json` ; `host-permissions.test.ts` reste vert.

**Essai :** l'agent lance `pnpm ext:zip` et relit les deux `manifest.json` (version, icônes, `_locales`, hôtes, aucun `key`, les clés `gecko` dans le seul zip Firefox). Les vrais juges sont les consoles : celle de Google au geste 9, celle de Mozilla au geste 18.

### W08 · L'écran d'accord nomme leonmemory.com (O4)

**Fichiers :** `extension/entrypoints/options/index.html` (section `#consent`), `extension/lib/settings.ts:7-16` (`CONSENT_VERSION` 5 et son historique), `extension/lib/consent-version.test.ts:9-13`, `src/test/contracts/consent-text.test.ts:22`.

**Fait quand :** « votre serveur Leon » et « votre serveur » (`options/index.html:25-30`, `:41-45`) deviennent la destination nommée, au mot à mot validé par Amos dans la PR, en français et en anglais ; version 5 et son empreinte notées ; `consent-text.test.ts` attend le nouveau texte. Le texte s'écrit sans `https://` : `host-permissions.test.ts:22-26` interdit une adresse dans les points d'entrée. Une version construite pour `localhost` affichera aussi « leonmemory.com » : accepté, elle ne sert qu'au développement. La version non listée de Zen garde l'ancien texte ; à son passage à la version listée, l'écran se rouvre (`background.ts:84-88`).

**Tests :** les deux tests de l'accord, d'abord rouges sur le nouveau texte, puis verts.

## Lot 4 : le serveur autorise l'extension

**Ce que ça change :** Leon sait autoriser une extension, sous Chrome comme sous Firefox, et la montrer dans Réglages. **Dépend de :** ce plan. **N'en fait pas partie :** l'extension elle-même (lot 5), l'identifiant du Store Chrome (ajouté au lot 5).

**Ordre des tâches :** W09, W12, W10, W11 : W10 se sert des identifiants de développement (`EXTENSION_IDS.chrome.dev`, `EXTENSION_IDS.firefox.dev`) que W12 crée.

### W09 · La sorte `extension`

**Fichiers :** `src/server/db/migrations/0075-jetons-extension.sql` (nouveau) et son test `.db.test.ts`, `src/server/db/schema/api-tokens.ts`, `src/server/auth/api-tokens.ts`, `src/server/api/require-api-token.ts`, `src/server/api/ingest-routes.ts`, `src/server/api/computer-routes.ts` (garde de `DELETE /jeton`), `src/server/auth/api-tokens.db.test.ts`, `src/server/api/require-api-token.db.test.ts`, `src/server/api/ingest-routes.db.test.ts`.

**Fait quand :** X6.

**Tests :** la migration accepte `extension` et garde les trois autres ; un jeton `extension` ouvre `/me`, `/ingest` (`chatgpt`, `claude_ai`) et `DELETE /jeton`, reçoit 403 sur `/ingest` avec `claude_code`, et 401 sur `/briefing`, `/chercher`, `/noter`, `/usages` et `/api/mcp` ; manuel, ordinateur et assistant gardent leurs droits ; `route-guards.db.test.ts` reste vert.

### W10 · La variante de la page et l'échange

**Fichiers :** `src/server/auth/computer-authorize.ts` (X1 à X3) et son test, `src/server/auth/computer-code.ts` (X4) et son test, `src/app/(auth)/computer/authorize/page.tsx`, `actions.ts` et leurs tests, `src/app/(auth)/sign-in/page.test.ts`, `src/server/api/computer-routes.ts` (X5) et `computer-routes.db.test.ts`, `messages/en.json`, `messages/fr.json` (`computer.authorize.extension`).

**Fait quand :**
- X1 à X5. La page de la variante montre son titre, sa question, son avertissement, sans cases ; un lien invalide qui porte `extension` montre `extension.invalidText` (le texte actuel dit de relancer `leon login`, `messages/en.json:1950`) ;
- sans session : connexion, puis retour sur la même demande, rebâtie, par chacun des chemins de X1 ; sans espace, `/welcome` (`page.tsx:52`) ;
- en production, les identifiants de développement sont refusés (page d'erreur, aucune redirection).

**Tests :** un identifiant hors de X2, une adresse de retour glissée dans la requête, `port` et `extension` ensemble, `usages` avec `extension` : refusés ; « Autoriser » : redirection vers `https://<dev Chrome>.chromiumapp.org/?code=…&etat=…`, et vers `https://<SHA-1 du gecko.id de dev>.extensions.allizom.org/?code=…&etat=…` pour l'identifiant Firefox, dont le code se vérifie et porte `k: 'extension'` ; « Annuler » : `refus=1` ; la connexion, la double authentification et `pathAfterSignIn` rendent le chemin de la variante ; un code `k: 'extension'` échangé donne une ligne `extension` nommée `Extension` ; un code d'ordinateur donne toujours `ordinateur` ; le même code deux fois : 409 ; textes EN et FR (`translation-keys.test.ts`) ; l'avertissement de la variante nomme les deux gestes (accepter l'écran de Leon, cliquer Se connecter), en EN et en FR.

**Essai :** l'agent, sur `pnpm dev`, ouvre l'adresse de la variante avec chacun des deux identifiants de développement, se connecte avec un compte de test, clique « Autoriser » : l'adresse finale porte `code` et `etat` (la page de `chromiumapp.org` ou d'`extensions.allizom.org` ne s'affiche pas, c'est attendu). Que la fenêtre de `launchWebAuthFlow` attrape bien la redirection d'une action serveur, sous Chrome et sous Zen, se voit à l'essai local du lot 5 (W16 a), avant sa fusion.

### W11 · La carte dans Réglages

**Fichiers :** `src/app/(app)/settings/page.tsx:103-116`, `src/components/verre/reglages/integrations.tsx:22-31` et `:90`, `src/components/verre/reglages/tokens.tsx:26-46`, `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :** les jetons `extension` non révoqués forment une liste à part, ajoutée aux cartes « Connectés ». Une carte : l'icône de la tuile (`Puzzle`), le nom traduit `kindExtension`, la légende `leon_…<4 derniers>` (deux navigateurs se distinguent), une phrase de panneau (« envoie à Leon les conversations captées sur claude.ai et ChatGPT »), « Déconnecter » avec ses mots de confirmation. `GLYPHS`, `REVOKE_WORDS` et `NOTES` ont leur entrée `extension`. Les jetons personnels, collés ou non, restent où ils sont aujourd'hui.

**Tests :** un jeton `extension` a sa carte, ni parmi les ordinateurs ni parmi les jetons ; déconnecté, la carte disparaît et `/me` le refuse.

### W12 · Les identifiants de développement, et celui de Firefox

**Fichiers :** `extension/lib/extension-keys.ts` (nouveau : `DEV_PUBLIC_KEY`), `EXTENSION_IDS` (X2 : `chrome.dev`, `firefox.store`, `firefox.dev`), `src/test/contracts/extension-id.test.ts` (nouveau).

**Fait quand :**
- Chrome : une paire de clés RSA tirée une fois (`openssl` est sur le poste), seule la clé publique commitée ; le test calcule l'identifiant à partir de la clé et le compare à `EXTENSION_IDS.chrome.dev`. Le calcul est celui de Chromium (SHA-256 de la clé, 32 premiers chiffres hexadécimaux, `0-f` changés en `a-p`), qu'aucune page officielle lue ne décrit : l'essai du lot 5 le confirme en comparant à l'identifiant affiché par `chrome://extensions`, comme la doc le demande (« They should match »).
- Firefox : les deux `gecko.id` de X2. Le test vérifie que `EXTENSION_IDS.firefox.store` égale le `gecko.id` du manifeste pour `leonmemory.com` (W04), et que `returnUrl` rend, pour chacun des deux, une adresse écrite en dur dans le test, calculée une fois à la main (`printf '%s' '<id>' | shasum -a 1`). L'essai du lot 5 la compare à `browser.identity.getRedirectURL()` dans Zen.

**Tests :** le test de contrat ; une clé ou un `gecko.id` changé d'un caractère le fait échouer.

## Lot 5 : « Se connecter » dans l'extension

**Ce que ça change :** l'extension se connecte, dit à quel compte, et se déconnecte, sous Chrome comme sous Firefox ; le jeton collé reste à côté (P3). **Dépend de :** les lots 3 et 4 fusionnés ; l'identifiant et la clé du Store Chrome (geste 9) avant la fusion. **N'en fait pas partie :** les liens vers les magasins (lot 7).

### W13 · Les manifestes et l'identifiant du Store

**Fichiers :** `extension/lib/manifest.ts` et son test, `extension/lib/extension-keys.ts` (`STORE_PUBLIC_KEY`), `src/server/auth/computer-authorize.ts` (`EXTENSION_IDS.chrome.store`), `src/test/contracts/extension-id.test.ts`.

**Fait quand :** `identity` entre dans les permissions des deux cibles ; `key` (Chrome) et `gecko.id` (Firefox) suivent X8 ; la version passe à `1.0.1`, car le brouillon du geste 9 est en `1.0.0` et « Each new version that you upload to the Chrome Web Store must have a larger version number than the previous version » (https://developer.chrome.com/docs/webstore/prepare ; la page ne dit pas si un brouillon jamais soumis compte) ; c'est aussi le premier numéro listé sur addons.mozilla.org, plus haut que les `0.9.x` ; le test de contrat couvre aussi le Store Chrome. **Tests :** `store: true` n'a jamais `key` ; version `1.0.1` (les tests de W04 et W07 suivent) ; un build Chrome pour `leonmemory.com` porte la clé du Store, pour `localhost` celle de développement ; un build Firefox pour `leonmemory.com` porte le `gecko.id` des magasins, pour `localhost` celui de développement.

### W14 · Se connecter, se déconnecter

**Fichiers :** `extension/lib/sign-in.ts` (nouveau, les navigateurs injectés pour les tests) et son test, `extension/lib/api.ts` (l'échange et la révocation), `extension/lib/settings.ts` (X7) et son test, `extension/lib/outbox.ts` (X7) et son test, `extension/entrypoints/options/index.html` et `main.ts`, `extension/entrypoints/background.ts` (rafraîchir `account` par `/me`).

**Fait quand :**
- **Se connecter**, depuis la page d'options seulement (la petite fenêtre se ferme pendant la connexion ; son bouton ouvre les options) : tirer le jeton (`leon_` + 32 octets), l'`etat` (16 octets) et l'empreinte ; `launchWebAuthFlow({ url, interactive: true })` avec X1 et `browser.runtime.id` (sous Firefox, c'est le `gecko.id`) ; à l'adresse rendue, vérifier l'origine de `browser.identity.getRedirectURL()` (celle de X3, sur les deux moteurs) et l'`etat`, puis `refus=1` ou `code` ; X5 ; garder le jeton, `account` et `signedIn: true` ; révoquer l'ancien jeton seulement s'il venait de « Se connecter » (`DELETE /api/v1/jeton`, comme `src/cli/login.ts:191`) ; un jeton collé n'est jamais révoqué (X7), et un message dit qu'il ne sert plus à l'extension et qu'on le révoque dans Réglages s'il ne sert plus ailleurs.
- « J'accepte et je continue » enregistre l'accord puis lance la connexion s'il n'y a aucun jeton enregistré, collé ou non (`main.ts:70-76`) : l'écran d'accord se rouvre aussi à une mise à jour qui monte `CONSENT_VERSION` (`background.ts:84-88`), et une extension déjà branchée ne doit pas changer de jeton. Si le clic ne suffit pas à ouvrir la fenêtre après l'écriture de l'accord (non vérifié), le bouton « Se connecter » reste.
- **Se déconnecter**, pour un jeton tiré : `DELETE /api/v1/jeton`, puis effacer jeton et `account`. Si le serveur ne répond pas, effacer quand même et dire de déconnecter l'extension dans Réglages. Un jeton collé se retire comme aujourd'hui (champ vidé, « Enregistrer »), sans révocation.
- **Fenêtre fermée, refus, 401, serveur injoignable, ou onglet des options fermé pendant la connexion :** rien d'enregistré (dans le dernier cas, l'échange X5 n'a pas lieu) ; un message quand l'onglet est encore là ; on refait « Se connecter ».
- **Personne sans compte :** dans la fenêtre, l'inscription ne garde pas la demande (`src/app/(auth)/sign-up/page.tsx:15-27`), l'adresse doit être vérifiée sans connexion automatique (`src/server/auth/auth.ts:147`, `:151`, `:161-162`), et un compte neuf passe par `/welcome` (`computer/authorize/page.tsx:52`) : la demande est perdue, comme pour la CLI (`login.ts:350`). D'où le texte d'O5 sous le bouton, avec l'hôte du serveur de la version.
- **Le bloc de connexion s'ajoute en haut des options :** « Connecté à <espace> en tant que <e-mail> », la ligne « Pour changer de compte : Se déconnecter, changez de compte sur leonmemory.com, puis Se connecter » et « Se déconnecter », ou « Se connecter » et le texte d'O5. **Le formulaire « Jeton personnel » et le bloc « Adresse du serveur » restent dessous, tels quels** (`options/index.html:68-91`, `main.ts:34-68`, `:90-127` ; P3), à deux changements près : le champ reste vide quand le jeton vient de « Se connecter » (aujourd'hui il reçoit le jeton enregistré, `main.ts:30`, et « Voir » le montrerait) ; enregistrer un jeton collé fait `signedIn: false` et révoque un jeton tiré s'il y en avait un.
- **Le tampon** suit X7 : rien n'est capté sans jeton ; il appartient à `userId` et `tenantId`.

**Tests :** un `etat` différent, une autre origine, `refus=1`, une 401 à l'échange : rien d'enregistré ; une 201 : jeton, `account` et `signedIn` gardés, l'ancien jeton tiré révoqué ; un jeton collé n'est jamais révoqué, ni par « Se connecter » ni par « Se déconnecter » ; coller un jeton par-dessus un jeton tiré révoque ce dernier ; le champ reste vide avec un jeton tiré ; la déconnexion efface même sans serveur ; aucun jeton tiré dans une adresse, un message ni le champ ; A se déconnecte, une capture a lieu, B se connecte : rien de A ne part ; après un 401, B du même espace se connecte : le tampon est vidé et compté comme perdu ; A se reconnecte après un 401 : son tampon part ; accord accepté avec un jeton présent, collé ou tiré : aucune fenêtre ouverte.

### W15 · Les textes, dans l'extension et sur le site

**Fichiers :** `extension/entrypoints/popup/index.html` et `main.ts`, `src/components/verre/reglages/extension.tsx`, `src/app/(app)/settings/page.tsx:151-154`, `messages/en.json`, `messages/fr.json`, leurs tests.

**Fait quand :**
- petite fenêtre : « Connecté » montre le compte et l'espace (`popup/main.ts:20`) ; « collez un jeton dans les options » (`:24-27`) devient « connectez-vous ou collez un jeton dans les options » ; « Jeton refusé / Collez un nouveau jeton » (`:29-33`) devient « Jeton refusé : reconnectez l'extension ou collez un nouveau jeton dans les options » ; la perte « quand le jeton a changé » (`:89-92`) devient « quand le compte a changé » ;
- Réglages, dans la même PR : l'étape 3 (`step3`, `tokenLink`, `messages/fr.json:845` et `:816`) et le point 3 de `extensionPrompt` (`:849`) disent « Dans l'extension, cliquez Se connecter, ou collez un jeton personnel » ; les étapes 1 et 2 et l'encart de l'adresse restent (P3).

### W16 · Les essais réels (Amos)

**a. En local, avant la fusion du lot 5.** L'agent lance `pnpm dev`, construit l'extension pour `localhost` (identifiants de développement) pour les deux cibles et donne à Amos le chemin complet des dossiers ; Amos les charge à la main :
- Chrome (mode développeur) : accord, la fenêtre s'ouvre (le clic sur « J'accepte » suffit-il ?) ; voit-on « Autoriser » directement ou la connexion (session partagée, non vérifiée) ; « Autoriser » : la fenêtre attrape-t-elle la redirection de l'action serveur, se ferme-t-elle ; compte et espace affichés ; la carte dans Réglages ; un échange ChatGPT capté ; « Déconnecter » dans Réglages, puis la petite fenêtre redemande la connexion ; « Se connecter » de nouveau, l'ancien jeton est révoqué ; « Se déconnecter » ; « Annuler » dans la fenêtre ; l'identifiant de `chrome://extensions` égale `EXTENSION_IDS.chrome.dev` ;
- un profil Chrome sans session : la connexion dans la fenêtre, et le texte d'O5 ;
- Zen (`about:debugging`, module temporaire) : la même suite ; la fenêtre de Firefox attrape-t-elle la redirection vers `extensions.allizom.org`, voit-elle la session de leonmemory.com (conteneurs compris) ; `browser.identity.getRedirectURL()`, lu dans la console de l'extension (`about:debugging`, « Examiner »), égale l'adresse que le serveur bâtit pour `EXTENSION_IDS.firefox.dev` (W12) ; ce que montre la confirmation de Firefox, si un module temporaire la montre ;
- Edge (`edge://extensions`, mode développeur), Brave et, si Amos l'a, Dia : « Se connecter » jusqu'au bout ;
- dans chaque navigateur essayé : coller un jeton marche encore, et « Se connecter » par-dessus ne le révoque pas ; fermer l'onglet des options pendant la connexion n'enregistre rien.

La PR du lot 5 note chaque résultat. Si la fenêtre échoue quelque part, on le note : le jeton collé y reste le chemin (P3), et Amos dit s'il faut l'écrire sur les fiches.

**b. En production, après la fusion et le déploiement des lots 4 et 5**, l'ancienne extension retirée de Chrome (geste 11). L'agent construit depuis main l'extension pour `leonmemory.com` (identifiants des magasins), pour les deux cibles, et donne les chemins complets. Amos la charge dans Chrome, et dans un profil Zen à part (`about:profiles`), car la version signée de tous les jours a le même `gecko.id` : « Se connecter » jusqu'au bout ; compte et espace affichés ; un échange ChatGPT et un échange claude.ai captés (journaux : `POST /api/v1/ingest` en 202), claude.ai seulement si le lot 1 le capte ; Google ou Microsoft dans la fenêtre si Amos s'en sert ; l'identifiant de `chrome://extensions` égale celui de la console, et `getRedirectURL()` dans Zen égale l'adresse de `EXTENSION_IDS.firefox.store`. Les résultats vont en commentaire de la PR du lot 5, déjà fusionnée (une PR de suite s'il faut corriger).

## Lot 6 : la page de confidentialité et les textes des deux fiches

**Ce que ça change :** une page /privacy en ligne, liée du pied du site, et les textes prêts à coller dans les deux consoles. **Dépend de :** ce plan ; le contenu final suit le lot 1, les catégories du lot 2, O4 et P3. **N'en fait pas partie :** l'avis juridique, qui revient au conseil d'Amos.

### W17 · La page /privacy

**Fichiers :** `src/app/(site)/privacy/page.tsx` (nouveau), `src/components/site/site-footer.tsx:62-68` (lien « Confidentialité » dans la colonne Confiance), `messages/en.json`, `messages/fr.json` (`site.privacy`, `site.meta`), `src/test/contracts/page-links.test.ts` si la page y entre.

**Fait quand :**
- **Ce que les magasins exigent :** ce qui est collecté, comment, à quoi ça sert, avec qui c'est partagé, dit comme l'écran d'accord ; la phrase « Limited Use » que propose la règle de Google (https://developer.chrome.com/docs/webstore/program-policies/limited-use) ; une politique que Mozilla demande dès que des données quittent l'appareil (https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), avec les catégories de Firefox (X8) dites avec les mêmes mots ; la phrase juste sur le jeton (voir « La sécurité ») ; les deux façons de brancher l'extension, « Se connecter » et le jeton personnel collé, avec ce que ce jeton ouvre.
- **Ce que le RGPD demande, à valider par le conseil d'Amos :** le responsable du traitement et son contact, les finalités et la base légale, les destinataires (la personne, ses managers en remontant), les sous-traitants et transferts hors UE (hébergement, base, Sentry `next.config.ts:37-45`, le fournisseur du modèle d'IA, l'envoi d'e-mails), la durée de conservation, les droits et comment les exercer, la suppression du compte. Aucun de ces points n'est dans un texte du site aujourd'hui ; `src/components/site/content.ts:23` interdit de promettre le RGPD dans les textes marketing : la page dit des faits, elle ne promet pas.
- **Aligner l'anglais et le français sur la navigation privée :** « Jamais en navigation privée » contre « Pauses in private windows » (`messages/fr.json:1303` et `messages/en.json:1303`, `content.ts:547` et `:1243`), alors que l'extension y est interdite (`wxt.config.ts:13`).

**Tests :** la page répond en EN et en FR ; le lien du pied de page mène à elle ; les clés existent dans les deux langues.

### W18 · Les textes des deux consoles

**Fichiers :** `docs/etudes/extension-store-2026-11/fiches.md` (nouveau).

**Fait quand :** prêts à coller, en anglais et en français :
- **Chrome Web Store :** la description ; le but unique ; la justification de chaque permission (`storage`, `alarms`, `identity`, `claude.ai`, `chatgpt.com`, `leonmemory.com`, et pourquoi un script tourne dans le monde MAIN) ; « pas de code distant » ; les données collectées ; les instructions pour les relecteurs ; la liste des captures d'écran 1280x800 à faire.
- **addons.mozilla.org :** le nom, le résumé, la description, deux catégories au plus, l'e-mail et le site d'assistance, la licence, la politique de confidentialité (le texte ou le lien de /privacy), les notes pour les relecteurs, avec la commande de la notice de W04 (https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).
- **Pour les deux :** le champ « Jeton personnel » dit dans la description et dans les notes pour les relecteurs (P3) ; dans les notes, des repères à remplacer (`ADRESSE`, `MOT_DE_PASSE`), jamais les vrais identifiants du compte de test du geste 14 (`CLAUDE.md:58`).

**Point pour Amos et son conseil :** le site ne nomme jamais claude.ai ni ChatGPT (publicité comparative, `docs/etudes/founder-pme-2026-10/marketing.md:90`), mais les fiches, /privacy et l'écran d'accord doivent dire quels sites sont lus. Le plan ne tranche pas.

## Lot 7 : le site renvoie vers les magasins

**Ce que ça change :** Réglages propose « Ajouter à Chrome » et « Ajouter à Firefox ». **Dépend de :** les publications, les liens des deux fiches (gestes 19 et 20) et le contrôle du geste 21.

### W19 · « Ajouter à Chrome », « Ajouter à Firefox »

**Fichiers :** `src/components/verre/reglages/extension.tsx`, `integrations.tsx:22-31` et `:202-213`, `src/app/(app)/settings/page.tsx:117` et `:151-154`, `messages/en.json`, `messages/fr.json` (`settings`, lignes 838-849 ; `site.connectors.channels.extension`), `src/components/site/pages/connecteurs.tsx`, `README.md:24`, `docs/guides/premier-jet-verification.md:13`.

**Fait quand :** le panneau commence par les deux liens (deux constantes, sans détection du navigateur ; « Ajouter à Firefox » sert aussi Zen), puis « cliquez Se connecter dans l'extension » ; dessous, la demande pour Claude Code, les étapes à la main et l'encart `WXT_PUBLIC_LEON_URL` restent, pour qui construit l'extension (P3) ; la carte Extension de la page Connecteurs porte les mêmes liens. Le README et le guide gardent la construction locale. `WXT_PUBLIC_LEON_URL` reste dans `.env.example:126` : le code la lit et un test l'exige (`src/test/contracts/env-contract.test.ts:49-51`).

**Tests :** les liens sont les adresses des fiches ; aucune clé de message n'est orpheline ; l'ancre `#extension` ouvre toujours le panneau (`settings-tabs.test.ts:7`).

## Ce qui revient à Amos

Des gestes qu'un agent ne peut pas faire, dans l'ordre. Aucune clé d'API n'est demandée : les envois à Mozilla se font à la main.

1. **Maintenant :** relire cette correction ; confirmer ou changer O2 à O6 et P1 à P5 ; choisir les deux `gecko.id` (X2) : celui des magasins ne change plus après le premier envoi (W06).
2. **Au début du lot 1 :** donner son accord pour le témoin dans son Chrome, puis taper et envoyer lui-même les messages de l'étude (W01). Trancher W02 si la porte de sortie s'ouvre.
3. **Maintenant, en parallèle (O6) :** créer le compte Mozilla : sur addons.mozilla.org, « Log in » avec un compte Mozilla (https://extensionworkshop.com/documentation/publish/submitting-an-add-on/), double authentification obligatoire pour publier depuis le 15/03/2021 (https://blog.mozilla.org/addons/2021/03/11/two-factor-authentication-required-for-extension-developers/), puis le Firefox Add-on Distribution Agreement, accepté au premier envoi. Aucun frais n'est cité, mais aucune page ne dit « gratuit ». Recommandation : la même adresse dédiée de leonmemory.com que pour Google (geste 6).
4. **Avant la fusion du lot 2 :** l'essai dans Zen (W05), avec un jeton personnel créé pour Zen seul.
5. **Après la fusion du lot 2 :** envoyer la version non listée, l'installer et coller le jeton (W06).
6. **En parallèle des lots :** choisir le compte Google de publication (O6). Recommandation : une adresse dédiée de leonmemory.com, comme le conseille Google ; l'e-mail du compte ne se change plus ensuite. Sources : https://developer.chrome.com/docs/webstore/set-up-account, https://developer.chrome.com/docs/webstore/register.
7. **Puis :** créer le compte développeur Google : validation en deux étapes, e-mail de contact vérifié, frais d'inscription payés une fois (5 $ selon la note de Google du 30/04/2026, https://developer.chrome.com/docs/extensions/whats-new ; non relu ici), contrat accepté. Source : https://developer.chrome.com/docs/webstore/register.
8. **À la création du compte Google :** la déclaration « commerçant ou non » (DSA, O6), avec son conseil. Un commerçant donne son nom légal, une adresse et un téléphone vérifié par SMS, publiés en bas de la fiche ; seul le compte qui a lancé la vérification peut la finir. Recommandation du cadrage : commerçant, au nom de la société, si Leon vend son service (page Tarifs), avec une ligne professionnelle. Sources : https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure, https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq.
9. **Après la fusion du lot 3 :** un agent construit le zip Chrome (`pnpm ext:zip`) depuis main à jour et vous donne son chemin complet ; créer l'article en brouillon : envoyer ce zip dans la console, **sans le soumettre** ; copier l'identifiant (32 lettres) et la clé publique (onglet Package, « View public key ») ; les donner à l'agent du lot 5 (ce ne sont pas des secrets). Source : https://developer.chrome.com/docs/extensions/reference/manifest/key.
10. **Dans les PR des lots 2, 3 et 6 :** valider le mot à mot des catégories de données de Firefox (lot 2), du texte d'accord (O4) et de la description (lot 3), de /privacy et des textes des deux fiches (lot 6) ; le fond RGPD avec son conseil.
11. **Avant le contrôle en production (W16 b) :** retirer de son Chrome l'extension chargée à la main (`chrome://extensions`, « Supprimer ») : sans `key`, elle a un autre identifiant, et deux Leon capteraient. Un échange envoyé deux fois ne fait pas de doublon (`ingest-turns.ts:29`, `:72`). Garder ses jetons personnels tant qu'une extension s'en sert (celui de Zen, W06) ; révoquer chacun (sa carte, « Révoquer ») dès qu'il ne sert plus, car il ouvre presque toute l'API sans expirer (`require-api-token.ts:27`).
12. **Avant la fusion du lot 5 :** l'essai local W16 a (Chrome, Zen, Edge, Brave, Dia s'il l'a). **Après la fusion et le déploiement des lots 4 et 5 :** le contrôle en production W16 b (Chrome, Zen).
13. **Une fois les lots 1 à 6 fusionnés :** un agent lance `pnpm ext:zip` depuis main à jour, relit les deux `manifest.json` (`identity` présent, aucun `key`, version `1.0.1`, les clés `gecko` du seul zip Firefox) et vous donne le chemin complet des trois fichiers ; vous envoyez le zip Chrome dans l'onglet Package de l'article (« Upload new package », libellé non vérifié). C'est ce zip-là qui part à la relecture (geste 17).
14. **Avant les envois :** créer sur leonmemory.com un compte et un espace de test pour les relecteurs de Google et de Mozilla ; taper l'adresse et le mot de passe seulement dans les instructions pour les relecteurs de chaque console (« Test instructions » chez Google, « Notes for Reviewers » chez Mozilla), jamais dans le dépôt (`fiches.md` n'a que des repères, W18). Sources : https://developer.chrome.com/docs/webstore/publish, https://extensionworkshop.com/documentation/publish/submitting-an-add-on/.
15. **La fiche Chrome :** description EN et FR, icône 128x128, au moins une capture 1280x800 (5 au plus ; un agent peut les préparer), catégorie. Source : https://developer.chrome.com/docs/webstore/cws-dashboard-listing.
16. **L'onglet Privacy de Chrome :** but unique, justification de chaque permission, « No, I am not using remote code », données collectées et certifications, lien vers /privacy (W18). Source : https://developer.chrome.com/docs/webstore/cws-dashboard-privacy.
17. **La distribution et l'envoi chez Google :** visibilité publique (A2), pays ; soumettre à la relecture (le zip du geste 13) en publication différée (case décochée). Garder leonmemory.com en ligne pendant la relecture : un serveur en panne vaut un refus (« Yellow Magnesium »). Sources : https://developer.chrome.com/docs/webstore/cws-dashboard-distribution, https://developer.chrome.com/docs/webstore/troubleshooting, https://developer.chrome.com/docs/webstore/review-process.
18. **Le même jour, chez Mozilla :** dans le même module que la version non listée, envoyer une nouvelle version « On this site » (listée) : le zip Firefox et le zip des sources du geste 13, puis les textes de W18, la politique de confidentialité et le compte de test dans les notes pour les relecteurs ; ensuite, répondre aux relecteurs. Relire avant l'envoi les règles qui changent le 1/12/2026 (https://extensionworkshop.com/documentation/publish/add-on-policies-preview-2026-12/).
19. **Après l'accord de Google :** cliquer « Publier », dans les 30 jours ; donner le lien de l'article pour le lot 7. Source : https://developer.chrome.com/docs/webstore/update.
20. **Après l'accord de Mozilla :** donner le lien de la fiche pour le lot 7 (qu'aucun bouton « Publier » ne soit à cliquer n'est pas vérifié).
21. **Juste après chaque publication :** dans Chrome, supprimer la copie chargée à la main (`chrome://extensions`, « Supprimer » : elle porte la clé du Store, donc le même identifiant), cliquer « Ajouter à Chrome » sur la fiche, puis accepter, se connecter et capter un échange ; dans Zen, passer de la version non listée à la version listée (seul ou depuis la fiche : non vérifié), puis la même suite. Le lot 7 ne part qu'après ce contrôle.
22. **Facultatif :** inviter David comme membre de l'éditeur Google (gratuit, https://developer.chrome.com/docs/webstore/group-publishers) et comme auteur du module chez Mozilla.

## Points des critiques

**Critique du premier cadrage (19/11) :**

| Point | Traité par |
|---|---|
| « Le serveur n'en voit que l'empreinte » est faux | « La sécurité » : il reçoit le jeton en clair à l'échange et à chaque envoi |
| L'argument XSS ne départage pas les approches | « Écartées » et « Le branchement forcé » ; parade O5 |
| Il manquait la confirmation de Chrome | « Ce que la personne verra », étape 2 |
| `_locales` pour une fiche en deux langues | W07 |
| `setAccessLevel` casserait la capture | « Écartées », avec sa raison ; « Risques » |
| La personne sans compte | O5, W14 |
| Le compte et l'espace jamais affichés | O5, W14, W15 |
| La description du manifeste promet claude.ai | W07 (description revue) et A1 |
| Les autres lecteurs des paramètres | X1 (tous cités), W10 |
| `key` dans le zip | O2, X8, W13 |
| Aucun test entre la clé et l'identifiant | W12, W13 |
| Aucun secours si la fenêtre échoue | P3 (le jeton collé reste), W16 |
| Restreindre les sortes de source | X6 |
| L'ordre des lots et les textes du site | W15, dans la PR du lot 5 |
| L'extension déjà installée à la main | Geste 11 |
| /privacy suit le Store, pas le RGPD | W17, avec le conseil d'Amos |

**Critique du second cadrage (19/11 au soir) :**

| Point | Traité par |
|---|---|
| L'onglet ordinaire ne vaut pas O1 « sans rien céder » | « Écartées » (son avantage et ce qu'il perdait), B4, « La sécurité » |
| L'argument contre O1 ne tient que par Safari ; sous Firefox, le retour est une constante | P2, X2, X3 ; Safari hors du chantier (B3) |
| « 1.0.0 partout » bloquerait la version non listée | X8 (les numéros), W06, W13 |
| Le compte Mozilla et la version non listée doivent venir tôt | Lot 2, gestes 3 à 5 |
| « Ce que la personne verra » change selon le navigateur | « Ce que la personne verra », Zen et Firefox |
| Arc de trop dans les essais, Dia plutôt | W16 |
| L'onglet des options fermé pendant la connexion | W14, W16 a |
| Apple : DSA, règles 4.8 et 5.1.1(v), Safari 18, CORS, navigation privée | Hors de ce chantier (B3), pour le jour où l'on y reviendra |
| L'hôte leonmemory.com justifié pour lire l'onglet de retour | Sans objet : l'onglet est écarté (B4) |

## Risques et ce qui n'est pas vérifié

**Risques :**
- **Les relectures :** un nouveau développeur et une extension qui lit les réponses de chatgpt.com et claude.ai : relecture plus longue, refus possible. Chez Google, chaque mise à jour est relue, un correctif urgent compris (https://developer.chrome.com/docs/webstore/review-process, page datée du 10/12/2021). Chez Mozilla, une nouvelle extension listée est relue à la main, sans délai fixe : de quelques heures à plus d'un mois selon le forum (https://discourse.mozilla.org/t/question-about-first-time-add-on-review-duration/148786).
- **Les règles de Mozilla changent le 1/12/2026** (règles et contrat de distribution, préversions publiées, https://extensionworkshop.com/documentation/publish/add-on-policies-preview-2026-12/) : elles valent pour les versions listées et non listées ; on ne les a lues qu'en partie.
- **claude.ai change sans prévenir** (le 19/11 en est la preuve). Un décodage par numéros de champs peut casser du jour au lendemain ; la petite fenêtre le montre (rejet `format`), mais chaque correctif attend deux relectures, Google et Mozilla. La version non listée d'Amos, elle, n'attend que la validation automatique (jusqu'à 24 h).
- **Le lot 1 peut échouer :** alors la publication attend, ou part avec ChatGPT seul (décision d'Amos).
- **La capture n'a jamais tourné hors de Chrome :** le monde MAIN à `document_start` sous la CSP des sites dans Firefox ; le test `event.source` du relais (`extension/lib/bridge.ts:29`) ; les permissions d'hôte que Firefox 127 et plus laisse retirer, sans que le code le vérifie (la capture ou l'envoi s'arrêterait sans un mot). C'est l'objet de W05 ; un contrôle dans la petite fenêtre s'ajoute si l'essai montre qu'il le faut.
- **Mozilla reconstruit l'extension depuis les sources :** une construction qui ne redonne pas le même paquet vaut un refus (W04).
- **Zen :** la fenêtre de connexion s'ouvre sans conteneur, donc peut-être sans la session de la personne ; LibreWolf vide ses données à la fermeture (le jeton aussi ? non vérifié).
- **La lecture par les managers et « Limited Use »** (pas de lecture humaine) : les exemples de Google visent les employés de l'éditeur, pas les managers du client. C'est une interprétation qu'un relecteur peut contester ; l'écran d'accord le dit (`options/index.html:38-39`).
- **Le jeton n'expire pas** et reste en clair dans `storage.local`, lisible du script isolé qui tourne sur les sites captés, pas de la page ni d'une autre extension, comme aujourd'hui. Désinstaller l'extension ne le révoque pas : « Déconnecter » dans Réglages. Un jeton personnel collé ouvre en plus presque toute l'API (voir « La sécurité »).
- **Le branchement forcé et l'hameçonnage du consentement** (une extension malveillante qui ouvre la page avec sa propre empreinte et lit l'adresse de retour dans un onglet) : parades plus haut ; il reste que la personne doit regarder ce qu'elle autorise et ce que l'extension affiche.
- **La clé publique du Store est commitée, et `gecko.id` est public :** n'importe qui peut charger à la main une extension qui porte l'identifiant de Leon. Il faut que la victime l'installe elle-même (mode développeur sous Chrome, `about:debugging` sous Firefox, où elle disparaît au redémarrage) ; la clé est de toute façon lisible dans le paquet publié.
- **Les identifiants sont écrits dans le serveur :** supprimer puis recréer l'article Chrome, ou changer de `gecko.id`, casse la connexion jusqu'à une nouvelle version du serveur.
- **Aucune limite de débit** sur `/computer/authorize` ni sur `POST /api/v1/ordinateurs` (seulement la taille du corps, `computer-routes.ts:53-56`) : inchangé.
- **Arc s'arrête le 22/12/2026** (https://arc.net ; https://arc.net/faq, citée avant, ne porte pas la date). Dia reprend ses extensions, mais aucune page officielle de Dia ne confirme l'installation depuis le Chrome Web Store (https://www.diabrowser.com/changelog).

**Non vérifié :**
- que la fenêtre de `launchWebAuthFlow` suive la redirection d'une action serveur Next vers `chromiumapp.org`, et sous Firefox vers `extensions.allizom.org` (Firefox la guette dans l'activité réseau de la fenêtre et l'annule, `parent/ext-identity.js`, lignes 62-106 ; qu'il l'annule avant d'envoyer la requête à ce domaine de Mozilla n'est pas établi ; sinon le code et l'`etat` y partiraient, sans effet sans le jeton) ;
- que cette fenêtre partage la session de leonmemory.com : sous Chrome, une seule lecture du code de Chromium (https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/extensions/api/identity/web_auth_flow.cc) ; sous Firefox, le code dit cookies et fenêtre ordinaire (`parent/ext-identity.js`, lignes 9-59), pas d'essai ; et que Google, Microsoft, le SSO et la double authentification y marchent ;
- que Zen garde `launchWebAuthFlow` tel quel et la préférence `extensions.webextensions.identity.redirectDomain` à sa valeur par défaut (P2 en dépend), et qu'il annonce la version de Firefox pour `strict_min_version` ;
- qu'un clic sur « J'accepte » suffise à ouvrir la fenêtre après l'écriture de l'accord (la doc demande un lancement « initiated by UI », sans parler de geste) ;
- Brave (son réglage « Allow Google login for extensions » toucherait `chrome.identity`, https://github.com/brave/brave-browser/wiki/Allow-Google-login---Third-Parties-and-Extensions), Edge en vrai (https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support dit que `launchWebAuthFlow` est pris en charge), Dia, Vivaldi, Comet et Opera ;
- ce que fait le Store d'un manifeste avec `key` : seulement des témoignages de forum (https://groups.google.com/a/chromium.org/g/chromium-extensions/c/x_NBS6_-NKs) ; on le retire du zip ;
- le calcul de l'identifiant Chrome à partir de la clé (W12) : celui de Chromium, sans page officielle ;
- le mot à mot des confirmations de Chrome et de Firefox à l'installation, que la permission `identity` n'ajoute rien à celle de Firefox, et qu'un module temporaire montre l'écran de données ;
- les catégories de données justes pour Leon (`personalCommunications`, `websiteContent`, `authenticationInfo` ?) : la page de Mozilla ne donne pas d'exemple d'extension qui capte des conversations d'IA ;
- que Zen passe seul de la version non listée à la version listée, et que Mozilla publie la version listée sans geste de plus ;
- les frais du compte Mozilla (aucune page ne dit « gratuit ») et le texte complet des règles du 1/12/2026 ;
- que la construction depuis le zip des sources redonne le même paquet, avec pnpm, chez les relecteurs de Mozilla ;
- que Dia installe depuis le Chrome Web Store, et qu'Edge montre encore sa fenêtre « autoriser les extensions d'autres magasins » ;
- l'outil qui fera les PNG et leur lisibilité à 16 px ;
- les conditions d'utilisation de claude.ai sur la lecture de son protocole interne ;
- les frais de 5 $ chez Google (repris du cadrage) ;
- le nom de la contrainte CHECK de 0049 en base ;
- qu'une variable du shell l'emporte sur `.env.local` pour `pnpm ext:zip` ;
- qu'un brouillon jamais soumis compte comme version précédente chez Google (la version monte quand même, W13), et le libellé « Upload new package » de la console ;
- rien n'a été lancé pour écrire ce plan ni sa correction : ni serveur, ni build, ni navigateur, ni extension. Les citations `chemin:ligne` ont été relues sur main (18d68ebd), après la PR #210 ; celles ajoutées ou gardées près d'un passage modifié le 20/11, sur a2cb103d.

## Sources

Relues le 19/11 pour ce plan : https://connectrpc.com/docs/protocol, https://protobuf.dev/programming-guides/encoding/, https://developer.chrome.com/docs/extensions/reference/api/identity, https://developer.chrome.com/docs/extensions/reference/manifest/key, https://developer.chrome.com/docs/extensions/reference/api/i18n, https://developer.chrome.com/docs/webstore/cws-dashboard-listing, https://developer.chrome.com/docs/webstore/prepare (la phrase sur la version).

Relues le 20/11 pour la correction : https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/child/ext-identity.js, https://github.com/mozilla-firefox/firefox/blob/main/toolkit/components/extensions/parent/ext-identity.js, https://github.com/mozilla-firefox/firefox/blob/main/modules/libpref/init/all.js (ligne 3112), https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/, https://extensionworkshop.com/documentation/publish/signing-and-distribution-overview/, https://extensionworkshop.com/documentation/publish/source-code-submission/, https://extensionworkshop.com/documentation/publish/submitting-an-add-on/, https://extensionworkshop.com/documentation/publish/add-on-policies-preview-2026-12/ (le titre et le sommaire seulement).

Reprises des cadrages, non relues ici :
- Extensions : https://developer.chrome.com/docs/extensions/reference/permissions-list, https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings, https://developer.chrome.com/docs/extensions/reference/manifest/icons, https://developer.chrome.com/docs/extensions/reference/manifest/version, https://developer.chrome.com/docs/extensions/reference/api/storage, https://developer.chrome.com/docs/extensions/whats-new.
- Store : https://developer.chrome.com/docs/webstore/register, https://developer.chrome.com/docs/webstore/set-up-account, https://developer.chrome.com/docs/webstore/publish, https://developer.chrome.com/docs/webstore/cws-dashboard-privacy, https://developer.chrome.com/docs/webstore/cws-dashboard-distribution, https://developer.chrome.com/docs/webstore/review-process, https://developer.chrome.com/docs/webstore/troubleshooting, https://developer.chrome.com/docs/webstore/update, https://developer.chrome.com/docs/webstore/group-publishers, https://developer.chrome.com/docs/webstore/using-api.
- Règles : https://developer.chrome.com/docs/webstore/program-policies/policies, https://developer.chrome.com/docs/webstore/program-policies/user-data-faq, https://developer.chrome.com/docs/webstore/program-policies/limited-use, https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements, https://developer.chrome.com/docs/webstore/program-policies/trader-disclosure, https://developer.chrome.com/docs/webstore/program-policies/trader-verification-faq, https://developer.chrome.com/blog/cws-policy-updates-2026.
- Firefox et Zen : https://zen-browser.app/release-notes, https://docs.zen-browser.app/user-manual/extensions, https://github.com/zen-browser/desktop/discussions/8961, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings, https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background, https://extensionworkshop.com/documentation/develop/manifest-v3-migration-guide/, https://github.com/mdn/browser-compat-data/blob/main/webextensions/manifest/externally_connectable.json, https://blog.mozilla.org/addons/2021/03/11/two-factor-authentication-required-for-extension-developers/, https://discourse.mozilla.org/t/question-about-first-time-add-on-review-duration/148786, https://discourse.mozilla.org/t/mixing-listed-and-unlisted-add-ons/13968.
- Safari (hors chantier) : https://developer.apple.com/documentation/safariservices/assessing-your-safari-web-extension-s-browser-compatibility, https://developer.apple.com/support/enrollment/, https://developer.apple.com/distribute/app-review/, https://bugs.webkit.org/show_bug.cgi?id=320812.
- Autres navigateurs et protocoles : https://support.microsoft.com/en-us/microsoft-edge/add-turn-off-or-remove-extensions-in-microsoft-edge-9c0ec68c-2fbc-2f2c-9ff0-bdc76f46b026, https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/api-support, https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/alternate-distribution-options, https://github.com/brave/brave-browser/wiki/Allow-Google-login---Third-Parties-and-Extensions, https://arc.net, https://www.diabrowser.com/changelog, https://www.rfc-editor.org/rfc/rfc8628, https://chromium.googlesource.com/chromium/src/+/HEAD/chrome/browser/extensions/api/identity/web_auth_flow.cc, https://groups.google.com/a/chromium.org/g/chromium-extensions/c/x_NBS6_-NKs.
