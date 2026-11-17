# Leon « Papier » v3 · take B « Bureau »

Decided before drawing:

1. Intent: the window is the desk of the home page; the sidebar, the ask bar, the broken tool and every tool are separate sheets of paper lying on it, and asking Leon is always the first thing within reach.
2. Ground: the desk `#F1F1EE`, flat, no border, no shadow. The page title and the section heads are written on the desk itself.
3. Raised (tool cards, gallery tiles, the ask bar at rest): white, 1px hairline `--line`, radius 12, shadow `--sh-1` (2px). Pointed at: 2px up and `--sh-2`.
4. Floating (sidebar, the sheet of the tool that needs attention, the tool panel, the command bar, menus, toasts): white, hairline, radius 12, `--sh-2` for what lies on the desk, `--sh-3` for what is held above it. A scrim of ink at 18%, never a blur.
5. Radii: 6 (fields, keys), 8 (rows inside a sheet: navigation, menu, command options), 12 (every sheet and card), pill (every button, chip and status).
6. Type, Schibsted Grotesk only: 13 (meta, pills, keys), 14 (interface), 15 (card names, the ask bar, running text), 18/600 (section heads, panel title), 28/600 (page title). Weights 400, 500, 600. Tabular numerals on flags, chip counts and keys only (in this face they open a gap after the comma of 1,842).
7. Spacing on a 4px grid: 4, 8, 12 (between cards), 16 (inside a card), 24 (inside a sheet), 40 (between sections). The sidebar and the panel sit 12px in from the window's edges.
8. Brand, under 5% of the screen: the three highlighter strokes sign the ask bar; a flag sticks out of the sheet that needs attention and out of the sidebar at "Connections", and flags count the sections (green 8, blue 42); the highlighter sweeps under a tool's name when pointed at and along the edge of a sheet while it works; people's initials sit on a pastel tint; the only ink button at rest is the one action that matters.
9. The eye, on Connections: first the Intercom sheet (the only flag sticking out, the only ink button: "Reconnect"); second the eight connected tools as a row of cards with their status; third "Add a tool": families, search, the grid of 42.
10. One primary action per view: "Reconnect" at rest, "Continue to <Tool>" or "Connect <Tool>" in the panel.

## What is built

Files: `connections.html` (whole without script), `app.css`, `app.js`, `build.mjs` (writes the data-driven markup into the page from the same templates app.js uses; run `node build.mjs` after changing data or a template; it checks 8 cards, 42 tools, 7 chips).

Shell
- Sidebar: a floating sheet 12px in from the window. Leon mark, Kestrel Studio (38 people), Home and Chat, then Documents, Team, Connections (current), Settings, the five recent discussions, the health of the tools (one tick per tool, "7 of 8 tools in sync", "Intercom needs reconnecting", a link to the sheet), Julie Martin and her menu (a native popover: Settings, Sign out).
- The amber flag on "Connections" sticks out past the sidebar's edge, as flags do on the home page's documents. It goes when Intercom is fixed.
- Rail: the button at the top collapses the sidebar to 60px (icons, tooltips, the flag still sticking out, the health as eight dots). Not remembered between visits.
- Under 900px: a menu button and the ask bar on top, the sidebar as a drawer with a scrim (Escape or a click outside closes it).
- Ask bar: always at the top of the main area, sticky, signed by three highlighter strokes. A click, Cmd+K or Ctrl+K opens the command bar exactly over it: a tool by its first letters (Enter opens its panel), "Ask Leon", the recent discussions, the six screens. Arrows, Enter, Escape.
- The five screens not drawn, the recent discussions and "Ask Leon" answer with a toast: "<Name> · Not drawn in this proposal".

Connections
- Title and sentence written on the desk; "already open it" carries the blue stroke (the colour of the permissions promise on the home page).
- Intercom's sheet, first: flag, logo, "Intercom needs reconnecting", the error pill, account, visible to, items, "Reconnect". Reconnect opens the token field in place: refusal when empty, "Reconnecting…" with the amber stroke along the sheet's edge, then "Intercom is back in sync" with the green stroke; the sidebar's health and the flag follow.
- Connected: seven cards and a dashed "Add a tool" place. Logo, status pill, name, account, who sees it, items, "Manage" (the whole card opens the panel).
- Add a tool: search (three letters; "/" focuses it), seven family chips with counts, 42 tiles (logo, name, "One click" or "API key", what Leon reads, "Connect"; the connected ones lie flat on the desk with a green "Connected"). Hover: the tile lifts, the button turns ink, the highlighter passes under the name in the family's colour. "No tool matches" is a dashed sheet with "Clear search".
- One tool's panel: a side sheet on the right, modal (a native dialog). Why a side sheet: it is a sheet like the others, it leaves the gallery in view behind it, and a key field deserves protected focus. Connect: what Leon will read, who will see it by default, how often, then "Continue to <Tool>" (one click) or the tool's own key fields with where to find the key (refusal per field, "Connecting…", then "connected · First sync in progress"; the card, the tile, the counts and the health follow). Manage: status and "Sync now", account, visible to (initials on pastel), items, what Leon reads, "Connect another account", "Delete connection" confirmed with the real consequence. Every one of the 42 tools opens it with its own data.

