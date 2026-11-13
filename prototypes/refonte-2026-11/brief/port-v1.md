# Leon — the new interface becomes the real interface (port v1)

The founder: "Connect the front-end and the back-end on localhost, so that we can then develop it. Finish all the
implementation that is needed. I will make changes afterwards."

The new look was designed and approved as a static prototype (`prototypes/refonte-2026-11/papier/app/`, guide
`NOTES.md`). The real app (Next.js 16, React 19, Tailwind 4, next-intl en/fr, Radix, Hono API, Drizzle, Better Auth)
still wears the rejected "Verre" look. This port transforms the REAL components so that every real screen, with its
real data, server actions and API calls, takes the new look and the new composition. Nothing the product does today
may be lost. Nothing is pasted from the static HTML: the prototype is the visual model, the maps say what exists.

Read in this order, every agent:
1. `brief/port-feedback.md` — the founder's 14 remarks on the prototype. They override the prototype.
2. this file.
3. `brief/app-v3-rollout.md` — his taste in his own words and the eight rules of the new look.
4. your area's map, `port/map-<area>.md`, in full. It lists every file, state, action, key and risk of your area.
   `port/map-quality-env.md` section 5 (what breaks, how to stay green) is for everyone.
5. `port/KIT.md` once it exists (written by the foundation stage): the components and classes to build with.

## Decisions (made by the design lead; do not reopen them)

Look and tokens
- Token names in `src/app/globals.css` stay; their values change (map styles-kit, section 1). One stylesheet stays
  the source: the new variables are added there, the shape rules that utilities cannot express go to
  `src/app/kit.css`, imported by `globals.css`, entirely inside `@layer components` (or `base`).
- Two themes, both drawn: light (the default for a first visit, whatever the system says) and dark. The mechanism
  that exists stays (`data-theme` on `<html>`, the stored choice `leon-theme`, the switch in the person's menu, in
  Settings, in the command bar and on the public site). Dark palette: an ink desk `#121210`, sheets a step lighter
  `#1C1C19`, quiet fill `#232320`, hover `#262622`, pressed `#2E2E2A`, hairline `#2E2E2A`, strong hairline `#45453F`,
  text `#F1F1EE`, secondary text `#A9A9A1`, icons at rest `#7D7D76`; the primary pill inverts (paper `#F1F1EE`, ink
  text); flags keep their colours with ink text; a highlighter stroke is its flag colour at about 30% behind light
  text; `ok` and `danger` get lighter tones that keep 4.5:1; shadows deepen and hairlines carry the edges. Every
  token has a value in both blocks. Nothing is ever written as a raw colour in a component.
- `--ink` today means "active row fill" (`bg-ink`, 6 files): that meaning becomes `--selected` (`bg-selected`: the
  desk in light, `#2A2A26` in dark). Then `--ink` and `--on-ink` are the brand's ink and what is written on it
  (`bg-ink text-on-ink` is the pill in both themes; same values as `--accent` / `--accent-ink`).
- `--accent` is ink. A link is ink and underlined; a selected thing is `bg-selected` or the ink fill, never a tint.
- Radii 12 (sheets, cards, panel, menus), 8 (rows), 6 (fields, keys), 3 (marks), pill (buttons, chips, status).
  Type: Schibsted Grotesk 400/500/600 for the interface, STIX Two Text only for the words of an original document,
  Geist Mono only for real code, Inter stays for the word "Leon" in the logo. Sizes 13/14/15/18/28, panel title 20,
  answer 18/1.6. Nothing under 13px. `src/lib/utils.ts` (tailwind-merge) learns every new text, radius and shadow name.
- Gone everywhere in the app: the aurora, glass and blur, the signal line, the spotlight, the beam, shimmer and
  spinner loops, bouncing eases, uppercase mono labels. "Working" is the label's verb, `aria-busy`, and the
  highlighter passing once; "done" is said in place.
- The shell breakpoint stays 861px. The sidebar is 256px, its rail 60px; the page is 1348px wide at most.

