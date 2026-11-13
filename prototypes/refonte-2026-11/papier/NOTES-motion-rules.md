# Motion module "rules" : section 2, the three rules (`#product`)

Files: `js/motion/rules.js` (336 lines), `css/motion-rules.css` (53 lines). Nothing else was edited.
Film it alone: `http://localhost:3041/papier/index.html?only=rules`.

## What it does

**Wide screens (1024px and more, motion allowed, and one rule fits under the bar).** The script adds `.is-pinned` on
`[data-rules]`. The list of names and the three `article.rule` then lie in one grid cell; the three fragments are
stretched to the same box and only the first paints the desk, so it reads as one panel that never moves, with
"Fictional example" at its foot. The section is pinned (ScrollTrigger) with the rule centred in the room under the bar,
for `min(2000px, 2.2 x the window's height)` of scroll (1,980px at 1440 x 900, 1,760px at 1280 x 800), and one timeline
is scrubbed. Lenis smooths it (`scrub: true`); without Lenis the scrub takes `M.dur.base` to catch up.

**Elsewhere** (under 1024px, a rule taller than the room under the bar, no ScrollTrigger): the stacked blocks,
untouched, with the entrance only (heading, text, fragment, 70ms apart, 20px, once per rule) and the heading's drawn mark.

**Reduced motion, no GSAP, `?only=<another module>`**: the module returns at once. The static page.

## Timeline of the pinned version

The timeline has 30 units, 10 a rule. At 1440 x 900 the pin runs from scroll 829 to 2,809: one unit = 66px.

| Units | Scroll at 1440 x 900 | What happens |
| --- | --- | --- |
| before | section enters (its top at 82% of the window) | Entrance, timed: the list, the heading, the text and the panel rise 20px, 70ms apart; "the colour of its source." is drawn by hand (pink). The answer is there, unmarked; no number, no flag, no document. |
| 0.4 to 6.7 | 855 to 1,271 | **Rule 1.** Three times, 2.1 units apart: the sentence is swept in its colour (linear with the scroll), its number and its flag pop, its document lands from the right with a slight turn. |
| 6.7 to 9.4 | 1,271 to 1,449 | Rule 1 at rest: everything can be pointed at and clicked (the linked highlight works). |
| 9.4 to 11.7 | 1,449 to 1,601 | The sheets leave upwards (faster than they came), the text fades, the marker moves one step (32px), the second text comes up, the Verlant answer slides in. At unit 10 "Not on record" becomes the current name and "Leon says so." is drawn (green). |
| 12 to 13.8 | 1,621 to 1,740 | **Rule 2.** "I don't know…" stays unmarked; the empty dashed flag draws itself round its outline beside it, its white fills in, then "no source" appears. |
| 14.2 to 16.3 | 1,766 to 1,905 | The second sentence takes colour 1, its number and flag pop, the Pipedrive note lands. |
| 16.3 to 19.2 | 1,905 to 2,096 | Rule 2 at rest. |
| 19.2 to 21.7 | 2,096 to 2,261 | The same change; then the switch comes up and Julie's view (answer and two documents) slides in. At unit 19.8 "Yours only" is current and "Nothing more." is drawn (blue). |
| 21.6 | 2,255 | **Rule 3**, timed: "Private to you" is stamped on the email (once). |
| 21.7 to 25 | 2,261 to 2,479 | Julie's view at rest. |
| 25 | 2,479 | Timed, about 1.2 s: the switch moves to Sophie by itself (`Leon.showView(1)`). The private email slides off to the right and fades, the answer fades; site.js rebuilds the fragment (Sophie's markup never contains the email); the new answer appears, its first sentence is swept pink, number and flag pop, the empty dashed flag draws itself beside "Nothing you can access records ACME's agreement.", and the ticket both can open travels to its new place against the right edge, unfolding to the left. Scrolling back above this point returns to Julie the same way in reverse (the email lands again, the stamp comes back). |
| 25 to 30 | 2,479 to 2,809 | Sophie's view at rest; it stays when the pin ends and the section scrolls away. |

Not scrubbed, on purpose: the entrance, the three heading marks, the stamp, and the change of person (it rebuilds the
DOM, so it cannot be tied to the scrollbar; it is triggered when the scroll crosses unit 25, in either direction).

## How to trigger each part

- Scroll through the section, or click a name in the list: "Cited" goes to unit 8, "Not on record" to 17.6, "Yours
  only" to 23.2 (the rule at rest). `aria-current="true"` is on the current name; `data-current="1|2|3"` on the section.
- The switch stays clickable while pinned and afterwards: a click plays the same change of person. Three fast clicks
  end on the last one. A click holds until the scroll next crosses unit 25.
- Keyboard: the three rules are stacked and all stay readable by a screen reader (hidden by opacity, not by
  `visibility`). When a control of a rule that is not on screen takes the focus, the page scrolls to that rule.
  Only the current rule takes the pointer.
- Resize, or fonts arriving late: everything is reverted (`gsap.context().revert()`), measured and built again; the
  scroll position puts the timeline back. Crossing 1024px switches between pinned and stacked with nothing left
  hidden or half-marked.
- Constants at the top of `rules.js`: `T`, `CUT`, `REST`, `STAMP`, `SOPHIE`; the scroll length is in `build()`.

## How it is built (for whoever polishes it)

- `M.sweep` (with `keep`, linear) for the sentences; once a sentence is fully marked the `.is-sweep` class is taken
  off, so the plain stroke is back and deepens when pointed at. `M.sheetLand` for the answer sheets (straight:
  `rotate: 0`, because `layoutFlags` measures where a sentence starts and a turned sheet would mislead it).
  `M.rough` for the headings, `M.onEnter` for the entrance, `M.dur` / `M.ease` everywhere.
- Two gestures are replayed on CSS variables instead of GSAP transforms, with the same values and eases as the
  core's: the flags' and numbers' pop (`--pop`, turned into `scale`) and the small sheets' landing and leaving
  (`--land`, `--leave`, turned into `transform`). Reason: see the first request below.
- The empty flag's outline is dashed, so it cannot be drawn with its own dash offset: at run time the script adds a
  `<mask>` holding a solid copy of the outline, draws that, and removes the mask when the flag is complete.
- Pre-hidden: only `html.js-motion #product [data-rv]`, with the failsafe.
- Self-check (44 assertions, in the session scratchpad, not in the repository):
  `node /private/tmp/claude-501/-Users-david-Downloads-Business-code-leon--claude-worktrees-leon-interface-redesign-715484/da99c0d6-086f-421a-bb71-53f736ad2f3a/scratchpad/papier-build/rules-check.mjs`

## Checked (November 10, headless Chrome)

- The self-check: 44 of 44. It covers: pinned at 1440 x 900, 1280 x 800, 1100 x 800, 1024 x 768 and 1024 x 1366 with
  the panel under the bar and above the fold; pin distance 1,980px; no jump when the pin starts or ends (the wrap moves
  by the 4px scrolled, nothing more); each rule's state at rest; Sophie by itself further down and Julie again when
  scrolling back; no trace of the email in Sophie's markup; clicks on the switch while pinned; the list's links;
  focus bringing a rule back; pointing still deepens a marked sentence, grows its flag and lifts its document;
  resize to 800 and back; 390 x 844 stacked, switch by tap; reduced motion untouched; `?only=hero` untouched; whole
  page 7,689px at 1440 x 900 (8.5 screens, limit 9), 0 console error.
- Films looked at: the module alone at 1440 x 900 (two rounds), the whole page, 1024 x 768, 390 x 844.
  Filmed with 0 console error but not looked at: `--reduced` (its state is asserted by the self-check) and 1280 x 800.
- The foundation's `core-check.mjs`: 31 of 32 with only this module on (the one failure is its own `?only=dev` test,
  which cannot run on an address that already carries `?only=`). On the whole page it reports 24 of 32: the 8
  failures are the hero's, the story's and the carousel's new behaviour, which that check still expects to be absent.

