# Onboarding, lots 3 à 5 : vos outils, les réponses mises au travail, « About you » pré-rempli — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**But :** finir l'onboarding de la spec, en une PR.
- **Lot 3, l'étape 2 « Your tools ».** Les outils conseillés pour le service et la règle des outils déjà branchés. « Connect my account ». Le retour sur l'étape après un branchement. Avec elle, le fil d'étapes et l'écran de fin « You're in ».
- **Lot 4, les réponses mises au travail :**
  - deux exemples de questions sur le Chat vide ;
  - le poste et le niveau dans le point du matin ;
  - les outils conseillés en tête de Connexions.
- **Lot 5, « About you » pré-rempli.** Un texte écrit à partir des seules sources de la personne, proposé une fois en carte en haut du Chat.

**Architecture :**
- L'étape 2 est une page `/bienvenue/outils` et l'écran de fin `/bienvenue/pret`, à côté de `/bienvenue/collaborateurs` (lot 2), dans le groupe `(onboarding)`.
- On ne réécrit aucun flux de branchement : l'étape 2 ouvre le `ToolDialog` de Connexions. Le retour après OAuth ou Pipedream passe par le cookie `leon_oauth`, avec une adresse de retour choisie dans une liste fermée.
- La proposition « About you » est une table, `about_suggestions`, sur le modèle de `briefings`. Elle est écrite par une file pg-boss que lance le passage quotidien de 6 h du point du matin. Le modèle reçoit seulement les sources que la personne a branchées elle-même.

**Technologies :** Next.js 16 (App Router, server actions), React 19, Better Auth 1.7.7, Hono (routes `/api`), Drizzle, Postgres (RLS), pg-boss, next-intl, zod 4.6, Vitest (`unit`, `db`), Biome.

**Spec :** `docs/specs/2026-10-28-onboarding.md` (sections « Étape 2 », « Fin », « Plus tard : About you pré-rempli », « Ce que deviennent les réponses », « Ce qui reste au bâtisseur »). Textes exacts dans l'objet `T` de `docs/specs/2026-10-28-onboarding-maquette.html` :
- étapes : `ownerSteps`, `inviteeSteps` ;
- étape 2 : `s2Title` à `ownHint` (lignes 198-203 en anglais, 230-235 en français) ;
- fin : `doneTitle`, `doneLead`, `openChat`, `pvBig`, `invBig` ;
- « About you » : `laterTitle` à `fromNote` (lignes 212-215 et 244-247) ;
- `continue`.

## Choix pris pour ce plan (la spec ne tranche pas, à relire par Amos dans la PR)

1. **Qui voit l'étape 2.** La spec le fixe pour les propriétaires existants : « Pas d'étapes 2 et 3 ». Donc, après l'étape 1 :
   - un propriétaire seul passe par les étapes 2 et 3 ;
   - un propriétaire qui a déjà une équipe va dans l'appli, comme au lot 2 ;
   - un membre ou un administrateur passe par l'étape 2.
   Ceux qui ont validé l'étape 1 avant ce lot ne la voient pas, sauf en tapant l'adresse.
2. **Le parcours :**
   - propriétaire seul : étape 1, puis 2, puis 3, puis la fin ;
   - membre ou administrateur : étape 1, puis 2, puis la fin ;
   - propriétaire avec une équipe : étape 1, puis l'appli.
   La fin est `/bienvenue/pret` : « You're in », puis « Open Chat » vers `/discussions`.
3. **Le fil d'étapes** reprend la maquette :
   - *About you · Your tools · Teammates* pour un propriétaire seul ;
   - *About you · Your tools* pour un membre ;
   - rien pour un propriétaire qui a une équipe (une seule étape).
   Le bouton principal de la dernière étape dit « Enter Leon », les autres « Continue ».
4. **« Connected by X »** : un outil d'équipe (pas Gmail, Outlook, Drive ni Slack) branché par un membre encore présent, dont la connexion n'est pas en erreur. Une connexion en pause compte. Une connexion d'un ancien membre ou en erreur ne compte pas : l'outil reste à brancher.
5. **Deux retours restent sur Connexions** :
   - l'installation de l'appli GitHub, dont le retour est l'adresse fixe de l'appli. Quand l'appli est configurée, c'est le cas de tout premier branchement GitHub, l'outil le plus conseillé en Dev et en Data : à signaler dans la PR ;
   - le consentement administrateur d'Outlook, qui revient sans cookie.
   Une erreur détectée avant la lecture du formulaire renvoie aussi sur Connexions. Une erreur détectée après revient sur l'adresse demandée.
6. **Connexions, « Recommended for your role »** : seulement les outils conseillés qu'il reste à brancher pour la personne, selon la règle du choix 4. Ceux déjà branchés restent dans la section « Connected », comme aujourd'hui.
7. **Les exemples de questions** n'apparaissent que tant que la personne n'a aucune discussion, et seulement si son service est connu. Un clic remplit le champ sans envoyer.
8. **Le point du matin** reçoit le service, le poste et le niveau comme identifiants dans une balise `<poste …/>`, à côté de `<a-propos>`. Un changement de poste marque les points périmés, comme `saveAbout`. Cela vaut pour l'étape 1 du propriétaire et pour la modification par un administrateur, pas pour l'arrivée d'un invité.
9. **« About you » pré-rempli :**
   - **Qui.** Une personne qui remplit toutes ces conditions :
     - elle a validé l'étape 1 ;
     - son compte n'est pas supprimé ;
     - son champ « À propos » est vide ;
     - elle n'a jamais reçu de proposition ;
     - elle a au moins 20 sources venues de ses propres connexions ;
     - elle a créé une connexion il y a au moins un jour, déjà relevée au moins une fois.
   - **Le texte.** Il décrit la personne comme elle le ferait elle-même, sans « vous », à la manière de l'exemple de la maquette. Texte brut, sans Markdown, sans renvoi `[n]`. Les numéros de PR ou de ticket sont permis.
   - **Quand.** Vérifié chaque matin, au passage de 6 h du point du matin.
   - **À partir de quoi.**
     - Ses propres sources seulement : `owner_user_id` = elle, outils de `PROVIDER_IDS`, lues sous ses droits.
     - Son poste, son service et son niveau, qu'elle voit déjà.
     - Ni les sources d'équipe branchées par d'autres, ni les conversations avec les assistants.
   - **Langue.** Celle de ses sources, comme le point du matin : le processus de fond ne connaît pas le cookie de langue.
   - **Coût.** Compté sous l'étape `point` (même modèle et même réglage que le point du matin).
   - **Une seule fois.**
     - « Save » enregistre par `saveAbout` et ferme la carte.
     - « Not now » la ferme pour de bon.
     - Si la personne remplit « À propos » ailleurs entre-temps, la carte ne s'affiche plus.
   - **Suppression du compte.** La proposition est effacée avec le reste, comme `about`.

