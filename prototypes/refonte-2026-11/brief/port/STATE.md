# Port of the new interface into the real app: where it stands

Updated November 12, 02:20 (local). Lead: the main session (Fable). Founder asleep; he said go.

Done
- Inventory: nine maps, `port/map-*.md`.
- Brief: `brief/port-v1.md` (decisions, rules, the foundation's review notes), `brief/port-feedback.md` (his 14 remarks
  plus "the lead keeps the design hand").
- Foundation (tokens light and dark, fonts, kit.css, base components, new shared components, `/kit`, `port/KIT.md`):
  built by one Fable agent, reviewed by two Sonnet agents (no blocker); the lead fixed by hand: the focus of a panel
  opened on its confirmation, and a waiting button (the highlighter passes along it).
- Tools: `tools/shoot.mjs`, `act.mjs`, `dead.mjs` take `--base http://localhost:3040 --login <email> [--theme dark]`
  and reuse one saved session per account (`tools/session.mjs`).
- Real app on http://localhost:3040 (preview config `leon-refonte`), prototype on http://localhost:3041
  (`refonte-maquettes`).

Running or next
- Wave 2a (launched 02:20): shell (Fable), connections (Opus), chat-home (Opus), demo-data (Sonnet), without the
  independent checks. Script: `workflows/scripts/leon-port-areas.js`, `args.areas`.
- Wave 2b (after the 5-hour usage window resets at 06:00): team, documents-admin, settings, auth-onboarding, site
  (`args.areas`), and the checks of the first three (`args.checkOnly: ['shell','connections','chat-home']`).
- Then: read the checks (`qa/port-*.md`), fix blockers, the lead's own design pass on every screen (1512 x 771, light
  and dark), typecheck, lint, tests, every screen clicked, the report to the founder in French.
- Nothing is committed.

## 03:25 — wave 2a is back (shell, connections, chat-home, demo-data); usage at 98% until 05:59

Full reports: `port/wave-2a/<area>.json` (summary, files, kept, checks, notDone, leastSure). Builders' checks: typecheck
and lint green, unit slice 84 files / 1200 tests green, db tests of the new readers green. No independent check yet.

For the lead, before or beside wave 2b:
- `next.config.ts`: move Next's dev badge (devIndicators position bottom-right): it covers the avatar, bottom left.
- Look at every ported screen at 1512 x 771, light and dark, and rework by hand. Known doubts:
  Connections: Linear shown twice for Claire (broken card + "Connect" tile); "No captures for 34 days" on a tile;
  section count flags ("Connected 5"): the founder wants no counts; several accounts in one panel is long.
  Chat: thread is full width (the founder liked the centred column of PR #118); how much is highlighted when every
  sentence cites; a whole cited turn over 400 characters gets no mark; "Leon is working…" alone before the first word.
  Home: briefing in three columns at 18px.
- Unused files to decide with the founders: connexions/carte.tsx, jeu.tsx, partie.ts, partie.test.ts, connexions.css.
- Demo data: the 06:00 (Paris) tick may overwrite the two demo briefings; if so re-run demo-step3-briefings.sql
  (see port/demo-data.md). GitHub shows "Sync failed" after a builder pressed "Sync now" (no GitHub app locally).
  The reporting tree switches on "managers see everything" for Claire and David.
- Local test databases created by builders: leon_test_refonte, leon_test_refonte_shell.
- Not seen live: the Admin entry of the menu (LEON_ADMINS unset locally), Sign out (shared session), a full OAuth
  round trip, a real reconnect, a delete of a connection.

Next: wave 2b at the reset (cron ce836d93, 06:08): team, documents-admin, settings, auth-onboarding, site, and the
checks of shell, connections, chat-home (`checkOnly`).

## 06:45 — wave 2b running (wf_e0d81434-b18, task wlaijtfk3): team, documents-admin, settings, auth-onboarding, site

Launched 06:07 with `nocheck`. The eight checks run together afterwards on a calm server:
`args: {"areas": [all eight], "checkOnly": [all eight]}`.

Done by the lead by hand on wave 2a (typecheck of these files clean, biome clean, their unit tests green):
- next.config.ts: `devIndicators: false` (the Next badge covered a control in every corner).
- Connections: Captures right after Connected; a tool that already has a card is no longer offered again under
  "Recommended" (catalogue.tsx); demo GitHub row put back to active (demo-data.md).
- Home: the "learned about you" banner is a quiet tile without a tool's logo; the briefing in 15px with 15px column
  heads; a number never starts a line alone (glued to the last word).
- Answers: two neighbouring runs of one source are one stroke (source-marks.ts, 2 tests); no seam when a stroke
  continues into the word glued to its flag (ui/text.tsx uses .hl--a / .hl--b).
- Source panel opened from an answer: marks only the words the answer took from the passage (`used`,
  `citingSentences` + test), the second run of a sentence only within 120 characters of the first; scrolls to the
  first mark.
- app-shell.tsx: the "[" handler no longer throws on a target that is not an element.
- tools/session.mjs: the session check asks /api/auth/get-session (never a screen under construction) and refuses to
  sign in again when the server does not answer.

Still to look at on a calm server (the five builders make every request take 10 s or more):
- the source panel's marks after the 120-character rule; the briefing's glued numbers;
- the command bar finding a person / a tool / a document ("karim", "outl" showed nothing after 5 s under load);
- "Recent": the three dots, the confirmation, the delete; the rail; 390 x 844; French; dark for the panels.

## 12 novembre, 09 h 10 : vague 2 presque finie, contrôles lancés

- **Vague 2b** (run `wf_e0d81434-b18`, tâche `wlaijtfk3`) : équipe, documents-admin, réglages, auth-onboarding sont
  construits (rapports complets dans `port/wave-2b/<zone>.json`). Le **site** tourne encore (dernières captures, puis
  dead.mjs) ; à sa fin : enregistrer son rapport dans `port/wave-2b/site.json`, puis lancer son contrôle
  (`args {"areas":["site"],"checkOnly":["site"],"lean":true,"reports":{"site":"…/port/wave-2b/site.json"}}`).
- **Contrôles** (run `wf_521c6044-e4a`, tâche `wrom39l8g`) : sept zones (shell, connections, chat-home, team,
  documents-admin, settings, auth-onboarding), Sonnet, mode `lean` (ils ne relancent ni typecheck ni les suites) ;
  chacun reçoit le rapport de son constructeur (`args.reports`). Rapports attendus dans `qa/port-<zone>.md`.
- **Suites à 08 h 43** (`qa/suites-0845.txt`) : `tsc` exit 0 sur tout le dépôt ; unit : 275 fichiers, 6456 passés,
  2 sautés. Pas encore lancés : tests base de données, `pnpm build`.
- **Mes retouches à la main depuis 08 h 40** : le test translation-keys lit `settings.connectedTitle` (clé
  `assistantsTitle` supprimée en/fr) ; onboarding `linkNote` et `leaveDescription` (plus de « Réglages › Équipe ») ;
  `initialsOf` ne garde que des lettres (« David (démo) » → DD, test ajouté) ; Réglages › Espace : pictogramme
  `Glyph Building2` à la place du carré d'encre à une lettre (retour 7) ; Équipe : « Tout le monde » replié = les
  visages + « Voir tout le monde » sous le titre, tri dans la langue de l'interface ; `equipe/send-by-email.tsx`
  partagé par le panneau d'invitation et l'étape Collaborateurs (deux copies supprimées) ; « C'est prêt » : un seul
  surlignage ; `initialOf` (mort) retiré de shell/brand.tsx ; les « + » de l'arbre paraissent dès que le pointeur
  entre dans l'arbre (`group/tree`).
- **À vérifier sur un serveur calme** : une erreur d'hydratation vue une fois sur /equipe à 08 h 53 (sans doute le
  rechargement à chaud juste après ma retouche : recharger et lire la console) ; un vrai clic sur une tuile
  déplaçable ouvre bien la fiche (compte propriétaire) ; les « + » au survol de l'arbre ; la rangée de visages ;
  l'envoi par e-mail dans le panneau et dans l'onboarding ; « C'est prêt » ; et le reste de la vague 1 (panneau d'une
  source, numéros du point collés au dernier mot, barre de commande qui trouve une personne, suppression d'une
  discussion récente, 390 px, français, panneaux en sombre).
