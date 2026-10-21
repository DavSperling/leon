# Leon UI inventory (French UI, Next.js)

Root: `src/` du dépôt Leon. Page titles use the template `"%s · Leon"`. Fonts are Inter for the UI, IBM Plex Serif (kept for literal quotes) and IBM Plex Mono. Dates are shown in Paris time. A sonner Toaster is mounted globally.

## Global shell (`components/app-shell.tsx`, `shell-frame.tsx`)
- **Skip link:** "Aller au contenu".
- **Top bar (h-14):** a round black "L" avatar with the word **"Leon"**, then a PanelLeft toggle. Its aria-label is "Replier la barre latérale" or "Déplier la barre latérale". The sidebar is 256px wide and animates closed to 0px.
- **Sidebar, in order:**
  1. **Workspace menu** (`workspace-menu.tsx`). The trigger is a card showing a round initial (first letter of the org), the org name, the user name below it, and a ChevronsUpDown icon. Its aria-label is "Menu du compte, {userName}". The dropdown shows the user name and email as a label, a separator, then **"Se déconnecter"**.
  2. **Command search** (`command-search.tsx`). An outline button with a Search icon, the text **"Rechercher…"** and a `⌘K` kbd. Clicking it, or pressing ⌘K / Ctrl+K anywhere, focuses and selects the home search input (`#barre-de-recherche`) if it is on the page. Otherwise it navigates to `/?q=`. There is no modal palette.
  3. **Sections** (`sidebar-sections.tsx`), each with a lucide icon:
     - Recherche (Search) `/`
     - Discussions (MessagesSquare)
     - Sources (Inbox)
     - Connexions (Plug)
     - Réglages (Settings)

     The active item gets `bg-sidebar-accent`, medium weight and primary colour.
- **Panel:** a white rounded card that holds `<main id="contenu">`. Below 1024px the page scrolls; there is no drawer.

## Shared components
- **EmptyState:** a bold reason line, a muted next-step line, and an optional single button.
- **SourceChip** (`source-chip.tsx`): icon + `label[ · authorName][ · dateTime]` at 13px, muted.
  - Icons for capture channels: claude_code → Terminal, claude_ai and chatgpt → Globe, mcp_remember → PenLine, interface → Monitor, other → Plug.
  - Connected tools take their family's icon: dev → Code, reunions → Mic, projet → KanbanSquare, crm → Users, support → LifeBuoy, mails → Mail.
- **SourceLink:** "Ouvrir dans {kindLabel}" with an ExternalLink icon (new tab).
- **StatusBadge** (`status-badge.tsx`), for indexing status:
  - `running`: **"En cours"**, CircleDashed, info tone.
  - `done`: **"Indexée"**, CircleCheck, success tone.
  - `failed`: **"Erreur"**, CircleX, destructive tone.
- **ConnectionStatus:** an icon plus a status line.
  - Active (CircleCheck, green):
    - "Actif · premier passage en attente"
    - "Actif · dernier passage il y a 2 h · 1 234 éléments"; a bare date gets "le " in front, e.g. "le 12 oct. 2026".
  - Paused (Pause, muted): "En pause".
  - Error (CircleX, red): "En erreur : {lastError}" or "En erreur".
  - Creator left (red): "Arrêtée : {name} n'est plus membre".
- **CopyButton:** "Copier". Toasts "Copié." or "Impossible de copier. Sélectionnez le texte à la main."

## Display formats (`lib/format.ts`)
- `formatDate`: "12 oct. 2026".
- `formatDateTime`: "12 oct. 2026, 14:12".
- `formatRelative`: "à l'instant", "il y a 4 min", "il y a 2 h", "hier", then the date.
- Numbers use fr-FR grouping ("1 234").
- **Highlights** (`lib/highlight.ts`): search snippets arrive with U+E000 / U+E001 around matched words. They are split and rendered as `<mark>` with a primary-soft background, primary text and medium weight. The preview pane highlights query terms client-side using a rough stem.

