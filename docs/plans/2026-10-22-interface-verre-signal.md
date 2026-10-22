# Plan : l'interface « Verre + signal » sur la vraie appli

> **Pour les agents :** skill requis : superpowers:subagent-driven-development (ou superpowers:executing-plans). Les étapes se cochent (`- [ ]`).

**But :** que l'appli Next.js (`src/app/`) ait l'apparence et les interactions de la maquette `prototypes/verre-signal/app/`, en restant branchée sur le vrai serveur. Spec : `docs/specs/2026-10-22-interface-verre-signal.md`.

**Architecture :** on copie le système de design de la maquette (jetons, primitives, ossature) dans `src/`, en l'adaptant à Next (`next/link`, `next/navigation`, rendu serveur). Puis chaque écran est réécrit avec les composants de la maquette, alimenté par les chargeurs et actions qui existent déjà. Les fausses données (`prototypes/.../src/data/`) et le flux simulé ne sont jamais copiés.

**Pile :** Next 16 (App Router, webpack), React 19, Tailwind 4, `radix-ui`, `lucide-react`, `motion` (ajouté), Vitest, Biome, pnpm.

Racine de travail : `W=/Users/david/Downloads/Business/code/leon/.claude/worktrees/interface-verre-signal`. Maquette : `M=$W/prototypes/verre-signal/app/src`.

---

## Règles d'adaptation (valent pour toutes les tâches)

1. **Emplacements.** Primitives : `src/components/verre/ui/`. Ossature : `src/components/verre/shell/`. Utilitaires : `src/lib/verre/`. Dans le code copié, `@/components` devient `@/components/verre`, `@/lib` devient `@/lib/verre`, `@/components/ui/x` devient `@/components/verre/ui/x`.
2. **Routeur.**
   - `Link to=` devient `next/link` `href=`.
   - `useNavigate()` devient `useRouter()` de `next/navigation` (`push` / `replace`).
   - `useSearchParams` et `usePathname` viennent de `next/navigation`.
   - `useLocation`, `useOutlet`, `UNSAFE_*` et `useNavigationType` disparaissent.
3. **Rendu serveur.** Aucun accès à `document`, `window` ou `localStorage` au niveau module : on le met dans un effet ou dans le `getSnapshot` de `useSyncExternalStore`, avec un `getServerSnapshot`. Tout fichier qui a un état, un effet ou du `motion` commence par `'use client'`.
4. **Pas de démo.** On ne reprend pas : `?theme=`, `?instant=`, les paramètres d'état en tête des écrans, `/_ds`, `wait`, `simulateStream`, ni rien de `src/data/`. `isInstant()` ne regarde plus que `prefers-reduced-motion`.
5. **Données.** Une valeur affichée vient d'un chargeur ou d'une action existants (tableau de la spec). Si la maquette affiche quelque chose qui n'en a pas, on le retire et on le note dans `docs/specs/2026-10-22-interface-verre-signal.md`, section « Retiré de la maquette ».
6. **Textes.** On garde les textes français de la vraie appli quand ils diffèrent de ceux de la maquette, sauf les mentions de la page Sources.
7. **Vérifier après chaque tâche :** `pnpm typecheck && pnpm lint && pnpm test:unit`. Les tests `db` tournent à la tâche 12.
8. **Commits.** Ajouter les fichiers explicitement (pas de `git add -A`). Messages en français. Terminer par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

### Tâche 0 : préparer le worktree

- [ ] `cd $W && cp ../../../.env.local .env.local` (fichier ignoré par Git ; même base locale que les autres worktrees).
- [ ] `pnpm install`
- [ ] `pnpm add motion@14.5.0` (même version que la maquette).
- [ ] `pnpm typecheck && pnpm test:unit` : tout passe avant de commencer.
- [ ] Commit : `package.json`, `pnpm-lock.yaml` : « Interface : ajoute motion ».

### Tâche 1 : jetons, polices, thème

**Fichiers :** modifier `src/app/globals.css` et `src/app/layout.tsx`. Créer `src/lib/verre/theme.ts`.

- [ ] Dans `globals.css`, remplacer les jetons actuels (`:root`, `@theme inline`) par le contenu de `$M/styles/tokens.css` et `$M/styles/effects.css`.
  - Garder `@import "tailwindcss";` et `@import "tw-animate-css";`.
  - Retirer `@import "shadcn/tailwind.css";` et la variante `.dark`.
  - Thème par `[data-theme="dark"]` et `[data-theme="light"]` sur `<html>`, comme la maquette.
  - Les jetons utilisés par l'ancien code (`--color-muted`, `--color-destructive-soft`, `--color-warning-soft`…) restent définis, adossés aux nouvelles couleurs, jusqu'à la tâche 11 : sinon les écrans pas encore portés cassent.
