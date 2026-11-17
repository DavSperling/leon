# Leon « Papier » v3 · the app: the system and the kit

The only guide for building a screen. See every piece live in `kit.html`; the approved screen is `connections.html`.

## The founder's rules, in his words first

- "We want to keep the design you are working on, but have something modern, clean, AI SaaS. It needs design."
- "I want the rectangles a bit smaller, so that it looks more professional, and more readable: there is a lot of
  information here. The number of items is useless. Even saying when it was synced is useless. This sentence [the one
  explaining the screen] is useless too: it only adds writing. I prefer when it is a bit less loaded, more readable:
  you find at once the information you are looking for."
- "In Manage you can leave the important information."
- "The connected ones, you can keep them bigger than the ones that are not connected. And when you click on one, you
  can make the rectangle that opens bigger: no need to minimise that."

Which gives the eight rules of this app:

1. A screen is a title and things. No sentence that explains the screen, no sub-title, no helper paragraph. A label
   only where a field needs one.
2. A thing on the desk (a tool, a document, a person, a computer, a question) is a rectangle that says what it is in
   one name and, at most, one quiet caption; and, only if something is wrong, what is wrong. No count, no date, no
   size, no "last …", no description on it.
3. Everything else about one thing lives in its panel, one click away: the side sheet, 520px wide, the height of the
   window. The panel keeps the important information; it is drawn with care.
4. Two sizes of rectangle, on the same columns: a card (88px high, picture at 36px, name at 15px) for what the person
   has or looks at first; a tile (52px high, 28px, name at 14px) for what can be added or picked.
5. One ink pill per view: the one thing to do. Everything else is quiet.
6. The brand is present and rare: the desk and its sheets, the ask bar signed by three strokes, a flag that counts a
   section, the highlighter where Leon marks a source or says "done". In an answer, colour n is still source n.
7. His window is 1512 × 771 (a 14-inch MacBook). Design for it first, sidebar open and rail; then 1680 × 850,
   1280 × 800 and 390 × 844.
8. Every control answers: true to the real product, with its working, done and refused states. Nothing dead, nothing
   that says "not drawn" or "not in this prototype". A link that leaves Leon says "Opens <Tool> in the real product."
   (`data-ext`).

## The files

| File | What it is | Who edits it |
|---|---|---|
| `app.css` | tokens, the shell, the kit | nobody during the screens stage |
| `app.js` | one global, `Leon`: data, templates, the shell's and the kit's behaviour | nobody during the screens stage |
| `build.mjs` | writes the shell and the data-driven markup into a page | nobody |
| `<screen>.html`, `<screen>.css`, `<screen>.js` | one screen | its builder only |
| `kit.html`, `kit.js`, `kit.css` | every piece in its states | reference |

Data, never edited: `../../shared/demo-data.js` (`LEON_DEMO` = `Leon.D`) and `../js/app-data.js` (`LEON_APP` = `Leon.A`).
If the kit lacks something, write it in your own sheet with the tokens below and say so in your report.

## The system

- Ground: the desk `--desk`, flat. Titles and section heads are written on the desk itself.
- Raised (cards, tiles, `.paper`, the ask bar): `--sheet`, 1px `--line`, radius `--r-l`, shadow `--sh-1`. Pointed at:
  1px up, `--sh-2`.
- Floating (sidebar, panel, command bar, menu, toast): the same sheet with `--sh-2` or `--sh-3`. Scrim `--scrim`,
  never a blur.
- Radii: `--r-s` 6 (fields, keys), `--r-m` 8 (rows inside a sheet, initials), `--r-l` 12 (every sheet and card), pill
  (every button, chip, status).
