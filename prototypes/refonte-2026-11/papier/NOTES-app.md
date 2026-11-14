# Leon « Papier » v2 : the app after login. Kit and rules for every app screen

This file is the guide for every app screen (`app.html`, `app-search.html`, `app-chat.html`, `app-connections.html`,
`app-documents.html`, `app-team.html`, `app-settings.html`, `signin.html`, `signup.html`). `app-kit.html` shows every
kit class once, in its states, and every control on it answers: open it and copy the markup from it. The briefs are
`app-v2.md` and, for the finishing round, `finish-v3.md`; where this file is more precise, follow this file.
The finishing round (every control works) has its own section: "The finishing round: new kit pieces".

The founder's rule: once connected, the interface stays simple to use and professional. One obvious thing to do per
screen, plain words, real tables and forms, no decoration.

## Files

| File | What it is | May you edit it |
|---|---|---|
| `css/tokens.css`, `css/ui.css`, `js/demo.js`, `../shared/demo-data.js` | The home page's system | No |
| `css/app.css` | The shell and the kit | No. If something is missing, put it in your own `css/app-<screen>.css` and say so in your report |
| `js/app.js` | `LeonApp`: builders, feedback, the disclosure and the confirmation, then behaviour | No |
| `js/app-data.js` | `window.LEON_APP`: extra fictional data | No. Read your data from it and write the same values in your HTML |
| `tools/build-app.mjs` | Pastes builder output between `<!--gen:…-->` markers | No |
| `app.html`, `app-search.html`, `app-kit.html` | Reference screens | No |

Your page: `app-<screen>.html`, `css/app-<screen>.css` for what the kit lacks, and `js/app-<screen>.js` for what a click
does on this screen. No line limit: clear code over a line count, no dependency.

## The page skeleton (copy exactly)

Head: same `<link>` tags as `app.html`, in this order: Google Fonts (preconnect ×2 + the stylesheet), `css/tokens.css`,
`css/ui.css`, `css/app.css`, then your own sheet. Then `<script>document.documentElement.classList.add('js');</script>`.
Title: `<title>Connections · Leon</title>`.

```html
<body class="app" data-screen="connections">
<a class="skip" href="#main">Skip to content</a>
<div class="shell">

<!-- the sidebar: copy it from app.html, from "<!-- shell" to "<!-- /shell -->", unchanged -->

<main class="main" id="main">
<div class="page">
  <header class="top">…</header>
  …
</div>
</main>
</div>

<script src="../shared/demo-data.js" defer></script>
<script src="js/app-data.js" defer></script>
<script src="js/demo.js" defer></script>
<script src="js/app.js" defer></script>
</body>
```

`data-screen` is one of `home | chat | documents | team | connections | settings`.

### The sidebar, exactly

Copy this block. The only thing you change: move `aria-current="page"` to your entry (remove it from Home).

```html
<header class="side" data-side>
  <div class="side__top">
    <a class="side__brand" href="app.html" aria-label="Leon, home"><svg viewBox="131 126 200 200" aria-hidden="true"><path d="M140 157C196 157 236 226 300 226M140 226H300M140 294C196 294 236 226 300 226" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round"/><circle cx="313" cy="226" r="17" fill="currentColor"/></svg>Leon</a>
    <button type="button" class="btn btn--line btn--sm side__menu" data-side-menu aria-expanded="false" aria-controls="side-body">Menu</button>
  </div>
  <div class="side__body" id="side-body">
    <div class="acct">
      <button type="button" class="acct__btn" data-acct aria-expanded="false" aria-controls="acct-menu">
        <span class="avatar" aria-hidden="true">K</span>
        <span class="acct__ws">Kestrel Studio</span>
        <span class="acct__who">Julie Martin</span>
        <svg class="ico acct__chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 6.25 8 3.5l3 2.75M5 9.75l3 2.75 3-2.75"/></svg>
      </button>
      <div class="menu acct__menu" id="acct-menu" hidden>
        <p class="menu__head">Signed in as <b>julie@kestrel.example</b></p>
        <a class="menu__item" href="app-settings.html">Profile and settings</a>
        <a class="menu__item" href="app-team.html">Invite people</a>
        <a class="menu__item" href="signin.html">Sign out</a>
      </div>
    </div>
    <nav class="side__nav" aria-label="Main">
      <a class="side__link" data-nav="home" href="app.html" aria-current="page"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 7 8 2.25 13.5 7v6.25H9.75v-3.5h-3.5v3.5H2.5z"/></svg>Home</a>
      <a class="side__link" data-nav="chat" href="app-chat.html"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.25 3h11.5v8H8.5L5 13.75V11H2.25z"/></svg>Chat</a>
      <a class="side__link" data-nav="documents" href="app-documents.html"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.75h5.25L12.5 5v9.25H4zM9 2v3.25h3.25M6.25 8.5h4M6.25 11h4"/></svg>Documents</a>
      <a class="side__link" data-nav="team" href="app-team.html"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="6" cy="5.25" r="2.5"/><path d="M1.75 13.5c.2-2.3 1.9-3.75 4.25-3.75s4.05 1.45 4.25 3.75M10.75 2.9a2.5 2.5 0 0 1 0 4.7M12 9.9c1.3.5 2.1 1.7 2.25 3.6"/></svg>Team</a>
      <a class="side__link" data-nav="connections" href="app-connections.html"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.75 1.75v3M10.25 1.75v3M3.75 4.75h8.5v2.5a4.25 4.25 0 0 1-8.5 0zM8 11.5v2.75"/></svg>Connections</a>
      <a class="side__link" data-nav="settings" href="app-settings.html"><svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.75h6.5M12 4.75h2M2 11.25h2M7.5 11.25H14"/><circle cx="10.25" cy="4.75" r="1.75"/><circle cx="5.75" cy="11.25" r="1.75"/></svg>Settings</a>
    </nav>
    <a class="side__state side__state--danger" href="app-connections.html"><span class="dot dot--danger" aria-hidden="true"></span>Intercom needs reconnecting</a>
  </div>
</header>
```