## Citation / reference format (`lib/references.ts`)
- The answer text contains `[n]`, or chains like `[1][3]`. A bracket stuck to a letter, digit, `_`, `]` or `)` is code and stays as text.
- Each `[n]` becomes a small chip: 18px tall, rounded 5px, primary-soft background, 12px primary digits. On hover it turns solid primary.
- **Search answer box:** the chip is an `<a href="#resultat-{sourceId}">` with title = result title and aria-label "Résultat n : {title}".
- **Discussion:** the chip is a button that opens the preview. Its aria-label is "Source n : {title}".
- A missing title shows as "Sans titre".

---

## 1. Recherche — `/` (`app/(app)/page.tsx`)
**Purpose:** full-text and semantic search across everything Leon has kept, with an optional AI answer on top.

**Blocks, in order:**
1. **Header** (visually hidden once a query is typed):
   - h1 **"Recherche"** (36px).
   - Subtitle: "Retrouver une information dans tout ce que Leon a gardé."
2. **Search bar** (`search-bar.tsx`), 56px tall:
   - Left icon: Search, or a spinning LoaderCircle while pending.
   - Placeholder: "Rechercher dans tout ce que Leon a gardé…"
   - X clear button (aria "Effacer la recherche") when there is text.
   - Primary button **"Rechercher"**.
   - Max 300 characters. Autofocused when there is no query.
3. **Welcome screen (no query):**
   - h2 "Quelques recherches pour commencer". A 2-column grid of cards, each with the query in a mono code pill and a muted hint:
     - `outil:github type:ticket`: "Les tickets GitHub, les plus récents d’abord"
     - `type:réunion depuis:7j`: "Les réunions de la semaine"
     - `"renouvellement du contrat"`: "Les mots exacts d’une phrase"
     - `budget depuis:3m`: "Un sujet, sur les trois derniers mois"
   - h2 "Pour affiner, écrivez-le dans la barre". A two-column dl of code → text:
     - `de:julie`: "ce qu’une personne a écrit (son nom ou son e-mail)"
     - `outil:github`: "un seul outil"
     - `type:réunion`: "une sorte de source : ticket, page, mail, fichier, conversation…"
     - `depuis:7j`: "les 7 derniers jours (j), semaines (s) ou mois (m)"
     - `avant:2026-10-01`: "avant une date"
     - `"phrase exacte"`: "les mots tels quels, dans cet ordre"
4. **Filters row** (`search-filters.tsx`, `filter-menu.tsx`). Every filter lives in the query string; there is no hidden state.
   - **Active chips** (pill, primary-soft) read "{Clé} : {valeur}" with an X link (aria "Retirer le filtre « … »"). Key labels: Personne / Outil / Type / Depuis / Avant. Examples: "Outil : GitHub", "Depuis : 7 jours", "Avant : 1 oct. 2026".
   - **Unrecognised chip:** warning tone with a TriangleAlert icon and tooltip "Filtre non reconnu : la recherche l’ignore."
   - **Dropdown pills** (outline, rounded-full, chevron), with checkbox items:
     - **"Outil"** (Wrench): every source kind, sorted alphabetically by label.
     - **"Type"** (Layers): the item natures.
     - **"Période"** (CalendarDays): "7 derniers jours", "30 derniers jours", "3 derniers mois", "12 derniers mois".
   - **"Personne"** (UserRound) expands inline into an input (placeholder "Nom ou e-mail") with buttons **"Ajouter"** and **"Annuler"**. Escape closes it.
