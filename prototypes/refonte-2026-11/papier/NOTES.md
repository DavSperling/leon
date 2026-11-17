# Leon « Papier » v2 : home page, state after the art director's pass

One page: `index.html`. Static, complete and readable with no script at all. Updates 4 and 5 of `home-v2.md` are
applied. The four motion modules are filled (`NOTES-motion-hero.md`, `-rules.md`, `-dev.md`, `-ambient.md` say what
each does and when). The two sections below are the last passes, the newest first; **where one disagrees with what
comes after it (the tables further down, a module's notes), it is the one that is right.**

## Founder's pass (November 10, evening): the developers section on one screen

His words: "I need to see it on my whole screen: there are things below, it is a pity. And a bit too much text."

### What changed

1. **The developers section fits one screen from 1100px wide** (`css/site.css`, `.dev`). The band is as tall as the
   room under the bar (`min-height`), and its padding is what the content leaves: `clamp(24px, (100svh - 72px -
   --dev-h) / 2, --band-pad)`. `--dev-h` is the measured height of the story in Morning: 660px, and 594px on a short
   screen (`max-height: 779px`, where the facts, the desk row and the terminal close up). Top-aligned on purpose:
   centring made everything shift while the terminal prints. If the copy or the terminal changes, measure again and
   set `--dev-h` (the check script prints `frag`). The text column is no longer sticky.
   Measured with the section's top on the bar, story at its end:
   | Screen | Padding | Text column | Story column | Lowest element | Section bottom |
   | --- | --- | --- | --- | --- | --- |
   | 1600 x 850 | 59px | 569 | 657 | 788 ("Fictional example"), terminal 757 | 850 |
   | 1440 x 800 | 34px | 569 | 657 | 763, terminal 732 | 800 |
   | 1280 x 720 | 27px | 558 | 594 | 693, terminal 662 | 720 |
   No overlap in any of the three steps; captions two lines each; heading two lines; no terminal line wraps.
2. **The terminal prints 13 lines** (18 before), in the brief's format: the three sessions each on one line (branch,
   then what was done, dimmed), three briefing lines with their coloured numbers, three sources. The data is
   `agentContext` in `shared/demo-data.js` (`sessions[].what` shortened; `briefing.items` replaces `prepared` and
   `sections`). Evening is 6 lines. In the section the terminal's type is `clamp(13px, 1.02vw, 14px)`, line height
   1.5 (1.4 on a short screen): at 1280 the longest line (68 characters) fits with 8px to spare.
   On a phone the branch starts the session's second line (`.term__branch::before`, a line break).
3. **Half the words in the text column**, the founder's copy word for word: 148 words to 89 (heading, lead, three
   facts, the line, the link); the three captions 38 to 23. The whole section, terminal included: about 344 to 220.
4. **Smaller pieces**: the small sheets are 34px tall (40) and overlap by 9px (5); the strip's dots sit 20px above
   the labels (24); desk row 18px under the strip, terminal 20px under the desk, "Fictional example" 12px under it.
5. **A source's number stays at the start of its line.** It used to end up at the end ("… Nov 9[1]") once the story
   had played: GSAP, measuring a mark inside a line that is not displayed yet, takes it out and puts it back before
   its next *element* sibling, and there was only text after it. The source's text is now a `<span>` (`demo.js`).
6. **The story starts when its strip is 30% down the screen** (16% before): with the band's top on the bar the strip
   rests at 13 to 19%, so the old threshold was never crossed at 1440 x 800. On arrival by a link nothing changes.
7. **"Developers" lands the band's top on the bar** (`M.anchor.developers` in `dev.js`, from 1100px; a plain jump
   too, by `scroll-margin-top`), so the whole section is on screen. Measured: section top at 73px at 1440 x 900.
8. **Crossing the pinned rules by a link no longer shows an empty screen** (`rules.js`, `unpin`). The block used to
   be moved back by the whole pin distance: it left after one screen and the spacer behind it was white (the blank
   frame at about 450ms). Now it stays on screen, on rule 1 at rest, and rises by a quarter of its height over the
   pin's length. The scrub stays frozen for the travel, as before. Filmed every 80ms for 1.44 s, top to Developers
   and bottom to Product: the rule is on every frame where the section is.

### Left as it is, and why

- Coming up to "Product" from below, the rule shown during the travel is rule 1 at its **start** (text and answer,
  no highlight yet): it is where the scrub stands on arrival; showing it complete would make it blink back.
- Arriving at Developers by a link, the ink band is empty for about 250ms (880 to 1,040ms of the travel): its
  entrance waits for the arrival, as the art director's pass decided.
- Between 1100 and about 1270px wide the terminal's longest line wraps, so the story is one or two lines taller than
  `--dev-h` there: the section runs a little under the fold. Not a named size.
- On a screen taller than about 940px the band stops growing (content plus the usual 104px above and below).
- The section top lands at 73px, not 72: one pixel of the briefing's band shows under the bar.

### Checked, and not