## Contraintes globales

- **Langue :** anglais par défaut ; tout texte d'interface dans `messages/en.json` et `messages/fr.json`, sans exception ; vouvoiement en français ; apostrophes typographiques (’) ; `src/i18n/messages.test.ts` vérifie la parité.
- **Vocabulaire :** « Department » / « Service », « Role » / « Poste », « Teammates » / « Collaborateurs » ; « Team » / « Équipe » reste réservé aux membres de l'espace.
- **Stockage :** des identifiants, jamais des libellés ; un identifiant inconnu s'affiche « Other » / « Autre ».
- **Droits :**
  - aucun droit de lecture ne change sur `sources`, `turns` et `passages` ;
  - la proposition « About you » ne lit que sous `withTenant(ctx)` de la personne, avec le filtre `owner_user_id` en plus de la RLS ;
  - elle n'envoie rien au modèle qui ne soit à elle.
- **Pas de boucle :** les pages `(onboarding)` lisent `getSession()` et `getUserContext()`, jamais `requireUserContext()`.
- **Frontière de confiance :**
  - toute action analyse tout son argument avec un seul schéma zod ;
  - l'adresse de retour OAuth est comparée à une liste fermée, jamais suivie telle quelle.
- **Erreurs :** des codes, traduits à l'affichage.
- **Formulaires avec des listes Radix :** jamais `<form action={…}>`.
- **Migration :** `0045-apropos-propose.sql` (main en est à 0044 au 2/11).
- **Base de départ :** `origin/main` à `97dd82f` (lot 2 fusionné) ou plus récent.
- **Git :**
  - branche `amos/onboarding-lots-3-5` ;
  - le plan est le premier commit ;
  - fichiers ajoutés un par un ;
  - messages de commit en français, terminés par la ligne `Co-Authored-By` ;
  - une seule PR.
- **Base de test :** `LEON_TEST_DATABASE=leon_test_onboarding` (la suite migre 0045 toute seule). Les commandes Postgres sortent de la sandbox.

## Points à surveiller à la relecture

1. **Une adresse de retour forgée** (`https://ailleurs`, `//ailleurs`, `/bienvenue/outils/../x`, absente) n'est jamais suivie : retour sur `/connexions`. Testé à la tâche 1.
2. **La règle « déjà branché ».**
   - Le Gmail d'un collègue ne compte pas pour moi.
   - Le GitHub d'un ancien membre ou en erreur ne compte pas non plus.
   - Le Linear d'un collègue présent s'affiche « Connected by ».
   Testé aux tâches 2 et 6.
3. **La proposition « About you » ne voit jamais les sources des autres.**
   - Une source d'équipe branchée par un collègue est visible par la RLS, mais pas à elle : exclue.
   - Une source privée d'un autre est cachée par la RLS.
   - Une conversation `claude_code` est exclue.
   Testé à la tâche 7.
4. **Texte trop long, deuxième passage, pas de modèle.**
   - Un texte de 900 caractères est coupé à 500.
   - Un deuxième passage n'appelle pas le modèle et n'écrit rien.
   - Sans clé de modèle, rien n'est écrit et le travail ne retente pas en boucle.
   Testé aux tâches 7 et 8.
5. **Un administrateur qui change le poste d'un autre** marque les points de cette personne, pas les siens. Testé à la tâche 5.

---

### Tâche 1 : revenir sur l'étape 2 après un branchement

**Fichiers :**
- Modifier : `src/lib/connection-form.ts` (liste des retours)
- Modifier : `src/server/connectors/oauth-cookie.ts` et `oauth-cookie.test.ts`
- Modifier : `src/server/connectors/oauth-routes.ts` et `oauth-routes.db.test.ts`
- Modifier : `src/components/verre/connexions/tool-dialog.tsx` (prop `returnTo`)

**Interfaces :**
- Produit (tâche 2) :
  - `export const OAUTH_RETURN_PATHS = ['/connexions', '/bienvenue/outils'] as const` et `type OAuthReturnPath` dans `connection-form.ts`, qui reste lisible côté client ;
  - `isOAuthReturnPath(value: unknown): value is OAuthReturnPath` (égalité exacte avec une entrée) ;
  - `ToolDialog` gagne `returnTo?: OAuthReturnPath`. Quand il est fourni, le formulaire OAuth ou Pipedream et celui de reconnexion postent un champ caché `retour` avec cette valeur.
- `OAuthPending` gagne `returnTo?: OAuthReturnPath`, et `PendingSchema` le même champ en `.optional()`, validé par `z.enum(OAUTH_RETURN_PATHS)`.

Les routes :
- **`startHandler` et `pipedreamStart`** lisent `retour` dans le formulaire déjà analysé. Ils le rangent dans le cookie seulement si `isOAuthReturnPath` l'accepte ; une autre valeur est ignorée en silence.
- **`returnHandler` et `pipedreamReturnHandler`** remplacent l'aide `connexions(params)` par une aide qui prend `pending?.returnTo ?? '/connexions'`, puis la même requête (`?branche=…` ou `?erreur=…&outil=…`). Sans cookie lisible : `/connexions`, comme aujourd'hui.
- **Les erreurs détectées après la lecture du formulaire** reviennent aussi sur le `retour` validé : `champs` (`oauth-routes.ts` vers les lignes 181 et 217) et l'`indisponible` de Pipedream (vers la ligne 249).
- Les autres redirections ne changent pas : `nextStep` de GitHub et les erreurs avant la lecture du formulaire (choix 5).
- `redirectUri` ne change pas : les fournisseurs l'ont enregistrée, et `oauth-guide.test.ts` la vérifie.