5. **Answer box** (`answer-box.tsx`). Shown only on page 1, with hits, when an LLM is configured.
   - Card heading: Sparkles icon + **"Réponse de Leon"** (13px, primary).
   - **Loading:** 3 skeleton lines (sr "Leon prépare une réponse…").
   - **Streaming:** the text plus a pulsing caret block. `[n]` chips are live.
   - **Done:** footnote "Rédigée par l’IA à partir des résultats ci-dessous : vérifiez les sources citées." and the outline button **"Continuer en discussion"** (MessagesSquare icon, spinner while pending). On error that button shows "Cette recherche ne peut pas devenir une discussion." or "La discussion n’a pas pu être créée. Réessayez dans un instant."
   - **Not enough:** the text "Les résultats ne suffisent pas pour répondre." in muted style, without the footnote.
   - **Unavailable:** "Réponse indisponible pour le moment. Les résultats ci-dessous restent complets."
   - **Hidden** on 204 (no model) or 429.
   - On wide screens it leaves a 440px right margin to line up with the results column.
6. **Unknown-person warning** (warning-soft): "Personne ne s’appelle « julie » dans l’équipe." Several names read "« a », « b » ni « c »".
7. **Search error** (destructive-soft): "La recherche n’a pas abouti. Réessayez dans un instant ; si cela persiste, regardez la page Sources."
8. **Empty, page 1:** "Aucun résultat." / "Essayez d’autres mots, retirez un filtre, ou cherchez le titre d’un document."
9. **Empty, page > 1:** "Il n’y a pas autant de résultats." / "Cette page est vide : les résultats s’arrêtent avant." with button **"Revenir à la première page"**.
10. **Count line:** "3 sources" / "1 source"; above 10: "Environ 1 234 sources".
11. **Result list + preview pane** (`result-list.tsx`). Two columns at ≥920px container width: results, plus a sticky 400px preview. Below that, the preview is a bottom sheet over a dimmed backdrop.

**Result item fields** (`result-item.tsx`, `view-model.ts`):
- **Meta line:** SourceChip (tool icon + tool label) · nature label · origin label. The origin is the first of repo / project / space / channel / folder / mailbox / site / organizer, truncated to 60 characters. Example: "GitHub · Ticket · acme/leon".
- **Title:** an 18px primary-coloured button that opens the preview. "Sans titre" in muted when absent.
- **Up to 3 passages,** each a hoverable button (selected = primary-soft):
  - "{authorName} · {date}", e.g. "Julie Martin · 12 oct. 2026".
  - A 15px snippet with `<mark>` highlights.
- **"Ouvrir dans {Outil}"** link when a URL exists.
- Results have no public/personnel visibility badge.

**Nature labels:**

| Key | Label |
|---|---|
| conversation | Conversation IA |
| reunion | Réunion |
| page | Page |
| ticket | Ticket |
| fil | Fil |
| note | Note |
| mail | Mail |
| fichier | Fichier |
| evenement | Évènement |
| commit | Modification de code |

**Preview pane** (`result-preview.tsx`):
- **Empty state (wide screens only):** MousePointerClick icon + "Cliquez sur un résultat pour lire le passage dans son contexte."
- **Header:** SourceChip "{Outil} · {Nature}", 17px title, "Ouvrir dans {Outil}", X button (aria "Fermer l’aperçu").
- **Loading:** 3 block skeletons.
- **Ready:** an ordered list of turns. Each shows the speaker name (author, or Vous / Assistant / Document / Participant), the date and time, and the text.
  - The matching turn has a left primary border on primary-soft, the label **"Passage trouvé"** in primary, and is auto-scrolled into view.
  - Other turns use the quote background and are clamped to 6 lines.
- **Not found:** "Ce passage n’est plus disponible. Relancez la recherche."
- **Error:** "L’aperçu n’a pas pu se charger. Cliquez de nouveau sur le résultat."
- Escape closes the pane.

**Pagination:** 10 per page, at most 50 pages. Layout "← Précédent | Page 2 sur 7 | Suivant →"; the missing side stays empty.

---

## 2. Discussions list — `/discussions`
**Purpose:** private Q&A threads with the Leon agent.

1. **Header:**
   - h1 **"Discussions"**.
   - Subtitle: "Posez une question : Leon cherche, lit et répond en citant ses sources, ou dit qu’il ne sait pas."
   - Lock line: "Vos discussions ne sont visibles que de vous."
