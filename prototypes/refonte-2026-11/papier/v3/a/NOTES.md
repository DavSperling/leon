# Leon « Papier » v3 · take A « Feuille »

## Decided before drawing

1. Intent: the app is one sheet of paper lying on the desk, and everything Leon shows is written on it in quiet, dense, aligned lists.
2. Ground: the whole window is the desk (`--desk`). The sidebar is written straight on it, with no box.
3. Raised: the sheet (white, radius 10, hairline `--edge`, the paper shadow `--sheet-shadow`), inset 8px from the window. Small raised slips (the ask field, the current entry, logo tiles): white, radius 6, hairline, `--sh-1`.
4. Floating: one tool's panel (a second sheet over the first, from the right), the command bar, the menu, the toast: radius 10, hairline, `--sh-3`, over a desk-coloured veil. No blur.
5. Type: Schibsted Grotesk only. Four sizes: 13 (meta), 14 (interface), 16 (section and panel titles, the lead sentence), 22 (the screen's title). Weights 400, 500, 600. Numbers right-aligned in lists (the face's tabular figures open a gap after a 1, so they stay proportional).
6. Spacing: a 4px grid. Rows 56, controls 28 / 32 / 40, sheet padding 32, head 56 (the sidebar's first row is 56 too, so the two align).
7. Radii: 3 (marks, keys), 6 (fields, slips, tiles), 10 (sheets), pill (every button and status).
8. Brand: the paper and the desk; ink pills; a pink flag that sticks out past the sheet's edge where a tool needs attention, and the same flag as the counter in the navigation; the three highlighter strokes as the sign of the ask field; the highlighter passing over a button while Leon works and under the word when it is done; a pastel tint behind Julie's initials. Under 5% of the screen.
9. The eye, on Connections: first the flag and the ink "Reconnect" on Intercom; second the list of connected tools with their logos and states; third "Add a tool", its families and the first row of the gallery.
10. One ink button at rest: "Reconnect". Everything else is a line pill or a quiet text action.

## Files

| File | What it is |
|---|---|
| `connections.html` | The page, whole without script. Written by `build.mjs`: do not edit it by hand |
| `build.mjs` | `node build.mjs` writes `connections.html` from `shared/demo-data.js` and `js/app-data.js`, with the row and tile templates of `app.js` (one source) |
| `app.css` | Everything visual. Loaded after `../../css/tokens.css` and `../../css/ui.css` (base, `.hl`, `.btn`, `.vh`) |
| `app.js` | Templates (shared with the build), then behaviour. No dependency |

## The system

Tokens added (top of `app.css`, used everywhere, nothing hard-coded below them):
`--n-1` `--n-2` (two neutral steps on paper), `--edge` (a sheet's edge on the desk), `--hover` `--press` (on the desk),
`--ok-tint` `--danger-tint` `--danger-line`, `--veil` (the desk's colour at 64%, behind a floating sheet; no blur),
`--r1` 3 · `--r2` 6 · `--r3` 10, `--sh-1` (slip) · `--sh-2` (the sheet) · `--sh-3` (floating) · `--sh-over` (the second sheet, shadow cast to the left),
`--s13` `--s14` `--s16` `--s22`, `--side-w` 248 (64 as a rail), `--inset` 8, `--pad` 32, `--head-h` 56, `--out` 14.

Components and their states:
- `.btn` (the home page's ink pill at 28 / 32 / 40): hover, pressed, focus ring, `.btn--line`, `.btn--danger`, `.is-busy` (turns to paper, the amber highlighter passes over it once).
- `.ib` round icon button · `.inp` field (hover, focus, `aria-invalid` with `.fld__err`) · `kbd`.
- `.pill` status (in sync: neutral with a green dot; `--bad`: red tint; `--first`: amber dot) · `.scope` (Team / Only you, with an icon).
- `.fl` the small flag: counter in the navigation, `.fl--out` marker sticking out past the sheet's edge, same flag on the panel when it repairs a tool.
- `.logo` a tool's logo on its 32px tile.
- `.row` a connected tool: hover, pressed, focus ring around the whole row, `.row--bad`, `.is-new` (the green highlighter passes over the row that just changed).
- `.tile` a tool of the gallery: hover (edge, slip shadow, "Connect" turns ink), pressed, focus ring, connected (check), needs reconnecting.
- `.fam` family chip (idle, hover, pressed, selected in ink) · the search marks the letters it found with the highlighter · `.none` the "no tool matches" state, with the dashed empty flag.
- `.panel` the second sheet (native `<dialog>`: focus stays inside, Escape and a click on the veil close it) · `.cmd` the command bar · `.menu` (native popover) · `.toast`.

## Decisions, and why

- The sheet does not scroll; a scroller inside it does, and that scroller is 16px wider than the paper on the left. That is the only way a flag can stick out past the paper's edge and still travel with its line.
- The connected tools are a list in two groups, "Needs attention" and "In sync", not a table with column heads: every value says what it is ("1,842 items", "Synced 4 min ago", "Only you"). Intercom is first, under a red-tinted group head, with the flag and the only ink button of the screen.
- The wide middle of each row says what Leon reads from that tool (real text, from `LEON_APP.reads`). Under 1360px it is dropped and the name takes the room; the broken tool keeps its message at every width.
- The gallery is one grid of 42, five across at 1680, filtered by family (chips with counts) or by a search that looks in every family. The whole tile is the target; "Connect" is a quiet pill that turns ink when the tile is pointed at, so 34 buttons do not shout.
- One tool's panel is a side sheet, not a dialog in the middle: the list stays visible behind it, the tool keeps its place, and the same container serves connect, manage and repair. It is 480px, aligned to the pixel on the main sheet's top, bottom and head line.
- Health is said three times and all three follow a repair: the flag in the navigation, the strip of eight ticks with its sentence at the foot of the sidebar, the count in the head.
- The account row holds the workspace ("Kestrel Studio" under "Julie Martin"); the email is the first line of her menu.
- No state is kept between visits (the rail opens again on reload): nothing to explain, nothing stale.

## Checked (November 11)

- 1680 × 850, 1440 × 900, 1280 × 800, 390 × 844: looked at; sideways overflow 0 at each.
- `dead.mjs` at 1680: 81 controls, 0 dead, 5 hidden at rest (the menu's three entries, the phone's menu button). The undrawn entries answer "<Name>: not drawn in this proposal."
- Flows played with `act.mjs`: Reconnect on Intercom (refused when empty, "Reconnecting…", "Reconnected.", the group, the flag, the head count and the sidebar follow); Outlook in one click; Fathom with a key; Gmail: "Sync now", "Delete connection" confirmed; search "zzz" (no match), "sla" (Slack), family "Meetings" (8); ⌘K and Ctrl+K, arrows, Enter, Escape; "/"; the rail; the drawer on a phone; reduced motion (transitions 1ms, no sweep on the row).
- With script disabled the page is the same as at rest. No console error.
- `dead.mjs` at 390: 81 controls, 0 dead, 20 hidden at rest (the sidebar is in its drawer).
- Taste `lint.mjs`: 20 FAIL, 12 WARN, all three of one family (a shadow at rest ×12, a hairline ×8, a 1px outlined box ×12). Left as they are: that checker is written for marketing pages without borders, and this brief asks for layered surfaces, hairlines and soft shadows. `impeccable detect`: 3 notes (the flag's tight padding, the command bar's foot, the type steps read at phone width); the title was raised from 20 to 22px, the other two are by design.

## Not done

- Notion is already connected in the data, so its one-click connect panel is reached only after deleting its connection; the same panel was checked on Outlook.
- "Use an API key instead" for the tools that accept both (`keyToo`): the data has no fields for them.
- A new connection takes Julie's email as its account and stays on "First sync in progress".
- Nine gallery descriptions are cut at two lines at 1680; the full sentence is in the tool's panel.
- The other five screens. Next on them: the same shell; Home as the sheet with the ask field and the briefing; Chat as the sheet with the sources as a second sheet (the same panel); Documents and Team as the same grouped list; Settings as the list of facts used in the panel.