## Not done, or decided

- At 1024 to 1279px wide the first heading ("Every sentence wears the colour of its source.") takes three lines in
  the five-column text. From 1100px that is already the case in the static page; from 1024 to 1099 it comes from
  pinning (the static page stacks there and the heading has the full width).
- At 1024px wide the three small sheets of rule 1 are 144px wide: readable, tight.
- Rules 2 and 3 have fewer documents than rule 1, so the lower part of the shared panel is empty desk for them
  (about 190px at 1440).
- Before a sentence is marked its number is hidden, which leaves a small gap in the line where it will pop.
- The highlighter sweeps every line of a sentence at the same time (that is how `.is-sweep` is written in ui.css),
  not one line after the other.
- Inside the pinned section the highlighter's 160ms colour fade on hover is off (see the second request).
- Not tested: Safari, Firefox, a real touch device (no Lenis there: the scrub then takes 0.42 s to catch up),
  a real trackpad's feel. The mask relies on `getTotalLength()` on a `<polygon>`; without it the flag is simply shown.
- A hash link straight to `#rule-2` or `#rule-3` lands on the pinned section's start, not on that rule.

## Requests outside my files

1. `NOTES.md` says GSAP's `x`, `y`, `rotation` "compose with the resting `translate` / `rotate`". With GSAP 3.13
   they do not: GSAP writes `translate: none; rotate: none; scale: none` inline on any element whose transform it
   animates. So `M.sheetLand` on a `.mini` or a pile's `.doc` ends at 0 degrees and snaps back to the resting tilt
   when its inline styles are cleared, and with `keep: true` the tilt and the 6px lift (`.is-lit`) are lost for good.
   Seen in my own check (the document no longer lifted), which is why this module uses CSS variables there. The hero
   and the developers' story may have the same small snap.
2. `M.sweep` ends by removing `.is-sweep`; `.hl` has `transition: background-color`, so the stroke should fade back
   in from transparent over 160ms: a short blink at the end of each sweep. Deduced from the CSS, not filmed. I
   switched that transition off inside the pinned rules only (`.rules.is-pinned .answer .hl`); a global fix belongs
   in ui.css (for example no transition while `.is-sweep` is being removed).
3. `core-check.mjs` should be updated now that the modules are filled (8 expectations describe the stubs).