2. **No-model warning** (warning-soft): "Aucun modèle d’IA n’est branché sur ce serveur : Leon ne peut pas répondre. La recherche, elle, marche."
3. **New discussion form** (card):
   - Label "Nouvelle discussion".
   - Textarea, 3 rows, max 4000 characters, placeholder "Par exemple : qu’a-t-on décidé avec ACME sur le renouvellement du contrat ?"
   - Help text "Leon cherche, lit et répond en citant ses sources." or an error in red: "Écrivez une question de 4 000 caractères au plus." / "La discussion n’a pas pu être créée. Réessayez dans un instant."
   - Button **"Demander à Leon"** (MessageSquarePlus icon, spinner while pending). Disabled without a model.
4. **h2 "Vous discussions"** — exact copy is **"Vos discussions"**.
   - Empty: "Aucune discussion pour l’instant." / "Posez une question ci-dessus, ou continuez une recherche en discussion depuis la page Recherche."
   - List (bordered card, dividers): each row shows the title (the first question on one line, up to 200 characters, truncated), a relative date ("il y a 2 h", "hier", "12 oct. 2026") and a ChevronRight.

## 3. Discussion detail — `/discussions/[id]`
- **Back link:** "‹ Discussions" (aria nav "Fil d’Ariane").
- **h1:** the discussion title (26px). Lock line: "Visible de vous seul · Leon ne lit que ce que vous avez le droit de voir."
- **Thread** (`discussion-thread.tsx`, `message-view.tsx`). Same two-column layout with a preview pane on the right. The pane is labelled "Aperçu de la source citée" and its empty hint reads "Cliquez sur une source citée pour lire le passage dans son contexte."
  - **User message:** right-aligned primary-soft bubble, max 88% wide.
    - If it is the first question and came from search, it also lists seeds under "À partir de N résultat(s) de la recherche".
  - **Assistant message:** card with "✦ Leon" heading (Sparkles icon), text with `[n]` chips, then a list under **"Sources citées"**.
    - Each row: number badge, title button (opens preview), and an ExternalLink icon button to the original when a URL exists.
  - **Streaming reply card:** "✦ Leon".
    - Before any text arrives: spinner + activity label:
      - "Leon réfléchit…"
      - "Leon cherche dans la mémoire…"
      - "Leon lit une source…"
      - "Leon regarde l’activité récente…"
      - "Leon travaille…"
    - When resuming a reply started earlier: "Leon termine une réponse commencée plus tôt…"
    - Once text streams: the raw text plus a pulsing caret. `[n]` stays plain text until the end.
  - **Fixed end texts:**
    - "Je ne peux pas répondre à cette demande." (refusal)
    - "Je ne sais pas : je n’ai rien trouvé à répondre." (empty)
    - Limit note appended: "Je me suis arrêté avant la fin : la limite de recherches et de lectures pour une réponse est atteinte. Posez une question plus précise pour que je continue."
  - **Notices** (quote background + CircleAlert icon + optional button):
    - "Leon n’a pas pu répondre pour le moment." with button **"Réessayer"** (RotateCcw). Variants:
      - "… Votre question est gardée."
      - "… Votre question vous attend dans la saisie."
    - "Leon répond déjà à deux de vos questions. Attendez qu’une réponse soit finie, puis réessayez." (+ "Réessayer")
    - "Votre session a expiré : la question n’a pas été envoyée. Reconnectez-vous, puis posez-la de nouveau." with button **"Se reconnecter"** (LogIn).
    - "Leon est ouvert ici à une autre adresse que la sienne ({origin}) : la question n’a pas été envoyée." with button **"Ouvrir à cette adresse"**.
    - "Leon répondait déjà dans cette discussion : votre question n’a pas été envoyée. Elle vous attend dans la saisie."
    - The no-model text (same as on the list page).
    - "Cette question attend encore sa réponse." with button **"Demander la réponse"**.
  - **Composer** (sticky bottom card):
    - Auto-growing textarea, placeholder "Posez une autre question…", or "Leon ne peut pas répondre sur ce serveur" when disabled.
    - Square icon button ArrowUp (aria "Envoyer la question"), or a spinner (aria "Leon répond…") while busy.
    - Hint: "Entrée pour envoyer, Maj + Entrée pour passer à la ligne. Leon ne lit que ce que vous avez le droit de voir."
  - A thread with a single user message starts the reply automatically.