Composition (the founder's rules, `app-v3-rollout.md`, plus his 14 remarks)
- A screen is a title and things. A thing is a rectangle with one name and at most one quiet caption; details live in
  the side panel (520px, the height of the window); two sizes of rectangle (card 88px, tile 52px); one ink pill per
  view. A sentence stays only where the product makes a promise or the law asks for it (consent, who sees what,
  deletion): then it lives in the panel, short.
- The side panel is a modal sheet: a click outside closes it and does nothing else; Escape closes it; focus returns
  to what opened it. A step that shows a secret once (a token, an invitation link, backup codes) cannot be dismissed
  by a click outside or Escape: only by its own button.
- One place to ask per screen. The top bar ("Ask or search…", three strokes, Cmd+K) shows on every screen except
  those that have their own field (a discussion, a new discussion, the search results). It opens the command bar:
  "Ask Leon: <words>" starts a discussion; "Search <words>" opens the results; then tools, people, documents,
  discussions and screens, fed by a server action under the person's rights.
- Home is `/` without a question: the greeting, the morning briefing only when the person truly has one, and
  questions to try. `/?q=` stays the search results (kept: filters, pagination, search without a model).
  Chat is `/discussions` (a new discussion) and `/discussions/[id]`: same state machine as today, new look.
- Sidebar: the brand, the entries in two groups, "Recent" (five discussions, each with a three-dots menu to delete
  it), the alert lines (a tool to reconnect; memory out of date), and one identity row at the bottom: a round avatar,
  the person's name, the workspace's name as its caption, opening the menu (Settings, theme, Sign out). No workspace
  tile, no letter squares. In the rail: icons, the dot on Connections, the round avatar.
- Avatars are circles everywhere: a photo when the account has one, otherwise initials on a soft tint of one of the
  four colours, stable per person.
- Team is the organisation chart, then the people. Members and invitations leave Settings for Team.

Engineering
- Restyle in place: keep the folder `src/components/verre/`, the file names, the exports and the props that tests
  pin (map quality-env, sections 3 and 5). New shared components go to `src/components/verre/ui/`.
- English and French together: every new or changed string goes into `messages/en.json` and `messages/fr.json` in the
  same edit, same keys, same parameters. French routes and French `NAV.label` values do not change.
- No new dependency. The project has `motion`, Radix, `lucide-react`, `sonner`, `cva`, `tailwind-merge`.
- Server changes are allowed where a remark or the new composition needs data the server does not give yet (the
  sidebar's data, the palette's feed, the invitation that carries "reports to", the invitation sent by email, the
  pending invitations, what an answer's citation knows of its source). Each with its test, under the same rights as
  the screens, with lean queries (the database pool is small).

## Working at several in one tree (read this twice)

- Each agent owns the files named in its task and edits only those. Shared files have one owner each:
  `globals.css`, `kit.css`, `layout.tsx`, `utils.ts`, `verre/ui/*` belong to the foundation stage; after it, a
  screen builder who needs a kit change writes it in its own files and reports it.
- `messages/en.json` and `messages/fr.json`: edit only your own namespaces, with small exact edits. Never reformat
  or rewrite these files whole.
- Never run a formatter or a fixer on the whole repository (`pnpm format`, `biome check --write .`): it rewrites the
  files other agents are editing. Format only your files: `npx biome check --write <your files>`.
- `pnpm typecheck` and `pnpm lint` see everybody's half-finished work. Fix only what is in your files; if another
  area is red, wait two minutes and run again; say in your report what was still red and whose it was.
- One dev server only, already running on http://localhost:3040 (database `leon_refonte`). Never start another
  `next dev`, never change `.env.local`, never run migrations or SQL on `leon_refonte` unless your task says so.
  When a page fails to compile because of a file that is not yours, wait and reload. Asking questions and adding
  documents call a paid embeddings service for a fraction of a cent: a few are fine, no bulk.
- Signing in for checks: account `claire@essai.leon.local` (owner), `david@essai.leon.local` (admin),
  `karim@essai.leon.local` (member); they share one password, written in
  `/Users/david/Downloads/Business/code/leon/.claude/worktrees/deuxieme-jet-glean/.demo/README.md`. Read it there,
  pass it through the environment variable `SHOOT_PASSWORD`, never print it, never write it in a file of the repo.
  A wrong password locks the sign-in for everybody for a while: do not guess.
- Git: read-only commands only. No commit, no stash, no checkout, no reset, no clean.

## Checking (every builder, before reporting)

- `pnpm typecheck`, `npx biome check <your files>`, and
  `npx vitest run --project unit src/components src/app src/i18n src/test/contracts src/lib` (about 15 s). If you
  touched `src/server`: the database tests of what you touched, with `LEON_TEST_DATABASE=leon_test_refonte`.
- Your screens on http://localhost:3040, signed in, at 1512 × 771 first (the founder's window), sidebar open and
  rail, in light and in dark, in English and in French (`leon-locale=fr` cookie); then 1280 × 800 and 390 × 844.
  Tools in `<SCRATCH>/tools/`: `shoot.mjs`, `act.mjs`, `dead.mjs`, each with `--base http://localhost:3040 --login
  <email>` (password from `SHOOT_PASSWORD`) and `--theme dark`. Look at each screen at least three times beside the
  prototype's page (http://localhost:3041/papier/app/…) and beside the founder's remarks. Every control answers.
- Report honestly: what works, what you did not check, what you left, what you could not decide.

## Notes from the foundation's review (November 12, 02:00) — for every builder

- The foundation is in: tokens in both themes, fonts, `kit.css`, the base components restyled in place, the new shared
  components, the showcase on `/kit`, the guide `port/KIT.md`. Typecheck, lint and the unit slice were green.
- A button that waits: pass `loadingLabel` (the verb: "Saving…"); the highlighter passes along it by itself.
- `PageHeader` no longer draws `subtitle` or `meta`. Three of those sentences are promises of the product ("only you
  see your discussions", who may open the admin page…): their screen's builder moves each into the panel or a short
  note, and removes the prop and its message keys in both languages.
- `Section` still draws `description`: each builder decides, sentence by sentence (the founder's rule 1).
- `CopyButton` says "Copied" in place and no longer toasts (unless `copiedMessage` is given).
- Leftovers the foundation could not touch, to clean in your own files: `font-bold`, text under 13px, `font-mono`
  outside real code, `rounded-field` on rows, `backdrop-blur`, the empty `.spin` / `.pop-in` / `caret` spans, the
  `Aurora`, `Beam`, `GlassCard signal/spotlight/reading` call sites, `glass-float`.
- A new size name must never equal a colour name (a text-size token called like a colour silently turns into a
  colour): the panel title is `text-head`.
- In dark, a tool's logo sits on a small light tile: keep it (logos are drawn for a light ground).

## Notes from the first wave (November 12, 03:20) — for the second wave

- The shell is ported (sidebar, top bar, command bar, identity menu, mobile strip). An action that changes what the
  sidebar shows (a connection's state, a discussion created, renamed or deleted, a member's name) revalidates the
  layout: do as `connexions/actions.ts` does.
- Connections links to `/reglages#equipe` for the choice of the team's GitHub repositories: the Settings builder keeps
  that anchor on that section, or says in its report where it moved.
- Members and invitations move to Team: the Team builder owns them; the Settings builder removes them from Settings
  and leaves nothing dangling.
- The founder wants no counts: do not give `Section` a count unless the number is the information itself.
- The demo organisation now has a reporting tree, a free group, one tool to reconnect and two paused ones. Never
  change it with SQL (only the demo-data task may).
- Shared accounts: never delete, rename or disconnect something you did not create yourself in this run; select it by
  its exact title or id, never by position. One discussion was lost that way in the first wave.
- The dev server slows down when several agents compile (up to 90 s for a request): give the tools `--settle` time
  before concluding that a control is dead.
