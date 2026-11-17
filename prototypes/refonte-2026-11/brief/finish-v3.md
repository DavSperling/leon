# Leon « Papier » v2 — finishing the app: every control answers

Read `common.md` (product, voice, bans), `app-v2.md` (the app's principles and screens) and
`prototypes/refonte-2026-11/papier/NOTES-app.md` (the kit, the rules, the wording) before this file. This file is the
round's specification; where it is more precise than the others, follow it.

## The founder's words for this round

"Finish the work on chat, connections, documents and team, settings, sign-in."
And, still: "Once connected, the interface must stay simple to use and professional."

## Where we are, measured

The nine screens are drawn, consistent and clean at rest (0 console error, no sideways scroll at 1440, 1280 and 390).
But 83 controls answer "Not in this prototype": 42 on Connections ("Manage" ×7, "Connect" ×35), 9 on Team ("Manage" ×8,
"Show all"), 6 on Documents ("Manage"), 6 on Settings (Change password, Set up two-step sign-in, Delete my account,
Create a token, Save name, Set up single sign-on), 5 on Chat (three discussions, two "Open in …"), 8 on Home (five
briefing sources, three recent discussions), 7 on the answer screen (four filters, three "Open in …"). A founder who
clicks finds a dead end on every screen. That is what "unfinished" means here.

## What "finished" means

Every control does what its label says, on the page, with fictional data, and shows the states a real product shows:
working, done, refused, empty. Nothing more appears at rest: the screens stay as they look today.

1. Nothing dead, nothing fake. One exception: a link that leaves Leon for the tool itself ("Open in Gmail") cannot go
   anywhere in a prototype. It carries `data-ext="Gmail"` and the notice says "Opens Gmail in the real product."
   Nothing else may say "Not in this prototype".
2. No modal, no drawer. A row's "Manage" opens a detail under that row; a removal asks in place; a setup unfolds inside
   its section. One thing open at a time.
3. True to the product. Each capability, its options and its consequence come from the real app, never from
   imagination: `<REPO>/messages/en.json` (the sections `connections`, `documents`, `team`, `settings`, `security`,
   `deleteAccount`, `discussions`, `thread`, `auth`), and when the strings do not settle it, the code
   (`<REPO>/src/server/connectors/catalog.ts` and the per-connector `catalog.ts`, `src/lib/providers.ts`,
   `src/lib/connection-form.ts`, `src/components/verre/…`). Say it in plainer and shorter words than today's app;
   keep the facts. If you cannot confirm that the product does something, do not show it. Never an invented customer,
   number, testimonial or certification.
4. Simple first. At rest a screen shows what it shows today: no new column, no icon, no second ink pill, no badge.
   What you add appears on a click, where the click happened.
5. Real states. An action goes: idle → working (the kit's `.busy` line, 600 to 900 ms, simulated) → done (the row, the
   count or the state changes, and a status message says it once). Where the real product can refuse, design the
   refusal: an empty or invalid field, a wrong key, a wrong password, a file type Leon does not read. Every opened
   thing closes: its own "Cancel" or "Close", and Escape. Focus goes to what opened and comes back to the button that
   opened it.
6. Without script a page still shows everything it shows today. What a click adds may need script.
7. State lives in the page. A reload brings the starting state back; nothing is stored between pages.
   (`shortcut: no storage, add it only if the founder asks for a flow that survives a page change`.) Links between
   pages carry what the next page needs in the address (`?d=`, `?q=`, `?state=`).
8. Motion is functional: 150 to 250 ms for something opening or a row changing. Reduced motion: no movement.
9. Keyboard: every control reachable in a sensible order, a visible focus ring, Enter sends a form, Escape closes.
   Under 900px every control is 44px tall and nothing scrolls sideways.
10. The wording rules of NOTES-app.md stand ("Team" / "Only you", sentence case, an error says what happened and what
    to do, no exclamation mark, no "AI").

## Stage 1: the kit and the data (one agent, before the screens)

Owner of `css/app.css`, `js/app.js`, `js/app-data.js`, `app-kit.html`, `tools/build-app.mjs`, `NOTES-app.md`.
The screens are rebuilt by six agents right after, in parallel: what you write is what keeps them identical. Keep it
small. Four pieces, each shown in its states on `app-kit.html` and documented in NOTES-app.md with the exact markup.

1. A disclosure, `data-open="<id>"` on a button: shows and hides the element with that id, keeps `aria-expanded` and
   `aria-controls` right, swaps the label when `data-close-label` is given ("Manage" ↔ "Close"), moves focus into what
   opened, closes on Escape and gives focus back. Inside a `[data-one-open]` container only one stays open.
   Its first use is the row detail: `<tr class="detail" id="…" hidden><td colspan="…"><div class="detail__body">`
   under a table row, and the same `.detail` under a list row (`li`). Design it: it belongs to its row (no shadow, no
   second box inside, `--desk` ground or a clear indent), holds two to four labelled lines and one line of actions,
   and reads calmly at 1440 and at 390.
2. A confirmation in place, `.confirm`: one sentence in bold that names the thing ("Delete the Gmail connection?"), one
   sentence that says what happens next, the red 32px pill (`.btn--danger`) that repeats the verb, and "Cancel", which
   takes focus. Settings already has one (its inline script): generalise that one, do not invent a second. Opening is
   `data-open`; choosing sends a `leon:confirm` event the screen listens to.
3. Feedback. `LeonApp.say(text)`: the existing `.notice` (`role="status"`), 2.4 s, for what happened elsewhere on the
   page or cannot be seen in place ("Connection deleted."). `LeonApp.done(button, 'Saved')`: the button says it for
   1.6 s, as "Copied" does today. `LeonApp.busy(element, text, ms)`: puts the `.busy` line in the element and resolves
   after the delay. One sentence in NOTES-app.md on which to use when.
4. `data-ext="<Tool>"` on a link that leaves Leon: the notice says "Opens <Tool> in the real product." The builders
   (`sourcesHTML` with `link: true`, the original's "Open in …") write it instead of `title="Not in this prototype"`.
   The handler of `title="Not in this prototype"` stays in the file, but no page may need it at the end of the round.

Data, in `js/app-data.js` (invented, consistent with `../shared/demo-data.js`: same people, tools, dates, and a source
only ever comes from a connected tool or an uploaded document):
- `answers`: the three discussions that have no answer today, in the shape of a scenario (`id`, `query`, `segments`
  with `cites`, `sources` with `passage` and `original`): "Who owns the Verlant account now?" (Nov 6; build on what
  the departure scenario already says about Thomas's handover and the Verlant quote), "Summary of the Nordia redesign
  feedback" (Nov 4), "What did we decide about the Q1 pricing?" (Oct 30; one source is the uploaded document
  "Q1 2027 pricing grid.xlsx", so an upload is seen cited like any other source). Two or three sentences each, two or
  three sources each, one private source among them at most. Plus `noAnswer`: what Leon says when nothing on record
  answers a question typed freely ("I don't know." and one plain sentence; no source).
- `briefingSources`: add to each of the five the exact passage (`passage`, with `**…**` around the words to mark),
  consistent with its briefing line.
- `members`: the 29 other people of the 38 (name, email, title, role, manager, status), so that the Team screen lists
  the team it counts. Plausible and varied, nobody famous, a sane tree of managers, two or three Admins in all.
- `connect`: for each of the 42 tools of the catalogue, how it connects (`'oauth'`: one click and the tool's own
  sign-in page; `'key'`: a key to paste) and whether what Leon reads from it is private to its owner by default.
  Copy the truth from the real catalogue (rule 3); do not guess.
Then run `tools/build-app.mjs` on the pages whose generated regions change, and check that the nine pages still load
without a console error.

## Stage 2: the screens (six agents in parallel, each in its own files)

Each agent owns only its files and never edits the kit (`css/app.css`, `js/app.js`, `js/app-data.js`) or another
screen. If the kit lacks something, write it in your own sheet in the kit's style and say so in the report. Scripts:
clear code over a line count (the old "under 60 lines" note is lifted), no dependency.

### Home and the answer — `app.html`, `app-search.html`, new `js/app-home.js`, `js/app-search.js`
- Home, "Recent": the five rows open their discussion in Chat (`app-chat.html?d=<id>`).
- Home, the briefing's sources: each row unfolds its passage (the record's words, 16px STIX, its highlighter, who can
  see it, "Open in <Tool>" as `data-ext`). A number after a briefing line opens its row and brings it into view. A
  native `<details>` per source works without script.
- The answer, "Filters": the four selects narrow the list of sources (tool, type, date, person); the count says
  "2 of 3 sources"; a sentence whose source is filtered out is not hidden (the answer does not change), and when
  nothing matches: "No source matches these filters." with "Clear filters". "Open in …" is `data-ext`.
- A question typed in any ask field that matches no demo answer gets the honest answer (`noAnswer`), never the ACME
  answer: Leon says "I don't know" when it has no source. The field keeps the words that were typed.

### Chat — `app-chat.html`, `css/app-chat.css`, `js/app-chat.js`
- The five discussions open (`?d=` for each; a reload keeps the open one).
- "New discussion": an empty thread with its title, the three suggested questions, the field focused; the list shows
  it first.
- Asking: the thread shows the words that were typed; "Leon is reading…" (`.busy`), then the answer arrives with its
  one sweep; a follow-up is added under the previous exchange and brought into view. Nothing matches → `noAnswer`,
  with the "connect it" link the answer screen has. Offline → the error that exists today.
- Deleting the open discussion: a quiet action in the thread's head, the confirmation in place (the real app deletes
  a discussion and all its messages, for good), then the next discussion opens.
