# Leon « Papier » v3 — the whole app in the look the founder chose

Read first: `app-v3-modern.md` (the identity to keep, what modern means and does not mean, the bans, the quality
bar), then `app-v3-b2.md` (his remarks on the Connections screen: read every word of his, they are the taste to
apply everywhere), then `finish-v3.md` (what "every control answers" means: its ten rules stand, except rule 2: the
container for details is now the side panel, see below). Then open the approved screen and its notes:
`papier/v3/b/connections.html`, `papier/v3/b/NOTES.md`, `app.css`, `app.js`.

## Where we are

The founder chose take B « Bureau » and approved its Connections screen after three passes. His answer to "shall I
roll this style out to the other screens?": "Yes, roll it out." This round builds the whole app after login, and the
sign-in, in that look, with every control working. The older screens (`papier/app.html`, `papier/app-*.html`,
`signin.html`, `signup.html`) are the previous look he rejected ("not modern at all"): they are a source of content,
flows and wording, never of design.

## The founder's taste, in his words (apply it to every screen, not only where he said it)

- "We want to keep the design you are working on, but have something modern, clean, AI SaaS. It needs design."
- "I want the rectangles a bit smaller, so that it looks more professional, and more readable: there is a lot of
  information here. The number of items is useless. Even saying when it was synced is useless. This sentence [the
  one explaining the screen] is useless too: it only adds writing. I prefer when it is a bit less loaded, more
  readable: you find at once the information you are looking for."
- "In Manage you can leave the important information."
- "The connected ones, you can keep them bigger than the ones that are not connected. And when you click on one, you
  can make the rectangle that opens bigger: no need to minimise that."

Which gives the rules of this app:
1. A screen is a title and things. No sentence that explains the screen, no sub-title, no helper paragraph. A label
   only where a field needs one.
2. A thing on the desk (a tool, a document, a person, a computer, a question) is a rectangle that says what it is in
   one name and, at most, one quiet caption; and, only if something is wrong, what is wrong. No count, no date, no
   size, no "last …", no description on it.
3. Everything else about one thing lives in its panel, one click away: the generous side sheet (520px wide, the
   height of the window). The panel keeps the important information; it is drawn with care.
4. Two sizes of rectangle, on the same columns: a card (88px high, logo or avatar at 36px, name at 15px) for what the
   person has or looks at first; a tile (52px high, 28px, name at 14px) for what can be added or picked.
5. One ink pill per view: the one thing to do. Everything else is quiet.
6. The brand is present and rare: the desk and its sheets, the ask bar signed by three strokes, a flag that counts a
   section, the highlighter where Leon marks a source or says "done". In an answer, colour n is still source n.
7. His window is 1512 × 771 (a 14-inch MacBook). Every screen is designed for it first, with the sidebar open and
   with the rail; then 1680 × 850, 1280 × 800, and 390 × 844.
8. Every control answers (the rules of `finish-v3.md`): true to the real product, with its working, done and refused
   states; nothing dead, nothing that says "not drawn" or "not in this prototype" (a link that leaves Leon for a tool
   says "Opens <Tool> in the real product.").

## The folder and the files

