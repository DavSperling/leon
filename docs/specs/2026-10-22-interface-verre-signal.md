# Spec : l'interface « Verre + signal » sur la vraie appli

Décidé le 22 octobre 2026 (David). Source visuelle : `prototypes/verre-signal/` (maquette Vite, données fictives, #32 et #34). Cible : l'appli Next.js dans `src/app/`, déjà branchée sur le serveur.

## Décisions

1. **Une seule PR** (`david/interface-verre-signal`) qui passe tous les écrans au nouveau design.
2. **Seulement le réel** : on n'affiche que ce que le serveur fournit déjà. Un élément de la maquette sans donnée est retiré, et listé dans la PR. Pas de valeur en dur.
3. **La page Sources disparaît**, comme dans la maquette (#34).

## Ce qui change

### Styles et dépendances

- `src/app/globals.css` : jetons de la maquette (`prototypes/verre-signal/app/src/styles/`) à la place des actuels. Aurore, verre, accent indigo, Manrope + Geist Mono (via `next/font`).
- Thème sombre par défaut, clair au choix. Bascule dans le menu du compte et dans ⌘K, mémorisée dans `localStorage` (`leon-theme`). Le thème est posé avant le premier rendu, pour éviter un flash.
- Seule dépendance ajoutée : `motion`. `react-router` n'est pas repris (routes de Next).
- `prefers-reduced-motion` respecté partout, comme dans la maquette.

### Composants

- Les primitives (`components/ui`) et l'ossature (`components/shell` : aurore, barre latérale repliable, barre mobile, palette ⌘K, menu du compte) de la maquette remplacent leurs équivalents dans `src/components/`.
- Les pages restent des composants serveur. Seules les parties interactives sont `'use client'`.
- Le code de démo de la maquette n'est pas repris : `?instant=`, paramètres d'état, `/_ds`, `simulateStream`, `src/data/`.

### Données, écran par écran

Chaque écran garde ses chargeurs et ses actions. Seul le rendu change.

| Écran | Données (inchangées) |
|---|---|
| Ossature | `requireUserContext`, `getViewerProfile`, `signOutAction` |
| Recherche | `runSearch`, `previewPassageAction`, SSE `/api/v1/recherche/reponse`, `parseQuery`, `continueInDiscussionAction` |
| Discussions | `listDiscussions`, `getDiscussion`, `newDiscussionAction`, `readDiscussionMessagesAction`, SSE `POST /api/v1/discussions/:id/messages` lu par `createDiscussionEventReader` |
| Connexions | `listCatalog`, `listConnections`, `connectorsKey`, `oauthNotice`, les cinq actions de `connexions/actions.ts`, routes OAuth |
| Réglages | `listApiTokens`, `createTokenAction`, `revokeTokenAction` |
| Connexion, inscription | `signInAction`, `signUpAction` |
| 404, erreur, chargement | `not-found.tsx`, `error.tsx` (avec `reset()`), `loading.tsx` |

**Seul ajout serveur** : `channelHealth(ctx)`, en lecture seule, tiré de `listSources` (`src/server/memory/sources.ts`). Il renvoie, par canal de capture (`CAPTURE_KINDS`), la date de la dernière capture. Il alimente l'alerte « Mémoire en retard » de la barre latérale (qui mène aux Réglages) et les canaux du schéma vivant des connexions. Pas de migration.

### Retiré de la maquette (pas de donnée côté serveur)

- Recherches récentes dans la palette ⌘K.
- Nombre de passages au centre du schéma des connexions, et la courbe d'activité.
- « Leon réfléchit… » et les noms des sources pendant la lecture (le flux n'envoie que le nom de l'outil). On garde les libellés tirés de `toolActivityLabel` et de l'événement `en-cours`.
- « Leon lit N sources » sur la recherche : on affiche « Leon lit les résultats… », sans nombre.
- La pastille de version à côté de la marque (l'appli n'expose pas de numéro de version).
- Les « il y a 3 h » de l'alerte « Mémoire en retard » : elle nomme les canaux en retard (« Mémoire en retard · Claude Code »).
- L'adresse pré-remplie quand « Compte créé, mais la connexion a échoué » mène à « Se connecter » (la maquette la passait dans l'état du routeur ; on ne la met pas dans l'URL). Le lien mène à `/connexion`, vide.
- Discussions : le texte de la réponse ne sort pas mot à mot d'un flou (le flux donne le texte entier à chaque étape, pas des mots), les renvois et le curseur restent. Pas de curseur posé d'office dans la saisie à l'arrivée (« Continuer en discussion », nouvelle question), ni de ⌘K « Nouvelle discussion » qui met le curseur dans la question (`?nouvelle=1`). L'aperçu d'une source citée montre l'outil et la nature une fois le passage chargé (la citation n'en dit rien) ; avant, le titre seul.

### La page Sources

- Supprimés : `src/app/(app)/sources/`, `src/components/sources-table.tsx` et son test, l'entrée de navigation.
- Le texte « regardez la page Sources » (`(app)/page.tsx`, `(app)/error.tsx`) devient celui de la maquette.
- `src/test/contracts/page-links.test.ts` : `/sources` passe dans les routes retirées.
- `README.md` et `docs/guides/premier-jet-verification.md` corrigés.
- `listSources` reste, tant que `channelHealth` en dépend.
- **Perte connue** : l'affichage des échecs du pipeline par source. À signaler dans la PR.

## À ne pas casser

- Le lien d'évitement « Aller au contenu » et `main#contenu`.
- ⌘K qui remet le focus sur la barre de recherche et sélectionne son texte.
- L'état d'adresse : seulement `?q=&page=` sur la recherche. Aucun paramètre de démo ne fuit.
- Les retours OAuth `?branche=` et `?erreur=`, mappés sur les notices de la maquette.
- `key={q}` sur la boîte de réponse (remise à zéro à chaque recherche).
- Les cas 401, 403 (origine), 429, sans modèle, question gardée, réponse coupée.
- Les lignes de confidentialité (cadenas) des discussions.

## Vérification

- `pnpm typecheck`, `pnpm lint`, `pnpm test`. Les tests existants passent, adaptés seulement là où un texte change.
- Un test pour `channelHealth`.
- Chaque écran dans le navigateur, sombre et clair, à 390 px et sur ordinateur. Contraste du texte ≥ 4,5:1, focus visible, pas de défilement horizontal.
- Aucun appel payant au LLM sans l'accord de David.
