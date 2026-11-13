# Motion module "hero": the navigation's entrance and section 1

Files: `js/motion/hero.js`, `css/motion-hero.css`. Nothing else was edited. Points 1, 2 and 3 of "Motion: the system".
The module only uses `M.dur`, `M.ease`, `M.sweep`, `M.flagPop`, `M.sheetLand`, `M.rough`, plus Flip for the pile. The
selection logic is not forked: the module sets `Leon.hooks.scenario` and `Leon.hooks.select` and calls `commit()`.

## What happens when

### 1. Page load (once, 2.6 s; measured 2,527 to 2,594 ms from the modules' start to the last sheet handed back)

Seconds from the first frame of the module (it starts when the fonts are in, see `M.ready`):

| At | What | Duration |
| --- | --- | --- |
| 0.00 | The navigation's content settles (10px down, fades in). | 0.42 |
| 0.05, 0.13 | The headline's two lines rise out of a clip. The line moves up while its clip moves down by the same amount, so the mask stays where the line will rest; the clip reaches 15% under the line box, so no descender is cut. | 0.6 each |
| 0.40, 0.47 | The sentence, then the pill and its note (16px, fade). | 0.42 |
| 0.50 | The tabs and the stage rise 24px together (the tab stays joined to the band). | 0.6 |
| 0.50, 0.66, 0.82 | The three hand-drawn strokes under "Source included.": pink, green, blue (`M.rough` on the three `[data-sweep-seg]`). | 0.2 each |
| 0.65 | The demo: the question is written. | 0.42 |
| 0.85, 1.30, 1.75 | Sentence 1, 2, 3. For each: the words (0.2), at +0.06 the highlighter sweep (`M.sweep`, 0.42), at +0.25 its document lands on the pile from the right (`M.sheetLand`, 140px, 4 degrees, 0.6), at +0.28 its flag pops (`M.flagPop`, 0.42), at +0.30 its footnote row is written (0.2). | |
| 2.60 | End: every inline style is gone, the sheets are back on their CSS slots. | |

Any click or key press (anywhere, capture phase) jumps to the end state at once, strokes included, and the click or
key still does what it was meant to do. A page reloaded further down than the hero skips the sequence.

