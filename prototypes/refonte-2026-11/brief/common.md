# Leon redesign prototypes: common brief (read this first, whole)

You are building ONE of two competing prototypes of a complete redesign of Leon: the marketing home, the sign-in
screen, and the app after login. The founder will compare version A (« Ambre ») and version B (« Papier ») and choose.
Your version's own direction is in `a.md` or `b.md` next to this file. That contract is decided: build it fully
committed, do not blend it with the layout you would have made anyway, do not soften it.

Plain HTML, CSS and vanilla JS. No framework, no build step, no npm. It must work from a static server and from the
file system (relative paths only). Light theme only. English only.

## The product

Leon (leonmemory.com) is the unified memory of a company. It connects to the company's tools (Gmail, Outlook, Slack,
Notion, GitHub, Linear, CRM, meeting notes, tickets, Drive: 42 connectors) and to people's conversations with AI
assistants, keeps every item word for word with its original access rights, and answers questions with a numbered
source on every sentence. When nothing on record supports an answer, it says "I don't know". Also: a morning briefing,
uploaded documents, and a server so each person's own AI assistant can query the memory with the same permissions.
Users: every employee of 20 to 200 person companies, not only developers. Markets: USA and Israel. Open beta, no
customers yet.

Voice: precise, frank, calm. Short sentences. No exclamation marks, no emoji, no hype, never "AI-powered", no
assistant or competitor names. Never invent customers, logos of customers, testimonials, metrics or certifications.

## What the founder said about today's interface (your version must visibly answer each point)

1. "It looks like AI, AI slop." Measured on today's home page: 4 gradient texts, 16 glass/blur elements, 12 uppercase
   kickers, 37 pill shapes, 42 outlined rounded boxes, 118 monospace captions, 13 tilting cards, 119 running
   animations, 20 font sizes, 14 corner radii, glow blobs, a particle field, a 3D sphere of logos, 01/02/03 steps.
2. "There is no brand, nothing personal."
3. "The colours are not right." Today: indigo #3b5aae and teal on blue-grey glass, dark by default.
4. "The titles are too big." Today: an 86px weight-800 centred headline on three lines with a gradient, and another
   at 96px on four lines.
5. "Keep demo areas like today's, but make them more precise."
6. "There is too much information." Today's home: 11 screens tall, 1,560 words, 11 sections, 10 tab controls.

History: an earlier restrained monochrome attempt was rejected as "too light"; the current glass look is the "AI
slop". He wants a SaaS site that sells, designed like the best current ones. So: rich, confident, specific. Not
timid, not generic.

## Hard limits (a reviewer will measure them)

- H1: 48 to 54px at 1440 wide, never above 56. Two lines at most at 1440, 768 and 390 (30 to 34px on a phone).
  Weight 600 at most for a sans, 500 at most for a serif. Solid colour.
- H2: 28 to 36px, one per section, two lines at most.
- Five type sizes at most on a page, outside interface fragments. Fragments use real interface sizes, 13px minimum.
- Running text 16px or more, in the full ink. Nothing under 13px anywhere.
- Home: the six sections of the copy deck plus the close and the footer. 450 words of prose at most outside
  fragments. 5,600px tall at most at 1440 wide.
- Navigation: wordmark, four links (Product, Connectors, Security, Pricing), "Sign in", one button "Create a
  workspace". A plain bar, not floating, not a pill.
- Demos on the home: the hero answer (interactive), the "no source" state, the permissions toggle (interactive), and
  one static fragment (the morning briefing). Nothing else that looks like an interface.
- One button shape and one corner radius for controls in the whole version.

## Banned (each one is something the founder is reacting to, or a mark of generated pages)

Gradients (background, text, border), glows, blur or glass, particle or blob backgrounds, 3D or tilt effects,
uppercase letter-spaced micro-labels, a kicker or eyebrow above a heading, a pill badge above the H1, floating pill
navigation, 01/02/03 numbering, icons in tinted squares or circles, rows of identical icon cards, monospace outside
real code, emoji, sparkle icons, magnifying glass, lock, eye or brain imagery, violet or indigo, cream with
terracotta, shadows on things at rest (your contract states the only exception), a styled accent word in a headline
(italic, coloured, underlined) unless your contract defines it, grey bars standing in for an interface, lorem ipsum,
exclamation marks. No centred text except where your contract says so. No animation that loops forever.

## Copy deck (both versions use these words; do not add sections)

Navigation: Product · Connectors · Security · Pricing — Sign in — Create a workspace

1. Hero
   H1: Know exactly what you promised. Source included.
   Sentence: Leon reads your team’s tools and answers in plain English. Every sentence links to the original. When
   nothing on record supports an answer, it says so.
   Button: Create a workspace. Note beside it: Open beta · no billing yet
   Demo: the three questions "A client commitment", "A known bug", "A departure". Note: Fictional example
