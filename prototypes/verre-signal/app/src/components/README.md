# Leon « Verre + signal » : mode d'emploi pour les écrans

Tout ce qui est partagé est déjà là. Un écran **ne modifie jamais** un fichier partagé (`src/components`, `src/lib`, `src/data`, `src/styles`, `src/main.tsx`, `index.html`) et garde ses composants propres dans son dossier `src/screens/<écran>/`. Il manque quelque chose ? Composez-le dans votre dossier à partir de ce qui existe.

**Imports.** Code interne : seulement `@/components`, `@/lib`, `@/data` (et les fichiers de votre dossier). Paquets permis : `react`, `react-router`, `motion/react`, `lucide-react`. **Jamais `radix-ui` en direct** : Dialog, AlertDialog, Sheet, DropdownMenu, Popover, Tooltip, Select, Checkbox, Switch et Collapsible sont déjà habillés ici.

Vitrine vivante de chaque composant et jeton : **`/_ds`** (`?theme=light`, `?ouvrir=dialogue|alerte|menu|popover|feuille`). Ossature : `?palette=1` ouvre la palette ⌘K, `?menu=compte` le menu du compte, `?rail=replie|deplie` impose la barre latérale repliée ou dépliée (captures), `?memoire=retard` montre l'alerte « Mémoire en retard » du pied de la barre (à jour, elle ne s'affiche pas). Référence visuelle : `planche/verre-signal.html`.

## Règles

