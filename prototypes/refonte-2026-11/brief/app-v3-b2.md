# Leon « Papier » v3 — take B, second pass: less on the screen

The founder chose take B « Bureau » (`papier/v3/b/`). This pass applies his remarks on its Connections screen.
Read `app-v3-modern.md` first (the identity, what modern means, the bans, the quality bar): it still stands.

## His words (November 11, on take B)

"I prefer this one, but without this [the sheet « Intercom needs reconnecting » beside the title]. I also want the
rectangles a bit smaller, so that it looks more professional, and more readable: there is a lot of information here.
The number of items is useless. Even saying when it was synced is useless. This sentence, « Leon reads your connected
tools every 15 minutes. An item is shown only to the people who can already open it. », is useless too: it only adds
writing. I prefer when it is a bit less loaded, more readable: you find at once the information you are looking for."

What he was looking at: his window is 1512 × 771 (a 14-inch MacBook), with the sidebar collapsed to its rail.
`<SCRATCH>/v3/david-b-1512.png` is his own screenshot; `<SCRATCH>/v3/david-b-banner.png` is the sheet he does not want.
1512 × 771 is now the first size to design for, with the rail and with the sidebar open.

## The principle he states (apply it to everything on this screen, not only to what he named)

One glance finds the thing. A card says what it is and, only if something is wrong, what is wrong. No count, no date,
no explanatory sentence, no label that repeats what the eye already sees. What a person may want to know about one
tool lives in that tool's panel, one click away. Smaller, tighter, perfectly aligned rectangles read as professional.
Removing must not make the screen poor: keep the surfaces, the type, the flags, the ask bar, the craft.

## The changes

1. Remove the Intercom sheet beside the title, with its flag and its form. Remove the intro sentence (and its blue
   stroke). The head of the page is the title "Connections", alone.

2. Connected tools become compact tiles.
   - One tile: about 60px high (56 to 64), the system's card surface, 12 to 14px of padding. Logo at 28px, then the
     name (14px, 600) and under it one quiet caption (13px, the secondary ink): "Team" or "Only you". Nothing else:
     no account, no number of items, no sync pill, no word "Manage".
   - The whole tile is the control that opens the tool's panel (`aria-label="Manage Gmail"`); a 16px chevron sits at
     its right edge in the secondary ink and darkens on hover. Hover lifts the tile as cards do today, calmly.
   - Grid: `repeat(auto-fill, minmax(216px, 1fr))`, 12px gaps: five tiles per row at 1512 with the rail, four with
     the sidebar open.
   - Intercom is the first tile, same size. Its caption is "Needs reconnecting", in the danger colour, with the small
     red dot before it; at its right edge, instead of the chevron, a 28px ink pill "Reconnect": the only ink pill of
     the screen. The pill and the tile open the panel in its repair state (the key field, the refusal when it is
     empty, "Reconnecting…"). Once repaired the tile is a normal one ("Team"), and the sidebar's alert line and the
     flag on "Connections" go away.
   - Remove the dashed "Add a tool" tile. The green flag counts 8, and eight tiles are drawn.

3. "Add a tool" lists only the tools that are not connected yet (34), as the same compact tile: logo at 28px, name
   (14px, 600), and at the right edge a 28px outline pill "Connect". No "One click" or "API key" line, no description.
   The blue flag counts 34. The whole tile opens the tool's panel.
   - Family chips stay, without their numbers. The search field stays.
   - Search: when the letters match only a tool that is already connected, say "<Tool> is already connected." with a
     "Manage" link that opens its panel. When nothing matches, the empty state that exists.
   - Hover on a tile: the lift, and the pill of that tile gets an ink border. Never a row of buttons turning black.
   - After a tool is connected it leaves this list and joins "Connected"; after a connection is deleted it comes back
     here; both flags follow.

