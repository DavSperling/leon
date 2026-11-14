# Leon « Papier » v3 — the app after login must look like a 2026 AI product

Read `common.md` (product, voice, bans) first. This file replaces the look described in `app-v2.md` and in
`papier/NOTES-app.md`: their facts about the product and their wording rules stand; their visual rules do not.

## The founder's words (November 11, on seeing the Connections screen)

"The sidebar is not modern at all, and the connections page neither. You forgot that we wanted to keep the design you
are working on but have something modern, clean, AI SaaS. It needs design."

What he saw: `<SCRATCH>/finish/now/conn-01.jpg` (1440 × 900). Look at it before anything else.
What he likes and wants kept: the public home page, `papier/index.html` (capture it and look at it: the white page,
the ink, the highlighters, the sheets of paper on a desk, the flags, the pill buttons, the type).

## Why the current app fails (our diagnosis)

We over-applied "simple and professional" and removed the design with the noise. It reads as an admin template:
- a flat grey column of text links beside a full-bleed white page: the layout of 2015, no surface, no depth;
- navigation as a plain list: no hierarchy, no entry point for asking (the product is an assistant), no recents;
- a bare HTML table with hairlines; states as grey sentences; logos at 20px lost in the text;
- the one tool that needs attention is a red line among eight rows;
- the screen's main job, adding one of 42 tools, is a list 2,600 pixels long;
- nothing on the screen says "Leon": the identity of the home page stops at the login.

## What "modern, clean, AI SaaS" means here

The reference family is the best product interfaces of 2025 and 2026: Linear, Attio, Granola, Dust, Notion, Vercel,
Raycast, Claude. What they share, and what this screen must have:
- Layered surfaces: a tinted ground and raised content surfaces, precise radii, hairlines, soft shadows.
- A sidebar that is designed: the workspace, one entry point to ask or search with its keyboard shortcut, navigation
  in meaningful groups with well-drawn icons, recent discussions, the health of the tools, the person signed in. It
  collapses to a rail.
- Integration pages as galleries: a logo on a tile, a name, one line, one action; categories and search; a panel for
  the details of one tool.
- States drawn as components: status pills, progress, skeletons, empty states, toasts, keyboard hints.
- Crisp micro-interactions: hover, press, a panel sliding in, a row settling, 150 to 250 ms. Nothing bounces.
- Density and precision: 13 to 14px interface text, a 4px spacing grid, optical alignment, numbers that line up.

And what it does NOT mean, because the founder rejected exactly this at the start ("it looks like AI slop"):
gradients (text, buttons or grounds), glass and backdrop blur as decoration, glows, a purple or indigo palette,
sparkle or magic-wand icons, emoji, big "hero metric" number cards, a coloured stripe on the left of a card, an icon in
a tinted rounded square above every heading, uppercase micro-labels with wide tracking, monospace as decoration,
nested cards, card radii of 20px or more, bouncy motion. A screen can be rich without any of these.

## The identity to keep (it is the brand; the app must be recognisably the home page's sibling)

- `papier/css/tokens.css`: white, the desk grey, ink, four highlighters (`--m1…4`) and their flags (`--f1…4`),
  Schibsted Grotesk for everything Leon says and for the interface, STIX Two Text only for the words of an original
  document, ink pill buttons, the sheet (white paper, hairline, long soft shadow), the flag (a page marker with a V
  notch), the highlighter stroke.
- The idea: paper on a desk. What Leon knows is a pile of documents; what Leon says is written on a sheet and marked
  in colour, one colour per source.
- New in v3: the brand may appear in the app's chrome, sparingly and with meaning: the sheet as the app's surface, a
  flag as a marker or a counter, the highlighter sweep as the language of "working… done", the three strokes as the
  signature of the ask field, pastel tints for people's initials. Inside an answer, colour n still means source n.
  Brand colour stays under about 5% of a screen; no coloured panel, no coloured button.
- You may add to the tokens, in your own stylesheet: neutral steps between white and ink, low-alpha tints of `--ok`
  and `--danger` for status pills, a shadow scale, a radius scale (keep cards at 14px or less). State them once, as
  custom properties, and use only them.

## The work: two designers, two takes, the founder chooses

Each designer redesigns the app shell and the Connections screen in their own folder, `papier/v3/<a|b>/`, from scratch
(new CSS, new markup). Same content, same data, same identity, different composition. This is a design proposal: it
must be beautiful at rest and its main interactions must work.

Files (yours only; edit nothing outside your folder): `connections.html` (whole and good-looking without script),
`app.css` (link `../../css/tokens.css` before it; you may also link `../../css/ui.css` for `.hl`, `.flag`, `.doc`),
`app.js` (vanilla, no dependency), `NOTES.md` (your system: surfaces, radii, shadows, type scale, spacing, components
and their states; your decisions and why; what you would do next on the other screens).