- **Base** : migration 0065 (`invitation_links.manager_id`) appliquée à `leon_refonte` ; bases de test
  `leon_test_refonte`, `leon_test_refonte_shell`, `leon_test_refonte_equipe`. Documents d'essai laissés par le
  constructeur (notes-chantier, process-devis, planning-2027, primes-confidentiel « Vous seul », dossier
  chantier-dupuis). L'interrupteur « managers » a pu être basculé puis remis par le constructeur des réglages (vu
  allumé à 08 h 54).
- **À dire à David** : le constructeur des réglages a affiché une fois, dans sa propre sortie d'outil, la ligne du
  README de démo qui contient le mot de passe des comptes d'essai (fichier local, rien dans le dépôt).
- **Charge** : sept contrôleurs + le site = charge 40 sur 10 cœurs ; mes captures n'aboutissent plus (> 150 s). Ne
  pas modifier `src/` pendant qu'ils jouent leurs parcours (rechargements à chaud dans leurs pages).

## 12 novembre, 10 h 05 : site construit, six contrôles rendus, quota à 100 % jusqu'à 11 h

- Le **site** est construit (rapport `port/wave-2b/site.json`) ; son contrôle n'est PAS lancé (quota). À lancer à 11 h :
  `args {"areas":["site"],"checkOnly":["site"],"lean":true,"reports":{"site":"<scratchpad>/port/wave-2b/site.json"}}`.
- **Contrôles rendus** (run `wf_521c6044-e4a`, résultats dans son `journal.jsonl`, rapports `qa/port-<zone>.md`) :
  shell 2 majeurs / 11 mineurs / 2 perdus ; connections 2 / 7 / 4 ; chat-home 3 / 6 / 3 ; **team 1 bloquant**, 4 / 6 / 0 ;
  documents-admin 2 / 5 / 1 ; settings 2 / 9 / 3. **auth-onboarding** : pas rendu à 10 h 04 (sans doute coupé par le
  quota) : le relancer seul si son résultat est vide (`resumeFromRunId: wf_521c6044-e4a`, mêmes args).
- Ensuite : corriger bloquant et majeurs, vérifier à l'écran, tests base de données, `pnpm build`, compte rendu.

## 12 novembre, 10 h 10 : quota atteint, arrêt jusqu'à 11 h

- Le « bloquant » de l'Équipe (clic sur une tuile sans effet, erreur d'hydratation) ne se reproduit PAS serveur au
  calme : /equipe sans erreur de console, le clic ouvre la fiche (compte claire). C'était la machine saturée.
- Corrigé : panneaux d'invitation et de jeton verrouillés aussi pendant la création.
- Contrôle auth-onboarding arrêté avant sa fin (quota) : à relancer avec celui du site.
- Restent, tirés des contrôles : focus après « Voir tout le monde » (le bouton disparaît, le focus tombe sur body) ;
  verrou pendant l'envoi dans security-settings.tsx ; « About 16 sources » et « From 7 search results » (compteurs) ;
  « Role » = poste dans l'invitation mais = droit d'accès dans la fiche (clé onboarding `job`) ; aides « To tell links
  apart » et « Same scale in every company » + note de bas du panneau d'invitation ; sept pastilles d'encre dans la
  fiche d'une personne sous soi ; barre de commande : un outil en panne dit « Connected » (searchShell) ; nom complet
  de l'espace dans le menu du compte ; Connexions : remonter « Ajouter un outil » (conseillés en tête, captures à la
  fin) ; /admin jamais vu en vrai (LEON_ADMINS) ; invitation d'essai « check-team-4 » à annuler dans la base de démo.

## 12 novembre, 11 h 15 : quota revenu, contrôles restants et corrections lancés

- Serveur de dev relancé à 11 h 07 (nouveau serverId `6b0a2b76-b22c-4719-9243-1d194e5ee82d`) avec
  `LEON_ADMINS=claire@essai.leon.local` dans `.claude/launch.json` (fichier local, hors git) : /admin est visible pour
  claire.
- **Contrôles restants** (site, auth-onboarding) : run `wf_6df7f1d3-9c6`, tâche `wztp6fnak`. Le contrôleur de
  l'onboarding a le droit de créer UN espace d'essai (`check-onboarding-xxxx@essai.leon.local`) et doit le supprimer.
- **Corrections** : run `wf_bb529c2e-b88`, tâche `wqfb2x6cl`, mode `args.fix` du script `leon-port-areas.js` : trois
  correcteurs Opus (shell-chat, team-settings, docs-connections), chacun suivi d'un vérificateur Sonnet qui cherche à
  réfuter. Mes arbitrages : `qa/rulings-<groupe>.md`. Rapports attendus : `qa/verify-<groupe>.md`.
- Après le retour des deux contrôles : même mode `fix` pour un 4e groupe (auth-onboarding + site), avec ses arbitrages.
- Construction de production et tests base de données lancés en arrière-plan à 11 h 12 : `qa/build-1112.txt`,
  `qa/db-1112.txt` (base `leon_test_refonte_equipe`). À refaire à la toute fin, après les corrections.