- [ ] **Étape 1 : écrire les tests qui échouent**
  - `connection-form.test.ts` : `isOAuthReturnPath` accepte les deux entrées et refuse `'https://ailleurs'`, `'//ailleurs'`, `'/bienvenue/outils/'`, `'/bienvenue/outils?x=1'`, `undefined`.
  - `oauth-cookie.test.ts` :
    - un aller-retour avec `returnTo: '/bienvenue/outils'` est égal ;
    - un cookie signé dont `returnTo` vaut `'https://ailleurs'` s'ouvre à `null`.
  - `oauth-routes.db.test.ts`, avec les aides `start(...)` et `back(...)` du fichier :
    - un départ GitHub avec `retour=/bienvenue/outils`, puis un retour réussi, donne `Location: /bienvenue/outils?branche=github` ;
    - un échec (`error=access_denied`) donne `/bienvenue/outils?erreur=annule&outil=github` ;
    - `retour=https://ailleurs`, `retour=//ailleurs` et `retour=/bienvenue/outils/../x` donnent `/connexions?branche=github` ;
    - Pipedream (Gmail) avec `retour=/bienvenue/outils` donne `/bienvenue/outils?branche=gmail` ;
    - une erreur `champs` avec `retour=/bienvenue/outils` revient sur `/bienvenue/outils?erreur=champs&outil=…`.
  - Les attentes existantes restent sans changement.
- [ ] **Étape 2 : les voir échouer**
  `LEON_TEST_DATABASE=leon_test_onboarding pnpm vitest run --project db src/server/connectors/oauth-routes.db.test.ts` (hors sandbox), puis `pnpm vitest run --project unit src/server/connectors/oauth-cookie.test.ts src/lib/connection-form.test.ts`.
- [ ] **Étape 3 : écrire la liste, le cookie, les routes et la prop `returnTo`**
- [ ] **Étape 4 : relancer ces tests, plus `oauth-guide.test.ts`, `route-guards.db.test.ts` et le typage**
- [ ] **Étape 5 : commiter**, message « Connexions : revenir sur l’étape Vos outils après un branchement »

---

### Tâche 2 : l'étape 2 et l'écran de fin

**Fichiers :**
- Créer : `src/app/(onboarding)/bienvenue/outils/page.tsx` et `page.test.ts`
- Créer : `src/app/(onboarding)/bienvenue/pret/page.tsx` et `page.test.ts`
- Créer : `src/components/verre/onboarding/tools-step.tsx` (client)
- Créer : `src/components/verre/onboarding/tools-model.ts` et `tools-model.test.ts` (pur)
- Modifier : `messages/en.json`, `messages/fr.json` (`onboarding.tools.*`, `onboarding.done.*`)

**Interfaces :**
- Utilise :
  - `ToolDialog` avec `returnTo`, et `OAuthReturnPath` (tâche 1) ;
  - `ReturnNotice` de `src/components/verre/connexions/index.tsx`, à exporter (ou à déplacer dans `parts.tsx`) ;
  - `listCatalog`, `CatalogItem` (`server/connectors/catalog.ts`) ;
  - `listConnections`, `ConnectionView` (`server/connectors/connections.ts`) ;
  - `oauthNotice` ;
  - `connectorsKey` ;
  - `readOnboardingMember`, `spaceRole`, `isSoleMember` ;
  - `DEPARTMENTS`, `isDepartment` ;
  - `PROVIDER_FAMILIES_ORDER` ;
  - `ToolIcon`.
- Produit :
  - `type ToolState = { item: CatalogItem; recommended: boolean; status: 'mine' | 'team' | 'free'; connectedBy: string | null }` ;
  - `toolStates(catalog: CatalogItem[], conns: ConnectionView[], recommended: readonly ProviderId[]): ToolState[]`, dans `tools-model.ts`, pur :
    - `connectedBy` : pour un outil sans `privateRaw`, le nom du premier membre présent (`!creatorLeft`), autre que moi, dont la connexion n'est pas en erreur (en pause compte) ; sinon `null` ;
    - `mine` : une connexion du lecteur (`isCreator`) pour l'outil ;
    - `team` : pas `mine`, et `connectedBy` non nul ;
    - `free` : tout le reste ;
    - l'ordre est celui du catalogue ;
  - `nextAfterTools(isSoleOwner: boolean): '/bienvenue/collaborateurs' | '/bienvenue/pret'`, dans le même fichier ;
  - `ToolsStep(props: { states: ToolState[]; conns: ConnectionView[]; viewerId: string; now: Date; canConnect: boolean; consentUrl: string | null; nextHref: '/bienvenue/collaborateurs' | '/bienvenue/pret'; notice: ReturnType<typeof oauthNotice> | null })`. `now` sert à `ToolDialog`. `consentUrl` est calculé comme dans `connexions/page.tsx`, pour qu'un retour Outlook `erreur=admin` montre le lien de consentement. Le fil d'étapes est ajouté par la tâche 3, ne pas l'anticiper.

**La page `/bienvenue/outils`** (serveur, gardes du modèle de `collaborateurs/page.tsx`) :
1. Sans session : `/connexion`.
2. Sans espace : `/bienvenue`.
3. Membre introuvable : `/`.
4. `onboardedAt` nul : `/bienvenue`.
5. Données :
   - les conseillés sont `DEPARTMENTS[dept].tools` si `isDepartment`, sinon `[]` ;
   - `listCatalog(await getLocale())` ;
   - `listConnections(ctx)` ;
   - `oauthNotice(await searchParams, locale)` ;
   - `canConnect = connectorsKey() !== null` ;
   - `nextHref = nextAfterTools(spaceRole(role) === 'owner' && await isSoleMember(ctx))`.
6. `generateMetadata` : `onboarding.tools.title`.

**L'écran** reprend le layout des étapes 1 et 3 : formulaire à gauche, aperçu à droite au-dessus de 1024 px.
- Titre `s2Title` et chapeau `s2Lead`.
- **Les familles** dans l'ordre `PROVIDER_FAMILIES_ORDER`, avec leurs libellés `connections.family.<id>`. Chaque outil disponible est une tuile à cocher (`aria-pressed`, logo `ToolIcon`, nom).
  - Un outil conseillé porte « Recommended » et part coché, sauf s'il est `mine` ou `team`.
  - Un outil `mine` porte « Connected » et ne se coche pas.
  - Un outil `team` porte « Connected by {name} » et ne se coche pas.