Data (fictional, Kestrel Studio, seen by Julie Martin; invent nothing else): `papier/../shared/demo-data.js`
(`LEON_DEMO`: `connections`, the 8 connected tools; `catalogue`, the 42 tools in 6 families; `discussions`) and
`papier/js/app-data.js` (`LEON_APP`: `reads`, what Leon reads from each tool; `connect`, how each tool connects,
`oauth` in one click or `key` with its fields and where to find the key, and whether what Leon reads is private to its
owner by default; `me`, `workspace`). Logos: `papier/../shared/logos/<tool>.svg`. Product facts and wording: the real
app's strings, `<REPO>/messages/en.json` (section `connections`); keep the facts, write plainer and shorter.

### What the shell must hold (you decide the composition)
The brand (the Leon mark: copy the SVG from `papier/app.html`); the workspace (Kestrel Studio); the entry point to ask
or search, with its shortcut (⌘K), which opens a command bar; the navigation: Home, Chat, Documents, Team,
Connections (current), Settings; the recent discussions; the health of the tools (one tool needs reconnecting); the
person signed in (Julie Martin, julie@kestrel.example) and her menu; a collapsed state (rail) on desktop; under 900px,
a top bar and a drawer. The other five screens are not drawn in this proposal: their entries answer with a short
notice ("Not drawn in this proposal") and nothing else on the screen is dead.

### What the Connections screen must hold (you decide the composition)
- A title and one sentence: Leon reads the connected tools every 15 minutes; an item is shown only to the people who
  can already open it.
- The tool that needs attention, first and unmissable: Intercom, last synced 2 days ago, the key was revoked,
  "Reconnect" (it works: a key field, a refusal when empty, "Reconnecting…", then synced, and the shell's health
  follows).
- The 8 connected tools: logo, name, account, who sees it ("Team" or "Only you"), state, number of items, and a way
  to manage each.
- Adding a tool: the 42 tools, found in one click (families, with counts) or three letters (search); for each, what
  Leon reads in one line and "Connect"; the connected ones marked.
- One tool's panel, in the container you judge best (a side sheet, a dialog, a popover; modern products use them;
  say why you chose): to connect (what Leon will read; who will see it by default; "Continue to <Tool>" for a
  one-click tool or the key field for a key tool; connecting; connected with "First sync in progress") and to manage
  (account; visible to; last sync and "Sync now"; "Delete connection" confirmed, with the real consequence: Leon stops
  reading the tool with that account, what it already saved stays). Build it fully for Notion (one click), Fathom
  (key) and Gmail (manage); the other tools open the same panel with their own data.
- States: hover, focus, pressed, loading, done, refused, and the gallery's "no tool matches".

### Simple to use, still
One obvious primary action per view. A new employee connects their tool in under ten seconds and sees at once that one
tool is broken and how to fix it. Plain words ("Team", "Only you", "Connect", "Reconnect"), sentence case, no jargon,
no exclamation mark, no "AI". Nothing invented: no customer, no metric, no certification, no chart of data the
product does not have.

### Sizes
The founder's window is about 1680 × 850. Design for it first; it must also be right at 1440 × 900 and 1280 × 800,
and hold at 390 × 844 (drawer, stacked cards, 44px targets, no sideways scroll). Use the width: no narrow column lost
in a wide white page.

### Quality bar
A senior designer at one of the reference companies would recognise this as a peer's work: alignment to the pixel, one
spacing grid, a consistent radius and shadow scale, real hierarchy (what you see first, second, third), contrast of
4.5:1 for text, a visible focus ring on every control, reduced motion respected. And a visitor who knows the home
page recognises Leon in two seconds.

## Checking

No server runs: give absolute file paths. Tools in `<SCRATCH>/tools/` (headless Chrome, no package):
- `node shoot.mjs --out DIR --width 1680 --height 850 --slices 3 name=/abs/page.html`: stills and NAME.json.
- `node act.mjs --out DIR --url /abs/page.html [--width --height] step …`: plays a flow and captures it
  (`click=<css | text=Words>`, `type=<target>::<text>`, `key=Escape`, `wait=600`, `shot=<name>`, `state`).
- `node dead.mjs --out DIR name=/abs/page.html`: clicks every visible control and says what each did (target: 0 dead).
Look at your screen at 1680 × 850 at least three times while designing, critically, beside the "before"
(`<SCRATCH>/finish/now/conn-01.jpg`) and beside the home page: after the first full draft, after the fixes, and at
the end with a panel open. Then 1440, 1280, 390. No console error, no sideways scroll.
`/Users/david/.claude/skills/impeccable/reference/craft-floor.md` is the quality floor (44 lines).