The foot line is always the Intercom one (the demo data has Intercom in error). The healthy form, for reference:
`<p class="side__state"><span class="dot dot--ok" aria-hidden="true"></span>All tools synced</p>`.

### The top row, exactly

Every screen except Home, the answer screen and Chat: the title on the left, the compact ask field on the right. It goes
to the answer screen. (Chat has no field in its top row: the one at its foot is the screen's only field.)

```html
<header class="top">
  <div class="top__text">
    <h1 class="top__title">Connections</h1>
    <p class="top__sub">One short sentence, on one line at 1280 wide, if the screen needs one.</p>
  </div>
  <form class="ask" action="app-search.html" role="search">
    <label class="vh" for="ask">Ask or search</label>
    <input class="ask__input" id="ask" name="q" type="text" placeholder="Ask or search…" autocomplete="off" required>
    <button class="btn" type="submit">Ask</button>
  </form>
</header>
```

Without a sub-line you may drop the `top__text` wrapper and put the `<h1 class="top__title">` directly in `.top`.
Home has no ask field in the top row (its field is the 56px one, `.ask.ask--lg`). The answer screen uses
`.ask.ask--fill` holding the question.

## Layout and spacing

- Sidebar 240px on `--desk`, no rule. Main area white, 32px padding. `.page` is 1120px wide at most and centred in
  the main area. Checked at 1440, 1280 and 1600 wide: the content column is 1120, 976 and 1120px.
- `.top` to the first block: 28px (built in). Between two `.sec` sections: 40px (built in; `.sec--gap` adds the same
  40px above a block that is not preceded by a `.sec`).
- A section starts with `.sec__head`: `<h2 class="h-sec">` on the left, a count (`.sec__meta`) or one text action
  (`.link`) on the right, a `--line-strong` rule under it. Lists and tables start right under that rule.
- Two columns: `<div class="duo" style="--aside: 340px">` (left column fluid, right column `--aside`, 48px between).
  Home uses 340px; the answer screen uses `.duo.result` (the right column is 38% between 360 and 440px).
- Rows are separated by 1px `--line` hairlines. Section heads and table heads use `--line-strong`. Nothing else is
  ruled, boxed or shaded.
- Gaps inside a group: 8px (chips, buttons side by side), 16px (fields), 24px (label column to content).
- Under 900px the sidebar becomes a top bar with a Menu button and everything stacks (`.duo`, `.kv`, `.split` go to one
  column). Do not spend time there; just make sure nothing scrolls sideways.

## Type (interface sizes only; never add one)

| Use | Size / weight | How |
|---|---|---|
| Page title | 24px / 600, -0.02em | `.top__title` |
| What Leon writes: an answer | 18px / 1.6 | `.answer` inside `.app` |
| Section title, briefing lines, Home's fact line, empty-state title | 16px (600 for titles) | `.h-sec`, `.brief__lines`, `.empty__title` |
| The words of an original document | 16px STIX Two Text, in the original and in a source row | `.doc__body`, `.tx__text`, `.src__passage` |
| All interface text: labels, cells, rows, buttons, the top sub-line | 14px | default in `.app`, `.top__sub` |
| Secondary text: meta, hints, table heads | 13.5px, `--ink-2` | `.muted`, `.sec__meta`, `.hint`, `.cell__sub`, `.row__meta` |
| Chips with a number, tags | 13px | `.cite`, `.num`, `.tag` |

Three weights: 400, 500, 600 (`<b>` is 600 in the app). Schibsted Grotesk for everything; STIX Two Text only for words quoted from an original; monospace only inside
`.code`. Nothing under 13px. Secondary text is `--ink-2` (6.8:1 on white, 6.0:1 on `--desk`); never lighter.
Do not set `font-variant-numeric: tabular-nums` on formatted numbers or dates: this face widens the comma and the
colon with it ("1 , 842").

## Colour

White ground, `--desk` sidebar, ink text and ink pills. Highlighter colours (`--m1…4`) and flag colours (`--f1…4`)
appear in three places only: an answer's sentences (`.hl`), citation numbers (`.cite`, `.num`), and the passage
inside an original or a source row. Source n always has colour n (`c1…c4` / `hl-1…hl-4`; a fifth source reuses
colour 1 and keeps its own number). Never colour a panel, a row, a button, an icon or a heading.
Status is a dot and words. `--danger` is for what needs an action (a failed connection, a destructive link, a field
error); `--ok` exists only as the status dot.

## The kit (all in `css/app.css` unless marked ui.css)

Actions
- Two button heights. 40px (`--ctl`, also the height of every field and of the compact ask field): `.btn`, the ink
  pill, one per screen, the screen's primary action; and a `.btn.btn--line` that sits beside a field ("Cancel").
  32px: `.btn.btn--line.btn--sm`, every other action: in a row, a sheet, a settings section, under an answer
  ("Manage", "Connect", "Disconnect", "Open in Granola", "Copy", "Create a token"), and the "Ask" of the compact field.
  "Reconnect" is the one filled 32px pill: the failing row's action.
- `.btn.btn--line.btn--sm.btn--danger`: the button that removes for good. Only inside a confirmation, or for deleting
  an account. A row's "Disconnect" or "Revoke" is a plain 32px pill; the red comes when Leon asks.
- `.link`: a text action beside a section title ("New discussion") or a link inside a sentence. Never a row action.
- `.chip`: a quiet pill you can click (a suggested question, a filter value). `aria-pressed="true"` turns it ink.
  Group several in `<ul class="chips">`. `.chips` is also the generic "wrap these with 8px gaps" row.
- `.tag`: a small fact you read, not a control (role "Admin", "You").

Fields
- `.label` above every field (ui.css), never a placeholder as a label. `.field` (ui.css; 40px in the app) for inputs
  and textareas; `.field.select` for a `<select>`; `.hint` under a field; `.field-error` (ui.css) with
  `aria-invalid="true"` on the field. `readonly` and `disabled` fields turn `--desk`.
- `.fields`: a vertical stack of fields, 16px apart. `.fields.fields--row`: side by side, wrapping.
- `.ask`: Leon's ask field (see the top row). Never build another search field with it; a list filter is a plain
  `.field` with a `.label` (visually hidden with `.vh` if the heading already names it), inside `.filter-row`, right
  under the section head (the catalogue of Connections, the members of Team).

Structure
- `.sec`, `.sec__head`, `.h-sec`, `.sec__meta`: a section and its head (see Layout).
- `.duo`: two columns.
- `.table` inside `.table-wrap`: real `<table>` with `<th scope="col">`. First cell: `<span class="cell">` (logo 20px
  + name in 600; add `<span class="cell__sub">` for a second line). `.t-num` right-aligns a number column; `.t-act` is
  the last column, holding one or two `.btn--sm`. Rows are 56px (`--row`), one or two lines, not hoverable (they are
  not links). `.avatar.avatar--quiet`: a person's initials in a cell.
- `.rows` > `li` > `a.row`: a list where each row is one link (`.row__title`, `.row__meta`). `aria-current="true"`
  marks the open one (the discussion list of Chat).
- `.kv`: labelled groups, a name on the left (140px, change with `--kv`) and its lines on the right (the briefing).
- `.split`: a settings section: `<div><h3 class="split__label">…</h3><p class="split__help">…</p></div>` on the left
  (280px), `<div class="split__body">` on the right (560px at most; `split__body--wide` for a table).
- `.subnav`: the app's only tabs. Links with `data-t="Label"` (it keeps the tab's width when it turns 600),
  `aria-current="page"` on the current one. Settings uses it for Profile,
  Security, Assistants and coding tools, Workspace.