- [ ] Dans `layout.tsx` :
  - Manrope (400–800, `--font-sans`) et Geist Mono (400, 500, `--font-mono`) via `next/font/google`, à la place d'Inter et Plex.
  - `<html lang="fr" data-theme="dark" suppressHydrationWarning>`.
  - Script inline avant le contenu : lit `localStorage['leon-theme']` et pose `data-theme`. Ne lit **pas** `?theme=`.

```tsx
const THEME_SCRIPT = `try{var t=localStorage.getItem('leon-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`;
// dans <head> : <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
```

- [ ] `src/lib/verre/theme.ts` : copie de `$M/lib/theme.ts`, avec `read()` protégé (`typeof document === 'undefined' ? 'dark' : …`).
- [ ] Ajouter l'icône de la maquette (`index.html`, SVG en data-URI) dans `metadata.icons`.
- [ ] Vérifier, commit : « Interface : jetons Verre + signal, Manrope, Geist Mono, thème sombre ».

### Tâche 2 : utilitaires

**Fichiers :** créer `src/lib/verre/` avec `cn.ts`, `nb.ts`, `format.ts`, `instant.ts`, `motion.ts`, `refs.ts`, `scroll.ts`, `text.ts`, `title.ts`, `width.ts`, `index.ts`, copiés de `$M/lib/`.

- [ ] `cn` : réexporter `@/lib/utils` (même `clsx` + `tailwind-merge`), pas de doublon.
- [ ] `format.ts` : comparer avec `src/lib/format.ts`. Si une fonction existe des deux côtés, garder celle de `src/lib/format.ts` (déjà testée) et réexporter.
- [ ] `instant.ts` : retirer `data-instant`. Lire `matchMedia` paresseusement, dans le `getSnapshot`. Mettre `MotionGlobalConfig.skipAnimations` à jour dans un effet du `ThinkingProvider` (tâche 4), pas au chargement du module.
- [ ] `title.ts` (`useTitle`) n'est pas copié : Next gère les titres avec `metadata`. On retire ses appels pendant les portages.
- [ ] `stream.ts` n'est pas copié.
- [ ] Test : `src/lib/verre/nb.test.ts`, qui vérifie l'espace fine insécable avant `:` et à l'intérieur des « ».

```ts
import { expect, test } from 'vitest';
import { nb } from './nb';
test('espace fine insécable avant les deux-points et dans les guillemets', () => {
  expect(nb('Note : « oui »')).toBe('Note : « oui »');
});
```

  Lancer `pnpm vitest run src/lib/verre/nb.test.ts`. Si `nb` produit un autre caractère que U+202F, adapter l'attendu à ce que fait la maquette : c'est elle qui fait foi.
- [ ] Vérifier, commit : « Interface : utilitaires de la maquette ».

### Tâche 3 : primitives

**Fichiers :** créer `src/components/verre/ui/*` à partir de `$M/components/ui/*` (badge, button, chips, copy, dialog, feedback, form, kbd, layout, menu, pagination, pill, surfaces, text, toast, index). `sparkline.tsx` n'est pas copié (pas de donnée).

- [ ] Appliquer les règles 1 à 3. `'use client'` sur tout fichier avec un état, un effet, `motion` ou Radix.
- [ ] `chips.tsx` importe `@/data/providers` (`kindIcon`, `kindLabel`, `isProvider`) : passer par `src/lib/providers.ts` et `SOURCE_KIND_LABELS` (`src/server/memory/labels.ts`, à réexporter côté client s'il est importable) ; pas de liste dupliquée.
- [ ] Logos : copier `prototypes/verre-signal/app/public/logos/` dans `public/logos/`.
- [ ] `toast.tsx` : garder `sonner` s'il est déjà au même rôle ; sinon remplacer `src/components/ui/sonner.tsx` dans `layout.tsx`, en un seul Toaster.
- [ ] Vérifier, commit : « Interface : primitives Verre + signal ».

### Tâche 4 : ossature

**Fichiers :** créer `src/components/verre/shell/*` à partir de `$M/components/shell/*`. Modifier `src/app/(app)/layout.tsx`. Créer `src/app/(app)/template.tsx`.

- [ ] Brand, workspace-menu, mobile-bar : prendre le nom de l'organisation, de l'utilisateur et l'e-mail en props, depuis `getViewerProfile` (aujourd'hui passés à `AppShell`). La déconnexion reste `signOutAction`.
- [ ] `nav.ts` : Recherche `/`, Discussions `/discussions`, Connexions `/connexions`, Réglages `/reglages`. Pas de Sources.
- [ ] `app-shell.tsx` : retirer `FrozenOutlet` et les animations de sortie ; `children` à la place de l'outlet. L'animation d'entrée de page passe dans `template.tsx` (`motion.div` avec `pageVariants`, entrée seulement).
- [ ] Garder le lien d'évitement « Aller au contenu » et `<main id="contenu">` (repris de `src/components/shell-frame.tsx`).
- [ ] `command-palette.tsx` :
  - retirer `RECENT_SEARCHES` ;
  - « Rechercher « q » » mène à `/?q=` ;
  - « Nouvelle discussion » mène à `/discussions` ;
  - « Brancher un outil » mène à `/connexions` ;
  - « Créer un jeton » mène à `/reglages` ;
  - le thème se bascule avec `useTheme().toggle`.
- [ ] ⌘K sur la page de recherche : focus et sélection de `#barre-de-recherche` (`focusSearchBar` de la maquette). La barre de la tâche 6 doit avoir cet `id`. Remplacer l'ancien `SEARCH_INPUT_ID` partout.
- [ ] `sidebar.tsx` : l'alerte « Mémoire en retard » vient de la prop `stale: ChannelHealth[]` (tâche 5) et mène à `/reglages`. Sans canal en retard, pas d'alerte.
- [ ] `layout.tsx` (app) : rend la nouvelle ossature. `src/components/app-shell.tsx`, `shell-frame.tsx`, `sidebar-sections.tsx`, `workspace-menu.tsx` et `command-search.tsx` sont supprimés à la tâche 11, pas avant.
- [ ] Vérifier (dont `pnpm dev`, ouvrir `/`), commit : « Interface : ossature Verre + signal ».

### Tâche 5 : `channelHealth` (seul ajout serveur)

**Fichiers :** modifier `src/server/memory/sources.ts` et `src/server/memory/sources.db.test.ts`.

- [ ] Test d'abord, dans `sources.db.test.ts`, en reprenant les données du test qui vérifie `channels` (vers la ligne 120) :

```ts
test('channelHealth donne la même santé par canal que listSources, sans lire les sources', async () => {
  const { channels } = await listSources(paul);
  expect(await channelHealth(paul)).toEqual(channels);
});
```

- [ ] `pnpm test:db -- sources` : échoue (`channelHealth` n'existe pas).
- [ ] Extraire de `listSources` la requête « dernière capture par canal » (le bloc après le commentaire « La dernière capture de l'utilisateur par canal ») dans `export async function channelHealth(ctx: TenantContext): Promise<ChannelHealth[]>`, et l'appeler depuis `listSources`. Même `withTenant`, même ordre `CAPTURE_KINDS`.
- [ ] Ajouter dans le même fichier `export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;` et `export function staleChannels(channels: ChannelHealth[], now: Date): ChannelHealth[]` : les canaux dont `lastCaptureAt` existe et date de plus de 24 h. Un canal jamais utilisé n'est pas « en retard ». Test unitaire de `staleChannels` dans `src/server/memory/stale.test.ts`, avec trois cas : récent, ancien, null.
- [ ] `pnpm test:db -- sources` et `pnpm vitest run src/server/memory/stale.test.ts` passent.
- [ ] `(app)/layout.tsx` appelle `channelHealth(ctx)` et passe `staleChannels(…, new Date())` à la barre latérale.
- [ ] Commit : « Mémoire : santé des canaux de capture lue à part (alerte de retard) ».

### Tâche 6 : Recherche

**Fichiers :** réécrire `src/app/(app)/page.tsx`. Créer `src/components/verre/recherche/*` à partir de `$M/screens/recherche/*` (answer, filters, motion, preview, results, search-bar, welcome).

- [ ] La page reste un composant serveur et garde son flux de données tel quel : `fromSearchParams`, `runSearch`, `pageCount`, `unknownPeopleMessage`, `getLlm(env)`, `toResultViews`, `queryTerms(parseQuery(q, now).text)`, `countLabel`.
- [ ] Les composants de la maquette reçoivent ces valeurs en props à la place de `search()` / `SearchResult`. Pour chaque champ de `SearchResult`, utiliser le champ correspondant de `ResultView` (`src/components/search/view-model.ts`). Adapter le composant si un champ manque, sans changer le chargeur.
- [ ] Réponse : remplacer `simulateStream`/`generateAnswer` par la lecture SSE de `src/components/search/answer-box.tsx` (`lib/answer-events.ts`). On garde ses états : flux, `fin`, `indisponible`, 204 (masquée), 429. `key={q}` sur la carte. « Leon lit N sources… » devient « Leon lit les résultats… ».
- [ ] Aperçu : `previewPassageAction(passageId)`, états chargement / introuvable / erreur. On ne met pas `?apercu=` dans l'adresse : l'aperçu est un état local.
- [ ] Filtres : la logique reste `src/components/search/search-filters.tsx` / `filter-menu.tsx` / `url-state.ts`. On ne change que le rendu.
- [ ] « Continuer en discussion » : `continueInDiscussionAction`.
- [ ] Recherche en cours : `src/app/(app)/loading.tsx` montre les cartes fantômes et « Leon cherche dans la mémoire… ».
- [ ] Erreur : « La recherche n’a pas abouti. Réessayez dans un instant. » (sans Sources).
- [ ] Les tests existants de `src/components/search/*.test.ts` passent toujours. Les fichiers de logique (`view-model`, `url-state`, `highlighted-text`, `answer-text`, `run-search`) ne bougent pas.
- [ ] Vérifier, commit : « Recherche : écran Verre + signal ».

### Tâche 7 : Discussions

**Fichiers :** réécrire `src/app/(app)/discussions/page.tsx` et `[id]/page.tsx`. Créer `src/components/verre/discussions/*` à partir de `$M/screens/discussions/*` (list, messages, preview, thread, model).

- [ ] Liste : `listDiscussions(ctx)` ; nouvelle question avec `newDiscussionAction`, compteur `DISCUSSION_MESSAGE_MAX_CHARS`, avertissement sans modèle (`getLlm(env) === null`).
- [ ] Fil : `getDiscussion(ctx, id)`. Le flux reste celui de `src/components/discussion/discussion-thread.tsx` (`discussionMessagesUrl`, `createDiscussionEventReader`, `readReply`, `toolActivityLabel`, `readDiscussionMessagesAction`). Porter le rendu de la maquette par-dessus. Le moteur de flux n'est pas réécrit.
- [ ] Notices : chaque `ReplyOutcome` de `read-reply.ts` garde son texte actuel (indisponible, gardée, coupée, 401, 403 origine avec `appOrigin`, 429, sans modèle, refus/vide/limite). « Leon réfléchit… » n'est pas repris.
- [ ] Citations et aperçu : `previewPassageAction(citation.passageId)`.
- [ ] Garder les lignes de confidentialité (cadenas) de l'écran actuel.
- [ ] `message-segments.test.ts` et `read-reply.test.ts` passent.
- [ ] Vérifier (sans envoyer de question si aucun modèle gratuit n'est configuré), commit : « Discussions : écran Verre + signal ».

### Tâche 8 : Connexions

**Fichiers :** réécrire `src/app/(app)/connexions/page.tsx`. Créer `src/components/verre/connexions/*` à partir de `$M/screens/connexions/*` (carte, catalogue, index, model, parts, tool-dialog, connexions.css).

- [ ] Données : `listCatalog()`, `listConnections(ctx)`, `connectorsKey()`, `oauthNotice(searchParams)`, plus `channelHealth(ctx)` pour les canaux du schéma.
- [ ] Actions de la fenêtre d'outil : `connectAction`, `replaceKeyAction`, `syncNowAction`, `setPausedAction`, `deleteConnectionAction`. Les champs et la validation restent ceux de `src/lib/connection-form.ts` et `connection-fields.tsx`.
- [ ] Retours OAuth : traduire `?branche=` et `?erreur=` (ce que lit `oauthNotice`) vers les notices `RETURN_CODES` de la maquette.
- [ ] Schéma vivant :
  - outils : `status` active / paused / error ;
  - canaux : « en retard » si `staleChannels` les contient, « aucune capture » si `lastCaptureAt === null`.
  - Retirer le nombre de passages au centre et `MEMORY.activity`.
- [ ] Mettre les familles et les logos en correspondance avec `CatalogItem.family` et `id` (fichiers `public/logos/<id>.svg`).
- [ ] Vérifier (ne brancher aucun vrai outil sans l'accord de David), commit : « Connexions : écran Verre + signal ».

### Tâche 9 : Réglages

**Fichiers :** réécrire `src/app/(app)/reglages/page.tsx`. Créer `src/components/verre/reglages/*` à partir de `$M/screens/reglages/*`.

- [ ] Jetons : `listApiTokens(ctx)` (non révoqués), `createTokenAction` (fenêtre « affiché une seule fois »), `revokeTokenAction` (confirmation).
- [ ] Commande Claude Code et lignes de l'extension : construites comme aujourd'hui, à partir de `env.BETTER_AUTH_URL` et `API_PATHS.mcp`. Ancres `#claude-code` et `#extension`.
- [ ] Vérifier, commit : « Réglages : écran Verre + signal ».

### Tâche 10 : connexion, inscription, pages système

**Fichiers :** `src/app/(auth)/layout.tsx`, `connexion/page.tsx`, `inscription/page.tsx`, `src/app/not-found.tsx`, `src/app/(app)/error.tsx`, `src/app/(app)/loading.tsx`. Sources : `$M/screens/auth-systeme/*`.

- [ ] Formulaires : `signInAction` / `signUpAction` avec `useActionState`, `AuthFormState {errors, values}`. On garde les noms de champs et les messages actuels.
- [ ] `error.tsx` : rendu de la maquette, bouton qui appelle `reset()`, texte sans Sources.
- [ ] `not-found.tsx` : rendu 404 de la maquette.
- [ ] `loading.tsx` : `PageSkeleton`. La recherche a ses cartes fantômes (tâche 6).
- [ ] Bascule de thème sur les pages hors ossature (`theme-toggle.tsx`).
- [ ] `src/app/(auth)/actions.test.ts` passe.
- [ ] Vérifier, commit : « Connexion, inscription, pages système : Verre + signal ».

### Tâche 11 : retirer Sources et l'ancien code

- [ ] Supprimer `src/app/(app)/sources/`, `src/components/sources-table.tsx` et `sources-table.test.ts`.
- [ ] Dans `src/test/contracts/page-links.test.ts`, déplacer `/sources` dans les routes retirées (à côté de `/journal`).
- [ ] `grep -rn "components/ui/\|app-shell\|shell-frame\|sidebar-sections\|command-search\|workspace-menu\|empty-state\|status-badge\|source-chip\|connection-panel\|connections-catalog\|token-list\|create-token-dialog\|revoke-token-button\|auth-form" src`. Supprimer tout ancien composant d'affichage qui n'est plus importé, ainsi que son test s'il ne teste que du rendu. Les fichiers de logique (`view-model`, `url-state`, `read-reply`, `message-segments`, `connection-form`…) restent. Leurs tests aussi.
- [ ] Supprimer de `globals.css` les jetons de compatibilité de la tâche 1 que plus rien n'utilise.
- [ ] Retirer `shadcn` des devDependencies s'il n'est plus importé (`grep -rn shadcn src`).
- [ ] `README.md:83` et `docs/guides/premier-jet-verification.md:11` : retirer la page Sources ; la santé de la capture se voit dans l'alerte de la barre latérale et dans le schéma de Connexions.
- [ ] Vérifier, commit : « Retire la page Sources et l'ancienne interface ».

### Tâche 12 : vérification complète

- [ ] `pnpm typecheck && pnpm lint && pnpm test` (avec la base locale démarrée : `docker ps | grep leon-postgres`).
- [ ] `pnpm build` passe.
- [ ] `PORT=3012 pnpm dev`. Dans le navigateur, pour chaque écran (`/`, `/?q=…`, `/discussions`, un fil, `/connexions`, `/reglages`, `/connexion`, `/inscription`, une 404), vérifier :
  - en sombre puis en clair ;
  - à 390 px puis sur ordinateur ;
  - pas de défilement horizontal ;
  - focus visible au clavier ;
  - ⌘K ;
  - barre latérale repliée ;
  - aucune erreur dans la console.
- [ ] Aucune réponse de l'IA (recherche ou discussion) sans l'accord de David : annoncer le coût d'abord.
- [ ] Mettre à jour la section « Retiré de la maquette » de la spec si des éléments ont été retirés en route.
- [ ] `git fetch origin && git rebase origin/main`, puis `git push -u origin david/interface-verre-signal`, puis PR (ce qui change, pourquoi, ce qu'Amos doit vérifier ; mentionner la perte de l'affichage des échecs du pipeline par source).

---

## Ordre et parallélisme

0 → 1 → 2 → 3 → 4 → 5 doivent se suivre (chacune dépend de la précédente). Ensuite 6, 7, 8, 9 et 10 touchent des fichiers distincts et peuvent avancer en parallèle dans ce worktree. 11 puis 12 viennent en dernier.