2. No source
   H2: When the record is silent, Leon says so.
   Text: No source, no claim. Ask about something nobody wrote down and the answer is “I don’t know”, with the
   closest thing on record.
3. Permissions
   H2: Leon sees what you see. Nothing more.
   Text: Every answer is built only from what the person asking can open. Your email, Slack, Drive and AI
   conversations stay yours.
   Control: Asked by Julie / Asked by Sophie
4. Connectors
   H2: 42 connectors. Nothing to migrate.
   Text: Connect a tool in one click or with an API key. Leon picks up changes every 15 minutes and keeps each item
   word for word. Your team keeps working where it already works.
   Link: See all 42 connectors. Small line: A browser extension brings in your conversations with AI assistants,
   private to you.
5. Morning briefing
   H2: A briefing every morning.
   Text: What you did, what changed, what is still open. 250 words at most, each line with its source.
   Small line: Your own AI assistant can ask Leon too, with your permissions. Link: Read the documentation
6. Security
   H2: What is in place, and what is not yet.
   Text: Each company’s data is isolated in Postgres with row-level security. Credentials are encrypted with
   AES-256-GCM. No SOC 2 or ISO 27001 yet: the security page lists what is missing.
   Link: Read the security page
Close
   H2: Everything your team said, on record.
   Text: Create a workspace, connect your first tool, ask your first question.
   Buttons: Create a workspace · Sign in
Footer: wordmark; Product (Search and cited answers, Chat and morning briefing, Connectors, Pricing, Documentation);
   Trust (Security, What’s missing); Account (Sign in, Create a workspace); Language: English · Français; © 2026 Leon

Links to pages that are not in the prototype (Pricing, Security page, Documentation, connectors list) point to "#"
and carry title="Not in this prototype". "Create a workspace" and "Sign in" go to signin.html. Product, Connectors
and Security scroll to their sections.

## Demo data (shared by both versions: do not invent other names, dates or numbers)

`../shared/demo-data.js` defines `window.LEON_DEMO`: people, four scenarios (segments of the answer with the numbers
they cite, sources with the passage and the original in its own shape), the permissions case (two views of the same
question), the morning briefing, recent discussions, connected tools, the catalogue of 42 connectors.
In text, `**words**` mark the passage Leon found: render them as the highlight, never as bold asterisks.
Tool logos: `../shared/logos/<tool>.svg` (the `tool` field is the file name). Use them at 16 to 24px, as images, on
their own colours. Read the data file before you design anything.

## What "more precise" means for the demos

- It is the real interface, built with the same CSS as your app screens, at real size (labels 13 to 15px). Never a
  miniature, never inside a browser or laptop frame, never tilted.
- One scenario taken to its end: the question, the answer with a number on every sentence, a click on a number, the
  original opened in its own shape (a meeting has speakers and times, a ticket has an id and a status, an email has
  from and to) with the passage highlighted and "Open in Granola" (the tool's name).
- The visitor acts: three questions to choose from, numbers and sources that respond to click and to keyboard. No
  endless auto-typing. If the answer is revealed progressively, it takes under 1.2 seconds, once, and is skipped
  under prefers-reduced-motion.
- Every state is designed: default, hover, focus, selected, and the "no source" answer, which is as deliberate as
  a normal one.
- Without JavaScript the first scenario is visible in full.
- "Fictional example" is written on every demo, in sentence case, 13px or more.

## The app: the same four screens in both versions

The person is Julie Martin, account lead at Kestrel Studio. Navigation entries, in this order: Search, Chat,
Documents, Team, Connections, Settings. Only the four screens below exist; the other entries are present but inert
(aria-disabled, title="Not in this prototype").

1. `app.html` — Home. A greeting set from the data, naming today's one fact (for example: "Good morning, Julie. The
   ACME migration moved to December 2."), the ask field ("Ask or search everything Leon has saved…", button
   "Search"), the morning briefing of the day (08:45, three lists), and the recent discussions. Submitting the ask
   field or choosing a suggestion goes to app-search.html.
2. `app-search.html` — Search results for "What did we promise ACME for V2?". Leon's answer on top (each sentence
   with its numbers; title "Leon’s answer"; note "Written from the sources below. Check them."; link "Continue in
   chat"), the filter row (Tool, Type, Date, Person), the list of the three sources as results (tool, kind, title,
   author, date, passage with the found words highlighted, "Open in <tool>"), and the original of the selected
   result open beside or below with the passage highlighted. Clicking a number or a result selects that source.
   Show who can see each source ("Shared with the team" / "Private to you").
3. `app-chat.html` — A chat: the question "Did ACME accept the new migration date?" asked by Julie, the answer with
   its numbers, the sources cited (one of them private to Julie: say so), the field "Ask another question…", and the
   note "Only you can see this discussion. Leon only reads what you have permission to see.". A list of the recent
   discussions to switch between.
