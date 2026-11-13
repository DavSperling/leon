# Motion module "dev": section 5, for developers

Files: `js/motion/dev.js` and `css/motion-dev.css`. Nothing else was touched.
With reduced motion, without GSAP, or with `?only=<another module>`, the module does nothing: the section is the
static page (Morning, three captions readable, no "Replay").

## What happens, and when

### 1. Entrance (once, when the top of the section's grid reaches 82% of the screen)

| At | What |
| --- | --- |
| 0 ms | The heading rises 20px and fades in (600ms, `expo.out`). |
| +70 ms each | The lead, fact 1, fact 2, fact 3, the closing line, the link, then the story's fragment. Last one starts at 490ms. |
| 120 ms | "dreaming" is drawn by hand in pink (`M.rough`, 520ms). On ink the marked word is ink too, so the word appears as the stroke passes under it. |

### 2. The story (once, 5.92 s)

It starts when the strip is a fifth of the way down the screen (`top 20%` of `[data-story]`; on a phone `top 110px`,
just under the bar): the three captions, the desk and the first lines of the terminal are then all on screen.
Before it starts, the fragment waits in the evening: the terminal says the session ended (3 lines), no sheet is out.

| Time | Step | What moves |
| --- | --- | --- |
| 0.00 | **Evening** | Its caption stays lit, the two others step back to 40% (420ms). |
| 0.10 – 0.22 | | The terminal prints what Leon keeps: "Leon · session kept" and its three lines, one every 40ms. |
| 0.50, 0.62, 0.74 | | The three sheets leave the terminal, from the line "What was said…", and land loose under "Evening" (600ms each, a 4 degree turn settling). |
| 1.90 | **Night** | The marker travels to the second dot (420ms, `power2.inOut`); the caption changes. |
| 1.95, 2.04, 2.13 | | The sheets are filed into the pile under "Night" (600ms each, one continuous move, no jump). |
| 2.30, 2.39, 2.48 | | Their flags pop, pink, green, blue (`M.flagPop`). |
| 2.60 | | "Thread fix/export-pagination" fades up 6px. |
| 3.80 | **Morning** | The marker travels to the third dot; the title becomes "codex · kestrel/app", in white while the part plays; the evening's screen fades out (200ms). |
| 4.00 – 4.68 | | The context block prints, 18 lines, one every 40ms. |
| 4.82, 4.94, 5.06 | | The source marks pop, source by source: each `[n]` in the briefing together with the `[n]` of its source line. |
| 5.50 – 5.92 | | The three captions come back to full; the title settles to grey; "Replay" appears. |

Measured in headless Chrome at 1440 x 900 (frames at 20 instants, `film/papier-dev/film-dev.json` in the scratchpad):
sheets land exactly on their resting places (no jump at the end of a tween), the terminal stays 595px and the
fragment 967px through the three steps, no inline style is left when the story ends.

### 3. Controls

- **Any click or key** during a play jumps to its end state (Morning for the story). Shift, Control, Alt and Meta
  alone do not count. It listens to `click`, not `pointerdown`: a finger scrolling the page does not cut the story.
- **A step's button** plays that step's part again, from the resting state of the step before it: "Evening" prints
  and sends the sheets out (1.9 s), "Night" files them (1.9 s), "Morning" changes the tool and prints (1.7 s). The
  marker travels from wherever it was. `data-step` and `aria-pressed` change at once, in the click.
- **"Replay"** plays the three. It is in the layout from the start (invisible, not focusable) and shows once
  something has played, so nothing moves when it appears.
- **Off screen** the play pauses, and resumes when the section comes back.
- If the visitor picks a step before the story has started, the story does not start by itself later.
- If the page is loaded below the section, the section is simply put in its Morning state.

## How to trigger each part by hand