- David utilise localhost:3040 : il a créé lui-même une invitation nommée « david » à 10 h 19. Ne pas y toucher.
  L'invitation « check-team-4 » est un reste d'un contrôleur (le correcteur team-settings peut l'annuler).
- L'accueil garde son point du matin en trois colonnes : c'est la maquette approuvée (pas de reprise).

## 12 novembre, 12 h 40 : huit contrôles rendus, corrections faites sur six zones, vérifications en cours

- Mesure de départ à 11 h 14 : tests base de données 1747 passés ; `LEON_LLM= npx next build --webpack` passe (le faux
  modèle de `.env.local` est interdit en production : le vider pour la construction). `/kit` répond 404 en production.
- **Correcteurs rendus** (run `wf_bb529c2e-b88`, rapports `port/fix/fix-<groupe>.json`) : shell-chat 11 corrigés,
  team-settings 17, docs-connections 10 ; les « clics sans effet » du matin ne se reproduisent pas. Leurs
  **vérificateurs** Sonnet tournent (rapports `qa/verify-<groupe>.md`).
- **Contrôles site et auth-onboarding rendus** (`qa/port-site.md`, `qa/port-auth-onboarding.md`) : aucun bloquant.
  **Correcteur auth-site** lancé (run `wf_2acdcaa3-aa0`, tâche `wet4gui1d`, arbitrages `qa/rulings-auth-site.md`).
- **Audit des phrases « ce que Leon lit »** du site contre le code des connecteurs : agent Sonnet en arrière-plan,
  rapport `qa/site-connectors-facts.md` ; c'est moi qui applique les corrections (src/components/site/content.ts).
- **À faire de ma main après les vérificateurs** :
  1. `verre/discussions/passage-parts.ts` : un long passage sans aucun mot commun ne marque RIEN (le correcteur marque
     sa première phrase : trompeur).
  2. Messages `onboarding.inviteErrors.job` et `onboarding.aboutErrors.job` : « Choose a position » (le champ s'appelle
     Position).
  3. `ui/side-panel.tsx` : quand le panneau passe « busy », le focus tombe sur body.
  4. Le menu du compte dépasse de 5 px à droite de la barre latérale (1512).
  5. Données de démo : la connexion Linear en panne appartient à Nadia ; avec la nouvelle règle (l'alerte et le drapeau
     ne vont qu'à la personne qui a branché l'outil) Claire ne voit plus rien. La donner à Claire (un UPDATE local, à
     noter dans demo-data.md) pour que la démo montre l'alerte, le drapeau et la pastille « Reconnect ».
  6. Restes d'essais à retirer : invitations « check-team-4 » et « Check Invitee », jetons `check-settings-token`,
     `check-fix-token`, `essai-reglages-port`, espaces `check-auth-onboarding-co` et `check-auth-onboarding-ambx`.
     NE PAS toucher : l'espace « test », l'invitation « david », les discussions de 10 h 21 (David lui-même).
  7. Mesurer au calme le temps de création d'une discussion (29 s sous charge depuis la barre de commande).
  8. Regarder à l'écran : Connexions (six « Recommended » en tête), Équipe, Réglages, Documents, Admin, Accueil, un fil,
     premiers pas, haut de la page d'accueil du site, Documentation.
- Décisions à faire valider par David (en plus de la liste du 06 h 45) : l'alerte « à reconnecter » ne va qu'à la
  personne qui a branché l'outil ; plus de section « Conseillés » sur Connexions (les conseillés ouvrent « Ajouter un
  outil ») ; le poste s'appelle « Position », « Role » = droit d'accès ; « Voir le texte » au lieu de « Ouvrir » ;
  prix en euros sur un site en anglais ; suppression d'un document lente pendant sa lecture (à creuser).

## 12 novembre, 12 h 35 : audit des phrases des connecteurs appliqué

- Rapport `qa/site-connectors-facts.md` : 34 phrases vraies, 8 trop affirmatives (slack, granola, fathom, claap, gitlab,
  front, notion, monday), aucune fausse. **Corrigées de ma main** dans `src/components/site/content.ts` (en + fr), et la
  légende « One click » des messages (`site.connectors.legend`) ne dit plus « you authorize Leon » (pour Gmail, Drive et
  Slack l'écran d'accord nomme Pipedream). Tests site + contrats : 306 passés.
- **Non changé, à dire à David (ce sont ses propres formules, déjà sur le site en ligne)** : « relevé toutes les
  15 minutes » est faux pour Gmail, Drive et Slack (quatre fois par jour ouvré, via Pipedream) ; « mot pour mot, avec un
  lien vers l'original » : le HTML devient du texte, les secrets sont masqués, coupe à 100 000 caractères, un résumé
  remplace la transcription absente, et HubSpot, Intercom, folk et Plain n'ont pas de lien. Proposition : « la plupart
  des outils toutes les 15 minutes » et « garde le texte de chaque élément, avec un lien vers l'original quand l'outil
  en fournit un ». Occurrences : messages `site.*` (connLead, heroLead, toolsLead, connectLead, pricing connectors…) et
  content.ts (lignes 291, 544, 546, 685, 1010, 1238, 1240, 1372).
- La liste « un clic » de la page Connecteurs est écrite en dur (connecteurs-catalogue.tsx) : un nouvel outil OAuth
  s'afficherait « clé d'API » tant qu'on ne l'y ajoute pas.
- **Décision de David (12/11, 12 h 40)** : « Laisse tel quel » pour « toutes les 15 minutes » et « mot pour mot, avec un
  lien vers l'original ». Ne pas les réécrire, ne pas reposer la question.

## 12 novembre, 13 h 20 : serveur relancé, animations du site manquantes, quota à 88 %

- **Serveur** : à 13 h 05 il mettait 10 à 30 s par page (boucle `pgboss.error`, 5,5 Go). Relancé à 13 h 13, nouveau
  serverId `a2ab4f96-b965-4381-8762-8a6b0b8a8a66` ; les pages répondent en moins d'une seconde, sauf celles qu'un agent
  est en train de modifier (recompilation, 10 à 16 s). Sa mémoire remonte vite (5 Go en cinq minutes) : le relancer
  avant la passe finale.
- **Démo** : interrupteur managers rallumé (vérifié), invitation `check-team-4` annulée par l'interface. Restent trois
  espaces d'essai : `check-auth-onboarding-co`, `check-auth-onboarding-ambx`, `check-fix-ao` (ce dernier sert encore au
  correcteur auth-site).