- `.panel`: a fine-edged group, no shadow, never nested. `.panel.panel--desk`: a note or a rule on `--desk`.
- `.menu`, `.menu__head`, `.menu__item`: a short list opening under its button (the account menu). The only thing
  besides the original that carries the sheet shadow, because it floats.
- `details.more-less` with `<summary class="btn btn--line btn--sm">Label<svg class="ico" …chevron…></svg></summary>`:
  a disclosure that works without script (the filters of the answer screen).
- `.code`: `<div class="code"><pre><code id="cmd">…</code></pre><button type="button" class="btn btn--line btn--sm" data-copy="#cmd">Copy</button></div>`.
- `.ico`: a 16px line icon, one 1.5px stroke, `viewBox="0 0 16 16"`. Only in the sidebar and as a chevron. No icon
  beside headings, in cells, in buttons or in empty states.

States
- `.status` + `.dot` (`.dot--ok`, `.dot--danger`, plain grey): "Synced 4 min ago". `.status.status--danger` for the
  failing one. Always words beside the dot.
- `.vis` (ui.css) and `.vis.vis--only`: who can see something. See Wording.
- `.empty`: `.empty__title`, `.empty__text`, `.empty__act` (one `.btn` and an optional `.muted` note). Left-aligned.
- `.alert` (`role="alert"`): `.alert__title` with a `.dot--danger`, `.alert__text`, and one `.btn--sm` to recover. It
  names the problem and the way out ("The key was revoked. Reconnect to resume.").
- `.busy`: a line of text with a small spinner, while something loads ("Reading the file…"). Still under reduced motion.
- Every control already has hover, `:focus-visible` (2px ink ring), pressed and disabled states. Do not restyle them.
- No control is dead and none says "Not in this prototype": every control does what its label says, on the page, with
  fictional data. The one exception is a link that leaves Leon for the tool itself ("Open in Gmail"): it carries
  `data-ext="Gmail"` and the notice says "Opens Gmail in the real product." (The handler of
  `title="Not in this prototype"` is still in `js/app.js`; no page may need it.)

What Leon writes
- The answer block: `<section class="ans">` with `<h2 class="h-sec">Leon’s answer</h2>`, the `.answer` paragraph,
  `.ans__note`, optional `.ans__hint`, and `.ans__actions`. Sentences are `.seg` with `.hl.hl-n` strokes and a
  `.cite.cn` number button; a sentence nothing supports is `.seg.seg--none` followed by `<span class="nosrc">no source</span>`.
  Never write this markup by hand: use the builder (below).