- `<SCRATCH>/pass6/check.mjs <papier/index.html> <out dir>` (session scratchpad, file paths, no server): the fit at the
  three sizes in the three steps, the story filmed every 400ms for 7.2 s at 1440 x 800 (Evening to 2 s, Night to 4 s,
  13 lines printed at 5.2 s, "Replay" from 6.8 s), the two travels, a phone capture. 0 console error everywhere.
- `film.mjs --reduced` and `--nojs`, 8 positions each at 1440 x 900: complete, still, identical, 0 console error.
- Phone (390 x 844): no sideways scroll, Morning reached, each session on two lines. Looked at once.
- Not run again: `core-check.mjs`, `rules-check.mjs`, `hero-check.mjs`, `ambient-check.mjs` (the first checks the
  terminal at 595px and the fragment at 967px: both numbers are now wrong on purpose), `lint.mjs`, `impeccable detect`.
  Not tested: Safari, Firefox, a real touch device, widths 700 to 1099 in pictures.

## Art director's pass (November 10)

Looked at before touching anything: stills at 1440 x 900 (the whole page), 1280 x 800 and 390 x 844, the load film,
a scroll film (26 frames, dense over the pinned rules and the developers). After the fixes: a second scroll film
(18 frames), a film of an anchor jump (13 frames), the reduced-motion and no-script films (identical, complete).

### What changed

1. **Anchor jumps (update 5, point 1): it was not built.** A navigation or footer link is now one move of 1.1 s
   (`M.dur.travel`, `M.ease.inOut`), whatever the distance, and the section's content lands 32px under the bar
   (measured: heading top at 105px, desktop and phone). In `core.js`: before the page leaves, the entrances of every
   section it will pass are put straight into their final state (`fire(entry, true)`: whatever the entrance creates
   or un-pauses is taken to its end, `M.quick` is true meanwhile, `M.rough` draws at once); the entrances of the
   destination wait and play on arrival; `document` receives `leon:travel` (`{ phase: 'start' | 'end', to, y }`);
   `M.travel` is set for the length of the move; `M.anchor[id]` lets a section name its own landing position.
   On a touch screen (no Lenis) the same move is driven by GSAP. Measured: 0 tween active while the page travels
   from the top to Security; the briefing's memo used to write itself in passing.
   - `rules.js`: for the length of a travel the scrubbed timeline is frozen (rule 1 at rest when the page comes from
     above, as it stands when it comes from below, its start when the section is the destination) and, when the page
     passes right through, the pinned block is moved back by what the pin holds, so it scrolls by like any section.
     "Product" lands on the pin's start (`M.anchor.product`).
   - `dev.js`: passed by a jump, the story goes to its end state (Morning, "Replay" offered). When Developers is the
     destination the story plays there, one second after the section's entrance starts (sampled every 0.5 s from
     the click: arrival at 1.1 s, Night shown at 4 s, Morning at 6 s).
2. **Changing question (update 5, point 2).** The 1.5 times speed is gone. The sheets leave together (200ms), then
   the answer builds one sentence every 0.7 s (`CALM` in `hero.js`; the load keeps 0.45 s to stay under 2.8 s), so a
   sentence has its sweep, flag and document before the next. Measured: 2.75 s from the click to the end. A second
   question while one is leaving or building (or within 400ms) shows the new question in its end state at once, with
   site.js's fade: three tabs clicked 150ms apart end on the last one, 3 flags, pile `top,b1,b2`, nothing dimmed.
3. **The developers' terminal is as tall as what it shows** (QA blocker: 374px blank in Evening and Night). 239px in
   Evening and Night, 595px in Morning at 1440; it grows line by line while the context prints. The fragment is 603px
   during Evening and Night: entirely on screen at 900 and at 800 high when the story starts (its strip 16% down).
   Evening holds 1.7 s instead of 1.9: the story lasts 5.7 s by its constants (sampled: Morning starts 4 s in, the
   terminal is full 0.8 s later; the end was not timed to the frame).
4. **Rules.** The longest heading took three lines from 1024 to about 1250px: it is 32px from 1024 to 1179 and 36px
   from 1180 to 1279 (two lines measured at 1024, 1179, 1180, 1279, 1280). The two rules that are not on screen are
   `inert` while pinned (no invisible tab stop, nothing invisible found by the page search); the list of names
   reaches them. `anticipatePin` is 0.
5. **Phone targets.** Navigation pill, wordmarks and text links are 44px tall; number chips and flags get a larger
   hit area by a pseudo-element (their drawing is unchanged, so a script measuring the element still reads 20 x 19
   and 34 x 24).
6. **One scale of durations.** The CSS tokens are now 200 / 420 / 600ms, the same as `M.dur`; the phone sheet's
   320ms uses the token; `M.rough` defaults to `M.dur.base`; the count-up is `M.dur.count` (0.8).
7. **`M.sheetLand` lands on the sheet's resting place** (its CSS `translate` / `rotate`), not on zero: the request
   of three modules. The hero's back sheets now land tilted in their slot instead of straightening at the end.