- Up and Down between source rows, as on the answer screen. "Copy with sources" checked. "Open in …" is `data-ext`.

### Connections — `app-connections.html`, `css/app-connections.css`, `js/app-connections.js`
- "Manage" on a connected tool opens the row detail: the account; "Visible to" (Team / Only you, with the one
  sentence that says what each means for this tool, from the real strings); the last sync and "Sync now"
  (Syncing… → "Synced just now"); "Delete connection", confirmed in place with the real consequence (Leon stops
  reading the tool with that account; what it already saved stays). After deletion the row leaves, the counts
  change, the catalogue offers "Connect" again, and the sidebar's foot line stays right.
- "Connect" on a catalogue row opens a detail under that row: who will see what Leon reads from this tool by default,
  then either "Continue to <Tool>" (one click; say that the tool's own sign-in page opens, simulate the return) or a
  key field with "Connect" (a pasted key; an empty or malformed key is refused with a field error). Then
  "Connecting…", and the tool appears in "Connected" with "First sync in progress", then "Synced just now"; the
  catalogue row says "Connected". Outlook keeps its sentence about the Microsoft admin.
- The catalogue is long: above it, the families as `.chip` filters (one pressed at a time, "All" first), beside the
  filter field. Finding one's tool takes one click or three letters.
- A new workspace, `?state=empty`: no tool connected yet. One sentence on what will appear, and the catalogue.
- "Reconnect" on Intercom keeps working (and can fail once with a wrong key if the real flow asks for one).

### Documents and Team — `app-documents.html`, `app-team.html`, `css/app-lists.css`, `js/app-documents.js`, `js/app-team.js`
- Documents: "Add a document" opens the file picker; a picked or dropped file appears as a row ("Reading the file…",
  then read) with the chosen visibility; a file type Leon does not read is refused in plain words. "Manage" opens the
  row detail: "Visible to" (the options the product really has for the person signed in) and "Delete", confirmed in
  place with the real consequence. Check in the real app who may manage whose document; offer "Manage" only where
  Julie (an Admin) really can. The empty state stays reachable (`?state=empty`).
- Team: "Invite by link" validates the address, shows the link once with "Copy" and the real rules (works once,
  expires in 7 days, Leon does not send it), and adds the person as "Invited today". "Manage" opens the row detail:
  role, manager ("Nobody" included), "Remove from the workspace" confirmed in place; the Owner's row and Julie's own
  row offer only what the product allows (check). The table lists ten people, then "Show all 38 people" unfolds the
  rest; the filter searches all 38. Without script all 38 are listed.

### Settings — `app-settings.html`, `css/app-settings.css`, new `js/app-settings.js` (move the inline script there)
- The four tabs are complete and every button works: Profile ("Save changes" validates and says "Saved"); Security
  (change the password: current, new, the rule, a refusal when the current one is wrong; two-step sign-in as the
  product does it, with its backup codes shown once; delete my account as the product asks for it); Assistants and
  coding tools (connect a computer; disconnect one; create a token: name it, see it once with "Copy", it joins the
  list; revoke one); Workspace (save the name; the plan line; company single sign-on as the product sets it up, in
  its real steps, each one short; delete the workspace as the product asks for it).
- The tab "Assistants and coding tools" starts with one plain sentence for someone who is not technical: what
  connecting a computer or an assistant gives them. Every technical word (token, command) has a plain sentence
  beside it. The address `#security`, `#assistants`, `#workspace` opens that tab.

### Sign-in — `signin.html`, `signup.html`, new `forgot.html`, `css/auth.css`, `js/auth.js`
- Sign in: an empty or malformed field is refused under the field; a wrong password is refused in plain words
  (reachable with `?state=error` and by typing the word "wrong"); the pill says "Signing in…" then goes to
  `app.html`. Google and Microsoft go to `app.html`. Company single sign-on as the product offers it (a quiet link, a
  work address, one sentence).
- "Forgot password?" goes to `forgot.html`: the address, "Send reset link", then the product's own careful sentence
  (it does not say whether the account exists), and the way back.
- Create a workspace: validation, "Creating…", then `app-connections.html?state=empty` (a new workspace starts by
  connecting its first tool). `signup.html?invite=1` is the arrival from an invitation link: "Join Kestrel Studio",
  no workspace name to choose.

## Checking (every agent)

No server runs: use file paths. Tools, in `<SCRATCH>/tools/` (headless Chrome, no package):
- `node dead.mjs --out DIR name=/abs/page.html[?query][#hash]`: clicks every visible control on a fresh page and says
  what each did. Your pages must end with 0 dead and 0 "not in this prototype".
- `node act.mjs --out DIR --url /abs/page.html [--width 1440 --height 900] step step …`: plays a flow and captures
  it. Steps: `click=<css | text=Words>>N>`, `type=<target>::<text>`, `pick=<target>::<option>`, `key=Escape`,
  `wait=600`, `shot=<name>`, `eval=<js>`, `state` (address, overflow, focus, status messages, console errors).
- `node shoot.mjs --out DIR --width 1440 --height 900 --slices 2 name=/abs/page.html`: stills and a JSON of sizes.
For each flow you build: play it with `act.mjs` to its end, look at the open state once at 1440 × 900 and once at
390 × 844, check focus and Escape, check the refusal. Look at pictures sparingly (read the printed state first).
At the end: `dead.mjs` on each of your pages and states; no console error; no sideways scroll at 1440, 1280, 390.