## Decisions

- Intercom is not repeated in the grid: its sheet is its card, pulled out and laid on top. The count still says 8.
- Under 1500px wide the Intercom sheet goes under the title instead of beside it (the title's column gets too narrow for the sentence).
- Under about 1340px the word "Manage" on a card becomes its arrow alone (a container query); the whole card is still the control.
- In the command bar a tool whose name matches comes before "Ask Leon", so three letters and Enter connect a tool.
- Notion is already connected in the data, so its one-click flow is reached by "Connect another Notion account" in its panel; Outlook, Jira and the other one-click tools open it directly.
- A new connection's account is Julie's email (private tools) or her name (team tools): the only thing here not read from the data files.
- No smooth scrolling, no state kept in the browser, no dependency.

## Checked (November 11)

- shoot.mjs 1680×850: h1 28px, Schibsted Grotesk loaded, no console error. Looked at 1680×850 at rest four times (beside the rejected screen and the home page), then with the panel open (Fathom refused, Outlook connected, Gmail delete, Notion, Sentry) and the command bar open (at rest, "fat", "no").
- act.mjs: no sideways scroll and no console error at 1680, 1440, 1280 and 390, at rest, with a panel open and with the command bar open. Cmd+K and Ctrl+K open it. Focus goes to the first field or the main button of a panel and back to what opened it.
- dead.mjs: 78 controls, 0 dead at 1680×850 and at 390×844.
- Without script: h1, the Intercom sheet, 8 cards, 42 tiles, 7 chips, 6 entries, 5 recents visible; no sideways scroll.
- Reduced motion (act.mjs --reduced): the reconnect flow ends in the same state; transitions and animations are cut to nothing.

## Not done, not checked

- Hover and pressed states are written for every control but were not looked at in a capture (the tools have no hover step).
- The lint and inspect scripts of the taste skill were not run; `impeccable detect` ran on the CSS and JS only (regex rules, nothing found).
- Contrast was computed by hand for ink-2 on the desk (5.9:1) and on white (6.9:1), not measured by a tool.
- Not tried in Safari or Firefox (the popover, `:has()` and container queries need recent versions).
- The rail is not remembered; "Visible to" cannot be changed in the panel; the first sync never finishes.

## Next, on the other screens

Home: the ask bar grows into the page's centre, the morning briefing is one sheet, each line flagged in its source's colour. Chat: the answer is a sheet, its sources are documents piled beside it as on the home page. Documents and Team: cards and rows from this system, initials on pastel for people. Settings: plain sheets, one per subject.

## Second pass, November 11

His words, on this take at 1512 × 771 with the rail: "I prefer this one, but without this [the Intercom sheet beside the title]. I also want the rectangles a bit smaller, so that it looks more professional, and more readable: there is a lot of information here. The number of items is useless. Even saying when it was synced is useless. This sentence [Leon reads your connected tools every 15 minutes…] is useless too: it only adds writing." A minute later: "In Manage you can leave the important information."

The rule applied to the whole screen: a tile says what the tool is and, only if something is wrong, what is wrong. Everything else about one tool is in its panel, one click away. This section replaces what "What is built" says about the head of the page, the cards, the gallery, the sidebar's health and the panel.

What changed
- Head: the title "Connections", alone. The Intercom sheet, its flag, its form and the intro sentence are gone.
- One tile for both sections (`.tl`): 60px high, the card surface, logo 28, name 14/600. Connected: under the name "Team" or "Only you", a chevron at the right edge (ink-2, ink on hover). To add: the name and a 28px outline "Connect" pill. The whole tile is one button (`aria-label="Manage Gmail"`, "Connect Jira"); the pill is drawn inside it, not a second control. Hover: 1px up, `--sh-2`, the highlighter under the name in the family's colour, the pill's border turns ink. No row of buttons turns black.
- Intercom is the first tile, same size: "Needs reconnecting" in the danger colour, a red dot on the logo's corner, the screen's only ink pill, "Reconnect". It opens the panel in its repair state. Repaired, it becomes a "Team" tile in the same place.
- "Add a tool" lists only the 34 tools not connected; the flags count 8 and 34 and follow each connect and delete. Chips without numbers. Letters that only find a connected tool say "Gmail is already connected." with "Manage".
- The panel is a compact sheet: 420px wide, as tall as its content (at most the window minus 24px, then it scrolls inside), 12px in from the top and right, radius 12 and `--sh-2` like the sidebar. Heads all 60px (logo 32, name, close). The details live here as a two-column list (label 104px, value): manage has the state and last sync with "Sync now" ("Syncing…", then "Synced just now"), Account, Visible to, Items saved, Leon reads, "Connect another account", "Delete connection" confirmed in place, "Done". Repair has the state, "Last synced 2 days ago", what happened, Account, Visible to, the token and region fields, where to find the token, "Reconnect" ("Reconnecting…", refused when empty) and "Not now". Connect is unchanged in content.
- Sidebar: one red line, "Intercom needs reconnecting", only while something is wrong; it opens Intercom's panel. In the rail, a red dot on the Connections icon replaces the flag. The rail is remembered (`localStorage`, in try/catch, applied in the `<head>` before the first paint; rail rules apply above 900px only, so the phone's drawer never inherits it).
- Gone: the "Add a tool" dashed card, the take-A switch link, the page's 2.2vw gutter (now 32px).

