# Leon « Papier » v2 — the rest of the site: the app after login, sign-in, inner pages

Read `common.md` (product, voice, bans, the founder's complaints about today's interface) and `home-v2.md` (the
direction the founder chose: read "What stays", "What changes" and its updates) before this file. The home page in
`prototypes/refonte-2026-11/papier/index.html` is the reference for the look: open it, read `css/tokens.css` and
`css/ui.css`, and reuse them. This file overrides the app and sign-in sections of `common.md`.

## The founder's words for this round

"Once connected, the interface must stay simple to use and professional. Do not be afraid of usage: work well."

Today's app, for the record (his own complaints and our audit): glass panels and glows behind every screen; a home
that is an empty search page with four examples of technical syntax; Search and Chat that do almost the same thing
in two places; the found passage highlighted pale blue on pale blue; a Connections page that piles states and a
catalogue of 42 tools with no reading order.

## Principles (this is a working interface: scanability and habit outrank expression)

1. Simple. One obvious thing to do on each screen. Plain words, no jargon, no search syntax shown unless asked for.
   Nothing to configure before the first answer. A new employee must succeed without help.
2. Professional. Calm, aligned, dense enough to work in. No decoration: no collage, no rotated sheets, no drenched
   colour, no marketing headline. Real tables, real forms, real states (empty, loading, error, "no source").
3. The same language as the site, used with restraint. `css/tokens.css` as it is. Schibsted Grotesk for all
   interface text; STIX Two Text only for the words of an original document. One highlighter colour per source
   (m1 to m4) and its flag colour (f1 to f4): they appear only on an answer's sentences, on citation numbers, and on
   the passage inside the original. Ink pill for the one primary action of a screen, outline pill for the others.
   The original document is the one "sheet of paper" of the app.
4. Motion is functional only: 150 to 250ms for selection, a panel opening, a row state; the highlighter sweep and
   the flag pop once when an answer arrives. No page-load choreography, no smooth-scroll library, no pinning, no
   hand-drawn strokes. Reduced motion respected.
5. Colour is information: under 3% of any screen. Status = a small dot and words ("Synced 4 min ago"), danger red
   only for what needs an action.
6. Honest. Fictional data from `../shared/demo-data.js` (Kestrel Studio, Julie Martin) and from `js/app-data.js`;
   "Fictional example" is not needed inside the app prototype, but nothing invented may look like a real customer.

## Shell (every app screen)

Left sidebar, 240px, on `--desk`, no rule: the Leon mark and wordmark; the workspace row (initial tile, "Kestrel
Studio", "Julie Martin", opens the account menu); six entries with 16px line icons drawn inline in one 1.5px stroke:
Home, Chat, Documents, Team, Connections, Settings; the current one is a `--desk-2` pill with ink text at 600. At the
foot, one line of state: "All tools synced" or, in danger red, "Intercom needs reconnecting" linking to Connections.
Main area: white, 32px padding, content 1120px wide at most, a top row with the page title (24px/600) and, except on
Home, a compact field "Ask or search…" that goes to the answer screen. The shell is static HTML in every page (no
script needed to see it). Desktop first: right at 1440, 1280 and 1600 wide; under 900px the sidebar becomes a top
bar with a menu button and content stacks.

## Screens (files in `prototypes/refonte-2026-11/papier/`)

- `app.html` Home. "Good morning, Julie." and one line naming today's fact from the briefing. The ask field, 56px,
  "Ask or search everything Leon has saved…", ink pill "Ask"; under it three suggested questions as quiet chips.
  Then two columns: "Morning briefing" (08:45; its three groups; each line ends with its coloured number, which
  opens the source) and "Recent" (the last discussions, with dates).
- `app-search.html` The answer. The question in the field; "Filters" closed by default (Tool, Type, Date, Person as
  plain selects when open). Left: "Leon’s answer" as a paragraph with one highlighter per source and a number after
  each sentence; the note "Written from the sources below. Check them."; "Continue in chat" and "Copy with sources".
  Then "Sources" as rows: number in its flag colour, logo, title, tool and kind, author and date, the passage with
  its highlighter, who can see it. Right: the selected original as a sheet, in its own shape, passage marked, "Open
  in Granola", who can see it. Selecting a sentence, a number or a row shows that original. A "no source" state
  (the Verlant question) is reachable from the home's third suggestion and is designed as carefully as the rest.
- `app-chat.html` Chat. A list of discussions (280px) with "New discussion"; the thread (720px): the question, the
  answer with highlighters and numbers, the sources as rows (the private email says "Only you"), the field "Ask
  another question…" fixed at the foot, and the line "Only you can see this discussion. Leon only reads what you
  can open."
- `app-connections.html` Connections. One sentence of explanation. "Connected" as a real table: tool, account, who
  sees it ("Team" or "Only you"), state (dot and words), items, "Manage"; the failing tool states its problem and
  offers "Reconnect". Then "Add a tool": a filter field and the catalogue by family, each tool one row with
  "Connect".
- `app-documents.html` Documents. A simple drop zone with a button; a table (name, added by, date, visible to); the
  empty state.
- `app-team.html` Team. A members table (name, role, manager, status), "Invite by link", and the rule of who sees
  what in one sentence. No org chart drawing.
- `app-settings.html` Settings. A sub-navigation (Profile, Security, Assistants and coding tools, Workspace) and
  two-column sections: a label and its explanation on the left, the fields on the right. Show Profile, and
  "Assistants and coding tools" (the connected computers, the one-line install command in a code block, a
  personal token row) in full.
- `signin.html` and `signup.html`. A form on the left (Continue with Google, Continue with Microsoft, then email and
  password; labels above fields; "Forgot password?"; the ink pill). On the right a `--desk` panel with one small
  sheet (the meeting line with its pink highlighter and flag 1) and the line "Everything your team said, on
  record." The pill goes to app.html.

Inert controls carry title="Not in this prototype". Every control has hover, focus-visible, pressed and disabled
states. Real buttons, links, labels, table markup, alt text. Text 14px in the app (13px minimum), 4.5:1 contrast.

## Inner pages of the public site (same header and footer as the home, same type and colours, modest motion)

- `pricing.html`. Honest: open beta, no billing yet. The three plans of today's site (Pilot, free, for one team;
  Team, the proposed price per active user per month; Dedicated, quoted), as one comparison table with words in the
  cells, not three cards with a "recommended" badge; then the six questions and answers.
- `security.html`. "Who sees what" first (shared with the team, private to you), then "In place" and "In progress"
  with the same items as the home, expanded with one plain sentence each, then how to ask a security question.
- `connectors.html`. The 42 connectors by family, each with one line on what Leon reads from it; a filter field;
  the browser extension and the coding tools at the end.
Copy for these three pages comes from today's site (`messages/en.json` under `site`, and
`src/components/site/content.ts`): keep its facts, cut its length by half, invent nothing.

## Files and ownership

New files only. Do not edit `index.html`, `css/site.css`, `css/ui.css`, `css/tokens.css`, `js/demo.js`,
`js/site.js`, `js/motion/*` or `../shared/demo-data.js`: another agent is working on the home page. Reuse them by
linking them. App styles go in `css/app.css` (the kit) and one small stylesheet per screen when needed; extra demo
data in `js/app-data.js`; inner pages share `css/pages.css`. Notes in `NOTES-app.md` and `NOTES-pages.md`.