On a phone (the headline's lines are inline there, not boxes) the headline rises as one block; the pile is not
displayed, so the demo plays on the answer sheet alone: sentences, strokes, flags, footnote rows.

### 2. Another question (about 1.5 s)

The answer's content (8px up) and the sheets (48px to the right, 30ms apart) leave in 0.2 s; then `commit()` rebuilds
the answer and the pile, and the same demo plays at one and a half times the speed (1.3 s). A second question asked
during the leave replaces the first: the last one asked comes in. A key or a click during the replay ends it.
The tab's indicator slides by the CSS that was already there (`clip-path`, 420ms); the module does not touch it.

### 3. Linking and selecting (0.62 s)

Pointing and focus (both flags to 1.1, deeper stroke, the sheet lifts 6px) are the foundation's CSS on `.is-lit`:
nothing added. Selecting a source wraps `Leon.hooks.select`:

- `Flip.getState` on the three sheets, `commit()`, `Flip.from` (0.6 s, `M.ease.inOut`): every sheet travels to its
  new slot, with its turn.
- The chosen sheet is first pulled 14% of its width to the right (0.2 s) while the pile keeps its order, then it
  passes over the others and comes down on top (0.42 s). It never jumps in front.
- The sheet that was on top stays written until the chosen one is over it (`data-was` on the sheets for the first
  0.2 s, two rules in `css/motion-hero.css`); without this a blank sheet showed for 150ms.
- A selection during a demo ends the demo first; a second selection during a move ends the move first.

## How to trigger each part

- Load: reload `http://localhost:3041/papier/index.html?only=hero` (the other modules stay silent).
- Skip: press any key or click during the first 2.6 s.
- Question: click a tab, or focus the tabs and press the left / right arrows. From the console: `Leon.showScenario('bug')`.
- Selection: click a sentence, a number, a flag, a footnote row or a sheet lying behind. From the console: `Leon.select(2)`.
- Reduced motion, no script, GSAP missing: the module returns at once, the hooks stay empty, the page is the static page.

## Pre-hidden states

`css/motion-hero.css`, under `html.js-motion`, each with the failsafe: `.nav__in`, `[data-h1-line]`, `[data-hero-lead]`,
`[data-hero-cta]`, `[data-tabs]`, `[data-stage]` (opacity 0). The module puts its own first states on them in the
same task as the hand-over. Two other rules are not pre-hides: `#stage.is-playing .hl { transition: none }` and the
`data-was` rules above.

## Checked (November 10, headless Chrome)

- `hero-check.mjs` (session scratchpad, `papier-build/`, not in the repository): **24 of 24 pass** at
  `?only=hero`. It covers: the load takes under 2.8 s; after the load, after a selection, after a question, after two
  questions 60ms apart and after a selection made during a replay, the pile and the flags are pixel for pixel where
  the static (reduced motion) page puts them and no inline style is left on anything; three drawn strokes; the
  chosen sheet starts where it was, goes right by 61px, stays behind for 0.2 s then stays in front; the covered
  sheet stays written; a key press at 450ms shows the end state within 60ms; reduced motion leaves the hooks empty;
  390px: load and question end clean; 0 console error everywhere.
- Filmed and looked at: the load at 1440 x 900 (16 frames), a selection and a question change (17 frames), the load
  at 390 x 844 (12 frames), the load with the whole page and its four modules (6 frames, 0 console error, no
  conflict seen in the hero). `--reduced`: 0 console error, checked by numbers rather than by eye.

## Not done, not checked

- The answer sheet changes height at once when the question changes (its content is invisible at that instant).
  Animating it would mean animating layout.
- If the pointer leaves a sheet while it travels, the 6px lift is dropped at the end of the move in one step.
- The strokes under "Source included." take 0.2 s each, 160ms apart. The brief says 160ms each and Rough Notation's
  guidance says 450 to 600: 0.2 is the closest of the three allowed durations.
- The later documents land behind the first one (their slot), not on top of it: the end state is the static page,
  with source 1 readable.
- Not filmed: 1280 x 800 and widths between 700 and 1099 (the motion does not change the layout). Not tested:
  Safari, Firefox, a real touch device.

## For the polish agent (outside my two files)

1. **`NOTES.md` is wrong on one point.** GSAP 3.13 does not compose with a resting CSS `translate` / `rotate`: the
   first time it reads an element's transform (a tween, `Flip.getState`, even an ancestor that Flip measures
   through) it folds them into its inline `transform` and writes `translate: none; rotate: none; scale: none`
   inline. Until `clearProps: 'transform'`, a slot change or the hover lift has no effect on that sheet; and at the
   clear, the sheet's own CSS transition on `translate` would replay from zero. The hero guards this (`hold` /
   `letGo` in hero.js: transition off, clear, reflow, transition back). `M.sheetLand` does not: any other use of it
   on `.pile > .doc` or `.mini` needs the same guard, or the guard belongs in `core.js`. I expected this from GSAP's
   behaviour and guarded it; I did not film the unguarded case.
2. **`M.sweep`'s hand-back.** When it removes `.is-sweep`, the stroke goes from a background image to
   `background-color`, and `.hl` has a 160ms transition on that colour: the stroke should blink out and fade back.
   Read from the CSS, not filmed. Neutralised in the hero only, by `#stage.is-playing .hl { transition: none }`.
   The rules section uses the same gesture.
3. **`core-check.mjs` now reports 24 of 32.** Two of the eight concern the hero and are collisions with the check
   itself, not defects: it draws the headline's strokes a second time (6 drawings instead of 3) and lands the
   hero's first sheet while the demo is doing the same. The six others are the story and the carousel, which now
   move. Run it with `?only=core` (no module answers to that name) to test the core alone.