8. Small: the connectors heading says 42 until its count plays; the three headings that had no flat stroke without
   script now have one in the markup (connectors, briefing, security); Home and End work on the question tabs; the
   focus ring of a number chip is there on the first frame; "Fictional example" is above the fold at 1280 x 800 (794).

### Left as it is, and why

- (Solved by the founder's pass above.) **Morning: the terminal ends 165px under the fold at 1440 x 900 (295px at 1280 x 800).** The strip, the pile and the
  18 lines are 959px; a 900px screen has 828 under the bar. What is hidden is the "Sources" block; the three marks in
  the briefing lines pop on screen. Fitting it means cutting content the brief lists, or a smaller terminal face.
- (Obsolete: the text column is 88px shorter than the story at 1440 and no longer sticky.)
- A jump that starts inside the pinned rules, or within one screen under them, does not move the block back: the
  pin holds for the first part of the move (about 0.6 s), then lets go.
- The carousel: one copy per row (a gap would open on a screen wider than 2,763px), a half-pixel step at each wrap,
  and its 40 and 46 s are literals in `ambient.js`.
- The frame loop keeps running at rest (GSAP's ticker drives Lenis). A CDN slower than 3 s makes the hero show, then
  replay. Sophie's view arrives late in the pin (about 120px before it ends). `M.sweep`'s hand-back blink is
  neutralised in the hero and in the rules only (nothing else uses it).
- "Replay" cannot be reached by keyboard before something has played; the switch and the steps use `aria-pressed`.
- Copy kept as the brief gives it, including "A tool you never used starts with what the others did." (the claims
  review would prefer "what your other tools did"). The evening terminal's lines are still written in `demo.js`.
- Navigation pill 40px in the 72px bar (the page's pills are 48). Phone H1 29px. The note beside the hero pill wraps
  after the dot at 1280. The hero's right group is aligned on the sentence, the pill hangs below the headline.

### Checked, and not

- `<SCRATCH>/ad/check.mjs <out dir>` (session scratchpad, not in the repository), headless Chrome: jumps from the top
  to Security, up to Developers, up to Product, down to Connectors, straight to Developers; the three tabs; the story
  by scrolling at 1440 x 900 and 1280 x 800; rule headings at five widths; the phone. 0 console error everywhere.
- Fold: answer 783, top source 830, "Fictional example" 877 at 1440 x 900; 711, 757, 794 at 1280 x 800. Page 7,420px
  at 1440 x 900 before the story plays (8.2 screens), about 7,680 after (8.5); 9.06 screens at 1280 x 800.
- Reduced motion and no script: complete, static, 0 console error; a link still jumps to its section.
- `rules-check.mjs`: 42 of 44. One failure is the behaviour replaced by `inert` (a hidden rule's control taking the
  focus); the other ("pointer goes to the current rule only") was not investigated.
- `hero-check.mjs`: 20 of 24. The four failures are the question-change checks, which sample the end state at the
  old 1.5 times timing (the sheets are still landing when they look); the checks were not rewritten.
- `ambient-check.mjs`: 28 of 30. Both failures are expectations this pass changed on purpose (the count no longer
  waits at 0; three flat strokes exist under reduced motion).
- `impeccable detect index.html`: 6 notes, the same six as after the foundation, left for the same reasons.
- Not run: `core-check.mjs`, `lint.mjs`, `inspect.mjs`. Not tested: Safari, Firefox, a real touch device, a real
  trackpad, a screen reader, widths 700 to 1023 in pictures. The phone was checked by numbers after the changes, not
  looked at again. A jump while a late font triggers a refresh was not tried.

## Files

| File | Role |
| --- | --- |
| `index.html` | The page. The regions between `<!--gen:NAME-->` and `<!--/gen-->` are pasted-in output of `js/demo.js` (so the page is whole without script). |
| `css/tokens.css` | Colours, the five type sizes, grid, shapes, motion tokens for CSS states (`--ease-out`, `--ease-flag`, `--t-fast/base/move`). |
| `css/ui.css` | Base + interface components: buttons, sheet, answer, highlighter, chips, flags, footnote rows, documents, pile, minis, memo, switch, the story strip, terminal, phone bottom sheet. |
| `css/site.css` | The page: grid, navigation, the eight sections, footer, breakpoints (1100 = full composition, 960 = menu button, 700 = phone). |
| `css/motion.css` | Shared motion rules: the failsafe, the hand-drawn highlight's layer, Lenis. |
| `css/motion-{hero,rules,dev,ambient}.css` | One sheet per module (a comment line each for now). |
| `js/demo.js` | `window.LeonUI`: builders that return HTML strings from `LEON_DEMO` (no DOM needed), plus `layoutFlags`. Dates are rendered with a no-break space ("Nov 15" never parts). |
| `js/site.js` | `window.Leon`: interactions only (questions, selecting a source, linked pointing, Julie/Sophie, the story's steps, phone sheet, navigation). |
| `js/motion/core.js` | `window.LeonMotion`: the contract below. |
| `js/motion/{hero,rules,dev,ambient}.js` | The four modules (stubs). |
| `tools/build.mjs` | Refills the `gen:` regions after a change in `js/demo.js`: `node tools/build.mjs <abs path to papier>`. Not needed to run the page. |

## Page structure (top to bottom)

| # | Section | Selector | Ground | Notes |
| --- | --- | --- | --- | --- |
| – | Navigation | `header.nav[data-nav]` | white, sticky, 72px | Product, Connectors, Developers, Security, Pricing, Sign in, pill. `.is-scrolled` after 24px (site.js). Under 960px: menu button + panel `[data-nav-panel].is-open`. |
| 1 | Hero | `section.hero#top` | white, then `.stage` desk band | `.hero__head` (H1 cols 1-8, lead + `.cta` cols 9-12), `.tabs[data-tabs]`, `#stage[data-stage]` with `#hero-answer` (cols 1-7) and `#pile` (cols 8-12). |
| 2 | Three rules | `section.rules#product[data-rules]` | white | **Three stacked blocks** `article.rule[data-rule="1|2|3"]` = the fallback (phone, reduced motion, no script). `ol.rules__list[data-rules-list]` (the three names + `[data-rules-marker]`) is hidden until `.rules.is-pinned`. |
| 3 | Connectors | `section.conn#connectors` | white | `[data-count="42"]` in the H2; `.marquee[data-marquee]` holds two `ul[data-marquee-row="1|2"]` (21 tools each). Static = one wrapped block; `.is-rolling` = the carousel (below). |
| 4 | Morning briefing | `section.brief#briefing` | desk band | `.memo[data-memo]` cols 1-6, text cols 8-12. |
| 5 | For developers | `section.dev#developers[data-dev]` | **ink band** | `.dev__text` cols 1-5 (H2 runs over 6). From 1100px wide the band is one screen tall (founder's pass). `.dev__frag[data-story][data-step]` cols 7-12: the strip, the desk row with the pile, the terminal, "Fictional example". |
| 6 | Security | `section.sec#security` | white | H2 "What is in place, and what is in progress." cols 1-5, lists "In place" / "In progress" cols 7-12. |
| 7 | Close | `section.close#close` | desk band | `.statement` 56px cols 1-7, `.close__form` (desk-2 panel) + `form.signup.sheet` cols 9-12. |
| – | Footer | `footer.foot.on-ink` | ink | |

## Hooks for the motion modules (all present in the static markup, all in their final state)

Entrance order per section: `[data-rv="1"]` heading, `[data-rv="2"]` text, `[data-rv="3"]` fragment.

| Motion item (home-v2.md) | Elements |
| --- | --- |
| 1. Load: H1 lines | `[data-h1-line="1|2"]` (`.h1__line`, block, nowrap from 700px up). |
| 1. Load: headline highlight | `[data-sweep="hero"]` (`.swp`) with three flat CSS strokes `[data-sweep-seg="1|2|3"]` = the fallback. To draw by hand, give each `<i>` stroke to `M.rough` (they are the three thirds of the phrase): `M.rough(seg, { color: 1 })`, then 2 and 3 with a delay. `.is-drawn` on the `.swp` hides the flat strokes. |
| 1. Load: lead, pill, tabs, stage | `[data-hero-lead]`, `[data-hero-cta]`, `[data-tabs]`, `[data-stage]`. |
| 1-3. The demo | Sentence k: `[data-sentence="k"]` (carries `data-n` = its source). Its strokes: `.hl` inside. Number chip: `[data-cite="n"]`. Flag: `[data-flag="n"]` (`data-for="k"`; `data-flag="0"` = the empty dashed flag, its outline is `polygon[data-draw]`). Footnote row: `[data-note="n"]`. Document: `[data-source="n"]` (`data-slot="top|b1|b2"` in the pile), its flag `[data-docflag="n"]`. Question row: `[data-question]`. Everything linked to source n shares `data-n="n"`. |
| 2. Tab indicator | `[data-tab-indicator]`: one shape clipped by `--ind-l` / `--ind-r` (set by site.js); it already slides with a CSS transition on `clip-path`. |
| 3. Linking | `.is-lit` is toggled by site.js on every `[data-n]` of the pointed link (flags grow to 1.1, strokes deepen, sheet lifts 6px: CSS). `.is-selected` on the chosen sentence. |
| 4. Pinned rules | `[data-rules]`, `[data-rule="k"]`, `[data-rule-text="k"]`, `[data-rule-frag="k"]`, `[data-rule-link="k"]`, `[data-rules-marker]` (3 x 32px; move it by 32px per rule), `[data-perm]`, `[data-switch]`, `[data-switch-thumb]`, `[data-perm-body]`. Inside each fragment the same sentence / flag / source hooks as the hero; small sheets are `.mini[data-source="n"]`. |
| 5. Connectors | `[data-count="42"]`, `[data-marquee]`, `[data-marquee-row="1|2"]`, `li.tool[data-tool]`. **To roll:** append a copy of each row's 21 items to that row (`data-clone`, `aria-hidden="true"`), add `.is-rolling` on `.marquee`, then slide row 1 from `xPercent: 0` to `-50` and row 2 from `-50` to `0`, linear, repeat -1 (slightly different durations). Half a row is exactly one set (checked: 2951.7px and 2763.7px at 1440), so the copy follows the last tool with no gap. Pause on `pointerenter` / `focusin`; give `.marquee` a `tabindex="0"` and a label when it rolls, so a keyboard can stop it. The stroke under the pointed tool's name is already CSS (`.tool:hover > span`). Clones are `display: none` unless `.is-rolling`. |
| 6. Briefing | `[data-memo] [data-line]` in print order (title, date, then heading and items), chips `[data-chip]`. |
| 7. Security | `li[data-check="yes"] path[data-draw]` (ticks) and `li[data-check="progress"] path[data-draw]` (the half ring, a plain arc: `stroke-dashoffset` draws both). The faint full ring under the arc is not animated. |
| 8. Close | `[data-sweep="close"]` (one flat stroke; draw over its `<i>` with `M.rough(seg, { color: 4 })`), `.close__form .signup`. |
| Section headings | One phrase per heading is wrapped in `.hmark[data-hmark="1|2|3"]` (rules 1-3 and developers). Flat CSS stroke by default; `M.rough(hmark, { color: n })` draws over it and sets `.is-drawn`. On the ink band the marked words turn to ink and the drawn stroke goes behind them (motion.css). |
| 11. Developers: the story | Root `[data-story]` = `.dev__frag`, state in `data-step="1|2|3"` (3 in the markup). Strip: `[data-dream]`, `[data-dream-step="k"]` (dot `.dream__dot`), its button `[data-story-step="k"]` (label `.dream__when`, caption `.dream__cap`, `aria-pressed`), `[data-dream-marker]` (CSS `left` puts it on the current step's dot; animate `x` between them). Desk row `.dream__desk`: `[data-dream-pile]`, `[data-dream-sheet="1|2|3"]` (each holds a `.flag`), `[data-dream-thread]`, and `[data-story-replay]` (**hidden**: remove the `hidden` attribute when your module can replay). Terminal `[data-term]`: titles `[data-term-title="evening|morning"]` ("claude · kestrel/app" / "codex · kestrel/app"), bodies `[data-term-body="evening|morning"]` stacked in one grid cell, morning = 13 x `[data-term-line]` in print order with coloured marks `[data-term-mark="n"]` and source lines `[data-term-source="n"]`, evening = 6 x `[data-term-end]`. Facts beside it: `[data-fact="1|2|3"]`. |

What each step shows, statically (CSS in ui.css, driven only by `data-step`):

| `data-step` | Terminal | Sheets | Marker |
| --- | --- | --- | --- |
| 1 Evening | title "claude", the end of the session ("Session ended · Nov 9, 21:02", "fix/export-pagination · PR #482 updated", what Leon keeps in three lines) | loose under "Evening" (columns 1-2 of the desk row), no flags, no thread name | first dot |
| 2 Night | as Evening | filed in the pile under "Night", flags on, "Thread fix/export-pagination" | second dot |
| 3 Morning (default, no script) | title "codex", the context block | as Night | third dot |

`Leon.showStep(k)` sets the state (and `aria-pressed`); clicking a step calls it. `Flip.getState` the sheets before
`commit()`, `Flip.from` after, and they travel between the two places.

A sweepable product highlighter exists: `.is-sweep` on an ancestor of `.hl` strokes and `--sweep` from 0 to 1 (the
stroke grows from the left on each line; a sentence's last word, which carries the number, fills over the last
tenth). `M.sweep` does it. Without the class the stroke is full.

## Script API

`window.LeonUI` (js/demo.js), all return strings: `scenario(id)`, `questionHTML`, `answerHTML`, `notesHTML`,
`asheetHTML(answer, {notes, selected})`, `docHTML(source, {slot})`, `pileHTML(sources, top)`, `slotsFor(sources, top)`,
`miniHTML`, `fragHTML`, `permHTML(view)`, `memoHTML()`, `connectorsHTML()`, `dreamHTML()` (the strip and the desk row),
`terminalHTML()` (both states); and `layoutFlags(scope)` (DOM: puts each flag level with the line where its sentence
starts; two on one line sit side by side).

`window.Leon` (js/site.js):

- `Leon.select(n, {open})`: choose source n in the hero (moves `data-slot`, `aria-pressed`, `.is-selected`). On a phone it opens the bottom sheet unless `open: false`.
- `Leon.showScenario('commitment' | 'bug' | 'departure')`: change the hero's question (rebuilds `#hero-answer` and `#pile`).
- `Leon.showView(0 | 1)`: permissions, 0 = Julie, 1 = Sophie (rebuilds `[data-perm-body]`; Sophie's markup never contains the email).
- `Leon.showStep(1 | 2 | 3)`: the developers' story (sets `data-step` on `[data-story]`). The step already shown is allowed again, so a hook can replay it.
- `Leon.light(root, n, on)`, `Leon.layoutFlags()`, `Leon.openSheet(n)`, `Leon.closeSheet()`, `Leon.state` (`{scenario, top, view, step}`).
- `Leon.hooks.scenario | select | view | step = (detail, commit) => {…}`: wrap a change. Call `commit()` when the DOM should change (synchronous), and animate around it (`Flip.getState` before, `Flip.from` after). Without a hook the change is immediate.
- Events on `document` after each change: `leon:scenario {id, previous}`, `leon:select {n, previous}`, `leon:view {view, previous}`, `leon:step {step, previous}`.

After any change of text or width call `Leon.layoutFlags()` (a ResizeObserver already does it for `[data-linked]` roots).

## Motion core

Libraries, pinned, at the end of `<body>` with `defer`, in this order: GSAP 3.13.0, ScrollTrigger, Flip, SplitText
(cdnjs); Lenis 1.3.4 (unpkg; its sheet is linked in `<head>` without blocking the first paint); Rough Notation 0.5.1
(unpkg); then `js/motion/core.js`; then `hero.js`, `rules.js`, `dev.js`, `ambient.js`. Every one of them is optional.

### The API as built (`window.LeonMotion`, called `M`)

| Member | What it does |
| --- | --- |
| `M.ok` | `true` when GSAP is loaded and motion is allowed. `false` under reduced motion or without GSAP: a module returns at once, the page is already final. |
| `M.reduced` | `prefers-reduced-motion: reduce`. |
| `M.enabled(name)` | `false` when the address carries `?only=<another module>` (`hero`, `rules`, `dev`, `ambient`), to film one module alone. |
| `M.dur` | `{ fast: 0.2, base: 0.42, slow: 0.6 }` seconds. The only three durations. `gsap.defaults` is set to `base` and `M.ease.out`. |
| `M.ease` | `{ out: 'expo.out', inOut: 'power2.inOut', pop: 'back.out(1.8)' }`. `pop` is for flags only. |
| `M.ready(fn)` | Calls `fn(M)` once the DOM is parsed, the fonts are loaded (1.5 s at most) and the libraries are checked. Modules run in script order, in one task. A throwing module is logged and does not stop the others. Called after the start, `fn` runs at once. |
| `M.sweep(el, o)` | The highlighter: adds `.is-sweep` on `el` (a sentence, or any ancestor of `.hl` strokes) and drives `--sweep` 0 → 1. `o`: `duration` (base), `delay`, `ease` (inOut), `keep`. When done it removes the class and the property (unless `keep`). Returns the tween. |
| `M.flagPop(el, o)` | Scale 0.6 → 1 and opacity 0 → 1 with `M.ease.pop`, from the edge the flag is attached to (right edge for `.flag--left`, left edge otherwise). It switches the flag's CSS transition off while it runs and clears its inline styles when done (unless `keep`). `o`: `duration`, `delay`, `keep`. Returns the tween. |
| `M.sheetLand(el, o)` | A sheet arrives: from `x` 64, `y` -20, `rotate` 3 degrees, opacity 0 to rest, `M.dur.slow`, `M.ease.out`; inline styles cleared when done (unless `keep`). `o`: `x`, `y`, `rotate`, `duration`, `delay`, `keep`. Returns the tween. |
| `M.rough(el, o)` | Draws a Rough Notation highlight over `el`. `o`: `color` (1 to 4 = the highlighter of that source, or any CSS colour), `delay` and `duration` in seconds (0.52), `padding` (`[1, 3]`), `onDone`. It sets `.is-drawn` on the closest `.swp` / `.hmark` **at once**, so the flat stroke never shows under the drawn one, then draws after the delay. Returns the annotation (`.show()`, `.hide()`, `.remove()`), or `null` when the library is missing: the flat CSS stroke stays. |
| `M.onEnter(el, fn, o)` | `fn(el)` once when `el` enters the viewport: ScrollTrigger (`o.start`, default `'top 82%'`, `once`), or an IntersectionObserver without it. |
| `M.lenis` | The Lenis instance, or `null` (reduced motion, touch-first device, library missing). |
| `M.refresh()` | A debounced (160ms) `ScrollTrigger.refresh`. Already called after the modules start, when the fonts arrive, on `load`, and whenever the page's height changes. |

The three gestures return `null` when motion is off or the element is missing; none of them throws. Add the tween to
a timeline (`tl.add(M.flagPop(flag), 0.4)`) or let it play. Inside a **scrubbed** timeline pass `keep: true`, so the
tween can play backwards (the cleanup at the end would otherwise let go of the element).

Also done by the core: plugins registered; Lenis started and tied to ScrollTrigger (`lenis.on('scroll',
ScrollTrigger.update)`, `lenis.raf` from `gsap.ticker`, `lagSmoothing(0)`); in-page links go through
`lenis.scrollTo` (the section's top meets the bar, the hash is pushed, the section takes the focus). A module that
handles a link itself (the rules' list while pinned) calls `preventDefault` on the click: the core then leaves it. A
scroll that Lenis did not make (a script's `window.scrollTo`, a key pressed during a glide) wins at once.

### Pre-hidden states and the failsafe

An inline script in `<head>` adds `js-motion` to `<html>`, except under reduced motion. A module may pre-hide **only
what its own load or entrance animates**, in its own sheet, under `html.js-motion`, and every such rule carries the
failsafe:

```css
/* css/motion-hero.css */
html.js-motion [data-h1-line] { opacity: 0; animation: var(--failsafe); }
```

`--failsafe` is `leon-failsafe 1ms linear 3s forwards` (motion.css): if the core or the libraries never arrive, the
element shows after 3 seconds (opacity 1, visible, no clip-path, no transform). Pre-hide with `opacity`,
`visibility`, `clip-path` or `transform` only: the sheets' resting places use `translate` and `rotate`.

**The hand-over, which every module must respect.** Just before it calls the modules, the core removes `js-motion`.
The CSS pre-hides let go at that instant, and from then on only inline styles hide anything. So in your `ready`
callback, **synchronously**, put every element you pre-hid into its first state yourself:

```js
LeonMotion.ready(function (M) {
  if (!M.ok || !M.enabled('hero')) return;
  var lines = document.querySelectorAll('[data-h1-line]');
  gsap.set(lines, { opacity: 0, yPercent: 100 });               // same task: no frame shows them
  gsap.to(lines, { opacity: 1, yPercent: 0, duration: M.dur.slow, stagger: 0.08, clearProps: 'all' });
});
```

`gsap.from(...)` and `fromTo(...)` created in the callback also count (they render their first state at once); a
tween created later (inside `M.onEnter`) does not, so `gsap.set` its targets first. Whatever a module does not touch
is simply visible: a disabled module (`?only=`), a module that throws, a missing library all leave the page whole.
`html.motion-on` is set once the modules have run with motion allowed, if a sheet needs to know.

### Who owns what

| Module | Sections | Motion points of home-v2.md | Hooks of `Leon` it takes |
| --- | --- | --- | --- |
| `hero` | navigation, `#top` | 1 page load (bar, H1 lines, the three drawn strokes, lead, pill, tabs, stage, then the demo plays once; any click or key jumps to the end), 2 changing question, 3 selecting with Flip, the tab indicator | `hooks.scenario`, `hooks.select` |
| `rules` | `#product` | 4 the pinned, scrubbed rules (adds `.is-pinned`, list marker, the switch moving to Sophie), the three headings' drawn marks | `hooks.view` |
| `dev` | `#developers` | 11 and Update 4: the story in three steps (6 s at most, any click or key skips it), each step replayable, "Replay", the heading's drawn mark, this section's entrance | `hooks.step` |
| `ambient` | `#connectors`, `#briefing`, `#security`, `#close`, footer | 5 count-up and carousel, 6 briefing lines and chips, 7 ticks and half rings, 8 "on record." and the landing sheet, 10 the `[data-rv]` entrances of these four sections | none |
| core | whole page | Lenis, anchors, refresh. Point 9 (controls) is CSS and done. | |

A module touches only its own sections and its own two files. `[data-rv]` exists in every section: scope your
selectors to your sections' ids.

### Things the modules must know

- **Scroll budget.** At 1440 x 900 the stacked page is 6,969px; the stacked rules take 1,809px of it; the rolling
  carousel is 124px shorter than the wrapped grid. Limit: 9 screens = 8,100px. With the pin and the carousel rolling
  the page is `5,936 + pin distance`: keep the pin distance at **2,000px at most**.
- **Pinning.** Nothing is pinned by CSS. On wide screens with motion allowed, add `.is-pinned` on `[data-rules]` (it
  shows the list of names), lay the three `.rule` blocks in one grid cell, and scrub. The fragments are 428 to 547px
  tall at 1280 to 1440, so they fit under the 72px bar.
- **CSS movement already there**: `.is-swapping > *` (a 240ms fade when a question or a person changes: remove the
  class in your hook if you animate the swap), `.pile > .doc` transitions on `translate` / `rotate` (set
  `transition: none` while Flip runs), `.flag` and `.mini` transitions (`M.flagPop` handles the flag's).
  GSAP 3.13 does **not** compose with a resting `translate` / `rotate`: the moment it animates an element's transform
  it folds them into its own `x`, `y`, `rotation` and writes `translate: none; rotate: none` inline. A tween on a
  resting sheet must end on those values (`M.sheetLand` does), and its CSS transition stays off until it is handed back.
- **Hand-drawn strokes.** The drawing is an svg placed just before the marked element; headings are positioned and
  isolated (motion.css) so it follows them. Rough Notation redraws on resize by itself. Call `M.rough` after the
  layout is final for that heading (inside `ready`, the fonts are loaded).
- **Filming with Lenis.** `film.mjs` scrolls with a real wheel and waits 450ms: under Lenis the page is still
  gliding, so a frame is taken a few pixels before its target (the caption gives the real position).
  `shoot.mjs` is exact.
- **Reduced motion**: `M.ok` is false, `js-motion` is never set, Lenis is off, ui.css cuts CSS transitions to 1ms.
- `data-ui` marks the root of each interface fragment (the checkers leave its borders alone, the word count skips it).

## Checked (November 10, headless Chrome)

- Self-check of the foundation: **32 of 32 pass**. Run it again after touching the core or the static states:
  `node /private/tmp/claude-501/-Users-david-Downloads-Business-code-leon--claude-worktrees-leon-interface-redesign-715484/da99c0d6-086f-421a-bb71-53f736ad2f3a/scratchpad/papier-build/core-check.mjs http://localhost:3041/papier/index.html <out dir>`
  (it lives in the session scratchpad, not in the repository). It covers:
  GSAP 3.13.0 and the four other libraries present; the API complete; Lenis running; `js-motion` released;
  H1 56px on two lines; "Nov 15." on one line; no sideways scroll; the three gestures (and their cleanup); three drawn
  strokes on the H1; `onEnter`; a throwing module contained; the story's three states with no layout jump (terminal
  595px, fragment 967px in all three); the carousel's rolling mode seamless and edge to edge; a navigation link through
  Lenis; a script scroll during a glide; `?only=dev`; reduced motion; the CDNs blocked (page whole, `M.ok` false);
  the core blocked (the CSS failsafe shows a pre-hidden H1 after 3 seconds).
- `shoot.mjs` at 1440 x 900, 1280 x 800 and 390 x 844: 0 console error. H1 56px / 600 on two lines at 1440 (49.9px
  at 1280, 28.9px at 390, two lines each). Page 6,969px at 1440 (7.74 screens before the pin), 7,053 at 1280, 9,944 at 390.
  The answer, its flags and the top source are above the fold at 1440 x 900 (top source ends at 829) and 1280 x 800 (757).
- Fonts really loaded: Schibsted Grotesk 400/500/600, STIX Two Text 400.
- `film.mjs --nojs` and `--reduced`: every section visible in its final state, nothing moves, 0 console error. The
  developers section shows the Morning state with the three captions.
- Headings two lines at most at 1440, 1280 and 390. Sizes outside fragments at 1440: 56, 40, 18, 16, 13.5.
  Smallest text anywhere: 13px. Prose outside fragments: 491 words (limit 620). Story captions: 2, 4 and 3 lines at 1440.
- `impeccable detect index.html`: 6 notes left (12 before). Fixed: the number chips and the small sheets of the
  dreaming pile now carry real padding instead of a fixed height (same rendering). Left on purpose: the `.stage`,
  `.brief`, `.dev`, `.close` bands are reported as having no side inset, but their content is inset by `.wrap`
  (48px margins); the answer sheet's footnote rows run to the sheet's bottom edge by design (each row has its own
  padding); "Source" repeated three times is screen-reader text. **A highlighter stroke that hugs its text is
  intended** (`.hl`, `.hmark`, `.swp`, the stroke under a pointed tool's name): do not pad it.
- `lint.mjs`: 19 FAIL, unchanged, all by contract (1px rules inside lists and fragments, the sheet's one shadow,
  monospace in the terminal).

## Not done, or decided against the letter of the brief

- (Foundation's list. The choreography now exists: see the four module notes and the art director's pass above.)
- Phone H1 is 29px, not 32 to 34: at 32 the headline takes three lines in 358px; two lines was kept.
- Phone H2 of the developers section is 25px (the others 28): at 28 it alone takes three lines.
- The stage is 519px tall at 1440 (the brief says "about 620"): it ends at the fold with the top source fully visible.
- The briefing memo numbers its five lines 1 to 5; chip 5 reuses colour 1 (there are four highlighter colours).
- The story's pile shows the three sources of the developer briefing under the thread name of the first session;
  the third (the ACME ticket) belongs to another subject in the demo data. Fictional, but worth a look.
- The Evening terminal is written from the first session of the data and from the facts `home-v2.md` allows (what
  Leon receives, masked secrets, private to its author). Its exact wording ("Session ended", "Leon · session kept")
  is ours: the real tools print something else.
- The terminal is as tall as what it shows (239px in Evening and Night, 595px in Morning at 1440): the page is about
  260px longer once the story has reached Morning.
- Developers on the left: the text column is 269px shorter than the story. It is sticky on screens at least 861px
  tall, so the gap sits above it at the end of the section instead of under it at the start.
- The carousel assumes one set of 21 tools is wider than the screen (2,764px at least): true up to 2,560px wide.
- Width 700 to 1099 is a plain stack; not looked at in pictures, only measured (no sideways scroll).
- Not run: `inspect.mjs`. Not tested: a real touch device (Lenis is skipped there by a media query), Safari, Firefox.