- Source rows: `<ol class="srcs">` of `.src` (number `.num`, logo, `.src__title`, `.src__vis`, `.src__meta`,
  `.src__passage`). As buttons they select an original (`aria-pressed`); as links (`link: true`) they leave Leon for
  the tool (`data-ext`), or go to Documents for an uploaded file (`upload: true` in the data).
  `.src.src--compact`: one line, no passage (the sources of the briefing on Home). The number is the same 19px chip
  after a sentence (`.cite`) and at the head of a row (`.num`); the chosen one carries a 1.5px ink outline in both.
- "I don’t know" (`answer.unknown`): the closest record is written in plain ink with its number, no stroke; no source
  is selected, and the original's place holds `.orig__none` until a row is chosen.
- The original: `<aside class="orig">` holding `article.doc.sheet` from the builder. It is the app's one sheet of
  paper: the only element with the sheet shadow, never rotated, never more than one visible at a time.

## Builders and the build tool

`js/app.js` exposes `window.LeonApp` (HTML strings, same data as the home page):

- `LeonApp.answerHTML(answer, {selected})`: `answer` is anything with `segments` and `sources` (a scenario of
  `LEON_DEMO.scenarios`, or `LEON_DEMO.permissions.views[0]` for the chat).
- `LeonApp.sourcesHTML(sources, {selected, link})`.
- `LeonApp.originalHTML(source, {hidden})`: `LeonUI.docHTML` with the app's wording for a private source; its "Open
  in …" is `data-ext` (or a link to Documents for an upload).
- `LeonApp.resultHTML(id, selected, query)`: the whole answer screen for any answer id. With no source (`none`) it
  has no "Sources" section and no original, and "Continue in chat" carries the typed words (`app-chat.html?q=…`).
- `LeonApp.copyText(answer)`.
- `LeonApp.answer(id)`: a demo answer by its id: `commitment | bug | departure | unknown` (the shared scenarios),
  `date` ("Did ACME accept the new migration date?", as Julie sees it), `verlant | nordia | pricing`
  (`LEON_APP.answers`), `none` (`LEON_APP.noAnswer`). `null` for anything else.
- `LeonApp.match(words)`: the id of the demo answer some typed words are about, or `'none'`. Use it wherever a
  question is typed (Home, the answer, Chat), so the same words get the same answer everywhere:
  `const id = LeonApp.match(q); const answer = { ...LeonApp.answer(id), query: q };`. Never fall back to the ACME answer.

Pages must be whole without script, so paste the output into the HTML. Write a marker and run the tool:

```html
<!--gen:LeonApp.answerHTML(LEON_DEMO.permissions.views[0], { selected: 1 })--><!--/gen-->
```
```
node tools/build-app.mjs /abs/path/to/papier app-chat.html
```

The expression may use `LeonApp`, `LeonUI`, `LEON_DEMO` and `LEON_APP`. The tool is idempotent.

## Behaviour that `js/app.js` gives every page (no code to write)

- The current entry (from `aria-current`; `data-screen` is the fallback), the account menu (click, Escape, click
  outside), the Menu button under 900px.
- `data-copy="#id"` on a button copies that element's text and says "Copied" for 1.6 seconds.
- The disclosure (`data-open`), the confirmation (`.confirm`), `LeonApp.say`, `.done`, `.busy` and `data-ext`: see
  "The finishing round: new kit pieces".
- On a `[data-result]` container (the answer screen only): `?s=<answer id>` and `?q=<typed words>` (matched with
  `LeonApp.match`; nothing matches → "I don't know", and the field keeps the typed words), selection by click on a
  sentence, a number or a row, Up and Down between rows, and the one arrival animation (strokes sweep, numbers pop,
  1.4s, once, off under reduced motion).

What a click does on your screen goes in `js/app-<screen>.js`. The page must still show, without script, everything
it shows at rest.

## Data