- **L'aperçu :**
  - « To connect » : les outils cochés qui sont `free`, chacun avec « Connect », qui ouvre `ToolDialog` avec `returnTo="/bienvenue/outils"` et `conns=[]` (le lecteur n'en a aucune pour ces outils). Sans outil coché : « Nothing selected yet. » ;
  - « Already connected for your workspace » : les outils conseillés dont `connectedBy` n'est pas nul, avec « Connected by {name} ». Si l'outil est aussi `mine` : « Your account is connected » (`ownConnected`). Sinon : un bouton secondaire « Connect my account » (`ToolDialog` avec `conns=[]` et `returnTo`) et la note `ownHint` ;
  - « What happens next » : `nextText`.
- `ReturnNotice` quand `notice` est là. Après la fermeture d'une fenêtre de branchement par clé, `router.refresh()` met l'écran à jour.
- **Les sorties :** le bouton principal et « I’ll connect them later » (lien discret) mènent à `nextHref`. Le bouton dit « Continue » si `nextHref` est l'étape 3, « Enter Leon » (`onboarding.teammates.enter`) si c'est la fin.
- Les choix cochés restent dans l'état du composant (rien en base).

**La page `/bienvenue/pret`** (serveur, mêmes gardes 1 à 4) :
- `doneTitle`, `doneLead` et le bouton « Open Chat » vers `/discussions` ;
- l'aperçu à droite : `pvBig` pour un propriétaire, `invBig` pour un membre.

Messages :
- `onboarding.tools.*` : `title`, `lead`, `recommended`, `toConnect`, `connect`, `connected`, `none`, `nextTitle`, `nextText`, `skip`, `connectedBy` (avec `{name}`), `alreadyTitle`, `connectOwn`, `ownConnected`, `ownHint` ;
- `onboarding.done.*` : `title`, `lead`, `openChat`, `ownerReady` (`pvBig`), `memberReady` (`invBig`).
Textes de la maquette, `T.en` / `T.fr`.

- [ ] **Étape 1 : écrire les tests qui échouent**
  - `tools-model.test.ts` :
    - le Gmail d'un collègue reste `free` pour moi ;
    - le GitHub d'un collègue présent est `team` avec son nom ;
    - le GitHub d'un ancien membre (`creatorLeft`) est `free` ;
    - le Linear d'un collègue en `error` est `free` ;
    - mon Notion est `mine` ;
    - un GitHub à moi et à un collègue est `mine`, avec `connectedBy` = le collègue ;
    - le Jira en pause d'un collègue est `team` ;
    - `recommended` suit la liste ;
    - `nextAfterTools(true|false)`.
  - `outils/page.test.ts` et `pret/page.test.ts`, sur le modèle de `collaborateurs/page.test.ts` : les quatre gardes, et le rendu avec les bonnes props. Mocker les composants clients et les modules serveur.
- [ ] **Étape 2 : les voir échouer** : `pnpm vitest run --project unit "src/app/(onboarding)" src/components/verre/onboarding`
- [ ] **Étape 3 : écrire le modèle, les deux pages, `ToolsStep` et les messages**
- [ ] **Étape 4 : typage, lint, tests, messages, contrats** : `pnpm typecheck && pnpm biome check src messages && pnpm vitest run --project unit "src/app/(onboarding)" src/components src/i18n src/test/contracts`
- [ ] **Étape 5 : commiter**, message « Onboarding : l’étape Vos outils et l’écran de fin »

---

### Tâche 3 : le fil d'étapes et le parcours complet

**Fichiers :**
- Créer : `src/components/verre/onboarding/steps.tsx`
- Modifier :
  - `src/lib/onboarding.ts` (étapes) et `onboarding.test.ts` ;
  - `src/app/(onboarding)/bienvenue/actions.ts` et `actions.test.ts` (redirection après l'étape 1) ;
  - `src/components/verre/onboarding/about-step.tsx`, `tools-step.tsx`, `teammates-step.tsx` (fil d'étapes, et sorties de l'étape 3) ;
  - les pages `bienvenue`, `outils` et `collaborateurs` (elles passent les étapes) ;
  - leurs tests qui comparent les props exactement : `collaborateurs/page.test.ts` et `outils/page.test.ts` (tâche 2) gagnent `steps` ;
- Modifier : `messages/en.json`, `messages/fr.json` (`onboarding.steps.*`)

**Interfaces :**
- `type OnboardingStepId = 'about' | 'tools' | 'teammates'` et `onboardingSteps(path: 'soleOwner' | 'member' | 'ownerWithTeam'): OnboardingStepId[]` dans `src/lib/onboarding.ts` : `['about','tools','teammates']`, `['about','tools']` ou `['about']`.
- `OnboardingSteps({ steps: OnboardingStepId[]; current: OnboardingStepId })` : une liste ordonnée, l'étape en cours avec `aria-current="step"`, les étapes passées marquées faites. Elle ne s'affiche pas quand il n'y a qu'une étape. Elle tient à 375 px sans défilement.
- Les trois composants d'étape gagnent `steps: OnboardingStepId[]`.

Ce qui change :
- **`completeAboutStepAction`** (choix 1) :
  - un propriétaire seul, nouveau venu compris, va sur `/bienvenue/outils` au lieu de `/bienvenue/collaborateurs` ;
  - un propriétaire qui a une équipe va toujours sur `/` ;
  - un membre ou un administrateur va sur `/bienvenue/outils` au lieu de `/`.
  `isSoleMember` reste appelé, pour le propriétaire seulement. Toutes les redirections restent des littéraux, pour le contrat `page-links`.
- **Étape 3** : « Enter Leon », « I’ll invite people later » et « Leave anyway » mènent à `/bienvenue/pret` au lieu de `/`.
- **Les pages calculent `steps`** :
  - `/bienvenue` : nouveau venu `'soleOwner'` ; propriétaire `'soleOwner'` ou `'ownerWithTeam'` selon `isSoleMember` ; membre `'member'` ;
  - `/bienvenue/outils` : `'soleOwner'` pour un propriétaire seul, `'member'` sinon ;
  - `/bienvenue/collaborateurs` : `'soleOwner'`.
- Messages : `onboarding.steps.about`, `.tools`, `.teammates` (`ownerSteps` de la maquette : « About you / Your tools / Teammates », « Vous / Vos outils / Collaborateurs »).

- [ ] **Étape 1 : écrire les tests qui échouent**
  - `onboarding.test.ts` : `onboardingSteps` pour les trois chemins.
  - `bienvenue/actions.test.ts`, chaque redirection vérifiée exactement avec `toHaveBeenLastCalledWith` :
    - propriétaire seul et nouveau venu : `/bienvenue/outils` ;
    - propriétaire avec une équipe : `/` ;
    - membre et administrateur : `/bienvenue/outils`.
    Les cas « étape déjà validée » (vers les lignes 261-277) gardent `/`.
  - `collaborateurs/page.test.ts` et `outils/page.test.ts` : les props attendues gagnent `steps`.
- [ ] **Étape 2 : les voir échouer**
- [ ] **Étape 3 : écrire `onboardingSteps`, `OnboardingSteps`, les branchements et les messages**
- [ ] **Étape 4 : typage, lint et tests** (mêmes commandes que la tâche 2). `page-links` voit `redirect('/bienvenue/outils')` et les liens vers `/bienvenue/pret`.
- [ ] **Étape 5 : commiter**, message « Onboarding : le fil d’étapes et le parcours jusqu’à l’écran de fin »

---

### Tâche 4 : les exemples de questions sur le Chat vide

**Fichiers :**
- Modifier : `src/app/(app)/discussions/page.tsx`, `src/components/discussion/new-discussion-form.tsx`
- Modifier : `messages/en.json`, `messages/fr.json` (`discussions.examplesLabel`)

**Interfaces :** `NewDiscussionForm({ disabled, examples }: { disabled: boolean; examples?: string[] })`.

Ce qui change :
- **La page** lit `readOnboardingMember(ctx)` avec `listDiscussions`. Quand la personne n'a aucune discussion et que son service est connu (`member?.department` non nul, puis `isDepartment`, qui prend une chaîne) :
  - elle construit `examples` avec `getTranslations('onboarding')` : `asks.<dept>.one` et `.two` ;
  - elle le passe au formulaire.
- **Le formulaire** affiche, sous le champ, le libellé `discussions.examplesLabel` (« Try asking » / « Essayez par exemple ») et une `Pill` par exemple.
  - Un clic fait `setQuestion(texte)` puis met le focus dans le champ (une `ref` sur le `Textarea`). Rien n'est envoyé.
  - Rien ne s'affiche si `disabled` (pas de modèle) ou sans exemples.

- [ ] **Étape 1 : écrire les messages, la page et le formulaire**
- [ ] **Étape 2 : typage, lint, messages, contrats** : `pnpm typecheck && pnpm biome check src messages && pnpm vitest run --project unit src/i18n src/test/contracts`
- [ ] **Étape 3 : commiter**, message « Chat : deux exemples de questions selon le service, tant qu’il est vide »

L'essai dans le navigateur est fait par le contrôleur : un clic remplit sans envoyer, et rien ne s'affiche dès qu'une discussion existe.

---

### Tâche 5 : le poste dans le point du matin

**Fichiers :**
- Modifier : `src/server/briefing/briefing-prompt.ts` et `briefing-prompt.test.ts`
- Modifier : `src/server/briefing/briefings.ts` et `briefings.db.test.ts`
- Modifier : `src/server/briefing/about.ts` (aide partagée)
- Modifier : `src/server/auth/onboarding.ts` et `onboarding.db.test.ts`
- Modifier : `src/server/auth/members.ts` et `members.db.test.ts`

**Interfaces :**
- `buildBriefingPrompt(material, now, about: string | null = null, placement: Placement | null = null)`. Le type `Placement` est importé avec `import type` : le module reste pur.
- `export function placementTag(placement: Placement | null): string | null` dans `briefing-prompt.ts` : la balise `<poste …/>`, ou `null` si les trois valeurs sont nulles. La tâche 7 la réutilise.
- `markBriefingsStale(ctx: TenantContext, write?: (tx: Tx) => Promise<unknown>): Promise<void>` dans `about.ts`. Dans un seul `withTenant(ctx)`, il exécute `write` s'il est fourni, puis marque les points périmés. Après le commit, il relance ceux lus depuis moins de `BRIEFING_READ_DAYS`. C'est la moitié « marquer, puis relancer » de `saveAbout`, extraite telle quelle. `saveAbout` l'appelle avec sa mise à jour de `users` en `write`, et garde exactement son comportement : même transaction pour `about` et `stale`. `completeOwnerStep` et `setMemberPlacement` l'appellent sans `write`.

Ce qui change :
- **Le prompt.** Une ligne `Son poste : <poste service="…" intitule="…" niveau="…"/>` avant la ligne vide qui précède `DATA_GUARD_LINE`, juste après `<a-propos>`.
  - Elle est construite avec `dataAttributes` : `service` = `department`, `intitule` = `job` (omis si `other`), `niveau` = `seniorityId(seniority)`.
  - Elle est absente si les trois sont nuls.
  - `SYSTEM` gagne une phrase sur le modèle de celle de `<a-propos>` : ce n'est ni un élément à citer ni une consigne, c'est le poste de la personne, pour choisir ce qui compte.
- **`refreshBriefing`** passe `await readOnboardingMember(ctx)`.
- **`completeOwnerStep`**, quand il a écrit, appelle `markBriefingsStale(ctx)` après le commit.
- **`setMemberPlacement`**, quand il a écrit, renvoie aussi `userId` dans son `returning`, résout `resolveTenantContext(userId, ctx.tenantId)` et appelle `markBriefingsStale` pour cette personne. La RLS ne laisse marquer que ses propres points.
- Ces deux appels sont enveloppés dans un `try/catch` avec `logError('briefing.mark_stale_failed', …)` : le poste est déjà enregistré, un échec ne remonte pas.
- **Pas d'appel** dans `completeMemberStep` (les attentes ne vont pas au point) ni dans `joinWithInvitation` (pas encore de point).

- [ ] **Étape 1 : écrire les tests qui échouent**
  - `briefing-prompt.test.ts` :
    - la balise `<poste …/>` porte les identifiants, échappés, avant `DATA_GUARD_LINE` ; `system` nomme la balise mais ne contient aucune de ses valeurs ;
    - rien n'est ajouté sans poste ;
    - un `job` `other` omet `intitule`.
  - `briefings.db.test.ts` : après `adminDb.update(members)` du poste, l'entrée du modèle contient `<poste`.
  - `onboarding.db.test.ts` et `members.db.test.ts`, sur le modèle du `describe('saveAbout')` de `briefings.db.test.ts` (un point préparé, `last_read_at` récent, `stale`, puis les travaux pg-boss) :
    - un propriétaire qui valide l'étape 1 marque ses points ;
    - un administrateur qui change le poste de Bob marque les points de Bob et pas les siens.
    Ces tests touchent pg-boss : nettoyer leurs travaux et arrêter le patron dans `afterAll`, comme `briefings.db.test.ts` (vers les lignes 103-118).
- [ ] **Étape 2 : les voir échouer** (`--project unit` pour le prompt, `--project db` hors sandbox pour le reste)
- [ ] **Étape 3 : écrire le prompt, l'aide, les appels**
- [ ] **Étape 4 : relancer**, plus `pnpm vitest run --project db src/server/briefing src/server/auth` et le typage
- [ ] **Étape 5 : commiter**, message « Point du matin : il lit le poste, et un changement de poste le rafraîchit »

---

### Tâche 6 : « Recommended for your role » en tête de Connexions

**Fichiers :**
- Modifier : `src/app/(app)/connexions/page.tsx`
- Modifier : `src/components/verre/connexions/index.tsx`, `catalogue.tsx`
- Modifier : `src/components/verre/connexions/model.ts` et `model.test.ts`
- Modifier : `messages/en.json`, `messages/fr.json` (`connections.recommended`)

**Interfaces :**
- `recommendedToConnect(catalog: CatalogItem[], conns: ConnectionView[], ids: readonly ProviderId[]): CatalogItem[]` dans `model.ts`. Ce sont les outils de `ids`, dans cet ordre, disponibles, que `toolStates` (tâche 2) ne classe pas `mine` ou `team`. Réutiliser `toolStates`, pas une seconde règle.
- `ConnexionsProps` gagne `recommended: ProviderId[]`.

Ce qui change :
- **La page** passe les outils du service : `DEPARTMENTS[dept].tools` si `isDepartment`, sinon `[]`.
- **`Catalogue`** affiche une section `id="conseilles"`, titre « Recommended for your role » / « Conseillés pour votre poste », entre les pastilles de familles et « Connected ». Elle contient des `FreeTile` et applique le même filtre que le reste.
  - Ces outils sont retirés de la seule section « To connect » (`free`). La section « Connected » ne change pas : le Gmail d'un collègue peut donc y figurer et dans les conseillés, et le retour du focus prend la première tuile trouvée, ce qui suffit.
  - Rien ne s'affiche quand la liste est vide.

- [ ] **Étape 1 : écrire le test qui échoue** (`model.test.ts`) : l'ordre du service ; mon outil exclu ; le GitHub d'un collègue présent exclu ; le Gmail d'un collègue gardé ; le GitHub d'un ancien membre gardé ; un outil indisponible exclu.
- [ ] **Étape 2 : le voir échouer**
- [ ] **Étape 3 : écrire le modèle, la page, la section et le message**
- [ ] **Étape 4 : typage, lint, tests** (`src/components/verre/connexions`, `src/i18n`, `src/test/contracts`)
- [ ] **Étape 5 : commiter**, message « Connexions : les outils conseillés pour votre poste en tête »

---

### Tâche 7 : écrire la proposition « About you »

**Fichiers :**
- Créer : `src/server/db/migrations/0045-apropos-propose.sql`
- Modifier : `src/server/db/schema/search.ts` (table `aboutSuggestions`, à côté de `briefings`)
- Créer : `src/server/briefing/about-material.ts`, `about-prompt.ts`, `about-prompt.test.ts`, `about-suggestion.ts`, `about-suggestion.db.test.ts`
- Modifier : `src/server/briefing/gather.ts` (exporter `lastTurns` et `sourceOf`, rien d'autre)
- Modifier : `src/server/db/rls-coverage.db.test.ts` (`about_suggestions` dans `DELETE_ALLOWED`, avec sa raison)
- Modifier : `src/server/auth/delete-account.ts` et son test (effacer la proposition avec le reste)

**Interfaces :**
- La migration :

```sql
-- 0045-apropos-propose.sql : la proposition « About you » (onboarding, lot 5). Une par personne et par espace, écrite
-- par le travail de fond à partir de ses seules sources, montrée une fois en haut du Chat. closed_at : enregistrée ou
-- écartée. La fonction rend qui est prêt, sans rien lire des sources (security definer, identifiants seulement).
create table about_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references "user"(id) on delete cascade,
  text text not null check (char_length(text) between 1 and 500),
  source_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  acl uuid[] not null check (acl = array[user_id]),
  unique (tenant_id, user_id)
);
alter table about_suggestions enable row level security;
create policy tenant_acl on about_suggestions to leon_app
  using (tenant_id = app_tenant() and acl && app_principals())
  with check (tenant_id = app_tenant() and acl && app_principals());
grant select, insert, delete on about_suggestions to leon_app;
grant update (closed_at) on about_suggestions to leon_app;
```

  La suppression sert seulement à `deleteAccount` : ajouter `about_suggestions` à `DELETE_ALLOWED` dans `rls-coverage.db.test.ts`, avec cette raison.

  Puis la fonction `apropos_a_proposer(p_kinds text[], p_min_sources int, p_min_age interval) returns table (tenant_id uuid, user_id uuid)`, en `security definer`, avec `set search_path` comme les fonctions de 0030. Elle est suivie de `revoke all on function apropos_a_proposer(text[], integer, interval) from public;` puis `grant execute … to leon_app`, comme toutes les fonctions `security definer` du dépôt. Elle ne rend que des identifiants : les personnes du choix 9.
  - Un membre avec `"onboardedAt"` non nul, dont le compte n'est pas supprimé (`deleted_at` nul) et dont `about` est vide ou nul.
  - Sans ligne dans `about_suggestions` pour cet espace.
  - Au moins `p_min_sources` sources de l'espace avec `owner_user_id` = elle et `kind = any(p_kinds)`. Le compte est borné : `(select count(*) from (select 1 … limit p_min_sources) x) = p_min_sources`.
  - Une connexion qu'elle a créée dans cet espace avec `created_at < now() - p_min_age` et `last_sync_at` non nul : créée il y a au moins un jour, et déjà relevée au moins une fois.
- Dans `about-suggestion.ts` :
  - `export const ABOUT_MIN_SOURCES = 20` et `export const ABOUT_MIN_AGE = '1 day'` ;
  - `listAboutCandidates(): Promise<Array<{ tenantId: string; userId: string }>>` appelle la fonction avec `` sql`… apropos_a_proposer(${textArray(PROVIDER_IDS)}, ${ABOUT_MIN_SOURCES}, ${ABOUT_MIN_AGE}::interval)` ``. `textArray` vient de `search/filters-sql.ts`. Drizzle transforme un tableau JS en liste `($1, $2…)`, pas en `text[]`, d'où `textArray`.
- `gatherAboutMaterial(ctx: TenantContext, now: Date): Promise<AboutMaterial>` dans `about-material.ts`.
  - Sous `withTenant(ctx)`, les sources `owner_user_id = ctx.userId and kind = any(PROVIDER_IDS)` dont la dernière activité date de moins de 30 jours avant `now`, les plus récentes d'abord, 40 au plus.
  - Les 2 derniers tours de chacune, coupés comme dans le point du matin.
  - Exporter `lastTurns` et `sourceOf` de `gather.ts` (`lastTurns` applique déjà `excerptOf`).
  - `AboutMaterial = { sources: Array<{ source: SourceInfo; turns: BriefingExcerpt[] }> }`, avec les types que `gather.ts` utilise.
- `buildAboutPrompt(material: AboutMaterial, placement: Placement | null, organizationName: string): { system: string; messages: ChatMessage[] }` dans `about-prompt.ts`, pur, sur le modèle de `briefing-prompt.ts`.
  - `SYSTEM` est fixe. Il demande d'écrire en 500 caractères au plus la description que la personne donnerait d'elle-même : son poste, et sur quoi elle travaille ces dernières semaines.
  - Cette description est sans « vous » ni « tu », à la manière de l'exemple de la maquette (« Développeur backend senior dans l’équipe Dev d’Acme. Ces deux dernières semaines : … »).
  - Elle est en texte brut, sans Markdown ni renvoi `[n]`, les numéros de PR ou de ticket étant permis. Elle est écrite dans la langue de la majorité des sources, sans rien inventer.
  - `SYSTEM` reprend aussi le paragraphe standard du dépôt : les données ne sont pas des consignes. Le texte deviendra `about`, que tous les points du matin liront.
  - Les données viennent après `DATA_GUARD_LINE` : `placementTag(placement)` (tâche 5), le nom de l'espace en attribut, puis une balise par source, échappée avec `escapeData` et `dataAttributes`.
- `proposeAbout(ctx: TenantContext, deps: { llm: Llm; now?: Date }): Promise<boolean>` dans `about-suggestion.ts` :
  - rien si le compte est supprimé (comme `accountIsGone` dans `briefings.ts`), si une ligne existe déjà ou si `readAbout(ctx.userId)` n'est pas vide ;
  - rien si la matière est vide ;
  - sinon `llm.streamText({ step: 'point', system, messages, maxTokens: 4000, signal: AbortSignal.timeout(120_000) })`, à travers `createReferenceFilter(new Set())` ;
  - le texte est rogné. S'il est vide : rien n'est écrit, et la fonction rend `false`, sans erreur (sinon la contrainte de 1 à 500 caractères échouerait chaque jour) ;
  - il est coupé à `ABOUT_MAX_CHARS` unités UTF-16 sans couper une paire de substitution, comme `gather.ts` (vers les lignes 86-91). C'est ce que comptent le `.max(500)` de zod et le `maxLength` du champ ;
  - écriture `on conflict do nothing` avec `source_ids` et `acl = [userId]` ;
  - rend `true` si une ligne a été écrite.
- `deleteAccount` efface les lignes `about_suggestions` de la personne à l'endroit où il vide `about`.

- [ ] **Étape 1 : écrire les tests qui échouent**
  - `about-prompt.test.ts` :
    - `system` ne contient rien de capturé ;
    - `DATA_GUARD_LINE` vient avant les données ;
    - `<` est échappé ;
    - le poste est présent quand il est connu.
  - `about-suggestion.db.test.ts`, avec `newTeam`, `seedIndexed` ou `seedRun` et `createFakeLlm` comme `briefings.db.test.ts`. Alice a :
    - une source `github` à elle (acl espace) ;
    - une source `gmail` à elle (acl Alice) ;
    - une source à elle mais d'acl Bob (cachée par la RLS) ;
    - une source `claude_code` à elle ;
    - Bob a une source `linear` à lui (acl espace).
    Les tests :
    - le prompt de `llm.calls[0]` ne contient que le `github` et le `gmail` d'Alice, et `calls[0].step === 'point'` ;
    - un texte de 900 caractères est rangé à 500 ;
    - un deuxième `proposeAbout` n'appelle pas le modèle et n'écrit rien ;
    - une matière vide n'écrit rien ;
    - une réponse vide du modèle n'écrit rien et rend `false` ;
    - un `about` déjà rempli n'écrit rien.
  - `listAboutCandidates`, contre la vraie base :
    - Alice est rendue avec 20 sources à elle et une connexion créée il y a 2 jours, déjà relevée ;
    - elle ne l'est pas avec 19 sources, avec une connexion créée il y a une heure (même relevée), avec `about` rempli, avec une ligne existante, ou avec un compte supprimé.
  - `delete-account` : après la suppression, la personne n'a plus de ligne `about_suggestions`.
- [ ] **Étape 2 : les voir échouer**
- [ ] **Étape 3 : écrire la migration, la table Drizzle, la matière, le prompt et `proposeAbout`**
- [ ] **Étape 4 : relancer**, plus `schema-contract.db.test.ts`, `rls-coverage.db.test.ts`, `llm-contract.test.ts` et le typage
- [ ] **Étape 5 : commiter**, message « About you : écrire une proposition à partir des seules sources de la personne »

---

### Tâche 8 : lancer la proposition chaque matin

**Fichiers :**
- Modifier : `src/server/briefing/queue.ts`, `worker.ts`, `worker.test.ts`
- Tests : `worker.test.ts` (pg-boss mocké, comme aujourd'hui)

**Interfaces :**
- Dans `queue.ts`, seulement :
  - `BRIEFING_QUEUES` gagne `about: 'apropos-proposer'`, créé dans `getBriefingBoss()` avec les mêmes options que la file de rafraîchissement ;
  - `AboutJobSchema = z.object({ tenantId: z.uuid(), userId: z.uuid() })`.
- Dans `worker.ts` (le patron y est déjà mocké par `worker.test.ts`) :
  - `enqueueAboutProposals(): Promise<number>` appelle `listAboutCandidates()` (tâche 7) et fait un `send` par ligne, avec `singletonKey = ${tenantId}:${userId}` ;
  - `processAboutJob(data, deps: { llm: Llm | null })` :
    - `llm` nul : retour sans échec ;
    - `resolveTenantContext` nul : retour ;
    - sinon `proposeAbout(ctx, { llm })` ;
    - erreurs passées par `rethrowSummary('about.propose_failed', …)`.

Le gestionnaire du passage de 6 h appelle `enqueueMorningRefreshes()` puis `enqueueAboutProposals()`. Les deux tournent toujours : chaque échec est journalisé, puis le résumé de la première erreur est relancé, pour que pg-boss réessaie comme aujourd'hui (`worker.ts` vers les lignes 103-111). `registerWorkers` ajoute `boss.work(about, { ...polling, batchSize: 1, localConcurrency: 1 }, …)`.

- [ ] **Étape 1 : écrire les tests qui échouent** (`worker.test.ts`). Ajouter `send` au patron mocké, et mocker `./about-suggestion` (`listAboutCandidates`, `proposeAbout`).
  - Le passage de 6 h envoie un travail par ligne rendue, avec la bonne clé.
  - `processAboutJob` avec `llm` nul n'appelle rien.
  - Un membre parti (contexte nul) n'appelle rien.
  - Une erreur de `proposeAbout` est relancée en résumé.
  - Un échec de `enqueueMorningRefreshes` n'empêche pas l'envoi des propositions, et l'erreur remonte quand même.
  - Les attentes existantes changent : `work` est appelé trois fois (vers la ligne 92), et le passage de 6 h fait deux lectures (vers la ligne 181).
- [ ] **Étape 2 : les voir échouer**
- [ ] **Étape 3 : écrire la file, l'envoi et le traitement**
- [ ] **Étape 4 : relancer** `src/server/briefing`, unit et db, plus le typage
- [ ] **Étape 5 : commiter**, message « About you : la proposition part au passage du matin »

---

### Tâche 9 : la carte en haut du Chat

**Fichiers :**
- Modifier : `src/server/briefing/about-suggestion.ts` et `about-suggestion.db.test.ts` (lecture et fermeture)
- Modifier : `src/app/(app)/discussions/page.tsx`, `src/app/(app)/discussions/actions.ts` et son test
- Créer : `src/components/verre/discussions/about-suggestion-card.tsx` (client)
- Modifier : `messages/en.json`, `messages/fr.json` (`aboutSuggestion.*`)

**Interfaces :**
- `readAboutSuggestion(ctx): Promise<{ text: string; kinds: ProviderId[] } | null>` : la ligne de la personne si `closed_at` est nul, si `readAbout` est toujours vide et si toutes ses `source_ids` lui sont encore visibles (même contrôle que `readBriefing`). `kinds` donne les outils distincts de ces sources, 6 au plus.
- `closeAboutSuggestion(ctx): Promise<void>` : `closed_at = now()` sur sa ligne encore ouverte.
- Dans `discussions/actions.ts` :
  - `saveAboutSuggestionAction(text: string): Promise<{ ok: true } | { error: 'tooLong' | 'empty' | 'failed' }>` :
    - même schéma que `updateAboutAction` ;
    - un texte vide rend `empty` sans rien enregistrer ;
    - puis `saveAbout(ctx, texte)`, `closeAboutSuggestion(ctx)` et `revalidatePath('/reglages')` seulement. Pas de `revalidatePath('/discussions')`, qui ferait disparaître la carte avant le message `saved` : c'est le composant qui la masque ;
  - `dismissAboutSuggestionAction(): Promise<void>` : `closeAboutSuggestion(ctx)` puis `revalidatePath('/discussions')`.
- `AboutSuggestionCard({ text, kinds, max })`, sur le modèle d'`AboutSettings` :
  - le titre `laterTitle`, le chapeau `laterLead` ;
  - un champ prérempli et modifiable, avec compteur et l'aide `aboutHint` ;
  - « Not now » et « Save », « Save » désactivé quand le champ est vide ;
  - « Based on » avec les logos des outils, et la note `fromNote` ;
  - après « Save », le message `saved` s'affiche dans une zone `aria-live`, puis la carte se masque côté client.

**La page** lit la proposition avec `listDiscussions` et affiche la carte en premier enfant du conteneur de 760 px, avant l'en-tête.

Messages `aboutSuggestion.*` : `title`, `lead`, `label`, `hint`, `notNow`, `save`, `saved`, `failed`, `tooLong` (avec `{max}`, comme `about.tooLong`), `basedOn`, `basedOnNote`. Textes de la maquette ; `about.failed` et `about.tooLong` pour les erreurs.

- [ ] **Étape 1 : écrire les tests qui échouent**
  - `about-suggestion.db.test.ts` :
    - la proposition se lit ;
    - fermée, elle ne se lit plus ;
    - avec `about` rempli ailleurs, elle ne se lit plus ;
    - quand une de ses sources devient invisible, elle ne se lit plus.
  - `discussions/actions.test.ts`, avec `saveAbout` et les fonctions mockés :
    - « Save » enregistre, ferme, puis revalide `/reglages` (pas `/discussions`) ;
    - 501 caractères donnent `tooLong` sans rien enregistrer ;
    - un texte vide donne `empty` sans rien enregistrer ni fermer ;
    - « Not now » ferme sans enregistrer.
- [ ] **Étape 2 : les voir échouer**
- [ ] **Étape 3 : écrire la lecture, la fermeture, les actions, la carte, la page et les messages**
- [ ] **Étape 4 : typage, lint, tests et contrats**
- [ ] **Étape 5 : commiter**, message « About you : la proposition en carte en haut du Chat »

L'essai dans le navigateur est fait par le contrôleur, avec une ligne posée à la main dans la base de dev : carte, modification, « Save », puis Réglages › Profil, et « Not now ».

---

### Tâche 10 : vérifications finales et PR

- [ ] **Étape 1 : toute la suite** : `pnpm typecheck && pnpm biome check src messages && pnpm test:unit && LEON_TEST_DATABASE=leon_test_onboarding pnpm test:db` (hors sandbox pour la base).
- [ ] **Étape 2 : les essais dans le navigateur**, sur la base de dev migrée :
  - le parcours d'un nouveau propriétaire seul, de l'étape 1 à 2, puis 3, puis la fin ;
  - celui d'un membre invité, de l'étape 1 à 2, puis la fin ;
  - un branchement par clé depuis l'étape 2 ;
  - le fil d'étapes à 375 px ;
  - les exemples sur le Chat vide ;
  - la section de Connexions ;
  - la carte « About you ».
- [ ] **Étape 3 : relecture de la branche entière** avec les grilles `security-review` et `auditing-runtime-contracts`, en particulier :
  - l'adresse de retour OAuth ;
  - ce que le modèle reçoit pour « About you » ;
  - la fonction `security definer` ;
  - les clés de messages ;
  - les nouvelles routes.
- [ ] **Étape 4 : se remettre à jour, vérifier le numéro de migration, pousser et ouvrir la PR.** Amos a demandé une seule PR pour les lots 3 à 5. La description reprend les neuf choix ci-dessus et ce que David doit vérifier : le retour OAuth, la règle « déjà branché » et ce qui part au modèle.