The app lives in a new folder, `papier/app/`: `index.html` (Home), `chat.html`, `documents.html`, `team.html`,
`connections.html`, `settings.html`, `signin.html`, `signup.html`, `forgot.html`. Shared: `app.css` (tokens added to
the brand's, the shell, the kit), `app.js` (the shell's behaviour, the kit's behaviour, the shared templates),
`build.mjs` (writes the shell and the data-driven markup into every page, so that each page is whole without script
and the nine shells are identical), `NOTES.md` (the system and the kit: the only guide of the screen builders). Per
screen: `<screen>.css` and `<screen>.js` when needed. Data: `../../shared/demo-data.js` (`LEON_DEMO`) and
`../js/app-data.js` (`LEON_APP`: `answers`, `noAnswer`, `briefingSources` with passages, `documents`, `members` (38),
`computers`, `tokens`, `install`, `connect`, `reads`…); `../js/demo.js` (`LeonUI.docHTML`: the original of a source,
as a sheet) may be reused. Brand tokens: `../css/tokens.css`, and `../css/ui.css` for `.hl`, `.flag`, `.doc`.
Nothing outside `papier/app/` is edited, except by the last pass (see the end).

## Stage 1: the shell and the kit (one agent)

Turn the approved screen into a system the other screens are built from, without changing how it looks.
- The shell, once: the floating sidebar and its rail (remembered), the drawer under 900px, the ask bar and the
  command bar, the menu of the person signed in, the toast. Its markup is written into each page by `build.mjs` from
  one template. The entries are real links between the screens, with the current one marked; "Recent" opens a
  discussion (`chat.html?d=<id>`); the alert line and the flag on "Connections" follow the data on every page;
  "Ask Leon: <words>" in the command bar opens `chat.html?q=<words>`; the command bar also finds a tool, a person, a
  document, a discussion and a screen.
- The kit, each piece once, with its states, documented in `NOTES.md` with the markup to copy: the page head (title,
  and the view's one ink pill at its right when the view has one); a section head (title, the flag that counts, tools
  at the right: search, chips); the card and the tile; chips; the search field; fields and their errors; buttons;
  the status pill; initials on a pastel; the side panel (head, rows of facts, a form, the foot, the confirmation in
  place, "working…" then done) with one function to open it with any content; the toast; the empty state; and what
  Leon writes: an answer (its sentences under the highlighter, a number after each sentence, "no source" when a
  sentence has none), the sources as tiles (the number in its colour, the tool's logo, the title, "Only you" when it
  is private), and the original document as a sheet inside the side panel, opened at its passage.
- `connections.html` moves here on top of the shared files, pixel for pixel what was approved (compare captures).
- `NOTES.md` starts with the founder's rules above, then the system, the kit, the wording, what never to do.

## Stage 2: the screens (five agents in parallel, each in its own files)

Content, flows and true wording come from `finish-v3.md` (each screen's section), from the older screens and from the
real app's strings. The look and the amount of writing come from the rules above. When they disagree, the rules win.

### Home — `index.html`
The first screen after sign-in, and the face of the assistant.
- "Good morning, Julie." Nothing under it.
- What to ask: three suggested questions as tiles; a click opens the discussion with its answer.
- The morning briefing: one sheet, its five lines in their three groups, each line ending with its number in its
  colour. A click on a line or a number opens the side panel with the original document at the passage.
- Nothing else: the recent discussions are in the sidebar, the ask bar is at the top.

### Chat — `chat.html` (the answer screen and the chat are one screen now)
Asking Leon always opens a discussion: there is no separate "answer" page.
- The question as the title. The answer on a sheet: the sentences under the highlighter, a number after each. Under
  it the sources as tiles; a click on a sentence, a number or a source opens the original in the side panel
  (the document as a sheet, the passage marked, who can see it, "Open in <Tool>").
- At the foot, the field to go on ("Ask a follow-up…"); a follow-up is added under the exchange.
- The states, each designed: a new discussion (the three suggestions), Leon reading (the highlighter passing), the
  answer arriving once, "I don't know" (nothing on record: said plainly, with the way to connect a tool), offline.
- `?d=<id>` for the seven demo answers (the four scenarios and the three of `LEON_APP.answers`), `?q=<words>` for a
  question typed anywhere: matched by keyword, else the honest `noAnswer`. "Copy" (the answer with its sources).
  Deleting the discussion, confirmed (the real app deletes it for good).

### Documents and Team — `documents.html`, `team.html`
- Documents: the ink pill "Add a document" (the file picker; a file dropped anywhere on the page works too). The
  documents as tiles on three columns: the file's icon, its name, "Team" or "Only you". A new file says "Reading…"
  under the highlighter, then is read. A type Leon does not read is refused in plain words. The panel of a document:
  added by, date, size, visible to (it can be changed where the product allows), "Delete", confirmed. The empty
  state (`?state=empty`).
- Team: the ink pill "Invite" opens the panel: a work address, "Create the link", the link shown once with "Copy" and
  the three true facts (works once, expires in 7 days, Leon does not send it); the person joins as "Invited". The
  38 people as tiles on four columns: initials on a pastel, the name, the job title; "You" on Julie. A search field.
  The panel of a person: the address, the role (where the product lets Julie change it), the manager, "Remove from
  the workspace", confirmed.

### Settings — `settings.html`
- Four chips: Profile, Security, Assistants, Workspace (`#security`, `#assistants`, `#workspace` open them).
- Each group is a sheet with only its fields; the ink pill "Save" appears when something changed, and says "Saved".
- What takes steps opens the side panel: change the password; two-step sign-in as the product does it, with its
  backup codes shown once; delete my account as the product asks for it; create a token (name it, see it once,
  "Copy"); company single sign-on in its real steps; delete the workspace.
- Computers and tokens are tiles; their panel holds the details and "Disconnect" or "Revoke", confirmed.
- One plain sentence is allowed where a technical thing appears (the install command, a token): one.

### Sign-in — `signin.html`, `signup.html`, `forgot.html`
Outside the shell, in the same family: the desk, one sheet for the form; beside it the home page's document with its
highlighter and flag (the older screens have it: keep the idea, redraw it in this look). The flows of `finish-v3.md`:
refusals under the fields, a wrong password, "Signing in…", Google and Microsoft, company single sign-on, the reset
link and its careful sentence, creating a workspace (then `connections.html?state=empty`), the arrival by an
invitation (`signup.html?invite=1`). Signing in opens `index.html`; "Sign out" in the shell comes back here.

## Stage 3: one independent check per screen group (no edits)

Every control clicked (`dead.mjs`), every flow played to its end (`act.mjs`), four sizes; and the founder's rules
measured: the words visible at rest, anything on a card beyond a name and one caption, any sentence that explains the
screen, any count, date or size at rest, card and tile heights, the panel's size, the one ink pill.

## Stage 4: the last pass (one agent)

Fresh eyes on the nine pages side by side at 1512 × 771: one product, the same shell to the pixel, the same card, the
same panel, the same words for the same things. Fix what the checks found. Then, and only then, outside the folder:
point the public pages' "Sign in" and "Create a workspace" links (`papier/index.html`, `pricing.html`,
`security.html`, `connectors.html`) to `app/signin.html` and `app/signup.html`, and update the hub page
`prototypes/refonte-2026-11/index.html` (in French) so that it presents the new app. The older screens are left where
they are (the main session archives them).

## Tools and checking

`<SCRATCH>/tools/`: `shoot.mjs` (stills), `act.mjs` (plays a flow and captures it), `dead.mjs` (clicks every control
and says what it did); headless Chrome, absolute file paths, no server. See `app-v3-modern.md` for their use.
Look at each screen at 1512 × 771 at least three times, beside the approved Connections screen
(`<SCRATCH>/v3/b3/open-rest.jpg`, `rail-rest.jpg`, `open-manage.jpg`): same family, same density, same calm?
Nothing is committed.