- **Couleurs : seulement les jetons.** La palette par défaut de Tailwind est retirée (`bg-gray-800` n'existe pas). Classes : `bg-bg bg-glass bg-glass-2 bg-glass-3 bg-panel bg-float bg-menu bg-hover bg-ink` (`bg-panel` = `--glass`, le fond de `GlassCard variant="panel"`), `border-line border-line-strong`, `text-fg text-fg-2 text-muted text-accent`, `bg-accent text-accent-ink bg-accent-soft border-accent-line`, `bg-mark-bg text-mark-ink`, et pour chaque ton `success | warning | destructive | info` : `text-x bg-x-soft border-x-line` (`destructive-ink` = texte sur bouton rouge). Variables CSS brutes : `var(--line)`, `var(--hi)`, `var(--accent)`… (liste dans `src/styles/tokens.css`).
- **Texte** : `text-fg` (défaut du corps) > `text-fg-2` > `text-muted` ; tous ≥ 4,5:1 sur le pire fond, dans les deux thèmes, y compris quand Leon travaille (aurore intensifiée). Mettez du texte de ton (`text-warning`…) seulement sur son fond doux ou sur le verre.
- **Typo** : Manrope partout (`font-sans`, défaut), **dates, heures et phrases comprises** : « il y a 4 min », « créé le 12 oct. 2026 · utilisé il y a 2 h », « dernier passage il y a 2 h · 1 234 éléments », « Page 2 sur 7 » s'écrivent en `text-muted tabular-nums` (chiffres alignés). **Geist Mono (`font-mono tracking-normal`) seulement pour ce qui se lit signe par signe** : un nombre seul (compteur, ms), un identifiant, `[n]`, une touche (`Kbd`), du code, une version. Tailles : `text-meta` 11,5 · `text-label` 12,5 · `text-ui` 13,5 · `text-body` 14 · `text-lead` 15,5 · `text-title` 16,5 · `text-h2` 21 · `text-h1` 30. Titres : `font-semibold tracking-[-0.018em]`.
- **Rayons** : `rounded-panel` 26 · `rounded-box` 18 (barre de recherche, réponse, aperçu) · `rounded-card` 16 (cartes, menus) · `rounded-field` 12 (champs, lignes de nav) · `rounded-item` 10 (lignes de menu) · `rounded-chip` 7 · `rounded-full` (pastilles, boutons). Ombres : `shadow-hi` (reflet haut, sur tout verre), `shadow-panel`, `shadow-float`.
- **Utilitaires de verre** : `glass-float` n'est que la matière des calques (fond `--float` + flou) ; ajoutez le trait et l'ombre à côté, librement retirables : `glass-float border border-line-strong shadow-float`. `glass-panel` est le panneau principal complet (trait, rayon 26, fond, flou, ombre) : ses trait et ombre ne se surchargent qu'avec le suffixe `!` (`border-0!`, `shadow-none!`), car l'utilitaire sort après les classes simples dans la feuille.
- **Français** : passez toute chaîne avec `; : ? ! % « »` dans `nb()` (espaces fines insécables). `PageHeader`, `Section`, `EmptyState`, `Notice`, `Field`, `DialogContent`, `AlertDialog` et `toast` le font déjà pour leurs textes ; les données (`@/data`) sont déjà passées.
- **Sobriété (consigne du fondateur, juste après l'accessibilité)** : un seul point focal par écran, la tâche principale évidente en 3 s, le reste plus discret. **Un seul bouton `primary` par vue** ; `quiet` pour l'action répétée de chaque ligne. L'accent est réservé à ce qui est interactif, courant ou cité. Pas de compteur en double, de badge redondant, d'icône d'ornement ni de métadonnée secondaire : les détails en divulgation progressive. Graphiques : libellés directs, pas de décor, jamais la couleur seule, nombres formatés et alignés.
- **Mouvement** : seulement pour un retour, un changement d'état ou l'orientation ; jamais plusieurs animations qui se disputent l'œil. Seule l'aurore bouge en continu ; le faisceau seulement pendant que Leon travaille. Ce qui est là à l'arrivée sur un écran s'affiche sans entrée (`useAppear()`), **pas de révélation au défilement**, pas d'attente simulée, rien de caché derrière une chorégraphie. N'animez que `transform`, `opacity`, `filter`. Préréglages dans `@/lib` (ci-dessous). En `?instant=1` ou mouvement réduit, `useInstant()` vaut `true` : affichez l'état final, sans chorégraphie (motion saute déjà ses animations ; les animations CSS sont coupées). **Un flou animé finit par `transitionEnd: unfilter`** (déjà fait dans `pageVariants`, `rise`, toasts) : un `filter` resté posé, même `blur(0px)`, fait de l'élément le bloc conteneur de tout `position: fixed` descendant et casse le verre imbriqué. Dans Tailwind 4, `scale-*` et `translate-*` sont les propriétés `scale` et `translate` : écrivez `transition-[scale]` / `transition-[translate]`, pas `transition-[transform]`.
- **Accessibilité** : un seul `h1` par page (`PageHeader`), `Section` pour les `h2`, `IconButton` exige `label`, focus visible partout (anneau d'accent global), jamais le sens par la couleur seule.
- **Mobile** : sous 861 px la barre latérale disparaît (variants `shell:` / `max-shell:`). Aucun défilement horizontal à 390 px : dans une grille, écrivez `grid-cols-[minmax(0,1fr)]` ou donnez `min-w-0` aux enfants qui contiennent du texte `whitespace-nowrap`.
- **Titre d'onglet** : `useTitle('Recherche')` → « Recherche · Leon ».
- **Paramètres de démonstration** propres à votre écran (`?etat=…`) : documentez-les en tête de votre `index.tsx`.

## Contrat avec le routeur (`src/main.tsx`, ne pas modifier)

| Dossier | Export par défaut | Routes |
|---|---|---|
| `screens/recherche` | `Recherche()` | `/` (état dans l'adresse : `?q=`, `&page=`) |
| `screens/discussions` | `Discussions()` | `/discussions` (`?nouvelle=1`), `/discussions/:id` (`useParams().id`) |
| `screens/connexions` | `Connexions()` | `/connexions` |
| `screens/sources-reglages` | `SourcesReglages({ page: 'sources' \| 'reglages' })` | `/sources`, `/reglages` (`?creer=1`) |
| `screens/auth-systeme` | `AuthSysteme({ page: 'connexion' \| 'inscription' \| '404' \| 'erreur' })` | `/connexion`, `/inscription`, `*` (hors ossature, dans `StandaloneShell` : aurore + `<main>`, à vous de centrer) ; `erreur` = `errorElement` (dans le panneau pour une erreur d'écran, `useRouteError()`) |

Les écrans sont chargés à la demande ; pendant le chargement, l'ossature montre `PageSkeleton`. Tous les écrans sont préchargés pendant un temps mort après le démarrage : la transition de page joue sur l'écran, pas sur le squelette. L'ossature fournit déjà : aurore, barre latérale, barre mobile, palette ⌘K, `<Toaster />`, transitions de page, focus sur `<main id="contenu">` et retour en haut **quand le chemin change**. Pendant sa sortie, l'écran sortant garde son contenu **et son adresse** (`useLocation`, `useSearchParams`, `useParams` y lisent encore l'ancienne) : il ne repasse pas à un autre état et ne prend pas le focus. La toute première page s'affiche sans entrée (`initial={false}` sur elle seule) ; ce qui y monte ensuite joue son entrée normalement : **plus besoin d'`<AnimatePresence>` ni de `PresenceContext` maison pour ça**. Après un choix dans la palette qui change de page, le focus que la nouvelle page pose (champ de `?nouvelle=1`) est gardé. `useShell()` dit `'app'` (dans l'ossature) ou `'standalone'` (connexion, 404, erreur racine). Un changement de paramètres sur le même chemin (`?q=`, `?page=`, filtres) ne bouge ni le focus ni le défilement : `Pagination` remonte seule ; ailleurs, appelez `scrollToTop()` (`@/lib`) et gérez le focus vous-même.

**Barre latérale repliable.** Recherche a l'icône `TextSearch` ; le bouton « Rechercher ⌘K » juste au-dessus est une ligne sans cadre au glyphe ⌘ (dans le rail, deux loupes empilées se confondaient). **Sur `/`, ⌘K et ce bouton mettent le curseur dans `#barre-de-recherche` (et sélectionnent son texte), comme le vrai Leon ; ailleurs ils ouvrent la palette.** Dans la palette, un début de mot d'une section ou d'une action (« sources », « jeton ») passe devant : Entrée y va ; sinon Entrée lance la recherche du texte tapé. Le pied de la barre ne dit rien quand la mémoire est à jour. Dépliée (248 px) ou repliée en rail d'icônes (64 px) : bouton en haut de la barre, touche `[` (hors champ de saisie), action de la palette. Choix mémorisé (`localStorage` `leon-rail`) ; sans choix, dépliée dès 1280 px, repliée de 861 à 1279 px. Le panneau prend la place libérée : **un écran ne suppose jamais la largeur du panneau** (à 1024 px de fenêtre, la page a 700 px utiles barre dépliée, 884 repliée ; elle plafonne à 1176 px dépliée, 1360 repliée). Pendant les 220 ms du repli, la page est posée une fois à sa largeur finale puis glisse ; un `ResizeObserver` d'écran ne voit qu'un seul changement. En repliant, la page est donc un instant plus large que le panneau qui s'ouvre : son bord droit est rogné pendant ~150 ms, puis entre (voulu : sinon le texte se remettrait en page à chaque image). Le haut du panneau n'a plus de bandeau : le premier élément de la page (`PageHeader`) est en haut, sous 40 px de marge.

## `@/components` : système de design

### Boutons et pastilles
```tsx
<Button variant="primary|secondary|quiet|ghost|destructive|link" size="sm|md|lg" icon={MessageSquarePlus} loading={pending}>Demander à Leon</Button>
// un seul primary par vue ; quiet (contour fin, sans fond) pour l'action répétée de chaque ligne d'une liste
// loading : rotation, aria-busy + aria-disabled, clic (et envoi du formulaire) avalé ; le bouton garde le focus clavier
<Button asChild variant="secondary"><Link to="/">Retour à l’accueil</Link></Button>   // l'icône est gardée
<IconButton icon={ArrowUp} label="Envoyer la question" variant="ghost|secondary|primary" size="sm|md|lg" loading tooltip={false} />   // loading : comme Button
<Pill icon={Wrench} chevron>Outil</Pill>                      // en déclencheur de menu, le chevron tourne seul (data-state=open)
<Pill variant="active" removable aria-label="Retirer le filtre « Outil : GitHub »" onClick={…}>Outil : GitHub</Pill>
<Pill variant="warning" icon={TriangleAlert} removable …>Outil : slack</Pill>   // + <Tooltip content="Filtre non reconnu : la recherche l’ignore.">
<Badge tone="neutral|accent|success|warning|destructive|info" icon={…}>Non essayé en réel</Badge>   // mono : seulement pour un nombre ou un code (<Badge mono>1 234</Badge>)
<StatusBadge status="running|done|failed" />                  // En cours · Indexée · Erreur ; « Indexée » (l'état courant) reste discret : icône verte, mot atténué, sans pastille
<Kbd>{MOD_KEY}K</Kbd>                                          // MOD_KEY = « ⌘ » sur Mac, « Ctrl » ailleurs ; Kbd est aria-hidden
```

### Puces
```tsx
<CitationChip n={1} label="Résultat 1 : Call ACME — renouvellement 2027" href="#resultat-fathom-call-acme" active={lit===1} animate />  // recherche : lien
<CitationChip n={2} label="Source 2 : Relance — contrat ACME v3" onClick={() => openPreview(2)} />                                      // discussion : bouton
<SourceChip kind="fathom" boxed extra={['Réunion', 'Équipe Sales']} />       // icône + « Fathom · Réunion · Équipe Sales »
<SourceChip kind="github" author="Julie Martin" date={d} time />             // « GitHub · Julie Martin · 12 oct. 2026, 14:12 »
<ToolIcon kind="hubspot" boxed />                                            // icône de l'outil ou de sa famille, ou du canal (claude_code…)
<SourceLink kind={r.kind} href={r.url} />                                    // « Ouvrir dans Fathom », nouvel onglet ; rien sans adresse
```
`CitationChip` accepte les événements (`onMouseEnter`, `onFocus`…) pour éclairer le résultat lié. Zone de clic de 33 px.

### Verre et signal
```tsx
<GlassCard variant="panel|raised" signal spotlight reading className="p-4">…</GlassCard>
// panel : cartes de résultats (rounded-card, bg-glass) ; raised : réponse, aperçu, formulaires (rounded-box, bg-glass-2)
// signal : filet dégradé + halo d'accent en haut (cartes importantes : réponse de Leon, palette) ; spotlight : lueur qui suit le pointeur ;
// reading : trait de lumière qui parcourt l'arête haute (Leon lit cette source)
// Avec mesure : signal sur UNE carte par vue (la réponse en cours, pas chaque réponse d'un long fil) ; spotlight sur les
// cartes cliquables seulement ; reading seulement pendant la lecture ; Beam seulement pendant que Leon travaille
<Spotlight className="rounded-card border border-line">…</Spotlight>          // la lueur seule, autour de n'importe quel bloc (rognée à ses bords)
<Beam active={searching} className="rounded-box" ref={barRef}><div className="rounded-box …">barre de recherche</div></Beam>
// faisceau conique qui tourne autour de l'enfant + halo ; même rayon sur Beam et sur l'enfant ; `ref` accepté
// trackSpot(e) (lueur maison) : hôte `.spot-host` (position relative, rogné) dont un enfant direct est <span className="spot" /> ; seule la lueur bouge
```
**Leon travaille** : `const { setThinking } = useThinking(); setThinking(true)` pendant la recherche ou la réponse ; l'aurore s'intensifie, et l'inscription tombe seule au démontage. Associez-le à `<Beam active>` sur la barre.

### Retours
```tsx
<Skeleton className="h-2.5 w-3/4" />   <SkeletonText widths={['94%','81%','58%']} />   <PageSkeleton />
<EmptyState icon={Search} title="Aucun résultat." description="Essayez d’autres mots…" action={<Button>Revenir à la première page</Button>} bare />
// carte de verre nette (trait 1 px + reflet), pastille d'icône neutre ; bare : sans cadre, dans une carte qui en a déjà un
<Notice tone="neutral|info|success|warning|error" icon={CircleAlert} action={{ label: 'Réessayer', icon: RotateCcw, onClick }} live="alert|status">Leon n’a pas pu répondre…</Notice>
// neutral (verre, icône atténuée) pour une simple remarque ; les tons colorés quand il faut agir. Défaut : info
toast('Synchronisation demandée : elle démarre dans la minute.');  toast.success('Jeton révoqué.');  toast.error('Impossible de révoquer. Réessayez.');
// 4 s (8 s pour une erreur), en pause tant que le pointeur ou le focus est sur la pile ; trois au plus ; message annoncé (aria-live polite)
```

### Champs (Field relie libellé, aide/erreur et contrôle)
```tsx
<Field label="Jeton d’accès à grain fin" help="…" error={err} id="cle" aside={<a href={docsUrl} target="_blank" rel="noreferrer">Où trouver la clé ↗</a>}>
  // id (facultatif) : celui du contrôle, à viser d'ailleurs (aria-controls d'un bouton « Voir ») ; l'erreur est annoncée (role=alert)
  // les champs passent à 16 px au doigt (pas de zoom iOS) ; en erreur, l'anneau de focus global reste visible
  <Input placeholder="github_pat_…" type="password" />
</Field>
<Textarea autoGrow maxRows={8} rows={1} ref={composerRef} placeholder="Posez une autre question…" />   // ref et autoGrow ensemble
<Select options={BACKFILL_OPTIONS} defaultValue="30" onValueChange={…} />
<Checkbox checked={c} onCheckedChange={setC} label="…" />   <Checkbox defaultChecked label="…" />   // contrôlée ou non
<Switch checked={s} onCheckedChange={setS} label="…" />
<CheckboxBox checked />   // la case seule (lignes de menu maison)
```

### Calques (Radix : focus piégé, Échap ; entrée 220–260 ms, sortie 140 ms ; voile sans flou)
Le focus revient à l'élément qui l'avait à l'ouverture, **même sans `DialogTrigger`** (fenêtre ouverte par un état, `?creer=1`, un article de menu) : `DialogContent`, `AlertDialog` et `SheetContent` s'en chargent.
```tsx
<Dialog open={o} onOpenChange={setO}>
  <DialogTrigger asChild><Button>Brancher</Button></DialogTrigger>
  <DialogContent title="GitHub" description="Ce que Leon lit dans GitHub est visible de toute l’équipe." size="sm|md|lg" hideClose dismissible={false}>
    …<DialogFooter><DialogClose asChild><Button variant="ghost">Annuler</Button></DialogClose><Button variant="primary">Tester et brancher</Button></DialogFooter>
  </DialogContent>
</Dialog>
<AlertDialog trigger={<Button variant="ghost">Révoquer</Button>} title="Révoquer « MacBook de David » ?" description="Les outils qui l'utilisent perdront l'accès." confirmLabel="Révoquer" onConfirm={…} />
<DropdownMenu><DropdownMenuTrigger asChild><Pill icon={Wrench} chevron>Outil</Pill></DropdownMenuTrigger>
  <DropdownMenuContent className="w-[252px]">   // une longue liste défile dans la place disponible
    <DropdownMenuLabel meta="sources">Filtrer par outil</DropdownMenuLabel>
    <DropdownMenuCheckboxItem checked={on} onCheckedChange={…} meta={611}>GitHub</DropdownMenuCheckboxItem>   // reste ouvert au clic
    <DropdownMenuSeparator /><DropdownMenuItem icon={Trash2} destructive onSelect={…}>Supprimer</DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>
<Popover><PopoverTrigger asChild>…</PopoverTrigger><PopoverContent>…</PopoverContent></Popover>
<Tooltip content="Ouvrir dans Fathom" side="top">{bouton}</Tooltip>
<Sheet open={o} onOpenChange={setO}>                              // feuille du bas : aperçu sous 920 px, menu mobile
  <SheetContent title="Call ACME — renouvellement 2027" description="Fathom · Réunion" titleHidden hideClose>…</SheetContent>
</Sheet>                                                         // SheetTrigger, SheetClose aussi ; 88 % de haut au plus, filet Signal
<Collapsible><CollapsibleTrigger className="group …">ou coller une clé <ChevronDown className="group-data-[state=open]:rotate-180" /></CollapsibleTrigger>
  <CollapsibleContent>…</CollapsibleContent></Collapsible>        // le contenu entre en fondu (sans animer la hauteur)
```
Menus et listes : survol en `bg-hover`, et au clavier un anneau intérieur de 2 px (comme les `.mi` de la planche).
`usePalette().openPalette()` ouvre la palette ⌘K (elle est globale : ne la remontez pas) ; sur `/`, il met le curseur dans la barre de recherche à la place. Un changement de chemin pendant qu'un calque est ouvert (palette, menu mobile) laisse le focus au calque, qui le pose sur `<main>` en se fermant.

### Texte, code, navigation
```tsx
<PageHeader title="Discussions" subtitle="…" meta={<><Lock />Vos discussions ne sont visibles que de vous.</>} actions={…} />
// en-tête caché mais lu (Recherche une fois la requête tapée) : className="sr-only"
<Section id="jetons" title="Jetons personnels" description="…" actions={<Button>Créer un jeton</Button>}>…</Section>   // autres props (tabIndex, data-*) → <section>
<Highlighted text={passage.snippet} />                       // marqueurs U+E000…U+E001 → <mark>
<CitedText text={answer} renderCite={(n) => <CitationChip n={n} label={…} />} keep={(n) => n <= results.length} />   // puces collées au mot d'avant et à la ponctuation d'après
<CopyButton value={secret} label="Copier" />                  // toasts « Copié. » / « Impossible de copier. Sélectionnez le texte à la main. »
<CodeLine code={CLAUDE_CODE_COMMAND} wrap />                  // wrap : passe à la ligne (rien de caché à 390 px), « --header » jamais coupé
<Pagination page={2} pages={7} href={(p) => `/?q=${encodeURIComponent(q)}&page=${p}`} focusId="resultats-titre" />   // sans total : pages absent + hasNext ; focusId : où va le focus après le changement (tabIndex={-1})
<Sparkline values={[3,5,4,7]} label="Activité…" />          // immobile
```
`<Pagination>` remonte en haut du panneau au clic. Aussi exportés : `Logo`, `Brand`, `useShell`, `trackSpot` (lueur maison), `TooltipProvider` (déjà monté), les types `CheckboxProps`, `SwitchProps`, `TextareaProps`, `SheetContentProps`.

## `@/lib`

| Export | Usage |
|---|---|
| `cn(...)` | clsx + tailwind-merge (connaît nos tailles, rayons, ombres) |
| `nb(s)` | espaces fines insécables françaises |
| `NOW` | **le « maintenant » fixe : 21 oct. 2026, 11:00, Paris.** N'utilisez jamais `new Date()` pour un affichage |
| `formatDate(d)` · `formatTime(d)` · `formatDateTime(d)` · `formatRelative(d)` · `formatSince(d)` · `formatNumber(n)` | « 12 oct. 2026 » · « 14:12 » · « 12 oct. 2026, 14:12 » · « à l’instant / il y a 4 min / il y a 2 h / hier / date » (insécables : jamais coupé en fin de ligne) · idem mais « le 12 oct. 2026 » · « 1 234 » |
| `paris('2026-10-14 14:02')`, `minutesAgo(n)` | fabriquer des dates |
| `useTheme()` | `{ theme, setTheme, toggle }` (mémorisé dans `leon-theme`, `?theme=` prioritaire) |
| `useInstant()`, `isInstant()` | état final sans chorégraphie (`?instant=1` ou mouvement réduit) |
| `simulateStream(text, { onToken(token, acc), signal, instant, delay })` | flux mot à mot réaliste ; résout `'done'` ou `'aborted'` ; immédiat en mode instantané. `[n]` arrive comme un seul morceau, « 15 % » aussi (coupé sur `[ \t\n]+` : faites de même si vous redécoupez, jamais `\s+`, qui casserait les espaces insécables) |
| `wait(ms, signal)` | pause de chorégraphie (0 en mode instantané ; `false` si interrompue) |
| `useTitle(t)` | « t · Leon » |
| `scrollToTop()` | remonte en haut du panneau (et de la page sur mobile) |
| `useMinWidth(ref, px)` | `true` si l'élément fait au moins `px` de large : requête de conteneur (le panneau change avec le rail ; ne vous fiez pas à la fenêtre), pour volet ou feuille, deux colonnes ou une |
| `useAppear()` | `false` au premier rendu, puis `'initial'` : `<motion.li initial={appear} animate="animate">`, seul ce qui arrive après l'arrivée sur l'écran joue une entrée |
| `mergeRefs(ownRef, outerRef)` | un nœud, deux refs (votre ref interne + la `ref` reçue en prop, React 19) |
| `ease`, `duration`, `spring`, `springSoft`, `enter`, `exit` | courbes et durées : entrée 0,26 s ease-out `[.16,1,.3,1]`, sortie 0,14 s ; ressort des puces et indicateurs |
| `pageVariants`, `rise`, `fade`, `pop`, `list`, `stagger(i)` | variantes motion : `<motion.li variants={rise} initial="initial" animate="animate" transition={{ delay: stagger(i) }}>` (le délai se fond dans la transition de la variante) ; `rise` = monte de 10 px en sortant d'un flou (résultats) ; `pop` = puce qui éclot. Un élément `variants={rise}` **sans** ses propres `initial`/`animate` hérite des étiquettes de la page et entre avec elle : pour une entrée à lui, donnez-les (ou `inherit={false}`) |
| `unfilter` | `{ filter: 'none' }` : `animate={{ filter: 'blur(0px)', transitionEnd: unfilter }}` pour tout flou maison |
| `splitHighlights`, `markTerms(text, terms)`, `markPhrase`, `referenceSegments`, `fold`, `HL_START`, `HL_END` | surlignage et renvois `[n]` (`fold` : sans casse ni accent, espaces fines ramenées à l'espace) |

Classes CSS d'effet : `spin` (rotation 12 px, prend la couleur du texte dans un bouton), `pulse` (point vert, fixe), `caret` (curseur de saisie), `caret-block` (curseur de flux qui respire), `word-in` (mot qui sort d'un flou), `pop-in`, `sk` (squelette), `sweep` (reflet qui balaie : seulement pendant un chargement), `reading`, `signal-line` (filet dégradé sur l'arête haute ; l'hôte doit être `relative`), `signal-glow` (halo d'accent en haut), `spot-host` + `spot` (lueur), `beam-host` + `beam` (faisceau, préférez `<Beam>`). Calques Radix (posés sur un élément qui porte `data-state`) : `layer-pop` (menus, popovers), `layer-dialog`, `layer-sheet`, `layer-scrim`, `layer-collapse` ; ils sont déjà sur les composants, à n'employer que pour un calque maison.

## `@/data` (fictif, déterministe, en français)

- **Gens** : `ORG` (Acme), `ME` (David Sperling, david@acme.fr), `TEAM`, `JULIE BOB ALICE THOMAS`, `PIERRE` (parti), `MARC` (client ACME), `PEOPLE`, `findPeople(q)`.
- **Outils** : `PROVIDERS` (39, par famille puis libellé ; chacun : `id label family oauth keyAccepted fields keyHelp oauthHelp docsUrl warning triedForReal` = **copie exacte du vrai Leon**), `getProvider(id)`, `providersOf(family)`, `FAMILIES` (`id label icon`), `CAPTURE_CHANNELS`, `kindLabel(kind)`, `kindIcon(kind)`, `NATURES`, `NATURE_LABELS`.
- **Corpus** : `CORPUS` (40 éléments : réunions, mails, tickets, pages, notes CRM, conversations IA, commits), `getItem(id)`.
- **Recherche** : `search(q, { page, filters, force })` → `{ results (10 par page, chacun : n, kind, kindLabel, natureLabel, origin, title, url, passages[{author,date,snippet}], preview[{speaker,at,text,matching}]), total, pages, answer (texte avec [n] = rang en page 1, ou null ; chaque source citée est en page 1, une phrase dont la source est écartée par un filtre est retirée), answerState ('ok' | 'not-enough' | 'unavailable' via force), unknownPeople, unknownFilters, activeFilters[{label, recognized, removeQuery}], tookMs }`. Syntaxe : `de: outil: type: depuis: avant: "phrase exacte"`. Requêtes qui marchent : les 4 exemples, « où en est le renouvellement du contrat ACME ? » (réponse citée, 2 pages), budget, OVH, sauvegardes, SSO, recrutement ; `xyzzy` → rien. Aides : `withFilter`, `withoutFilter`, `hasFilter`, `filterTokens`, `countLabel(total)`, `plain(snippet)`, `SEARCH_EXAMPLES`, `SYNTAX_HELP`, `TOOL_OPTIONS`, `NATURE_OPTIONS`, `PERIOD_OPTIONS`, `RECENT_SEARCHES`, `PAGE_SIZE`.
- **Discussions** : `DISCUSSIONS` (8 ; `ovh-echeance` attend sa réponse, `acme-renouvellement` et `budget-plafond` sont complètes, `lenteurs-export` finit par « Je ne sais pas »), `useDiscussions()` (la liste à jour, à lire dans un composant), `subscribeDiscussions(l)`, `getDiscussion(id)`, `createDiscussion(q)` (ajoute en tête et prévient les abonnés : barre latérale, palette, liste), `generateAnswer(q)` → `{ text, sources, steps }`, `cite(text)`, `FIXED_TEXTS`, `ACTIVITY_LABELS`. Message assistant : `{ text (avec [n]), sources[{n, itemId, title, url, kind, kindLabel}] }`.
- **Sources** : `CHANNEL_STATUS` (4 canaux, `text` prêt : « Claude Code : dernière capture il y a 4 min », `late` pour ChatGPT), `SOURCES` (71 lignes, `indexing` running/done/failed/null), `sourcesPage(p)`, `SOURCES_PAGE_SIZE` (50), le type `IndexingStatus` (celui de `<StatusBadge status>`).
- **Connexions** : `CONNECTIONS` (GitHub, Linear, Notion ×2 par Alice et Bob, Fathom, Claap, Granola en attente, Outlook OAuth ; HubSpot en pause, Intercom en erreur, Jira arrêtée), `connectionsOf(id)`, `statusLine(c)`, `statusTone(c)`, `secretLine(c)` (« Clé ••••abcd · branché par Julie le 12 oct. 2026 »), `otherOwners(id)`, `otherOwnersNote(id)` (« Déjà branché par Alice et Bob. »), `dialogDescription(id)`, `BACKFILL_OPTIONS`, `BACKFILL_DEFAULT`, `ACTIVE_TOOL_COUNT` (7).
- **Réglages** : `TOKENS` (3), `createToken(nom)` → `{ token, secret }` (unique à chaque appel, même pour un nom déjà pris), `SERVER_URL`, `CLAUDE_CODE_COMMAND`, `MEMORY` (barre latérale).

Les données sont des modules : pour un état modifiable (révoquer, brancher), copiez-les dans un `useState` de votre écran.