- **Retouches de ma main à 12 h 55** : `ui/dialog.tsx` (le focus revient au contenu `#contenu` quand ce qui avait ouvert
  la fenêtre n'existe plus), `ui/side-panel.tsx` (focus gardé quand le panneau travaille), `equipe/org-chart.tsx`
  (colonne « Pas encore placés » à 288 px, masque en dégradé retiré), `equipe/invite-panel.tsx` (focus sur le champ du
  lien, sans défilement), `equipe/person-panel.tsx` (« Loading… » pendant la lecture de l'activité), messages
  `onboarding.*Errors.job` (« Choose a position »). Types et tests de ces dossiers : verts.
- **Vérificateur team-settings** : 18 corrections confirmées, rapport `qa/verify-team-settings.md`. Les deux autres
  vérificateurs et le correcteur auth-site tournaient encore à 13 h 18.
- **MANQUE RELEVÉ PAR DAVID (13 h 12) : « les animations ne marchent pas ».** Vrai pour le site : la maquette approuvée
  a un système de mouvement complet (GSAP 3.13 + ScrollTrigger + Flip + SplitText + Lenis, chargés par CDN ;
  `prototypes/refonte-2026-11/papier/js/motion/{core,hero,rules,dev,ambient}.js`, 1 341 lignes, et
  `css/motion*.css` ; notes `NOTES-motion-*.md`). Mon brief interdisait toute nouvelle dépendance (port-v1.md l. 75) :
  le constructeur du site n'a gardé que du CSS (logo qui se trace, arrivées au défilement, ruban des connecteurs). Non
  portés : la séquence d'ouverture de l'accueil (2,6 s), le changement de question, la pile Flip, la section des trois
  règles épinglée, la bande développeurs, le mouvement d'ambiance. Dans le navigateur intégré, les animations CSS
  tournent bien (s-draw, s-arrive x14, s-roll). **Question posée à David** : porter avec GSAP (nouvelle dépendance) ou
  refaire avec `motion` déjà installé. Travail d'une heure à une heure et demie pour un agent, après 16 h.
- **Quota** : 88 % à 13 h 17, remise à zéro à 16 h. Rappel programmé à 16 h 03.
- **Reste après 16 h** : lire `qa/verify-shell-chat.md`, `qa/verify-docs-connections.md`, le résultat de `fix:auth-site`
  (run `wf_2acdcaa3-aa0`) et son vérificateur ; mes reprises (passage-parts : rien de marqué sans mot commun ; menu du
  compte qui dépasse de 5 px ; connexion Linear de la démo à donner à Claire ; restes d'essais) ; les animations si
  David dit oui ; passe design à l'écran ; tsc, biome, unit, db, build ; compte-rendu.

## 12 novembre, 15 h 16 : tous les agents ont fini, quota atteint, reprise à 16 h 03

- Vérificateurs shell-chat (12 confirmées, 7 mineurs) et docs-connections (12 confirmées, 9 mineurs) rendus :
  `qa/verify-shell-chat.md`, `qa/verify-docs-connections.md`. Aucun bloquant, aucun majeur.
- Correcteur et vérificateur **auth-site** rendus (run `wf_2acdcaa3-aa0`, résultat complet dans son journal.jsonl et
  `qa/verify-auth-site.md`) : haut de l'accueil remonté, Documentation à deux pastilles d'encre, premiers pas allégés
  et tenant dans 771 px, page d'invitation vue en vrai. LIRE les défauts ouverts du vérificateur avant la passe finale.
- Plus aucun agent ne tourne. David n'a pas encore répondu sur les animations (GSAP ou non).
- À 16 h 03 : mes reprises (liste de 12 h 40 + mineurs des trois vérificateurs : astérisques dans le panneau d'une
  source, outil en pause dit « Connected », outils proposés sans attendre le serveur, focus après suppression d'une
  discussion récente, « pour tout le monde » sur un document privé, panneau de connexion verrouillé pendant le test,
  passage-parts), relancer le serveur, nettoyage des trois espaces d'essai, passe à l'écran, tsc/biome/unit/db/build,
  compte-rendu.

## 12 novembre, 16 h 13 : reprise, finitions lancées, carte des animations lancée

- Les deux serveurs avaient été arrêtés par l'appli à 15 h 47 : relancés (`leon-refonte` serverId
  `a1dfdddc-6bfa-4fd0-ab13-e6c984c31fc9`, `refonte-maquettes` `a7e1f28d-13e7-4999-bb97-95720327c65f`).
- Vérificateur auth-site : 18 sur 19 confirmées, 6 mineurs (`qa/verify-auth-site.md`).
- **Finitions** : run `wf_9e9b62ba-dd4`, tâche `wzt0esntm`, mode `fix` + `quick` : groupes finitions-a (shell,
  chat-home) et finitions-b (documents-admin, connections, auth-onboarding, site) ; arbitrages
  `qa/rulings-finitions-{a,b}.md` ; rapports attendus `qa/verify-finitions-{a,b}.md`.
- **Démo nettoyée** (voir demo-data.md) : plus d'espace ni de compte d'essai, Linear en panne appartient à Claire
  (alerte, drapeau et « Reconnect » visibles), jetons d'essai déjà révoqués.
- **Équipe** (de ma main) : tuiles de l'arbre à 200 px, colonne « Pas encore placés » à 280 px, marge de l'arbre 8 px :
  mesuré à 1512, la feuille ne défile plus (898 = 898) et « Customer success manager » n'est plus coupé.
- **Animations** : script `workflows/scripts/leon-site-motion.js` (carte → construction → vérification → correction).
  Étape « carte » lancée (run `wf_416a8be0-2e2`, tâche `wkd8gzgbe`), lecture seule, résultat `port/motion-map.md`.
  La construction attend la réponse de David (GSAP ou non) ; la maquette utilise GSAP 3.13 (+ ScrollTrigger, Flip,
  SplitText), Lenis 1.3 et Rough Notation 0.5. Lancer avec `args {"library":"gsap"|"motion","map":<résumé>}` une fois
  les finitions rendues (le correcteur finitions-b touche les fichiers du site).
- **Décision de David (12/11, 16 h 17) : « Oui, avec GSAP »** pour les animations du site. Lancer la construction
  (`leon-site-motion.js`, `args {"library":"gsap","map":<résumé de la carte>}`) dès que le correcteur finitions-b a
  rendu (il touche les fichiers du site) et que `port/motion-map.md` existe.

## 12 novembre, 16 h 32 : animations lancées avec GSAP, finitions faites, vérifications rapides en cours

- **Animations** : carte rendue (`port/motion-map.md`, 45 Ko ; résumé `port/motion-map.json`). Construction lancée :
  run `wf_861f0aa8-88f`, tâche `we19qkepp`, bibliothèque gsap, périmètre `qa/rulings-motion.md` (héros, ambiance,
  trois règles épinglées, terminal de la bande développeurs ; PAS l'histoire en trois temps de cette bande : son texte
  n'existe pas dans le vrai site, à dire à David). Constructeur Opus puis vérificateur Sonnet (films maquette / vrai
  site), un tour de correction si besoin. Rapport attendu : `qa/verify-motion.md`.
- **Finitions** (run `wf_9e9b62ba-dd4`) : correcteurs rendus (`port/fix/fix-finitions-{a,b}.json`), vérificateurs
  rapides en cours. Faits : outil en pause dit « Paused », outils proposés sans attendre le serveur, barre qui ne se
  ferme plus pendant « Asking Leon… », focus après suppression d'une discussion, menu du compte à la largeur de la barre,
  panneau de source sans astérisques et qui ne marque rien sans mot commun, panneau de connexion verrouillé pendant le
  test, titres de blocs par compte, confirmation de suppression d'un document privé, « Visible to » remis à zéro, tuile
  admin à 390, surlignage Sécurité derrière le texte, en-tête public (liens dans le menu sous 1200 px), bascule de la
  Documentation qui ne saute plus, commande d'installation qui défile à 390.
- **Laissés, à dire** : tableaux Markdown bruts dans le panneau d'une source ; Cmd+K pendant « Asking Leon… » ferme
  encore la barre ; suppression d'un document lente pendant l'indexation ; textes français de /admin ; vue « agent » de
  la Documentation avec un vide à la place des boutons ; avec le faux modèle local, une nouvelle réponse ne partage aucun
  mot avec sa source : rien n'est surligné (normal, à expliquer à David).
- Captures de ma passe finale en cours : `review/final/` (fil, panneau, menu, barre de commande, documents, admin,
  connexion, sombre) ; journal `qa/final-look.txt`.

## 12 novembre, 17 h 06 : finitions contrôlées, animations en construction

- Contrôles rapides rendus (`qa/verify-finitions-{a,b}.md`) : 9 sur 9 et 9 sur 10. Le seul majeur (carte « Your coding
  tools » coupée à 390 px, « Copier » hors de la carte) est **corrigé de ma main** (`onboarding/code-tools-card.tsx`,
  min-w-0) et mesuré : carte 16→374, commande qui défile (222 visibles sur 351), « Copier » à 284→342.
- **Laissés, mineurs** : sur téléphone la ligne du compte est sous le bas de la feuille de menu (elle défile) ; barre de
  défilement cachée de la commande d'installation ; vue « agent » de la Documentation avec une bande vide ; liens de
  l'en-tête public dans le menu entre 1024 et 1199 px ; dead.mjs jamais fini sur /, /discussions, un fil, /connexions,
  /documents, /admin, /securite, /tarifs (le serveur de dev sature) : à rejouer serveur au calme.
- Ma passe à l'écran (16 h 05 à 16 h 50) : Connexions, Équipe, Accueil, menu du compte, barre de commande, Admin : bons.
  Surlignage vérifié sur le fil « chercher des dossiers sur mes clients » (10 passages) ; « TerraCarte » est une réponse
  du faux modèle (aucun surlignage, normal). Panneau d'une source depuis une réponse : pas encore revu au calme.
- Suites lancées à 17 h 05 en arrière-plan : `qa/suites-1705.txt` (tsc, unit, db, biome).
- Serveur de dev sous surveillance (tâche de fond) ; il regonfle vite (7 à 9 Go en 45 minutes).
- Animations : constructeur en cours (run `wf_861f0aa8-88f`).

## 12 novembre, 17 h 15 : suites complètes (hors animations en cours)

- `qa/suites-1705.txt` : tsc sans erreur ; biome propre sur les 195 fichiers modifiés ; unit 6472 passés, 1 échec
  (`src/test/contracts/css-variables.test.ts` : variables `--rules-top`, `--stamp`, `--sweep`, `--pop`, `--land` lues par
  `src/components/site/motion/rules.ts`, fichier EN COURS d'écriture par le constructeur des animations : à revoir
  quand il a fini) ; db 1745 passés, 4 échecs :
  - 3 dans `src/server/api/context-routes.db.test.ts` : **sans rapport avec le portage** (git diff HEAD vide sur
    src/server/api et src/server/briefing). Le test sème des sessions à une date en dur (`NOV_5 = 2026-11-05T10:00Z`)
    et le code ne garde que 7 jours (`START_SESSIONS_DAYS`, start-context.ts) : ils passaient à 11 h 13 et échouent
    depuis le 12/11 à 10 h UTC (midi à Paris). **Ils échouent donc aussi sur main, et la CI va rougir.** À dire à David
    et à proposer comme correctif à part (une PR sur main, pas dans le portage).
  - 1 dans `src/server/search/index-run.db.test.ts` (« en moins de 10 s ») : chronométrage, machine chargée ; à rejouer
    au calme.

## 12 novembre, 17 h 46 : animations portées et vérifiées, vérifications finales lancées

- **Animations du site** (run `wf_861f0aa8-88f`) : construites (Opus) puis vérifiées (Sonnet, `qa/verify-motion.md`) :
  aucun bloquant ni majeur, pas de second tour. Fichiers : `src/components/site/motion/` (home-motion.tsx, start.ts,
  core.ts, hooks.ts, hero.ts, rules.ts, ambient.ts, motion.css), retouches de hero-demo.tsx, rights-switch.tsx,
  signal.tsx, demo-card.tsx, site.css, une ligne du script d'en-tête de `src/app/layout.tsx`, messages `site` (liste des
  trois règles : Cited / Not on record / Yours only). **Dépendance ajoutée : `gsap` 3.13.0** (package.json,
  pnpm-lock.yaml), licence « Standard no charge » de GreenSock/Webflow (pas open source) ; ni Flip, ni SplitText, ni
  Lenis, ni rough-notation (traits à la main = un masque SVG fixe). GSAP est un morceau à part (≈ 51 Ko) chargé à la
  demande sur /accueil seulement. Rapport du constructeur : `port/fix/build-motion.json`.
  Vu de mes yeux sur planches (`review/motion/real/sheet-load.jpg`, `sheet-scroll.jpg`) : ouverture en séquence
  (question à 0,8 s, phrases et documents jusqu'à 3 s), trois règles épinglées avec la liste de noms.
  **Non porté, à dire** : l'histoire en trois temps de la bande développeurs (texte absent du vrai site). Mineurs
  laissés : surlignages plus courts que la maquette dans la démo, pile qui s'attarde 0,2 s au changement de question,
  point final détaché un instant, défilement épinglé plus court de 250 à 300 px, Safari/Firefox/vrai téléphone non
  essayés, attributs style vides laissés par GSAP après « Stop animations ».
- Serveur relancé à 17 h 50 (serverId `9725ecc1-f834-4044-ad60-a9c147efeb2e`), pages préchauffées.
- **Vérifications finales** lancées en arrière-plan : `qa/final-suites.txt` (tsc, biome, unit, db, build avec LEON_LLM
  vide, état de git). Attendu : 3 échecs db connus (date en dur dans context-routes.db.test.ts, sans rapport).
- Reste : lire ces résultats, mettre la mémoire à jour, compte-rendu à David, proposer en tâche à part le correctif des
  tests datés (carte « own_initiative »).

## 12 novembre, 18 h : ÉTAT FINAL du portage (rien de commité)

- **Vérifications finales** (`qa/final-suites.txt`, 17 h 49) : tsc exit 0 ; biome propre (195 fichiers) ; unit 276
  fichiers, 6473 passés, 2 sautés ; build de production OK (`LEON_LLM= npx next build --webpack`, 37 routes) ; index git
  vide ; 222 entrées modifiées ou nouvelles (156 M, 19 D, 47 ??), 175 fichiers contre HEAD (+12 971 / −13 979).
- **Tests base** : 1745 ou 1746 passés selon la base ; 3 échecs fixes sans rapport avec le portage (date `NOV_5` en dur
  dans `src/server/api/context-routes.db.test.ts`, fenêtre de 7 jours de `start-context.ts`) ; 2 tests sensibles à
  l'état de la base de test locale (`index-run.db.test.ts` chronométré : passe sur `leon_test_refonte`, échoue sur
  `leon_test_refonte_equipe` encombrée ; `0020-corrections-audit-2.db.test.ts` : échoue parfois dans la série, passe
  seul sur les deux bases).
- Serveur de dev relancé à 17 h 50, pages préchauffées ; maquette sur 3041.
- **À proposer à David** : correctif des tests datés en tâche à part (PR sur main) ; découpage des commits par zone
  quand il le demandera (branche à renommer `david/<sujet>`, CLAUDE.md) ; le balayage dead.mjs au calme ; l'histoire en
  trois temps de la bande développeurs s'il la veut.

## 12 novembre, 20 h : localhost relancé dans le panneau Terminal

- Les serveurs de prévisualisation avaient été arrêtés par l'appli à 19 h 03, trente minutes après la fin de mon
  dernier tour (même chose à 15 h 47). David a demandé de rouvrir le localhost.
- Ils tournent maintenant dans le panneau Terminal de la session, où ils survivent à mes silences : onglet `c1`
  « Leon localhost 3040 » (`BETTER_AUTH_URL=http://localhost:3040 LEON_ADMINS=claire@essai.leon.local npx -y
  pnpm@11.0.8 dev --port 3040`) et onglet `c2` « Maquette 3041 » (`python3 -m http.server 3041 --directory
  prototypes/refonte-2026-11`). Pour les arrêter : `stop_terminal_tab`. Ne plus lancer `preview_start {name}` sur ces
  ports tant qu'ils tournent (port pris) ; `preview_start {url}` ouvre seulement l'onglet du navigateur.

## 12 novembre, 20 h 10 : David demande « toi fable tu es passé sur tout le site ? » : passe Fable complète lancée

- Réponse honnête : non. De mes yeux, en grand : Accueil, Connexions, Équipe, menu du compte, barre de commande, Admin,
  un fil (appli, état final) ; du site : le haut de l'accueil, Tarifs, Documentation et Connecteurs sur des captures du
  matin (avant corrections), puis les deux planches des animations. Jamais vus par moi en état final : Produit, Cas
  d'usage (et les pages par équipe), Sécurité, le site en sombre, en français, sur téléphone ; côté appli : panneaux de
  Documents, les quatre groupes des Réglages, pages de connexion, premiers pas, variantes sombre/français/téléphone.
- Mon contexte est à 80 % : je ne peux plus lire quarante captures en grand. D'où : script
  `workflows/scripts/leon-fable-pass.js`, run `wf_4d841258-acf`, tâche `w1a9qoygm` : **deux designers Fable** (site ;
  appli), chacun regarde chaque écran en grand (clair, sombre, 390, français) et corrige à la main dans ses fichiers,
  puis un contrôle Sonnet de non-régression (tests, build, animations, console). Planches attendues :
  `review/site-pass/`, `review/app-pass/` ; rapport `qa/check-fable-pass.md`.
- À faire au retour : lire leurs « changes », « left », « forFounder » ; regarder moi-même quelques planches ; relancer
  tsc/unit/build si le contrôleur ne l'a pas fait ; dire à David ce qui a changé.
- Quota : fenêtre de 5 h à 57 % (remise à zéro à 21 h) ; **semaine : 49 % tous modèles, 57 % Fable** (le chantier a
  consommé environ 28 points de la semaine aujourd'hui) : le dire à David.

## 12 novembre, 20 h 40 : retours de David sur le design, passe Fable relancée avec les deux skills

- **Retours de David (20 h 15 à 20 h 25), mot pour mot** : « pourquoi le rectangle noir en bas? pourquoi mes questions
  sont en tout petits, le titre en haut est petit aussi, le a supprimer est a enlever ! dans le chat ! de plus je trouve
  que l'interface connecter est sans design, je t'ai dis d'utiliser le ui ux pro max, et impecable » ; « il faut quand
  meme que le site soit design ! avec des animations, que ca fasse saas » ; « on avait des choses qui était bien dans
  l'ancien design que tu peux t'inspirer dans l'idée ».
- **CONSIGNE PERMANENTE** : tout travail de design passe par les skills `impeccable` et `ui-ux-pro-max` (chargés dans
  cette session à 20 h 20 ; `impeccable context` lancé ; références lues : craft-floor, bolder, operate, typeset).
- **Chat corrigé de ma main** (mesuré à l'écran) : titre du fil en 28 px (`text-h1`, deux lignes au plus) ; question de la
  personne en 18 px (`text-answer`) ; plus de mot « Delete » dans le fil : menu à trois points en tête (Supprimer, même
  confirmation) ; bouton d'envoi = rond de 36 px avec la flèche, contour discret tant que le champ est vide, d'encre
  dès qu'il y a du texte (le « rectangle noir en bas » était la pastille « Ask »). Fichiers :
  `src/components/discussion/discussion-thread.tsx`, `verre/discussions/messages.tsx`, `verre/discussions/composer.tsx`.
  Tests des dossiers discussion : 51 passés ; tsc propre.
- **Passe design relancée** : script `workflows/scripts/leon-fable-pass.js` réécrit, run `wf_d59584b4-6b1`, tâche
  `wy256i0hb` : quatre designers Fable en parallèle, chacun obligé de suivre les deux skills et d'en rendre compte
  (champ `skills`) : `fable:site-home` (accueil, en-tête, pied, site.css, motion existant), `fable:site-pages` (toutes
  les autres pages du site, dans ses propres fichiers `pages.css` et `motion/pages.ts`), `fable:connections` (refonte de
  l'écran Connexions, mode « bolder »), `fable:app` (le reste de l'appli, sauf connexions et les trois fichiers du chat) ;
  puis `check:fable-pass` (Sonnet). Cap donné : site designé et animé sur toutes les pages, « SaaS », idées de l'ancien
  design « Verre » (git HEAD et https://leonmemory.com) réexprimées en Papier. Planches attendues : `review/site-pass/`,
  `review/app-pass/` ; rapport `qa/check-fable-pass.md`.
- Au retour : lire `skills`, `changes`, `left`, `forFounder` de chacun ; regarder les planches moi-même ; relancer tsc,
  unit, build ; montrer à David.
- Quota à 20 h 05 : fenêtre 57 % (remise à zéro à 21 h), semaine 49 % tous modèles, 57 % Fable.

## 12 novembre, 22 h 05 : les quatre designers Fable ont rendu, contrôle en cours, QUOTA FABLE À 84 %

- Run `wf_d59584b4-6b1` : coupés par la limite de 5 h à 20 h 45, repartis à 21 h, rendus vers 21 h 50. Rapports complets :
  `port/fable-pass/fable-<zone>.json` (changes, skills, left, forFounder, sheets). `check:fable-pass` (Sonnet) en cours
  à 22 h (rapport attendu `qa/check-fable-pass.md`).
- **Connexions** : un dessin en haut à droite du titre : le logo de Leon retracé avec un trait d'encre par outil branché
  et par canal de capture, chacun partant de la pastille de l'outil ; l'état se lit sur le trait (plein = lu, court gris
  = en pause, rouge pointillé = en panne, surligneur vert = vient d'être branché) ; survol d'une carte = son trait
  reste, les autres s'estompent ; même trait dans l'en-tête du panneau d'un outil ; tracé une fois à l'arrivée (0,7 s).
- **Accueil du site** : le ruban de logos devient une bande où les outils glissent sous la pile de feuilles de Leon ;
  une feuille avec trois sources posée sur le coin du terminal ; en-tête qui se resserre au défilement (72 → 60 px),
  menu « Use cases » qui se pose comme une feuille ; signature « Every answer, cited. » sous le logo du pied.
- **Autres pages du site** (plus petit que demandé) : Tarifs (la colonne Pilot est une feuille posée sur la grille,
  « Free » entouré au stylo, coches qui se tracent), Sécurité (deux petites piles), Connecteurs (surligneur au survol,
  une couleur par famille), Produit (quatre étapes sur une ligne reliées par un trait). **Documentation et Cas d'usage :
  pas touchés.**
- **Appli** (petit) : les listes déroulantes affichent leur valeur dès l'arrivée de la page (kit `ui/form.tsx`), numéro
  de source à largeur fixe, « Loading… » à la bonne taille, trait des « Try asking » aux trois couleurs. Laissés :
  Documents très nu, tableau Notion brut dans le panneau d'une source, tuile « learned about you » seule, /admin.
- **Pas encore fait par moi** : regarder leurs planches (`review/site-pass/`, `review/app-pass/`), relancer tsc, unit,
  build (le contrôleur le fait), montrer à David.
- **QUOTA à 22 h** : semaine Fable **84 %** (57 % à 20 h : les quatre agents Fable ont coûté 27 points), semaine tous
  modèles 63 %, fenêtre de 5 h à 57 % (remise à zéro à 2 h). **Ne plus lancer d'agent Fable sans l'accord de David** ;
  pour la suite (Documentation, Cas d'usage, Documents), proposer Opus avec les deux skills. Mon contexte : 88 %.

## 12 novembre, 22 h 20 : David : « continue avec fable », priorité à l'appli une fois connecté et aux premiers pas

- Ses mots : « non continue avec fable je vais renitialiser quand tu aura tt utilisé » ; « ce qui m'interesse surtout en
  design, c'est une fois que l'on est connecté de bien revoir tout cela, meme l'onboarding il est pas dingue ».
- **Passe en cours** : run `wf_188a8747-1b5`, tâche `wf6i2nclt` (script `leon-fable-pass.js`, `args.only`) : quatre
  designers Fable, les deux skills imposés, petits pas qui compilent (le quota peut couper à tout moment) :
  `fable:onboarding-app` (connexion, inscription, mot de passe oublié, invitation, les quatre étapes des premiers pas ;
  peut créer UN espace d'essai `fable-onboarding-xxxx@essai.leon.local` et doit le supprimer),
  `fable:workspace-app` (Accueil, résultats, nouvelle discussion, fil et panneau d'une source avec tableaux, coque),
  `fable:library-app` (Documents d'abord, Équipe, Connexions restantes, Réglages, Admin),
  `fable:site-pages-app` (Documentation, Cas d'usage, restes des autres pages). Puis `check:fable-pass-app` (Sonnet).
  Planches : `review/app-pass/<zone>/`, `review/site-pass/`. Rapport : `qa/check-fable-pass.md`.
- Le contrôle de la première passe (run `wf_d59584b4-6b1`) finissait à 22 h 05 : lire son verdict dans son journal.
- Le run `wf_1cdaa3eb-062` (seconde passe à trois agents) a été arrêté tout de suite, sans modification.
- Quand le quota Fable de la semaine sera épuisé, les agents et moi serons coupés ; David dit qu'il le réinitialisera.
  À la reprise : lire le journal de `wf_188a8747-1b5`, `git status`, vérifier que ça compile (tsc), relancer ce qui a été
  coupé avec `resumeFromRunId`, puis regarder les planches et montrer à David.

## 12 novembre, 22 h 25 : David : « renvoie un agent sur le chat, qu'il redesigne bien cette page et s'inspire de ce qu'on avait avant »

- Le run `wf_188a8747-1b5` (quatre designers) a été arrêté après huit minutes (une seule modification :
  `src/components/site/pages/documentation-toc.tsx`).
- **Passe en cours** : run `wf_ad6fe8a8-c46`, tâche `wtoyvvrwh`, cinq designers Fable (skills imposés, petits pas qui
  compilent) : **`fable:chat-app`** (nouveau, dédié : nouvelle discussion, fil, champ, panneau d'une source ; s'inspire
  de l'ancien chat « Verre » à HEAD : colonne de lecture centrée façon claude.ai, réponse en vrai texte, champ au
  centre ; garde l'intention de mes quatre corrections), `fable:workspace-app` (Accueil, résultats, coque : PLUS le
  chat), `fable:onboarding-app`, `fable:library-app`, `fable:site-pages-app` ; puis `check:fable-pass-app`.
- Fichiers du chat réservés au designer du chat : `src/app/(app)/discussions/`, `src/components/discussion/`,
  `src/components/verre/discussions/`, aides de `src/lib` (markdown, source-marks), `ui/text.tsx`, `ui/chips.tsx`.

## 12 novembre, 22 h 25 : quota réinitialisé par David, les cinq designers tournent

- Quota à 22 h 23 : semaine 0 % (tous modèles et Fable), fenêtre de 5 h à 2 %. David a écrit « Continue », puis demandé
  la durée : annoncé « designers vers 23 h 20-23 h 30, contrôle vers 23 h 45, mon regard et le point vers minuit ».
- Run `wf_ad6fe8a8-c46` (tâche `wtoyvvrwh`) : chat, onboarding, workspace, library, site-pages tous en cours à 22 h 23
  (12 à 35 appels, aucune modification encore : phase de regard). Attendre la notification de fin.
- Mon contexte est à 93 % : un résumé automatique va arriver. Tout ce qu'il faut pour reprendre est dans ce fichier
  (sections du 12/11 à 20 h 40, 22 h 05, 22 h 20, 22 h 25) et dans la mémoire (`feedback-skills-design-obligatoires`).
- Au retour des designers : lire `skills`, `changes`, `left`, `forFounder` dans le journal du run ; regarder moi-même
  quelques planches (`review/app-pass/<zone>/`, `review/site-pass/`), en commençant par le chat ; tsc, unit, build
  (`LEON_LLM=` vide) ; supprimer l'espace d'essai `fable-onboarding-…` s'il reste ; dire à David ce qui a changé.

## 12 novembre, 23 h : contrôle de la PREMIÈRE passe Fable rendu (run wf_d59584b4-6b1)
- Résultat complet : port/fable-pass/check-1.json. À lire avec le contrôle de la passe en cours (wf_ad6fe8a8-c46) avant le point final à David.

## 13 novembre, vers 5 h : la passe des cinq designers Fable est rendue (run wf_ad6fe8a8-c46)
- David a écrit « Reprends tout seul quand c est ok ». Rapports complets : port/fable-pass/fable-<zone>-app.json et check-fable-pass-app.json ; résumé lisible : port/fable-pass/RESUME-2.md (changements, « pour David », verdict du contrôle).
- À faire : lire RESUME-2.md ; corriger ce que le contrôle signale ; regarder le chat et les écrans clés (review/app-pass/<zone>/) ; vérifier que l espace d essai fable-onboarding-… est supprimé ; relancer le serveur (onglet Terminal c1) ; faire le point à David.

## 13 novembre, 5 h 10 : passe des cinq designers vue et contrôlée

- Contrôle (`check:fable-pass-app`) : rien de cassé : biome 0 erreur, 6489 tests unitaires, tsc propre, build OK, dix
  pages du site et six écrans de l'appli sans erreur ni débordement ; six mineurs (liste dans RESUME-2.md).
- **Chat vu de mes yeux** (`review/chat/thread-v2.jpg`) : colonne de lecture centrée (idée de l'ancien design), titre
  28 px + trois points, question à droite en 18 px, réponse sur une feuille, **les sources sont des drapeaux qui
  dépassent du bord droit de la feuille à la hauteur de leur citation** (logo de l'outil + titre), champ au pied avec
  les trois traits et le rond d'envoi. Très bon résultat.
- Pas encore vus par moi : Accueil recomposé (point du matin en document, bonjour en 40 px), Documents (bureau + place
  de la prochaine feuille), premiers pas (dessin des outils vers Leon), Admin en une feuille, pages du site
  (Documentation à signets, Cas d'usage avec le grand champ qui écrit les questions). Planches : review/app-pass/<zone>/.
- Démo : espace d'essai « Fable Onboarding ufzx » et son compte supprimés en SQL. Espaces restants à David : « test »,
  « david », « Test ».
- Reste : regarder ces écrans, corriger les mineurs des deux contrôles (dessin de Connexions trop petit, trait du
  panneau près de la croix, pile de l'accueil du site, feuille qui dépasse du terminal, compteur « 37 » d'« Add a
  tool », signets de la Documentation), faire le point à David, puis les commits quand il le demandera.
- 13/11, 5 h 15 : **finitions lancées** : run `wf_cd1de869-6f8`, tâche `wzjxna6it` (un designer Fable sur huit petits
  défauts : dessin de Connexions trop petit, trait du panneau près de la croix, compteur « 37 », noms coupés par la pile
  de l'accueil du site, feuille qui dépasse du terminal, éventail de la pile, signets de la Documentation, piles de
  Sécurité ; puis contrôle Sonnet). À son retour : lire son résultat, regarder Accueil, Documents, premiers pas, Admin et
  les pages du site (review/app-pass/<zone>/, review/finitions/), puis le point complet à David (il dort sans doute :
  il a écrit « reprends tout seul quand c'est ok »). Ne pas lancer `next build` pendant qu'il se sert du serveur.

## 13 novembre, vers 6 h 45 (limite d'usage atteinte)

- Finitions (wf_cd1de869-6f8) rendues et controlees : 8 defauts fermes, biome 0 erreur, tsc propre, 6489 tests.
- Serveur 3040 relance a 6 h (il etait a 9,5 Go) : onglet Terminal c3.
- Regarde par moi, en clair 1512x771 : Accueil, Chat, Documents, Connexions, Equipe, Reglages, Admin ; en sombre et au telephone (planches) ; premiers pas (images du designer) ; les 7 pages du site. Captures : review/mine/.
- Corrige a la main : site.css `.s-termdocs` marge -22px -> -10px (la feuille couvrait la fin de la derniere ligne du terminal). PAS reverifie a l'ecran.
- Reste a faire : Documents, le nom du dossier (pile) est 6 px plus a droite que celui des fichiers (367 contre 361), cause non trouvee (mesurer .tl__pic) ; Connexions, vide de 130 px sous le titre a gauche du dessin (a trancher) ; piles de Securite faibles en sombre ; relancer tsc + tests unitaires apres ma retouche CSS ; point complet a David.

## 13 novembre, 8 h 40 - 9 h (David : « remets la page connector comme elle était avant ! continue le reste »)

- Compris ainsi : l'ecran Connexions de l'appli, etat d'avant l'agrandissement du dessin par les finitions (petit dessin 360x112 dans le coin, « Connected » a y=165). Fait : index.tsx, model.ts, model.test.ts, connexions.css reconstruits depuis le journal du designer (recoupes avec son propre `cat`). Gardes : trait court dans la tete du panneau, pas de compteur « 37 » sur « Add a tool ». Copies : scratchpad/restore/cx/after-finitions (grand dessin) et before-finitions (ce qui est en place).
- Si David voulait autre chose : (a) sans dessin du tout = etat du 12/11 20 h (images review/app-pass/a/connections-01.jpg), a reconstruire depuis les journaux de la premiere passe Fable ; (b) la page Connectors du SITE = pas touchee.
- Corriges a la main et verifies a l'ecran : feuille du terminal (site, accueil) -22 -> -10 px, derniere ligne degagee de 7 px a 1512 et 13 px a 390 ; dossier de Documents aligne (PileMark dans une boite 30x36, viewBox "3 0 30 36") ; piles de Securite en sombre (papier --s-desk-3).
- Suites apres retouches : tsc 0 (appli + extension), biome 0 erreur (7 avertissements), vitest 279 fichiers / 6489 tests. Pas de `next build` (David se sert du serveur).
- Serveur 3040 relance a 8 h 37 : onglet Terminal c4 (l'onglet c3 avait disparu, sans doute au redemarrage de l'appli). Maquette 3041 arretee, pas relancee.
- En cours : controle independant francais / sombre / telephone (wf_d1f37915-ace, 2 Sonnet, lecture seule), images dans review/controle-fr/.

## 13 novembre, 9 h 10 - 9 h 25 (David : « pourquoi le localhost est aussi long ? »)

- Cause mesuree : mes deux controleurs (wf_d1f37915-ace) chargeaient le serveur en boucle (serveur a 319-498 % de processeur, charge 10 sur 10 coeurs) ; le serveur de dev tenait 6-7 Go. Controle ARRETE (TaskStop), non termine : a relancer quand David ne se sert pas du serveur (script leon-controle-fr-telephone, resumeFromRunId ne recupere rien, les deux agents repartent de zero).
- Serveur relance a 9 h 12 : onglet Terminal c5. Pages publiques prechauffees : premiere ouverture 2-10 s, ensuite 0,2-0,5 s, y compris apres 2 minutes sans visite. Memoire du Mac : 32 Go, 73 % libre apres relance ; pas de pression.
- Trouve dans le journal du serveur : « Assertion failed: text.tsx : puces mal collees au texte » (verification interne du texte des reponses, 3e cas). Corrige dans citedRuns : « Vu [1] [9]. » sans la source 9 rend le point colle a la puce [1]. 6 cas verifies, module charge sans assertion.

## 13 novembre, 9 h 30 : le dessin de Connexions est retire, tout est commite

- David : « je veux juste que le schéma en haut à droite dégage ». Il ne voulait ni l'ancien schema vivant, ni le petit dessin : l'en-tete de Connexions n'a plus aucun dessin. Retires : le composant Fan et ses entrees (index.tsx), la prop onHot (catalogue.tsx), FAN / bundled / fan (model.ts) et leurs tests, les regles .cx-fan et .cx-chip (connexions.css). Les notes plus haut qui parlent du « petit dessin en place » sont donc perimees. Le trait dans la tete du panneau d'un outil est garde.
- Suites apres ce retrait : tsc 0, biome 0 erreur, vitest 279 fichiers / 6488 tests. Ecran verifie a 1512x771 (plus de dessin, « Connected » a y=165, aucune erreur de console).
- Tout le travail est commite en local sur la branche claude/leon-interface-redesign-715484 (un seul commit au-dessus de 976d6ae), rien n'est pousse. David continue avec un autre agent a partir de ce commit.
- Pas fait : controle francais / sombre / telephone (interrompu), build de production apres les dernieres retouches, Safari, Firefox, vrai telephone, les decisions listees plus haut.