---

## 4. Sources — `/sources` (`app/(app)/sources/page.tsx`)
**Purpose:** raw list of captured and connected sources, with indexing health.

1. **Header:** h1 **"Sources"**. Subtitle: "Les conversations brutes restent privées ; ce que lisent les connexions est visible de l'équipe."
2. **Channel pills,** one per capture channel (Claude Code, claude.ai, ChatGPT, Note MCP):
   - "Claude Code : dernière capture il y a 4 min"
   - "claude.ai : aucune capture"
   - Late (more than 24h), warning pill with TriangleAlert: "ChatGPT : aucune capture depuis 3 j"
3. **Empty, page 1:** "Aucune conversation captée." / "Installez l'extension ou lancez pnpm leon import-claude-code."
4. **Empty, later page:** "Cette page est vide." / "Les sources s'arrêtent avant : revenez à la page précédente."
5. **Table,** 50 rows per page:

| Column | Content |
|---|---|
| **Origine** | SourceChip |
| **Titre** | Title, or muted "Sans titre", plus an "Ouvrir dans …" link |
| **Dernier tour** | Relative time, full date/time on hover, "—" if none |
| **Tours** | Count, right-aligned |
| **Indexation** | StatusBadge, or "—" (sr "Pas encore indexée"). "Erreur" is a `<details>` that reveals "Échec de l’indexation." |

6. **Pagination:** "Précédent | Page N | Suivant". No total is shown.

---

## 5. Connexions — `/connexions`
**Purpose:** catalog of 39 tools to connect, grouped by family, with the state of each connection.

1. **Header:** h1 **"Connexions"**. Subtitle: "Ce que Leon lit dans vos outils est visible de toute l'équipe, sauf le texte des boîtes mail, qui reste privé comme une conversation."
2. **OAuth return notice** (success = CircleCheck green, error = CircleX red):
   - "{Outil} est branché. La première synchronisation démarre dans la minute."
   - "Connexion à {outil} annulée."
   - "Le lien a expiré, recommencez."
   - "{Outil} a refusé l'autorisation."
   - "{Outil} ne répond pas, réessayez dans un moment."
   - "Vérifiez les champs saisis."
   - "L'administrateur Microsoft de votre entreprise doit d'abord autoriser Leon." with the link "Lien d'accord pour l'administrateur"
   - "Accord donné : cliquez de nouveau sur Se connecter avec Outlook." (success)
   - "Reconnectez {outil} avec le même compte et le même site, ou ajoutez une autre connexion."
3. **Not configured** (warning box): "Les connecteurs ne sont pas configurés sur ce serveur : il manque la variable LEON_CONNECTORS_KEY, qui chiffre les clés des outils. Générez-la avec `openssl rand -base64 32`, ajoutez-la à l'environnement (voir .env.example), puis redémarrez Leon."
4. **One section per family:** an h2 (24px), then a bordered list of tool rows.
   - Left side:
     - Tool label plus tags: "Bientôt" (unavailable; none are today), or **"Non essayé en réel"** (currently every tool, since `triedForReal` is false for all).
     - Below: "Non branché", or for each connection its account label and a status line.
     - "Déjà branché par Alice et Bob." when others connected it.
   - Right side: button **"Brancher"** (primary) or **"Gérer"** (outline).