Decisions
- Four tiles a row at 1512, rail or sidebar, not five with the rail. The brief asked for `minmax(216px, 1fr)` and five with the rail, but a tile that holds "Needs reconnecting" beside the "Reconnect" pill needs 284px (measured), and five a row at 1512 gives 260. So the grid is `minmax(284px, 1fr)`, the page is at most 1348px wide and the gutter is 32px: the tiles are 328px (rail) or 286px (sidebar) at 1512 and 328px at 1680, whole pixels, all 60px high, and the eight connected tools make two full rows in both states.
- The red dot sits on Intercom's logo rather than before its caption: same signal as the rail's dot, and it gives the caption the 12px it needed beside the pill.
- The panel's head lost "One click" / "API key": the key field or the "Continue to" button already says it.
- `build.mjs` checks: 8 connected tiles with Intercom first and the only ink pill, 34 tools to add, 7 chips without a number, the sidebar's line, and none of "items", "Synced", "min ago", "every 15 minutes", "One click", "API key" in the tiles.

Checked (November 11, second pass)
- 1512 × 771, looked at three times beside his screenshot, rail and sidebar, then with the panel open (manage Gmail, connect Fathom refused, repair Intercom refused then done, Notion). 1680 × 850, 1280 × 800 (3 a row), 390 × 844 (1 a row, 60px tiles, 44px drawer rows): no sideways scroll, no console error.
- act.mjs: repair Intercom (empty token refused, then the tile is "Team", the sidebar line, the flag and the rail dot are gone); Outlook (one click) then Fathom (key): flags 9/33 then 10/32, each leaves "Add a tool" and joins "Connected"; Gmail: "gma" says "already connected", "Sync now" then "Synced just now", delete confirmed, back in "Add a tool" (7/35); "zzz" empty state; Meetings chip (7 tools); command bar ("fat" + Enter opens Fathom, "Reconnect Intercom" opens the repair); reload keeps the rail, and the open sidebar.
- dead.mjs: 0 dead at 390 × 844 (69 controls). At 1512 it reports the five recent discussions and the sidebar's line as dead: an artefact of the remembered rail (the tool clicks "Collapse sidebar" early and every later fresh page opens as a rail, where those are hidden); clicked directly at 1512, each one works.
- Without script: the title, 8 tiles, 34 tiles, 7 chips, the sidebar's line and both flags are there. Reduced motion: the repair ends in the same state, transitions cut.

## Third pass, November 11 (two more remarks from the founder)

His words: "The connected ones, you can keep them bigger than the ones that are not connected. And when you click on
one, you can make the rectangle that opens bigger: no need to minimise that."

- Two sizes of rectangle, on the same four columns: a connected tool is a card (88px high, logo 36px, name 15px), a
  tool to add is a tile (52px high, logo 28px). Rules under `#conn-grid` and `#tiles` in `app.css`.
- The panel is a side sheet 520px wide and the height of the window (12px in from the edges), with the logo at 44px,
  the name at 20px and 15px text. It keeps the details ("in Manage you can leave the important information"): state
  and last sync with "Sync now", account, visible to, items saved, what Leon reads.
- The broken tool's caption is "Disconnected" (it was "Needs reconnecting"): shorter, it no longer touches the
  "Reconnect" pill when the sidebar is open, and it no longer repeats the button.
- Checked at 1512 x 771, sidebar open and rail: cards 286x88 and 328x88, tiles 286x52 and 328x52; dead.mjs 69 controls,
  0 dead; repair (empty token refused, then repaired), connect in one click, delete with confirmation, search "gma";
  no console error, no sideways scroll at 1512, 1280 and 390.