- Type, Schibsted Grotesk: `--fs-1` 13 (captions, pills, labels), `--fs-2` 14 (interface), `--fs-3` 15 (card names,
  panel text), `--fs-4` 18 (section heads, Leon's answer), `--fs-5` 28 (the page title). Weights 400, 500, 600.
  STIX Two Text only for the words of an original document (16px).
- Inks: `--ink`, `--ink-2` (captions, labels); `--n-500` for icons only. `--danger` for what is wrong, `--ok` for the
  dot of a healthy status.
- Spacing on 4px: 8, 12 (between rectangles), 16 (inside a card), 24 (inside a sheet, title to first section), 40
  (between sections). Gutter 32px, page at most 1348px wide.
- Colour n: classes `.c1` to `.c4` (pink, green, blue, amber) set a flag, a number or a stroke.
- Motion: `--fast` 150ms, `--med` 220ms, `--ease`; a simulated call lasts `--work` (1.3 s, `Leon.WORK`). Nothing
  loops, nothing bounces. Reduced motion is handled globally.
- Under 900px: the drawer, 44px controls (already in `app.css`). Under 600px: one column.

## The page skeleton (copy it)

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Documents · Leon</title>
<!--b:head-->
<!--/b:head-->
<link rel="stylesheet" href="documents.css">
</head>
<body>
<!--b:shell-->
<!--/b:shell-->

<main id="main">
<!--b:top-->
<!--/b:top-->

  <div class="page">
    <header class="head"><h1>Documents</h1><button type="button" class="btn">Add a document</button></header>

    <section class="sec" aria-labelledby="docs-h">
      <div class="sec__head"><h2 id="docs-h">…</h2><span class="tag c2"><!--b:doc-count-->7<!--/b:doc-count--></span></div>
      <ul class="grid grid--3" id="docs">
<!--b:docs-->
<!--/b:docs-->
      </ul>
    </section>

    <p class="fict">Fictional example: Kestrel Studio, seen by Julie Martin.</p>
  </div>
</main>

<!--b:end-->
<!--/b:end-->
<script src="documents.js"></script>
</body>
</html>
```

`head`, `shell`, `top`, `end` are the shell's four blocks: never write inside them. `end` already loads the data,
`../js/demo.js` and `app.js`; your script comes after it. The current entry of the sidebar is found from the file name.

## build.mjs

```
node build.mjs documents.html     # only your page: safe while the others build theirs
node build.mjs                    # every page
```

It fills every `<!--b:name-->…<!--/b:name-->` of the page. Your own blocks are registered by your script
(`<page>.js`; for `index.html` it is `home.js`), whose first half must run without a document:

```js
(function () {
  'use strict';
  const L = window.Leon, { A, esc } = L;
  const docs = () => A.documents.map((d) => L.tile({ logo: d.type, name: d.name, sub: d.visibility === 'private' ? 'Only you' : 'Team', attrs: `data-doc="${esc(d.name)}"` })).join('\n');
  L.block('docs', docs);
  L.block('doc-count', () => A.documents.length);
  L.selfCheck = (assert) => { assert.equal((docs().match(/<li/g) || []).length, 7); }; // optional
  if (!L.browser) return;      // build.mjs stops here
  // behaviour: the same templates redraw the list after a change
})();
```

Run it after any change of a template: the page must show everything it shows at rest without script.

## The kit: markup and the one line of JavaScript

**Page head.** `<header class="head"><h1>Team</h1><button type="button" class="btn">Invite</button></header>`. The
pill is the view's one ink pill; leave it out when the view has none. Nothing under the title.

**Section head.** `<div class="sec__head"><h2 id="x-h">Connected</h2><span class="tag c2">8</span><div class="sec__tools">…search…</div></div>`
inside `<section class="sec" aria-labelledby="x-h">`. The flag `.tag.cN` counts the things drawn under it.

**Grid.** `<ul class="grid">` (four columns at 1512), `<ul class="grid grid--3">` (three at most).

**Card and tile.** `Leon.card(o)` and `Leon.tile(o)` return one `<li>`:

```html
<li class="c1"><button type="button" class="tl card" aria-label="Manage Gmail" data-tool="gmail">
  <img class="logo" src="../../shared/logos/gmail.svg" alt="" width="36" height="36"><span class="tl__id"><span class="tl__name"><span class="mark">Gmail</span></span><span class="tl__sub">Only you</span></span>
  <svg class="i" aria-hidden="true"><use href="#i-chev"/></svg>
</button></li>
```

`o`: `logo` (a file of `shared/logos`: a tool, or `pdf`, `word`, `excel`, `powerpoint`) or `av` (a person's name:
initials on their pastel); `name`; `sub` (the one caption); `err: true` (caption in red, red dot on the picture);
`pill` (words of a 28px pill at the right instead of the chevron; outline, or ink with `ink: true`); `num` (a source's
number, in its colour, before the logo); `hl` (1 to 4: the colour of the stroke under the name when pointed at);
`href` (the rectangle is a link); `label` (aria-label); `attrs` (attributes of the control, as a string); `li`
(attributes of the `<li>`). The class is `tl card` (88px) or `tl tile` (52px). The whole rectangle is the control:
never a second button inside.

**Chips.** One pressed at a time; the group tells you:

```html
<div class="chips" role="group" aria-label="Families" data-chips id="chips">
  <button type="button" class="chip" data-v="all" aria-pressed="true">All</button>
  <button type="button" class="chip" data-v="crm" aria-pressed="false">CRM</button>
</div>
```
`$('#chips').addEventListener('leon:chip', (e) => show(e.detail));`

**Search.** `<div class="search"><label class="vh" for="q">Search people</label><input class="field" id="q" type="search" placeholder="Search people" autocomplete="off" spellcheck="false" data-slash><kbd aria-hidden="true">/</kbd></div>`.
`data-slash`: the `/` key focuses it. Filtering is yours (`input` event).

**Fields and their errors.** `Leon.field({ id, label, kind: 'text' | 'secret' | 'email' | 'select', options, placeholder, value, req: false })` inside `<form class="form" novalidate>`:

```html
<div><label class="label" for="f1">Name</label><input class="field" id="f1" type="text" aria-describedby="f1-e" data-req="Name"><p class="field-error" id="f1-e" role="alert"></p></div>
```
`if (Leon.validate(form)) …` writes "Name is missing." or "This is not an email address." under each `[data-req]`
field and focuses the first; `Leon.fieldError(field, 'This password is not the right one.')` for your own refusal
(`''` clears it). One plain sentence beside a technical thing: `<p class="hint">…</p>`.

**Buttons.** `.btn` (ink: once per view), `.btn.btn--line` (every other action), `.btn.btn--quiet` (the way back, a
removal before it is asked), `.btn.btn--danger` (only inside a confirmation), `.btn--xs` (28px, on a card or in a row),
`.btn--sm` (32px), `.iconbtn`, `.linkbtn`. `Leon.busy(btn, 'Saving…').then(() => Leon.done(btn, 'Saved'))`: the
button works for 1.3 s, then says it for 1.6 s. `<button data-copy="#token">Copy</button>` copies that element and
says "Copied" (`Leon.copy(text, btn)` from script). `<a href="#" data-ext="Gmail">Open in Gmail</a>` says "Opens
Gmail in the real product."

**Status pill.** `Leon.pill('Synced 4 min ago')`, `Leon.pill('First sync in progress', 'work')`,
`Leon.pill('Disconnected', 'err')`. In a panel, never on a card.

**Initials on a pastel.** `Leon.av('Karim Benali')` (32px; 28 in a tile, 36 in a card, 44 in the panel's head),
`Leon.av(name, 'av--s')` (24px, in a row of facts). A person keeps the same tint everywhere.

**The side panel.** One function, any content; calling it while it is open redraws it:

```js
Leon.panel.open({
  logo: 'gmail',               // or av: 'Karim Benali'; neither: the title alone
  title: 'Gmail', sub: '',     // sub: one quiet line under the name (a person's job title)
  body: Leon.facts([['Account', 'julie@kestrel.example'], ['Visible to', Leon.who('private')]]),
  foot: '<button type="button" class="btn btn--quiet" data-act="ask-delete">Delete</button><button type="button" class="btn btn--line push" data-close>Done</button>',
  act: (name, el) => {},       // a click on [data-act="name"] inside the panel
  submit: (form) => {},        // a form of the panel was sent and Leon.validate let it through
  back: '.tl[data-doc="x"]',   // what takes focus when it closes, if what opened it was redrawn
});
```

- Body pieces: `Leon.facts([[label, valueHTML], …])` (the rows; `<small>` inside a value is its quiet second line);
  `Leon.who('private' | 'team')` (the value of "Visible to"); a status row
  `<div class="statusrow">${Leon.pill('…')}<button class="btn btn--xs btn--line" data-act="sync">Sync now</button></div>`;
  a form `<form class="form" id="panel-form" novalidate>…</form>` whose button is in the foot:
  `<button type="submit" form="panel-form" class="btn">Create the link</button>`; done:
  `<div class="done"><h3><span class="mark is-on">Outlook is connected</span></h3><p>…</p></div>`.
- Foot: without `foot`, a "Done" button. `data-close` closes; `data-focus` takes focus on opening (else the first
  field); `.push` goes to the right; `<p class="panel__note">` is the quiet line under the buttons.
- Working, then done: `Leon.panel.busy('Connecting…').then((still) => { /* change the data, redraw the page */ if (still) Leon.panel.open(next); })`.
  The main button says it, the fields freeze, the highlighter runs along the foot. `still` is false when the person
  closed the panel meanwhile.
- The confirmation, in place of the foot: `Leon.panel.confirm({ title: 'Delete this connection?', text: 'Leon stops reading Gmail with julie@kestrel.example. What it already saved stays.', yes: 'Delete connection', no: 'Keep it' }).then((yes) => { if (yes) { … Leon.panel.close(); Leon.toast('…'); } })`.
  The question names the thing, the sentence says what really happens, the way back takes focus.
- `Leon.panel.close()`; Escape and a click outside close it too. Escape on a confirmation only answers "no": the
  panel stays. A click beside the panel on another thing that opens it (a tile, a card, a briefing line, a number)
  opens that thing at once, in the same panel; the focus comes back to it at the end.

**Toast.** `Leon.toast('Gmail connection deleted. What Leon saved stays.')`: for what happened elsewhere on the page
or cannot be seen in place. What can be seen in place (a button, a row) says it in place.

**Empty state.** `<div class="empty"><h3>No documents yet</h3><p>Add a file and Leon reads it.</p></div>` (one short
line; a `.btn.btn--line.btn--sm` only when the view has no ink pill for it).

**What Leon writes.**

```js
const a = Leon.answer('commitment');            // or Leon.answerFor(words typed)
el.innerHTML = `<article class="paper">${Leon.answerHTML(a)}</article>${Leon.sourcesHTML(a.sources)}`;
Leon.wire(el, a);                               // a sentence, a number or a source tile opens the original
Leon.arrive(el.querySelector('[data-answer]')); // once, when the answer arrives
```

- `.paper`: a sheet of content on the desk (an answer, the briefing, a group of settings). Never one inside another.
- `Leon.answerHTML(answer)`: each sentence under the highlighter of its source, its number after it; "no source"
  after a sentence nothing supports; for "I don't know" (`answer.unknown`) the closest record keeps its number, not
  its stroke.
- `Leon.sourcesHTML(sources)`: the sources as tiles (number in its colour, logo, title, "Only you" when private).
- `Leon.panel.source(source, back)`: the original as a sheet inside the panel, opened at its passage, with who can
  see it and "Open in <Tool>". It also takes a source that only has a `passage` (`Leon.A.briefingSources`). `back`:
  what takes the focus when it closes (`Leon.wire` gives the number of the sentence that was clicked).
- `Leon.asksHTML()` (the block `<!--b:asks-->`): the three questions to try, as tiles that wrap instead of cutting
  (`.tl[data-ask]`). Home and a new discussion show the same ones.
- A number alone (a line of the briefing): `<button type="button" class="cite c3" data-n="3">3</button>`, or the
  label `<span class="num c3">3</span>`.
- Reading: `<p class="reading"><span class="mark">Leon is reading…</span></p>` (the stroke passes once), then replace it.
- `Leon.copyText(answer)`: the answer with `[n]` and its list of sources, for "Copy".
- Answers: `Leon.answer(id)` with `commitment`, `bug`, `departure`, `unknown`, `date`, `verlant`, `nordia`, `pricing`,
  `none`; `Leon.match(words)` gives the id some words are about; `Leon.answerFor(words)` gives the answer, or the
  honest `noAnswer` carrying the words. `Leon.discussions` (id, title, date, href) and `Leon.suggestions` (id, label,
  href) are the five recent discussions and the three suggested questions.

**Icons.** `Leon.icon('plus')` or `<svg class="i" aria-hidden="true"><use href="#i-plus"/></svg>`: home, chat, doc,
team, plug, sliders, panel, menu, updown, chev, x, out, exit, plus, up, check, copy, trash, laptop, key. Another one:
inline `<svg class="i" viewBox="0 0 24 24"><path d="…"/></svg>`, one 1.6 stroke, no fill.

## The shell (already in every page)

- The sidebar's entries are links; "Recent" opens `chat.html?d=<id>` (the open one is marked); "Sign out" goes to
  `signin.html`. The rail is remembered (`localStorage`); under 900px it is a drawer.
- The alert line, the flag and the rail's dot follow `Leon.conns`: after changing a connection call
  `Leon.shell.refresh()`. The number of people under the workspace's name follows Team: `Leon.shell.people(n)`.
- A page is at least the height of the window and the "Fictional example" line (`.fict`, the last child of `.page`)
  is its foot: on a short screen it sits at the bottom of the window, never in the middle of the content.
- The command bar (the ask bar, ⌘K) finds a tool, a person, a document, a discussion, a screen, and asks:
  `Leon.ask(words)` goes to `chat.html?q=<words>` (Chat may replace `Leon.ask` to answer in place).
- Going to one thing: `Leon.go('tool' | 'person' | 'doc', id)` opens `connections.html?open=<tool>`,
  `team.html?open=<email>`, `documents.html?open=<file name>`. The screen that owns the thing sets
  `Leon.openHere = (id) => openItsPanel(id)`: it is called for `?open=` on load and when the person is already there.
- Addresses carry what the next page needs: `?d=`, `?q=`, `?open=`, `?state=empty` (`Leon.param('state')`).
  State lives in the page: a reload starts again from the data.
- A page outside the shell (sign-in) may use the `head` block alone and load the four scripts of `end`
  (`../../shared/demo-data.js`, `../js/app-data.js`, `../js/demo.js`, `app.js`) for the helpers (`Leon.validate`,
  `Leon.fieldError`, `Leon.busy`, `Leon.done`, `Leon.toast`); without `#side` the shell's behaviour does not start.

## Wording

- "Team" / "Only you". "Connect", "Reconnect", "Manage", "Done", "Not now", "Keep it". Sentence case.
- A refusal says what is wrong and sits under its field: "Access token is missing."
- A confirmation names the thing and says what really happens next, from the real product (`messages/en.json`).
- Working: the verb and an ellipsis ("Connecting…", "Saving…"). Done: one or two words ("Saved", "Copied").
- No exclamation mark, no "AI", no emoji, no invented customer, number or certification.
- "Fictional example: Kestrel Studio, seen by Julie Martin." closes every screen (`.fict`).

## Never

- A sentence under the title, a description on a rectangle, a count, a date, a size or "last …" at rest.
- A second ink pill in a view; a row of buttons on a card; a button inside a card or a tile.
- A dialog of your own, a second kind of drawer, a detail unfolding under a row: details go to the side panel.
- A `.paper` inside a `.paper`; a radius above 12px; a new shadow, colour or type size outside the tokens.
- Gradients, blur, glows, purple, sparkle icons, icons in tinted squares, uppercase spaced labels, monospace outside
  real code, bouncing or looping motion.
- "Not drawn", "Not in this prototype", a dead control, a disabled button at rest.
- Editing `app.css`, `app.js`, `build.mjs`, the data files, or another screen's files.

## Checked at the end of this stage (November 11)

- `connections.html` at 1512 × 771 against the approved captures (`open-rest`, `rail-rest`, `open-manage`): no pixel
  differs by more than 12/255.
- `dead.mjs` at 1512 × 771: `connections.html` 69 controls, 0 dead; `kit.html` 58 controls, 0 dead.
- Flows on Connections: repair Intercom (empty token refused, then card "Team", alert, flag and dot gone); Outlook in
  one click and Fathom with a key (9/33, then 10/32); Gmail: "Sync now", delete confirmed (7/35), "gma" before it
  ("already connected"), "zzz", a family chip; `?state=empty`; `?open=fathom`; the command bar (a tool, a person, a
  question); the rail kept from one page to the next; "Sign out".
- The ten pages (nine and the kit) at 1512, 1280 and 390: no console error, no sideways scroll. The shell's markup is
  the same on every page but for the current entry.
- Not checked: Safari and Firefox (popover, `@property`), reduced motion, hover states in a capture.

## State of the app (November 11)

The last pass, after the five screens were built and checked. Nothing is committed.

### What the last pass changed

- One foot for every screen: the "Fictional example" line sits at the bottom of the window on a short screen
  (Home, Documents, Settings, a new discussion) instead of reading as content in the middle of the page.
- Documents started 15px lower than the other screens (a hidden file input stood between the head and the section):
  every screen now has its title at the same line and its first section 56px under it.
- The side panel: a click beside it on another tile, card, line or number opens that one at once (it took two
  clicks); Escape on a confirmation goes back to the panel instead of closing it; after a click on a sentence the
  focus comes back to that sentence's number.
- Chat: a follow-up is brought into view whole, its sources above the docked field (they were hidden under it); a
  refusal under the field leaves with the discussion it was made in; the same question asked again takes the place of
  the older one in "Recent" (no title twice); "Recent" hides when the last discussion is deleted; the confirmation
  reads "Delete this discussion?" (the title ended in "?”?"); an empty field says "Enter a question.".
- Team: the sidebar's "38 people" follows an invitation and a removal; a one-word name gets two initials; a link
  made without a name is called by its role.
- Home: the rules between the lines continue across the three groups whatever wraps (shared rows); its blocks are
  written by `build.mjs` like every other page's (`home.js` for `index.html`).
- Into the kit, because two screens had written them: the three questions to try (`Leon.asksHTML`, Home and Chat),
  the 32px button (`.btn--sm` was 36px), the page's foot, `Leon.shell.people`.
- Wording: "No documents yet" and "Copy it now; it won’t be shown again." (the product's own), "Your role and
  current focus" as the placeholder of "About you" (the product's label; it was a sentence that explained the field).
- Outside the folder: the "Sign in" and "Create a workspace" links of the four public pages go to `app/signin.html`
  and `app/signup.html`; the hub page presents the app.

### What every control does

The shell (every screen)
- Sidebar entries: go to their screen; the current one is marked. "Recent": opens that discussion.
- Collapse button: the sidebar becomes a rail, and back; remembered from one page to the next.
- "Intercom needs reconnecting" and the flag on Connections: open Intercom's panel; both leave once it is repaired.
- Ask bar (or ⌘K): the command bar. Words then Enter: asks Leon in Chat. A name: opens that tool, person, document,
  discussion or screen. Escape closes it.
- Julie's row: her menu, with "Settings" and "Sign out" (back to the sign-in page).
- Under 900px: the menu button opens the sidebar as a drawer; Escape or a tap outside closes it.

Home (`index.html`)
- A line of the briefing, or its number: opens the original at its passage in the panel; "Open in <Tool>" says
  where it would go; "Done", Escape or a click outside closes.
- A question to try: opens its discussion in Chat.

Chat (`chat.html`, `?d=<id>`, `?q=<words>`, `?state=error`)
- The field and "Ask" (Enter sends, Shift+Enter makes a line): Leon searches, reads, then answers once. Empty, over
  4,000 characters, or sent while Leon replies: refused under the field.
- A question to try (new discussion): asks it.
- A sentence, a number, a source tile: opens the original in the panel ("Open in <Tool>", or "Open in Documents" for
  an uploaded file).
- "Copy": copies the answer with its sources, says "Copied".
- "Delete": the discussion's facts and the confirmation; "Delete" removes it and opens the next one, "Keep it" or
  Escape goes back.
- "Connect a tool" (under "I don't know"): goes to Connections. "Try again" (when the answer could not arrive): asks
  again.
- A "Recent" entry: opens that discussion in place; Back and Forward work.

Documents (`documents.html`, `?state=empty`, `?open=<file>`)
- "Add a document": the file picker (a file dropped on the page works too). A file Leon reads appears with
  "Reading…", then "Team"; another kind, or one over 10 MB, is refused in one line that can be dismissed.
- A file: its panel (added by, date, size, visible to). On her own file Julie changes "Visible to" (saved at once) and
  can "Delete" (confirmed). On someone else's: details only, except a former member's file, which an admin may delete.

Team (`team.html`, `?open=<email>`)
- "Invite": name, department, role, seniority (the product's lists); "Create the link" shows the link once with
  "Copy link" and its three facts; the person joins the grid as "Invited".
- Search (or `/`): filters the 38 people; "Clear the search" when nobody matches.
- A person: their panel (address, role, manager, reports). Role and manager are saved at once; a manager that makes a
  loop, or changing who is above the owner, is refused. "Remove from the workspace" is confirmed. Nothing to change
  on the owner, on Julie herself or on a former member.

Connections (`connections.html`, `?state=empty`, `?open=<tool>`)
- A connected card: its panel (state and "Sync now", account, visible to, items saved, what Leon reads, "Connect
  another account" where it exists, "Delete connection" confirmed).
- Intercom's card and "Reconnect": the repair (an empty key is refused, then "Reconnecting…", then a normal card).
- A family chip and the search: narrow the 34 tools; "already connected" with "Manage" when the letters find a
  connected tool; "No tool matches" otherwise.
- A tool to add: its panel ("Continue to <Tool>" in one click, or its key fields); once connected it joins
  "Connected" and both flags follow; a deleted connection comes back to "Add a tool".

Settings (`settings.html`, `#security`, `#assistants`, `#workspace`)
- The four chips: show one group.
- Profile: a change shows "Save" ("Saving…", then "Saved"; an empty name is refused). "Delete my account": the
  product's steps (password, the word DELETE, the 6-digit code when two-step is on).
- Security: "Change password" (current, new, confirm; each refusal under its field). Two-step sign-in "Set up"
  (password, the code to scan, the backup codes shown once, the 6-digit code), then "Manage" (new backup codes, turn
  off).
- Assistants: a computer or a token opens its panel ("Disconnect" or "Revoke", confirmed). "Computer" and
  "Assistant": the command or the address to copy. "Token": name it, see it once, "Copy".
- Workspace: "Set up" company single sign-on (protocol, domain, issuer, id, secret; the DNS record; "Verify" fails
  once, then succeeds), then "Manage" and "Remove SSO". "Delete the workspace": refused, Julie is not the owner.

Sign-in (`signin.html`, `?state=error`, `#sso`; `signup.html`, `?invite=1`; `forgot.html`)
- "Sign in": refusals under the fields; a password containing "wrong" is refused; else "Signing in…", then Home.
- "Continue with Google" / "Microsoft": "Opening …", then Home. "Company SSO": a work address; another domain than
  kestrel.example is refused in the product's words. "Show" / "Hide" on a password.
- "Forgot your password?": the address, "Send reset link", then the product's careful sentence and the way back.
- "Create a workspace": validation, "Creating…", then Connections as a new workspace. With `?invite=1`: "Join
  Kestrel Studio", then Home.

### Checked

- `dead.mjs`, 1512 × 771, 23 pages and states (the nine pages, six more Chat states, the two empty states, the four
  Settings groups, the sign-in refusal, the invitation, the kit): 0 dead, 0 "not in this prototype". 390 × 844, the
  nine pages, a discussion and Settings' Assistants: 0 dead.
- The whole walk by `act.mjs` at 1512 × 771: sign in (refused once, then in), Home, a question from the command bar,
  a source, a follow-up, "Open in Documents", a document deleted, someone invited and someone removed, Outlook
  connected, a name saved and a token created in Settings, sign out. And each screen's main flow at 390 × 844.
- Eleven pages and states at 1512 × 771 (sidebar and rail), 1680 × 850, 1280 × 800 and 390 × 844: no console error,
  no sideways scroll; the title at the same point, the first section at the same line, cards 88px, tiles 52px, on
  the same columns; one ink pill at most; buttons, chips and fields 44px on a phone.
- Connections against the three approved captures: no pixel differs by more than 12/255.
- Without script, at 1512 and 390: the nine pages show their title, their things and their fields.
- Reduced motion (`act --reduced`): a briefing line is marked at once, an answer arrives complete.

### What remains

- State lives in the page: a repaired tool, an added document, an invited person or a new discussion comes back to
  the demo data on the next screen (`shortcut:` in `app.js`; keep it in `sessionStorage` if a walk must survive a
  page change).
- A question typed freely is matched by keyword: "Which tool holds the ACME contract?" gets the ACME commitment
  answer. Anything unmatched gets the honest "I don't know".
- Home: "Still open" holds one line beside two groups of two (the demo data); its title is the data's, the product
  says "What is still open"; the greeting is always "Good morning".
- Chat: "Copy" is not in the real product (the brief asks for it); "Ask a follow-up…" is the brief's wording, the
  product says "Ask another question…"; "Enter a question." is cut from the product's longer refusal.
- The panel of a source shows the passage and little else for a briefing line (the data holds one passage per line).
- The number after a sentence is a 20px square, on a phone too: the sentence itself is the larger target.
- On a phone the title of Documents and Team sits 6px lower than the other screens' (it is centred on the 44px pill).
- Not checked: Safari and Firefox (`popover`, `@property`, subgrid, `@container`), a real phone, hover in a capture.
- The older screens (`papier/app.html`, `app-*.html`, `signin.html`, `signup.html`, `js/app*.js`) are still in the
  folder; nothing links to them any more from the public pages or the hub.