5. **Tool dialog** (`connection-panel.tsx`):
   - Title = tool name. Description: "Ce que Leon lit dans {Outil} est visible de toute l'équipe."
   - Optional warning line (TriangleAlert). Example from Outlook: "Le texte des courriers et de l’agenda reste privé, comme une conversation : vous seul le voyez…"
   - Optional note: "Déjà branché par X. Évitez de brancher deux fois le même espace."
   - **Existing connection card:**
     - Label, status line, and "Clé ••••abcd · branché par Julie le 12 oct. 2026" ("Jeton" instead of "Clé" for OAuth).
     - Buttons:
       - "Synchroniser maintenant" (toast "Synchronisation demandée : elle démarre dans la minute.")
       - "Mettre en pause" / "Reprendre"
       - "Reconnecter" (OAuth) or "Remplacer la clé"
       - "Supprimer"
     - Delete confirmation dialog: title "Supprimer « {label} » ?", text "Leon ne lira plus {Outil} avec cette clé, qui est effacée. Les sources déjà captées restent dans la mémoire.", buttons Annuler / Supprimer (destructive).
     - The replace-key form uses the button "Tester et remplacer".
   - **Add a connection:**
     - OAuth form: help text, any pre-fields, then the select **"Lire ce qui date de"** with options "7 derniers jours" / "30 derniers jours" (default) / "90 derniers jours" / "1 an" and the hint "Borne le premier passage, donc son coût.", then the button **"Se connecter avec {Outil}"**.
     - Then a collapsible "ou coller une clé ▾".
     - Key form: keyHelp text plus the link "Où trouver la clé ↗", the fields (e.g. GitHub "Jeton d’accès à grain fin", placeholder `github_pat_…`, and "Dépôts", a textarea with placeholder `acme/leon`), the same period select, and the button **"Tester et brancher"** ("Test en cours…" while pending). Result: "Connecté : {account}" in green, or an error such as "Clé refusée par {Outil}." / "Vérifiez les champs : …".
     - When OAuth isn't configured: "L'appli {Outil} n'est pas encore configurée sur ce serveur."
     - "Brancher une autre connexion" (ghost button).
   - **Account label examples:** "Julie Martin (acme)", "Compte HubSpot 123456", "Claap (espace Acme)", "12 réunions accessibles".

**Providers by family** (labels from `lib/providers.ts`):
- **Dev:** GitHub, Linear, Notion
- **Réunions:** Circleback, Claap, Fathom, Fireflies, Gong, Granola, Leexi, tl;dv
- **Projet:** Airtable, Asana, Basecamp, ClickUp, Confluence, GitLab, Jira, Miro, monday.com, Plane, Productboard, Sentry, Shortcut, Trello
- **CRM:** Attio, Close, folk, HubSpot, Pipedrive
- **Support:** Crisp, Freshdesk, Front, Help Scout, Intercom, Missive, Plain, Zendesk
- **Mails et agenda:** Outlook

Within each family, tools are sorted by label in French order. They have OAuth: asana, airtable, attio, basecamp, clickup, confluence, github, gitlab, helpscout, hubspot, jira, linear, miro, monday, notion, outlook, productboard. Outlook is OAuth only. The rest are key-only. The capture-channel labels (not connectors) are Claude Code, claude.ai, ChatGPT and Note MCP.

---

## 6. Réglages — `/reglages`
1. **Header:** h1 **"Réglages"**. Subtitle: "Jetons d'accès et branchement des assistants".
2. **h2 "Jetons personnels".**
   - Text: "Un jeton donne accès à ce que vous voyez. Il n'est montré qu'une fois." with the button **"Créer un jeton"**.
   - Empty: "Aucun jeton pour l'instant."
   - **List rows:** name; mono `leon_…{hint}`; "créé le 12 oct. 2026"; "utilisé il y a 2 h" or "jamais utilisé"; button **"Révoquer"**.
   - Revoke confirmation: "Révoquer « {name} » ?" / "Les outils qui l'utilisent perdront l'accès." with Annuler / Révoquer. Toasts: "Jeton révoqué.", "Ce jeton n'existe plus ou est déjà révoqué.", "Impossible de révoquer. Réessayez."
   - **Create dialog** (no close X; clicking outside does nothing):
     - Step 1: "Créer un jeton", the same description, field "Nom de l'appareil" (error "Donnez un nom à l'appareil (80 caractères au plus)."), buttons Annuler / **"Créer le jeton"** ("Envoi…" while pending).
     - Step 2: "Jeton créé" / "Collez-le dans l'outil à brancher.", the token in a mono box, the warning "Copiez-le maintenant : il ne sera plus affiché.", buttons Copier / **"Terminé"**.