- The story: scroll to the section, or `document.querySelector('[data-story-replay]').click()`.
- One step: `Leon.showStep(1 | 2 | 3)` (same as clicking its button).
- Skip: any click or key.
- Film it alone: `node <SCRATCH>/papier-build/film-dev.mjs --out <SCRATCH>/film/papier-dev --url "http://localhost:3041/papier/index.html?only=dev"`
  (it scrolls to the trigger with a real wheel, takes frames at story times, writes `sheet-dev.jpg` and
  `film-dev.json`, then checks the three buttons, "Replay", the two skips and a step chosen during the story).
  Options: `--width 390 --height 844`, `--reduced`, `--full` (whole viewport), `--times a,b,c`, `--nocheck`.
  `python3 <SCRATCH>/papier-build/sum-dev.py <dir>…` prints the JSON compactly.

## Checked

- Story alone at 1440 x 900, the whole page with the three other modules at 1440 x 900, phone at 390 x 844: 0 console
  error each; every check of the film script passes (states after each button, both skips, "Replay", a step chosen
  during the story, the heading's stroke drawn, no entrance style left).
- Whole page at 1280 x 800: four frames of the story measured (same states, terminal 616px, fragment 1011px
  throughout), 0 console error; the buttons were not re-checked at that size.
- Reduced motion: Morning state, nothing inline, "Replay" hidden. Without script: unchanged static page.
- Looked at three film sheets (story alone, whole page, phone).

## What I did differently from the brief, or could not do

- **The whole terminal is not on screen during Morning at 900px tall.** The fragment is 967px, the screen under the
  bar 828px. When the story starts, the terminal shows about 350px: the title, the sessions, the first group of the
  briefing. The "Sources" lines and their three marks are below the fold unless the visitor keeps scrolling (most
  do, the story lasts 6 s). I did not scroll the page for the visitor.
- **Evening prints 4 lines, not 7.** The first three (the session's facts) are already there while the section
  waits, so the terminal is never an empty panel; what prints is what Leon keeps.
- **The title changes by a fade, not a slide**: the two titles are inline text, which cannot be transformed.
- **Durations**: only `M.dur` and `M.ease`. The one new number is the 40ms between printed lines (the brief asks
  30 to 45). A printed line appears at once, like a real terminal: no fade.
- **`M.sheetLand` is not used** for the sheets, see the first request below. `M.sweep` has no use in this section.
- **On a phone** the strip has no marker (the static design hides it); the lit caption alone says where we are.
  With motion on, the fragment is 58px taller than the static page there (the row kept for "Replay").
- Not filmed: widths between 700 and 1099. Not tested: Safari, Firefox, a real touch screen, a screen reader.
- The story starts at a scroll position; it does not wait for the scrolling to stop.

## Requests outside my files (for the polish agent)

1. **`M.sheetLand` makes a sheet jump when it lands, if the sheet rests on a CSS `translate` or `rotate`.**
   NOTES.md says GSAP's transform "composes with the resting translate / rotate": it does not. As soon as GSAP holds
   a transform on an element it sets `translate`, `rotate` and `scale` to `none` inline and carries their values in
   its own `x`, `y`, `rotation`. `sheetLand` tweens to `x: 0, y: 0, rotation: 0`, so the sheet lands straight and
   unshifted, then snaps to its real place when `clearProps` lets go. Measured here before the fix: 26px on the
   second small sheet. It concerns the hero's pile (`.pile > .doc`), the rules' `.mini`, and these `.dsheet`.
   Fix in core.js: read `getComputedStyle(el).translate` and `.rotate` first and tween to those values (see `place()`
   in dev.js, eight lines).
2. **The foundation's self-check (`core-check.mjs`) now reports 24 of 32.** Four of the eight are this module doing
   its job, and the check should be updated: "story default = Morning" (with motion the section waits in the
   evening until the story plays), "Morning: codex title" (same probe), "marker sits on the current dot" (probed in
   the same task as the click, while the marker travels), "leon:step events" (a part starts from the step before it,
   so a click on Night from Morning emits 1 then 2). The four others belong to the hero and ambient modules now
   being active (a pile sheet keeps `transform: translate3d(0,0,0)`, six drawn strokes instead of three, the
   carousel already cloned).
3. Optional, in ui.css: 140px less in the fragment at 900px tall (a shorter terminal, or the desk row tighter) would
   put the "Sources" lines on screen during Morning.
4. One whole-page run of the film script took several minutes to close its browser after writing its results; the
   two others closed at once. Not reproduced, cause unknown.