4. `app-connections.html` — Connections: the eight connected tools with account, who sees it (team or private to
   you), state (synced n minutes ago; Intercom in error with its message and a "Reconnect" action), number of
   items, a "Manage" action; then the catalogue by family with a "Connect" action and a filter field.

The app shell names the product (the Leon mark and wordmark) and the workspace (Kestrel Studio) and the person.
Give every control its hover, focus-visible and pressed state. Real `<a>`, `<button>`, `<input>`, labels, alt text.
Desktop first: 1440 and 1280 wide must both be right. Under 900px the app may simply stack; do not spend time there.

The Leon mark (inline SVG, monochrome, uses currentColor; keep it exactly):
`<svg viewBox="131 126 200 200" aria-hidden="true"><path d="M140 157C196 157 236 226 300 226M140 226H300M140 294C196 294 236 226 300 226" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round"/><circle cx="313" cy="226" r="17" fill="currentColor"/></svg>`
The wordmark is the mark followed by the word "Leon" in your interface typeface, weight 500 to 600.

## Sign-in (`signin.html`)

Title "Sign in". Buttons "Continue with Google" and "Continue with Microsoft". Then Email, Password, "Forgot
password?", button "Sign in" (it goes to app.html), and "No account yet? Create a workspace". Labels above fields,
never placeholders as labels. The other half of the screen is your version's brand moment: see your contract.

## The marketing page on a phone

index.html and signin.html must be right at 390px wide: their own composition, not a shrunken desktop. No sideways
scroll. Touch targets 44px. Interface fragments stay at real size and are cropped or scrolled inside, never scaled
down until unreadable.

## Files (in `prototypes/refonte-2026-11/<your version>/`)

`css/tokens.css` (custom properties: colours, type steps, spacing, radii, motion), `css/ui.css` (the interface
components used by the app and by the demos on the site), `css/app.css` (the app shell and screens), `css/site.css`,
`js/demo.js` (renders answers, sources and originals from LEON_DEMO; used by the site and the app), `js/app.js`,
`index.html`, `signin.html`, `app.html`, `app-search.html`, `app-chat.html`, `app-connections.html`, and `NOTES.md`
(what you built, what you checked, what is not done). Fonts from Google Fonts with `<link>` tags only (preconnect +
`display=swap`). No other external request. File names in lowercase ASCII with dashes.
Do not touch anything outside your version's folder (not `shared/`, not `src/`, not the other version).
Write files as you go: if you are interrupted, what is on disk must already be usable.

## Checking your work (be economical: screenshots are expensive to look at)

Capture: `node <SCRATCH>/tools/shoot.mjs --out <SCRATCH>/shots/<version> --slices 8 home=<abs path>/index.html`
(`--width 390 --height 844` for the phone; `--height 1000 --slices 1` for an app screen). It writes NAME-01.jpg… and
NAME.json (title sizes, fonts actually loaded, word count, page height, console errors). Read the JSON first: it
tells you sizes, fonts, height and errors without looking at any image. Then look at the slices once, list every
defect, fix them all, capture again, look once more. Two rounds of looking at most per file. Never screenshot after
each small edit.
Rules checkers (run each once near the end, fix what is real, say in NOTES.md what you left and why):
`node /Users/david/.claude/skills/design-taste-frontend/scripts/lint.mjs <your folder>`
`TASTE_SKILL_TMP=$(mktemp -d) node /Users/david/.claude/skills/design-taste-frontend/scripts/inspect.mjs <abs path>/index.html --out <SCRATCH>/shots/<version>/inspect` (add `--app` for an app screen)
`/Users/david/.claude/skills/impeccable/scripts/impeccable detect <your folder>`
The first inspector assumes very large headlines, at least four photographs and no borders at all: where it
contradicts this brief (title size, pictures, the borders of real interface fragments), this brief wins; mark the
root of each interface fragment with the attribute `data-ui` so it leaves the fragment's own borders alone.
Also read `/Users/david/.claude/skills/impeccable/reference/craft-floor.md` (44 lines) before writing CSS: contrast
4.5:1 for text, themed selection colour, caret, scrollbars and focus rings, balanced headings (`text-wrap: balance`),
tabular numerals in lists of numbers, real hover/focus/disabled states.

## Motion

One authored moment on the home (your contract names it), a short entrance for the parts of each section as it
enters the screen (heading, then text, then fragment; 60 to 90ms apart; 16 to 24px of travel with opacity; once),
and feedback on every control. Transform and opacity only. Content is visible by default and never depends on
script to appear. Everything has a `prefers-reduced-motion` fallback. Nothing loops.

## Report

When you finish, return: the files written, the checks you ran with their results (numbers), what is not done or not
checked, and the three things you are least sure about. Do not claim a check you did not run.