4. The tool's panel is where the details live. The founder added, a minute later: "On the other hand, yes, in Manage
   you can leave the important information." So the panel keeps everything that matters about one tool; what leaves
   the cards moves here, it is not deleted. It becomes a compact sheet, not a column the height of the window that is
   mostly empty: about 420px wide, as tall as its content (never taller than the window minus 24px, then it scrolls
   inside), 12px in from the top and right edges, same radius and shadow as the sidebar's sheet. The actions sit
   right under the content. Draw it with care: it is now the place where one reads about a tool.
   - To manage: the head (logo, name); the state and the last sync ("Synced 4 min ago", or "Needs reconnecting") with
     "Sync now" (outline; "Syncing…", then "Synced just now"); Account; Visible to; Items saved (the number); what
     Leon reads (the sentence from the data); then "Connect another account" where it exists today, "Delete
     connection" (confirmed in place, with the real consequence) and "Done".
   - To connect and to repair: unchanged in content (what Leon will read, who will see it, the one click or the key
     fields and where to find the key), in the same compact sheet.

5. Sidebar: the health block becomes one line and only when something is wrong: the red dot and "Intercom needs
   reconnecting" (it opens Intercom's panel). No ticks, no "7 of 8 tools in sync"; when everything works the block is
   absent. In the rail, a red dot on the Connections icon is enough. Remember whether the sidebar is collapsed
   (`localStorage`, inside try/catch), so the page reopens the way he left it.

6. Everything else stays: the ask bar and its three strokes, the command bar, the flags that count the two sections,
   the surfaces, radii and shadows, the type. Remove the black "Proposition B" switch link at the end of the page
   (take A is no longer in the running).

## Two more remarks (November 11, a few minutes later, on seeing the compact tiles)

"The connected ones, you can keep them bigger than the ones that are not connected. And when you click on one, you
can make the rectangle that opens bigger: no need to minimise that."

7. Two sizes of rectangle, which is also the hierarchy of the screen: what you have is a card, what you can add is a
   tile. A connected tool is a card of about 88px high: 16px of padding, logo at 36px, name at 15px (600), the caption
   at 13px, the chevron; four per row at 1512 (`repeat(auto-fill, minmax(260px, 1fr))`). Still nothing more written
   on it. A tool to add stays the compact tile of point 3 (about 56px high, logo at 28px), five per row.
8. The panel is generous, not minimised: a side sheet about 520px wide and the height of the window (12px in from
   the top, right and bottom edges), with comfortable type (15px for the values, 13px for the labels), a head with
   the logo at 44px and the name at 20px, the details as well-spaced rows, and the actions in a foot that stays at
   the bottom. This replaces the "compact sheet" of point 4; what it contains is unchanged (point 4).

## Files

Only `papier/v3/b/`: the templates in `app.js`, `build.mjs` (its self-checks change: 8 tiles, 34 tools, the chips),
`connections.html` (regenerate it), `app.css` (delete the rules nothing uses any more), `NOTES.md` (add "Second pass,
November 11": his words, what changed, why). Nothing outside the folder.

## Checking

Tools in `<SCRATCH>/tools/` (headless Chrome, absolute file paths): `shoot.mjs`, `act.mjs`, `dead.mjs` (see
`app-v3-modern.md`). For the rail: click the collapse button with `act.mjs`, then `shot=`.
- Look at the screen at 1512 × 771 at least three times, with the rail and with the sidebar open, beside his
  screenshot: is it clearly lighter, do the tiles line up to the pixel, is every tile the same height, does the eye
  find a tool at once? Then the panel open (manage, connect with a key, repair).
- Then 1680 × 850, 1280 × 800, 390 × 844 (one tile per row, 44px targets, no sideways scroll).
- Play: repair Intercom (empty key refused, then repaired: tile normal, sidebar line gone, flag gone); connect
  Outlook (one click) and Fathom (key): each leaves "Add a tool" and joins "Connected", flags 9 and 33, then 10 and
  32; manage Gmail, "Sync now", delete it: back in "Add a tool"; search "gma" before deleting ("already connected"),
  "zzz" (empty state), a family chip; the command bar; reload with the rail collapsed.
- `dead.mjs`: 0 dead. No console error. The page whole without script.
- The words "items", "Synced", "min ago", "every 15 minutes" appear nowhere on the screen at rest.
