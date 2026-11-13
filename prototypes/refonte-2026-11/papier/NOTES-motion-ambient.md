# Motion module "ambient": what it does, when, and how to see it

Files: `js/motion/ambient.js`, `css/motion-ambient.css`. Scope: connectors (3), briefing (4), security (6), close (7),
the footer, and the control feedback of the whole page. Nothing else was edited.

With `M.ok` false (reduced motion, GSAP missing) or `?only=<another module>` the module returns at once: the page is the
static page (wrapped grid of tools, "42", no drawn stroke in the three headings, nothing hidden).

## Timeline

Every `[data-rv]` of the four sections waits for **its own** arrival on screen (`M.onEnter`, start `top 88%`; the memo
`top 74%`), so a stacked phone layout never animates out of sight. Its delay is `(rv - 1) x 70ms`: elements of one row
arrive together and keep the order heading, text, fragment. Each rises 20px with opacity, `M.dur.slow`, `M.ease.out`,
once, and its inline styles are cleared at the end. `t` below is the moment the element enters.

| Where | When | What |
| --- | --- | --- |
| Connectors, H2 | t | rises; the count runs 0 to 42 in 800ms (`M.ease.out`; the number keeps the width of "42", right-aligned, so the words never shift; the H2 carries an `aria-label` meanwhile so nobody hears "0 connectors") |
| | t + 300ms | a green hand-drawn stroke under "Nothing to migrate." (`M.rough`, colour 2) |
| Connectors, lead | t + 70ms | rises |
| Connectors, carousel | from the start | two rows, row 1 leftwards in 40s a loop, row 2 rightwards in 46s, linear, endless. Each row holds its 21 tools twice and slides by half its width: no gap, no jump (measured: 0px off). Standing still while off screen (IntersectionObserver). |
| | pointer or focus on it | both rows slow to a stop in `M.dur.base` and start again when it leaves. The list is focusable (`tabindex="0"`, `role="group"`, a label) so a keyboard can stop it. |
| | pointer on a tool | its name takes one highlighter stroke, swept from the left (CSS, 240ms), pink, green or blue by position |
| Briefing, memo | t (`top 74%`) | the sheet rises; from t + 240ms its ten lines write in from the left (clip-path, `M.dur.base`, `M.ease.inOut`), 90ms apart, the rule under each line drawing with it; each number chip pops (`M.flagPop`) 300ms after its line starts. About 1.5s in all. |
| Briefing, H2 and text | t, t + 70ms | rise; at t + 300ms a blue stroke under "every morning." (colour 3) |
| Security, H2 | t | rises; at t + 300ms a green stroke under "in place" (colour 2) |
| Security, lists | t + 70ms | rise; from t + 220ms the three ticks then the three half rings draw (`stroke-dashoffset`, `M.dur.base`, `M.ease.inOut`), 70ms apart |
| Close, statement | t | rises; at t + 300ms the amber hand-drawn stroke under "on record." (`M.rough` on the flat stroke, colour 4) |
| Close, text and pills | t + 70ms | rise |
| Close, panel | t + 140ms | rises; 100ms later the sign-up sheet lands on it (`M.sheetLand`: from 48px right, 24px up, 3 degrees; 12px and 2 degrees on a phone) |
| Footer | footer's top at 94% | wordmark, three columns, base line rise 20px, 70ms apart |

Heading colours down the page: rules 1, 2, 3 · connectors 2 · briefing 3 · developers 1 · security 2 · close 4.

Durations and easings are the core's (`M.dur`, `M.ease`), plus the four figures the brief gives: 800ms for the count,
about 40s for a loop (linear), 90ms between memo lines, 70ms between ticks.

## Control feedback (point 9)

Already in `ui.css` / `site.css`, checked and left alone: the pill's arrow (3px on hover) and press (0.97), the
navigation underline growing from the left, the bar's edge after 24px (`.nav.is-scrolled`, set by `site.js`), the
switch's sliding thumb, the field's focus, the 2px ink ring at 2px on every `:focus-visible` (white on ink).
Added in `css/motion-ambient.css`:
- the arrow of a pill or of a text action also moves under keyboard focus, and the text action's underline darkens;
- footer links grow the same underline as the navigation (it was a colour fade) and dim when pressed;
- the stroke under a pointed tool is swept instead of faded (it overrides `.tool:hover > span` of `site.css`);
- the rolling list's focus ring is drawn inside (the list runs edge to edge).

## Pre-hidden states

One rule: the `[data-rv]` of the four sections and the footer's five blocks, `opacity: 0` under `html.js-motion`, with
`animation: var(--failsafe)`. Everything else the module moves lives inside one of them; the script sets its first
state in the `ready` callback, in the same task. Every part is wrapped (`part(els, fn)`): if it throws, its elements
are cleared back to the static page and the other parts still run.

## How to trigger and check

- Alone: `http://localhost:3041/papier/index.html?only=ambient`, then scroll. The sequences replay on reload only.
- Self-check (30 of 30 pass on November 10, headless Chrome):
  `node <SCRATCH>/papier-build/ambient-check.mjs http://localhost:3041/papier/index.html <out dir>`
  It covers: the pre-hidden entrances; the carousel (42 copies, one set exactly half a row, wider than the screen,
  opposite directions, stop on pointer and on focus, restart, still off screen, a real pointer on a tool); the count
  ending on "42" with nothing left behind; the four hand-drawn strokes; no inline style left on anything after playing;
  no sideways scroll; reduced motion (wrapped grid, nothing added); 390 x 844 (edge to edge, all played); the whole
  page with every module (all played, 0 console error, 6,845px). It also writes `sheet-seq.jpg`: each section at 120,
  320, 620 and 1500ms after it enters.
- Films looked at: `<SCRATCH>/film/papier-ambient` (alone, 1440), `papier-ambient-390`, `papier-ambient-whole`;
  `papier-ambient-reduced` was run (0 console error) and checked by the self-check, not looked at.

## Not done, or to know

- The three headings (connectors, briefing, security) carry no `.hmark` in the static markup, so their phrase is wrapped
  by script and only when Rough Notation is there. Under reduced motion and without script these headings have no
  stroke, while the rules' and developers' headings keep their flat one.
- On a phone the carousel rolls too (it replaces the two rows one could swipe): a finger held on it stops it, but
  nobody can swipe through the list any more.
- The ticks use `stroke-dashoffset`, as the brief asks; it is the one animation outside transform, opacity and clip-path.
- Not tested: Safari, Firefox, a real touch device, a screen wider than 2,764px (one set of tools must be wider than
  the screen; the foundation's note says so too). The focus ring of the rolling list was not looked at in a picture.
- With the rules pinned by their module the page gets longer; my triggers are recomputed by the core's refresh. The
  last self-check ran with the pin in place (page 7,689px): all my entrances played, nothing left behind, 0 console
  error. The whole-page film was taken earlier, before the pin existed (6,845px): the pinned page was not looked at.

## Requests outside my files (for the polish agent)

1. `index.html`: wrap the phrases for parity with the other headings, if wanted:
   `<span class="hmark" data-hmark="2">Nothing to migrate.</span>`, `<span class="hmark" data-hmark="3">every morning.</span>`,
   `<span class="hmark" data-hmark="2">in place</span>`. The module already uses an existing `.hmark` when it finds one.
2. `site.css`: the three `.tool:hover > span` background rules are now dead (overridden by the swept stroke); they can go.
3. `NOTES.md`, "Who owns what": point 9 is completed in `css/motion-ambient.css`; add a line for this file.