3. **h2 "Brancher Claude Code".** Text: "Lancez cette commande dans un terminal, en remplaçant le jeton par l'un des vôtres." Below it, a code line with Copier: `claude mcp add --transport http leon {origin}/…mcp --header "Authorization: Bearer <votre jeton>"`.
4. **h2 "Extension navigateur".** An ordered list of 3 steps:
   - build with `pnpm ext:build`
   - in `chrome://extensions`, enable developer mode, then « Charger l'extension non empaquetée » and pick `extension/.output/chrome-mv3`
   - "Dans les options de l'extension, collez un jeton créé ci-dessus."

   Then "Adresse du serveur, fixée à la construction de l'extension (variable `WXT_PUBLIC_LEON_URL`) :" and a code line with the server URL and Copier.

---

## 7. Auth — `(auth)` layout
Centred, 360px wide, "Leon" wordmark above.
- **`/connexion`:**
  - h1 "Se connecter".
  - Fields: "E-mail", "Mot de passe" (inline "Voir"/"Masquer" toggle).
  - Button **"Se connecter"** ("Envoi…" while pending).
  - Footer: "Pas encore de compte ? **Créer un espace**".
  - Errors: "Saisissez une adresse e-mail valide.", "Saisissez votre mot de passe.", "E-mail ou mot de passe incorrect.", "Trop de tentatives. Réessayez dans quelques minutes."
- **`/inscription`:**
  - h1 "Créer un espace".
  - Fields: Nom; E-mail; Mot de passe (hint "8 caractères minimum."); "Nom de l'entreprise" (hint "Crée l'espace de votre équipe.").
  - Button **"Créer l'espace"**.
  - Footer: "Déjà un compte ? **Se connecter**".
  - Errors: "Indiquez votre nom.", "Le mot de passe doit contenir entre 8 et 128 caractères.", "Indiquez le nom de votre entreprise (2 à 100 caractères).", "Cette adresse e-mail est déjà utilisée.", "Impossible de créer le compte. Réessayez.", "Compte créé, mais la connexion a échoué. Connectez-vous."

## 8. not-found / error / loading
- **not-found:** "Cette page n'existe pas." with an outline button "Retour à l'accueil".
- **error** (inside the app shell): destructive bar with CircleX, "Impossible de charger la page. Réessayez ; si ça persiste, regardez la page Sources." and a button **"Réessayer"**. The real error message is never shown.
- **loading:** a skeleton (title bar, subtitle, 5 two-line rows), sr "Chargement…". There is no spinner.

## Example data for fakes
The fixtures are mostly placeholders: "Source de test", "Tour de test.", "Organisation de test", connection label "Connexion de test", secret hint "test". Test files have more realistic samples:
- **Titles:** "Call ACME", "Relance ACME", "Renouvellement du contrat OVH", "Où en est le contrat ACME ?", "Fathom · call ACME", "LIN-42", "Plafond de dépenses", "Compte rendu", "Page produit".
- **Snippets:** "On a parlé de la remise du plan Zéphyr : quinze pour cent la première année.", "Le contrat OVH est renouvelé.", "La réunion du budget a eu lieu hier.", "Mettre en place les sauvegardes quotidiennes de la base de production."
- **People:** Alice and Bob.

---

I only skimmed the 39 per-tool catalog files (field and help copy differs per tool), the server-side search ranking and the API routes. Some tool warnings were cut off in my grep, but the list of tools that have one is complete.