`../shared/demo-data.js` (`LEON_DEMO`): people, scenarios, permissions, briefing, discussions, connections,
catalogue. `js/app-data.js` (`LEON_APP`): `me`, `workspace`, `profile`, `fact`, `suggestions`, `briefingSources`
(5, each with `author` and the record's own words in `passage`), `documents` (7, one still being read, two private),
`members` (all 38: one Owner, three Admins; `manager` is a name of the list or `''`; two invited, one who left),
`inviteLink`, `visibilityRule`, `computers` (2), `codingTools`, `install`, `installNote`, `tokens` (1), `tokenNote`,
`reads` (what Leon reads from each of the 42 connectors, the words of `connectors.html`), `connect` (how each of the
42 connects, see below), `answers` (the three discussions the shared data only names: `verlant`, `nordia`,
`pricing`, in the shape of a scenario) and `noAnswer` (what Leon says when nothing on record answers; no source).
Each of `LEON_DEMO.discussions` carries the `id` of its answer (`date`, `commitment`, `verlant`, `nordia`,
`pricing`): link a discussion with `app-chat.html?d=<id>` and read it with `LeonApp.answer(id)`.

`LEON_APP.connect[tool]`, copied from the real catalogue (`src/server/connectors`): `how` is `'oauth'` (one click,
then the tool's own sign-in page: 20 tools) or `'key'` (a key to paste: 22 tools); `private` is `true` for Gmail,
Outlook, Slack and Google Drive (what Leon reads there stays with whoever connects it unless they share it) and
`false` for the 38 others (visible to the team by default). A `'key'` tool also has `fields` (the product's own:
`label`, `kind` `secret | text | select`, sometimes `placeholder` or `options`; several tools ask for two or three)
and `where` (the product's sentence on where the key is found). `keyToo: true` marks the 13 one-click tools that
also accept a pasted key in the product; the prototype shows the one click only.
The end of `js/app-data.js` also corrects the shared data for the app only (the home page does not load it): a source
only comes from a connected tool (Outlook → Gmail, Fireflies → Granola, Asana → Linear, Pipedrive → HubSpot), the
ticket ACM-214 has one date (Oct 27), Leon says "you" to Julie, dates of this year drop the year, and the discussion
Chat opens on is the first of the list. `tools/build-app.mjs` loads the file, so pasted HTML carries the same values.
Invent nothing else: no other names, dates, numbers or tools. Roles are Owner, Admin, Member.

## Wording

- Who can see something: "Shared with the team" and "Only you" on a source, a document or a sheet; "Team" and
  "Only you" in a table column headed "Visible to". Never "Private", never a lock.
- Buttons name their action: "Ask", "Connect", "Reconnect", "Manage", "Invite by link", "Copy", "Add a document".
- Sentence case everywhere. No exclamation marks, no emoji, no "AI". Dates: "Oct 27" within this year, "Mar 12, 2025" for another year, "Today, 08:31" with a time; an original keeps its own words.
- An error says what happened and what to do. An empty state says what will appear here and offers the one action.
- "Fictional example" is not written inside the app.

## Never

- No gradient, glass, blur, glow, tinted icon square, coloured panel, coloured left border, or shadow on anything at
  rest except the original.
- No rotated sheet, no pile, no flags sticking out except the one on the original, no hand-drawn stroke, no
  page-load choreography, no smooth-scroll library, no looping animation (the `.busy` spinner while loading is the
  only exception).
- No uppercase micro-labels, no kicker above a heading, no monospace outside `.code`, no centred text.
- No card grid. A list of things is a table or a row list.
- No second ink pill on a screen, no new button shape, no new radius (6px for fields, panels and sheets; pills for
  buttons and chips; 3px for number chips and tags).
- No new font size, no text under 13px, no grey lighter than `--ink-2` for text.
- No modal for something a row, a disclosure or a new section can do.
- Nothing that needs script to be seen.

## Checking your screen

```
node <SCRATCH>/tools/shoot.mjs --out <SCRATCH>/shots/rest/<name> --width 1440 --height 900 --slices 2 name=/abs/path/app-<screen>.html
```

Read `<name>.json` first (console errors, sizes, fonts). Then check at 1280 × 800 and 1600 × 900. No sideways scroll
(`document.documentElement.scrollWidth <= innerWidth`), no console error, every Tab stop with a visible ring.
A visually hidden label (`.vh`) inside a wide table must sit inside `.table-wrap`, or it widens the page on a phone.

## What was built and checked in this stage (November 10)

Built: `css/app.css` (359 lines), `js/app.js` (219), `js/app-data.js` (64), `tools/build-app.mjs` (26), `app.html`,
`app-search.html`, `app-kit.html`, this file.

Checked with headless Chrome (`<SCRATCH>/tools/check-app.mjs`, 55 checks, all pass):
- `app.html`, `app-search.html` at 1440 × 900, 1280 × 800, 1600 × 900 and 390 × 844, and `app-kit.html` at 1280 and
  390: no sideways scroll, no text under 13px, no console error. Both screens fit one screen at 1440 × 900 and
  1280 × 800 (page height = viewport height).
- The answer screen: click on a number, a row and a sentence each show that original; Enter and Space on a number,
  Enter on a row, Up and Down between rows.
- A focus ring of 2px or more on all 15 Tab stops of Home and all 23 of the answer screen.
- The account menu (click, Escape with focus returned, click outside), the notice on inert controls, "Copy with
  sources" (answers "Copied"; the text is the answer with [n] and the three sources).
- `?s=unknown`, `?s=bug`, `?s=departure`, `?q=…Verlant…`, `?q=anything else`: the right answer, the right heading,
  the question in the field, the page visible, no animation class left behind.
- Under 900px: the Menu button opens the entries; controls are at least 40px tall.
- Without script: both screens show all their content (the sidebar entries too, also at 390 wide).
- Rules checkers: `impeccable detect`: nothing on these files. `lint.mjs`: only hairlines (rows, tables and heads of
  a working interface: kept), the menu's shadow (a real overlay) and `100vh` (each followed by `100dvh`).
  `inspect.mjs --app`: "placeholder-data: acme" (the shared demo data's client name: kept) and "heavy-shadow" on the
  original's sheet (the one sheet of paper the brief asks for: kept).

Not done, or decided:
- The answer in the app carries no flag on the sheet's edge and no pile: the builder is `LeonApp.answerHTML`, not
  `LeonUI.answerHTML`. The flag stays on the original only.
- The numbers of the briefing on Home jump to the source row under the briefing (`:target`, no script); the row
  itself is inert ("Open in <tool>"). There is no side sheet for a briefing source.
- The filters open and their selects change value, but they filter nothing.
- The question typed in the ask field is matched by keyword to a demo answer. (Corrected in the finishing round:
  anything else now gets "I don't know", `LEON_APP.noAnswer`, never the ACME answer.)
- The flag button on the original did nothing. (Finishing round: in the app it is a mark, not a button.)
- `app-kit.html` is a reference sheet, not a product screen; nothing links to it.
- Under 900px only the stacking was checked, not designed further. Safari and Firefox were not opened.

## The last pass before the founder (November 10): what changed, what remains

Scope: every app screen, sign-in and sign-up, `css/app*.css`, `css/auth.css`, `js/app*.js`. The home page's files and
`../shared/demo-data.js` were not touched. The table at the top of this file ("May you edit it") was for the screen
builders; the rules below it are current.

Changed in the kit (`css/app.css`), so that the same thing is written once:
- One control height, 40px (`--ctl`): fields, selects, the compact ask field, the primary pill. One small button, 32px.
  One table row, 56px (`--row`). Before: buttons of 28, 32, 36, 38 and 48px, fields of 36 and 40px, rows of 49 to 59px.
- One number chip (19px) after a sentence and at the head of a source row; the record's words are 16px STIX everywhere.
- The top sub-line is 14px, one line; Home keeps 16px for the day's fact.
- Moved in from the screens: `.filter-row`, `.btn--danger`, `.avatar--quiet`, the tab that keeps its width, the phone
  rule for `.code`. Removed from the screens: the head with an inline count and a floating filter (Team), the text
  buttons in red (Settings), the line "Prototype states" (Documents).
- `.page` holds 10px of the side padding: the ground of a row no longer hangs past its column (it measured 10px over).
- Under 900px every control is 44px tall (buttons, chips, fields, tabs, menu entries; the flag's target on the original).

Changed on the screens:
- Chat: one ask field (the top one is gone); the list is 280px and the thread 720px; it opens on the first row;
  `?d=commitment | bug | departure | unknown` opens that question, kept in the address; "Continue in chat" on the
  answer screen carries the question, which takes the first place of the list.
- The answer: "I don’t know" no longer looks answered (plain ink, no original preselected).
- Connections: the catalogue is one row per tool (logo, name, what Leon reads, the action in one column at the right
  edge); the filter also searches what Leon reads. The page is 2,624px tall at 1440.
- Home: "Recent" is 380px wide (no title is cut), in the same order as Chat; rows 3 to 5 say "Not in this prototype"
  instead of opening the wrong discussion.
- Documents: a new file is "Only you" unless "Team" is chosen.
- Settings: every secondary action is the 32px pill; "Disconnect" and "Revoke" turn red only in the confirmation.
- Sign-in and sign-up: the line on the desk is 18px, a step under the title; "Show" is a 32px quiet control.
- Data: see "Data" above.

Checked (`<SCRATCH>/tools/check-last.mjs`, 66 checks, all pass; pictures in `<SCRATCH>/shots/rest/final2/`):
- The 7 app screens, the kit sheet, sign-in and sign-up at 1440 × 900, 1280 × 800 and 390 × 844: no sideways scroll,
  nothing wider than `.page`, no console error, no text under 13px, three weights, the title at the same place on
  every app screen (280, 32 at 1440), the first sidebar entry at y = 128 on every screen.
- At 390: no control under 44px on the nine pages.
- Behaviour: the answer screen (selection, "you", the chat link, the "no source" state and its empty original), Chat
  (first row, switching, a number opens its original, a new question), Connections (42 rows on 42 lines, one action
  column, the filter, Reconnect up to "All tools synced"), Settings (the confirmation), Documents, Team (invite,
  filter), sign-in to `app.html`, and the 8 pages loading without script.

Kept on purpose:
- Sign-in and sign-up keep the public site's sizes (48px pills, 44px fields, 16px text): they are outside the app shell.
- The answer is 18px in the app (`--t-answer` is overridden in `.app`; the home page's demo stays at 20px).
- Every sentence of an answer is fully highlighted, as on the home page. It is the direction's signature.
- The account menu has the sheet shadow (it floats). The drop zone and the empty states have a dashed edge.
- The ground of a hovered or chosen row is 10px wider than its words, so that words stay aligned with the headings.
- `impeccable detect` still reports "text too close to the edge" on the number chips and highlighter strokes
  (`css/ui.css`, the home page's components): not changed.

Remains:
- Three of the five discussions ("Who owns the Verlant account now?", "Summary of the Nordia redesign feedback", "What
  did we decide about the Q1 pricing?") had no answer in the demo data. (The finishing round wrote them:
  `LEON_APP.answers`.)
- The filters of the answer screen open but filter nothing; "Manage", "Connect", "Create a token", "Change password"
  and the other inert controls say "Not in this prototype".
- On the answer screen the sidebar marks "Home" while the title says "Answer" (there is no Search entry, by the brief).
- The shared data still says Outlook, Fireflies, Asana and Pipedrive on the home page; only the app is corrected.
- `app-kit.html` was updated but not reviewed line by line. (The 60-line limit on a screen's script is lifted.)
- Not opened in Safari or Firefox. Under 900px: stacking and target sizes were checked, the composition was not redesigned.

## The finishing round: new kit pieces (November 11)

The round's rule: every control does what its label says, on the page, and shows the states a real product shows
(working, done, refused, empty). Nothing new appears at rest. Four pieces, all in `css/app.css` and `js/app.js`, all
shown working on `app-kit.html` ("Table" and "What a click opens"). Copy the markup below exactly; the handlers are
delegated, so rows added by script work without any set-up.

### 1. The disclosure: `data-open`

A button that shows and hides the element with that id. `js/app.js` keeps `aria-expanded` and `aria-controls`,
swaps the label when `data-close-label` is given, moves focus into what opened (`[data-focus]` if you mark one,
else "Cancel" of a confirmation, else the first control, else the element itself), closes it on Escape and on any
`data-close` button inside, and gives focus back to the button. Inside a `[data-one-open]` container (put it on the
`<tbody>` or the `<ul>`) opening one closes the others; a confirmation opened inside a detail does not close it.
What is open has no `hidden` attribute: that is the whole state.

```html
<button type="button" class="btn btn--line btn--sm" data-open="cx-gmail" data-close-label="Close" aria-expanded="false" aria-controls="cx-gmail">Manage</button>
```

- `LeonApp.open(idOrElement, opener)` and `LeonApp.close(idOrElement, refocus = true)`: the same from script.
- Events on the element, bubbling, `detail.opener` = the button: `leon:open` (sent before focus moves: fill the
  element there if you build it late) and `leon:close`.
- While open, an outline pill with `data-open` has the desk's ground. Do not restyle it.

### 2. The row detail: `.detail`

What "Manage" opens under its row. It belongs to the row (the hairline between them goes): the desk's ground, no
edge, no shadow, nothing boxed inside. Two to four labelled lines, then one line of actions. One `.detail` per row,
right after it, holding either a `.detail__body` or, when the row's button only asks a question, a `.confirm`.

Under a table row (`colspan` = the number of columns):

```html
<tbody data-one-open>
<tr>… <td class="t-act"><button type="button" class="btn btn--line btn--sm" data-open="cx-gmail" data-close-label="Close" aria-expanded="false" aria-controls="cx-gmail">Manage</button></td></tr>
<tr class="detail" id="cx-gmail" hidden><td colspan="6"><div class="detail__body">
  <dl class="detail__list">
    <div><dt>Account</dt><dd>julie@kestrel.example</dd></div>
    <div><dt><label for="cx-gmail-vis">Visible to</label></dt><dd><select class="field select" id="cx-gmail-vis"><option selected>Only you</option><option>Team</option></select><p class="hint">Only you can search what Leon reads in Gmail.</p></dd></div>
    <div><dt>Last sync</dt><dd>4 min ago</dd></div>
  </dl>
  <p class="detail__actions"><button type="button" class="btn btn--line btn--sm">Sync now</button><button type="button" class="btn btn--line btn--sm" data-open="cx-gmail-ask" aria-expanded="false" aria-controls="cx-gmail-ask">Delete connection</button></p>
  <!-- the confirmation of piece 3 goes here, right after .detail__actions -->
</div></td></tr>
</tbody>
```

Under a list row (the row is a `<div class="row">`, not a link, because it holds a button):

```html
<ul class="rows" data-one-open>
<li>
  <div class="row"><span class="row__title">Julie’s MacBook Air</span><span class="row__meta">Last session yesterday, 17:40</span><button type="button" class="btn btn--line btn--sm" data-open="pc-1" data-close-label="Close" aria-expanded="false" aria-controls="pc-1">Manage</button></div>
  <div class="detail" id="pc-1" hidden><div class="detail__body">… the same .detail__list, .detail__actions and .confirm …</div></div>
</li>
</ul>
```

- `.detail__list` is a `<dl>` of `<div><dt>…</dt><dd>…</dd></div>`: the label column is 132px (`--kv` changes it), a
  field in it is 240px at most, a `.hint` under the field says what the choice means. A label of a field is a
  `<label for>` inside the `<dt>`.
- `.detail__actions`: the 32px outline pills, the removing one last. Never a second ink pill, never a red one here:
  the red comes in the confirmation.
- Under 900px the lines stack (label above value), the buttons are 44px, and inside a table that scrolls sideways
  the detail stays in view at the screen's width. A table that turns into blocks under 900px (Connections) needs
  nothing more for the cell (`grid-column: 1 / -1` is built in), but its own rule on `tr` may add a gap: check it.
- Everything that changes in a detail changes there: the value of "Last sync", the sentence under "Visible to".
  The row above changes with it (its "Visible to" cell, its state).

### 3. The confirmation in place: `.confirm`

One sentence in bold that names the thing, one that says what happens next (the real consequence, from the product),
the red 32px pill that repeats the verb, and "Cancel", which takes focus. Opened with `data-open`, closed by
`data-close` or Escape. Choosing sends `leon:confirm`; the kit does nothing else, the screen does the work.

Inside a row detail, right after `.detail__actions` (it takes the place of the action line, with no ground of its own):

```html
<div class="confirm" id="cx-gmail-ask" hidden>
  <p class="confirm__text"><b>Delete the Gmail connection?</b> Leon stops reading Gmail with julie@kestrel.example. What it already saved stays.</p>
  <p class="confirm__act"><button type="button" class="btn btn--line btn--sm btn--danger" data-confirm="delete-connection">Delete connection</button><button type="button" class="btn btn--line btn--sm" data-close>Cancel</button></p>
</div>
```

On its own (a line on the desk, the pills at the right): under a row whose button only asks, inside the row's
`.detail`; or in a settings section, right under the button that opens it.

```html
<td class="t-act"><button type="button" class="btn btn--line btn--sm" data-open="tok-1" aria-expanded="false" aria-controls="tok-1">Revoke</button></td></tr>
<tr class="detail" id="tok-1" hidden><td colspan="4"><div class="confirm">
  <p class="confirm__text"><b>Revoke “Assistant on my laptop”?</b> Tools using it lose access to Leon right away.</p>
  <p class="confirm__act"><button type="button" class="btn btn--line btn--sm btn--danger" data-confirm="revoke">Revoke</button><button type="button" class="btn btn--line btn--sm" data-close>Cancel</button></p>
</div></td></tr>
```

The screen's part, the same shape everywhere (this is the kit sheet's own):

```js
document.addEventListener('leon:confirm', async (e) => {           // e.target is the .confirm
  if (e.detail.action !== 'delete-connection') return;            // e.detail.opener: the button that asked
  await LeonApp.busy(e.target, 'Deleting…', 700);                 // working, in place
  const under = e.target.closest('tr.detail');
  const next = under.nextElementSibling;
  under.previousElementSibling.remove(); under.remove();          // done: the row leaves, with its detail
  // … update the count, the sidebar's foot line, the catalogue …
  LeonApp.say('Connection deleted.');                             // said once
  (next ? next.querySelector('[data-open]') : document.getElementById('connected-h')).focus(); // focus goes on
});
```

- The opener that asks keeps its own label ("Delete connection", "Revoke"): no `data-close-label`.
- After a row leaves, give focus to the next row's button, or to the section's heading (`tabindex="-1"`).
- `tr.confirm` with `.confirm__in` is the older markup of Settings (its inline script); the kit leaves it alone until
  that screen moves to the markup above.

### 4. Feedback: `LeonApp.say`, `LeonApp.done`, `LeonApp.busy`

- `LeonApp.say(text)`: the `.notice` at the foot of the screen (`role="status"`), 2.4 s.
- `LeonApp.done(button, 'Saved')`: the button says it for 1.6 s, then its own label comes back (as "Copied" does).
- `await LeonApp.busy(element, 'Syncing…', 800)`: the `.busy` line takes the element's place for the delay
  (600 to 900 ms), then the element's own content comes back and the promise resolves with the element. It works on
  a button, a cell, a `<dd>`, a `.confirm`. While busy the element takes no second click.

Which one: the thing that changed says it itself whenever it can (the row's state, the count, the new row); `busy`
while it works; `done` when the result belongs to the button that was pressed ("Saved", "Copied", "Sent"); `say`
only for what cannot be seen in place, because the thing left the page or lives elsewhere ("Connection deleted.",
"Opens Gmail in the real product."). One message per action, never two. A refusal is not feedback of this kind: it
is a `.field-error` under its field (`aria-invalid="true"`), or an `.alert` for something that is not a field.

### 5. A link that leaves Leon: `data-ext`

```html
<a class="btn btn--line btn--sm" href="#" data-ext="Gmail">Open in Gmail</a>
```

The notice says "Opens Gmail in the real product." The builders write it (`sourcesHTML` with `link: true`, the
original's "Open in …"). A source that is an uploaded document does not leave Leon: it links to `app-documents.html`.
Nothing else may be `data-ext`: a control that stays in Leon must work.

### Checked in this stage, and what to know

- `dead.mjs` on `app-kit.html`: 0 dead, 0 "not in this prototype". The nine pages and the kit load with no console
  error at 1440 × 900. The flows on the kit sheet, played with `act.mjs`: detail open (focus in it, the button says
  "Close"), confirmation open inside it (focus on "Cancel"), Escape twice (focus back on "Delete connection", then on
  "Manage"), a second "Manage" closes the first, "Cancel", the choice ("Deleting…", the rows leave, "Connection
  deleted.", focus on the next "Manage"), the same under a list row, at 1440 and at 390 (no sideways scroll).
- The answer screen: `?s=verlant | nordia | pricing`, `?q=<anything else>` ("I don't know", the typed words kept,
  no source, no original), `?q=nordia feedback` (the Nordia answer). `dead.mjs` on it: 0 dead (it had 3). Two
  changes in `js/app.js` did that, on the answer screen and in Chat alike: the flag on an original is now a mark
  (a `<span>`, written by `LeonApp.originalHTML`), since the rows and the numbers choose the source; and choosing the
  source already shown makes its sheet arrive again ("here it is"). Under 900px the chosen original comes into view.
- Do not use `aria-disabled="true"` on a control: the old "Not in this prototype" handler still answers it. Use
  `disabled`, or `LeonApp.busy`.
- `dead.mjs` counts a chip that is already pressed as dead when pressing it again changes nothing. In a group where
  one is always pressed, say so in your report rather than inventing an effect.
- `act.mjs` at 390 can miss a real click on a control inside a table that scrolls sideways (it clicks before the
  scroll has settled). Use `eval=document.querySelector('…').click()` for that step.
- Not done here: the screens themselves. Chat still reads `LeonUI.scenario` and its own keyword list (it should use
  `LeonApp.answer` and `LeonApp.match`, and accept `?q=`); Settings still has its inline confirmation.
