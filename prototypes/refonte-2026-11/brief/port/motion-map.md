# Motion map: prototype `papier/` -> real `/accueil`

Written 12 Nov 2026. Nothing in the repository was edited. Read: the five notes, the five modules, `motion.css` and `motion-*.css`,
`site.js`, `demo.js` (via NOTES), then the real home (`src/components/site/home/*`, `demo-card.tsx`, `parts.tsx`, `site.css`,
`kit.css`, `site-header/footer`, `instant.ts`, `globals.css`). Filmed both pages at 1512 x 771 (`--times 0,300,600,900,1300,1800,2600`,
`--scroll` every 400 px). Stills and sheets: `scratchpad/port/film-map/{proto,real,real-nojs,real-reduced}/` (`sheet-load.jpg`, `sheet-scroll.jpg`).
Licence tarballs (read only, outside the repo): `scratchpad/port/lic/`.

## 0. What the two pages show today (from the films)

| | Prototype (`papier/index.html`) | Real (`/accueil`) |
| --- | --- | --- |
| Load, 0 to 2.6 s | Headline lines rise, 3 hand-drawn strokes, lead, pill, tabs and stage rise, then **the demo plays**: question, 3 sentences swept in pink / green / blue, flags and numbers pop, 3 documents land on the pile, footnote rows. | Headline lines rise (`s-line`), 3 strokes wiped (`s-wipe`), lead, pill and the tabs+stage block fade up (`s-arrive`), logo draws (`s-draw`). **Then nothing**: the answer is already complete, marked and numbered. In the film the page is at its end state at 0 ms because the CSS entrance finished before the `load` event. |
| Question switch | Leave 0.2 s, rebuild, demo replays at 1.3 s; tab indicator slides. | Instant swap (React `key` remount); the top sheet re-lands (`s-land`, 420 ms); no sentence-by-sentence build; tab background swap only. |
| Select a source | Flip: the three sheets travel, chosen one pulled right then over. | Slots change by CSS transition (420 ms on `translate`/`rotate`); `z-index` and the hidden contents of slots 1-2 switch at once; the new top re-lands (`s-land`). |
| Three rules | **Pinned** about 1,700 px of scroll at 771 px high (2.2 x height, 2,000 max), scrubbed: sentences swept, flags pop, documents land, names list with a marker, Julie -> Sophie by itself. Page scrolls to 6,082. | Three **stacked** blocks, each fading up with a scroll-linked view timeline (`.s-rv`). No list of names, no documents landing, no sweeps. Page scrolls to 4,963 (page 5,734 high). |
| Connectors | Count 0 -> 42, hand-drawn stroke, two rolling rows. | Two rolling rows (CSS `s-roll`, 42 s, reverse on row 2, pause on hover). Number and stroke static. |
| Briefing | Memo lines write in, chips pop. | Memo fades up as one block. |
| Developers | Strip Evening / Night / Morning, three sheets, terminal printing, "Replay". | A 5-line static terminal. **The story does not exist in the real page** (neither markup nor copy). |
| Security / close / footer | Ticks and rings draw, stroke under "on record.", sign-up sheet lands, footer rises. | Fade up (`.s-rv`) only. Ticks are already draw-ready (`pathLength=1`, `stroke-dasharray:1`). Close band has no form. |

Real page without JS and with reduced motion: whole, 0 console error (`real-nojs`, `real-reduced`). Real page: no GSAP, no Lenis, no `html.js-motion`.
`motion` 14.5.0 (MIT) is already a dependency of the repo (used by the app, not by the site).

## 1. Per module: what happens and when (from the notes)

### 1.1 Core (`core.js`, `motion.css`)

| What | Detail |
| --- | --- |
| Contract `window.LeonMotion` (M) | `ok`, `reduced`, `enabled(name)` (`?only=`), `dur` {fast .2, base .42, slow .6, count .8, travel 1.1}, `ease` {out `expo.out`, inOut `power2.inOut`, pop `back.out(1.8)`}, `ready(fn)`, `sweep`, `flagPop`, `sheetLand`, `rough`, `onEnter`, `lenis`, `refresh`. |
| Start | Waits for DOM, `document.fonts.ready` (1.5 s cap), then removes `html.js-motion` and runs the modules in one task; each module sets its first states synchronously in that task. Adds `html.motion-on`. |
| Pre-hide | Inline `<head>` script adds `js-motion` unless reduced motion. Each module's sheet hides its own entrances under `html.js-motion` with `animation: leon-failsafe 1ms linear 3s forwards` (shows everything after 3 s if nothing arrives). |
| Gestures | **sweep**: `--sweep` 0 -> 1 on a sentence, 0.42 s inOut, class `.is-sweep` while running. **flagPop**: scale .6 -> 1 + opacity, `back.out(1.8)`, 0.42 s, from the attached edge. **sheetLand**: from x 64, y -20, rotate 3deg, opacity 0, 0.6 s `expo.out`, lands on the CSS resting `translate`/`rotate`. **rough**: Rough Notation highlight, 0.52 s, flat CSS stroke hidden at once (`.is-drawn`). |
| Lenis | Smooth scroll, in step with ScrollTrigger (`gsap.ticker`); off on `(hover:none) and (pointer:coarse)` and reduced motion. |
| Anchor jumps | In-page `a[href^="#"]` travel 1.1 s `inOut`; entrances passed on the way are put into their end state (`M.quick`); `leon:travel` event; modules may veto (`M.anchor.<id>`). |
| Refresh | Debounced 160 ms `ScrollTrigger.refresh` on fonts, `load`, body height change. |

### 1.2 Hero (`hero.js`, `motion-hero.css`)

| At | What | Duration |
| --- | --- | --- |
| 0.00 | Nav content settles (10 px, fade). | 0.42 |
| 0.05 / 0.13 | Two headline lines rise out of a clip (line up, clip down by the same amount). Phone: one block. | 0.6 |
| 0.40 / 0.47 | Lead, then pill and note (16 px, fade). | 0.42 |
| 0.50 | Tabs and stage rise 24 px together. | 0.6 |
| 0.50 / 0.66 / 0.82 | Three strokes under "Source included." drawn (pink, green, blue). | 0.2 each |
| 0.65 | Question written. | 0.42 |
| 0.85 / 1.30 / 1.75 | Sentence k: words (0.2), +0.06 sweep (0.42), +0.25 its document lands on the pile (from the right, 140 px, 4deg, 0.6), +0.28 its flag pops, +0.30 its footnote row. | |
| 2.60 | End: all inline styles gone. Any click or key jumps to the end. Reloaded below the hero: skipped. | |
| Question change | Answer content (-8 px) and sheets (+48 px right, 30 ms apart) leave 0.2 s; `commit()`; demo replays at pace 0.7 (about 1.3 s); a second question replaces the first; click/key ends it. | about 1.5 s |
| Select a source | Flip all three sheets (0.6 s `inOut`); chosen sheet pulled right 14% (0.2) then over the others and down on top (0.42); `data-was` keeps the old top written for 0.2 s. | 0.62 |
| Linking | Pointing or focusing any end of a link lights all ends (flags 1.1, deeper stroke, sheet lifts 6 px): CSS `.is-lit`, driven by `site.js`. | |

### 1.3 Rules (`rules.js`, `motion-rules.css`)

Pinned only when width >= 1024, motion allowed, ScrollTrigger present, and one rule fits (`h + 32 <= window height - bar`). Pin length
`min(2000, 2.2 x window height)`. One scrubbed timeline of 30 units, 10 per rule (1 unit = about 57 px at 771 high).

| Units | What |
| --- | --- |
| entrance (section enters, `top 82%`) | List, heading, text, panel rise 20 px, 70 ms apart; heading mark 1 drawn (pink). |
| 0.4 to 6.7 | Rule 1: three times, 2.1 units apart: sentence swept (linear with scroll), number and flag pop (`--pop`), its mini document lands (`--land`). |
| 6.7 to 9.4 | Rule 1 at rest (everything pointable). |
| 9.4 to 11.7 | Turn: sheets leave up, text fades, marker moves 32 px, text 2 rises, answer 2 slides in (`sheetLand`, straight). Unit 10: "Not on record" current, mark 2 drawn (green). |
| 12 to 13.8 | Rule 2: the empty dashed flag draws itself beside "I don't know...", white fills, label "no source". |
| 14.2 to 16.3 | Second sentence takes colour 1, number and flag pop, Pipedrive note lands. |
| 19.2 to 21.7 | Turn to rule 3: switch rises (20.1), Julie's view lands (20.3). Unit 19.8: "Yours only" current, mark 3 drawn (blue). |
| 21.6 (timed) | "Private to you" stamp on the email (once). |
| 25 (timed, about 1.2 s) | Switch moves to Sophie by itself (`Leon.showView(1)`): email slides off, answer fades, `site.js` rebuilds the fragment (Sophie's markup never holds the email), new answer swept, empty flag drawn, shared ticket travels to its new place. Scrolling back above 25 returns to Julie. |
| 25 to 30 | Sophie at rest; stays when the pin ends. |

Not pinned (under 1024, a rule taller than the room, no ScrollTrigger): stacked blocks, entrance only (heading, text, fragment 70 ms apart, mark drawn). Reduced motion / no GSAP: static page.
Extras: clicking a name goes to its rest unit (8, 17.6, 23.2); focus in a hidden rule scrolls to it; non-current rules are `inert`; resize or late fonts rebuild; anchor jumps freeze the timeline.

### 1.4 Developers (`dev.js`, `motion-dev.css`)

| When | What |
| --- | --- |
| Entrance (grid top at 82%) | Heading, lead, 3 facts, closing line, link, story fragment rise 20 px, 70 ms apart; "dreaming" drawn pink at 120 ms. |
| Story, once (5.92 s), starts when the strip is 20-30% down the screen | 0.00 Evening: caption lit, others 40%; 0.10-0.22 terminal prints what Leon keeps (one line per 40 ms); 0.50 / 0.62 / 0.74 three sheets leave the terminal and land loose (0.6 each, 4deg). 1.90 Night: marker travels (0.42), 1.95-2.13 sheets filed into the pile (continuous move), 2.30-2.48 flags pop, 2.60 thread name fades up. 3.80 Morning: marker travels, title becomes `codex`, evening screen fades 0.2, 4.00-4.68 context block prints (18 lines, 40 ms), 4.82-5.06 source marks pop, 5.50-5.92 captions return, "Replay" appears. |
| Controls | Click or key ends the play at Morning. Each step button replays only its part. "Replay" plays the three. Pauses off screen. Loaded below, or passed by an anchor: Morning at once. |

### 1.5 Ambient (`ambient.js`, `motion-ambient.css`)

| Where | What |
| --- | --- |
| Every `[data-rv]` of connectors, briefing, security, close | Rise 20 px + fade, 0.6 s `expo.out`, once, on its own entry (`top 88%`; memo `top 74%`), delay `(rv-1) x 70 ms`. |
| Connectors H2 | Count 0 -> 42 in 0.8 s (width of "42" reserved; `aria-label` meanwhile); +0.3 s green stroke under "Nothing to migrate.". |
| Connectors rows | Two rows, 21 tools duplicated, row 1 left 40 s, row 2 right 46 s, linear, endless; slow to a stop (0.42 s) on pointer or focus; paused off screen; list focusable. Tool under pointer: name swept by a highlighter (CSS, 240 ms). |
| Briefing | Memo rises, from +240 ms ten lines write in from the left (clip, 0.42, 90 ms apart, rule drawing with each), each chip pops 300 ms after its line; blue stroke under "every morning.". |
| Security | Heading rises, green stroke under "in place" (+0.3 s); lists rise; from +220 ms three ticks then three half rings draw (`stroke-dashoffset`, 0.42, 70 ms apart). |
| Close | Statement rises, amber stroke under "on record." (+0.3 s); panel rises (+140 ms), sign-up sheet lands on it 100 ms later (48 px, 24 px up, 3deg). |
| Footer (top at 94%) | Wordmark, three columns, base line rise 20 px, 70 ms apart. |
| Controls (CSS only) | Arrow moves also under keyboard focus; footer link underline grows from the left; press 0.97; pointed tool stroke swept. |

## 2. Elements touched: prototype hook -> real element

Legend: OK = exists as is; ADD = exists, a hook/attribute/class must be added; MISSING = the structure does not exist (what is needed is stated).
The real home has **no `data-*` motion hook at all**. Real markup is server-rendered; client islands today: `HeroTabs`, `DemoScene`, `RightsSwitch`, `SiteHeader`, `MotionSwitch`.

### 2.1 Core

| Prototype | Real |
| --- | --- |
| Inline head script adding `html.js-motion` | ADD in `src/app/layout.tsx` `THEME_SCRIPT` (already reads `leon-motion` and sets `data-motion`); same line can add `js-motion` when reduced motion is off and `leon-motion` is not `off`. |
| `core.js` contract, `M.ready`, `M.onEnter`, `M.dur`, `M.ease` | MISSING. New small module (client hook + helpers). Durations/eases already exist as CSS tokens: `--s-ease: cubic-bezier(.16,1,.3,1)` (= expo.out feel), `--s-ease-flag: cubic-bezier(.34,1.56,.64,1)` (= pop), `--fast`, `--med`; and in `src/lib/verre/motion.ts` (`ease.out`, `duration.slow .6`). |
| Failsafe `leon-failsafe` | MISSING (add to `site.css`, scoped to `.s-root`). |
| Lenis, anchor `travel`, `leon:travel` | MISSING and **not needed**: the real home has no in-page anchor links (header and footer go to other pages; the skip link goes to `#contenu`). |
| `M.refresh` | MISSING; only needed if ScrollTrigger is used. |
| "Stop animations" | OK as a switch (`MotionSwitch`, `instant.ts`, `globals.css`); JS animations do not read it yet (section 5). |

### 2.2 Hero

| Prototype hook | Real element | Status |
| --- | --- | --- |
| `.nav__in` (nav settles) | `header.s-nav > .s-wrap.s-nav__in`; the logo already draws (`.s-brand path/circle/text`: `s-draw`, `s-dot`, `s-fade`, the founder's own idea). | Do not port the settle; the logo draw replaces it. |
| `[data-h1-line]` x2 | `.s-h1 .s-line > span` (clip via `overflow: clip`, `s-line` 600 ms, 80 ms apart). Under 1100 px `.s-line` is inline (rises without a mask, like the phone case). | OK, CSS. |
| `[data-sweep="hero"] [data-sweep-seg]` x3 | `.s-swp > i` x3 (`s-wipe` 260 ms at 520 / 740 / 960 ms). | OK, CSS (a wipe, not a hand-drawn wobble). |
| `[data-hero-lead]`, `[data-hero-cta]` | `.s-lead.s-top__lead.s-arrive` and `.s-top__cta.s-arrive` (`--i` 2, 3: 600 ms, 320 / 400 ms delay). | OK, CSS. |
| `[data-tabs]`, `[data-stage]` rise 24 px | One wrapper `div.s-arrive` (`--i` 4) around `HeroTabs`. | OK, CSS (one unit, not two). |
| `[data-tab-indicator]` sliding | None: `.s-tab[aria-selected]` swaps its background (150 ms). | MISSING: a `span` inside `.s-tabs` positioned with `--ind-l/--ind-r` set from `HeroTabs` (refs already there: `tabs.current[i]`), `transition: clip-path .42s`. |
| `#stage` | `.s-scene` (desk band), `role=tabpanel`, inside `HeroTabs`. | OK. |
| `#hero-answer` `.asheet` | `AnswerSheet` -> `div.s-sheet` (`DemoScene` column 1-7). | OK. |
| `[data-question]` | `p.s-answer__q` (strokes + query). | ADD `--k`/`data-k`. |
| `[data-sentence="k"]` (+ `data-n`) | **Not a node**: the answer is one `p.s-answer__text` with `span` text, `mark.hl.cN` and `.cite.cN`. | MISSING: group tokens per sentence in `AnswerText` (`parseAnswer` already knows each mark's following cite), or index each `mark.hl` / `.cite` pair (`style={{'--k': i}}`). Marks are source words only, so the unit is the mark, not the sentence (this is also what the founder asked for in feedback point 10). |
| `.hl` swept strokes | `mark.hl.cN` (`background-color`, `transition: background-color var(--fast)`). `kit.css` already has `.hl-arrive` + `@property --sweep` (900 ms) for `background-size` sweeps. | OK for the gesture; ADD per-mark delay and a wrapper trigger. |
| `[data-cite="n"]` chips | `button.cite.cN` (inline-flex, can scale) or `span.cite`. | OK, ADD `--k`. |
| `[data-flag="n"]` flags level with sentences | **None on the answer sheet.** Real flags exist only on pile documents (`span.flag.flag--left`). | MISSING by design: pop the `.cite` and the document flag instead; do not add side flags. |
| `[data-note="n"]` footnote rows | `ol > li > .s-note` (button or div, grid `auto 24px 1fr auto`). | OK, ADD `--k`. |
| `#pile > .doc[data-source][data-slot=top\|b1\|b2]`, `[data-docflag]` | `.s-pile > article.doc.cN[data-slot=0\|1\|2]` with `span.flag.flag--left`, inline `style="z-index:3-slot"`. Pile is `max-[1099px]:hidden`. | OK, ADD `--k`. |
| `[data-was]` over-pass | none | MISSING (a data attribute or class held 200 ms, see 3.1). |
| `.is-lit` linked pointing | none (only click via `onPick`; `.cite:hover` outline) | MISSING, not motion; cheap CSS `:has()` or a small state. Out of the motion scope, listed for the founder. |
| `.is-swapping` fade | none: `key` remount | n/a |

### 2.3 Rules

| Prototype hook | Real element | Status |
| --- | --- | --- |
| `section.rules#product[data-rules]` | `section.s-sec[aria-label]` > `.s-wrap` (in `Rules()`, server). | ADD hook. |
| `ol[data-rules-list]` (3 names) + `[data-rules-marker]` (3 x 32 px, moved 32 px per rule) | **None.** | MISSING: a client list (Cited / Not on record / Yours only: new en+fr copy), a marker, links that scroll to the rest unit. |
| `article.rule[data-rule=k]` x3 | `div.s-grid.s-rule3` x3 (`+ .s-rule3 { margin-top: 96px }`), no id, not `article`. | ADD `data-rule`. **Structure lacking: the list and the three rules must lie in one grid cell** (`grid-area: 1 / 1`, margin 0, same box height, `inert` on the non-current), and only the first fragment paints the desk, "Fictional example" shown once at the foot. Real `.s-rule3__frag` is its own padded desk panel, each with its own `figcaption.s-fict`. |
| `[data-rule-text=k]` | `.s-rule3__text.s-rv` (col 1-6). | ADD hook; remove `.s-rv` when pinned. |
| `[data-rule-frag=k]` | `figure.s-rule3__frag.s-rv` (col 6-13). | ADD hook; remove `.s-rv` when pinned. |
| `h2 [data-hmark=k]` | `h2.s-h2 > span.s-mark.cN` via `Marked` (inline, `z-index:-1`, static background). | OK to target; the draw needs `background-size` (an inline element cannot take `scaleX`), see 6. |
| Rule 1 fragment: `.asheet` + `.minis .mini[data-source]` x3 (mini documents landing) | `AnswerSheet` + `s-note` rows; **no mini documents** (`DemoScene pile={false}`). | MISSING objects. Cheapest faithful mapping: the `s-note` rows are the sources that "arrive" (rise + slide from the right, in order). Real mini sheets would be new markup and more words on the page: not recommended. Founder decision. |
| `[data-sentence]`, `.hl`, `[data-cite]`, `[data-flag]` inside | as in 2.2 | same |
| Rule 2: empty dashed flag `[data-flag="0"] .ef--wide polygon[data-draw]` + `.flag__label` | `svg.s-empty-flag` (polygon + dash path) and the `noSource` text in `Rules()`. The outline is **solid** here. | ADD `pathLength=1` on the polygon: it can be drawn with a plain `stroke-dashoffset` (the prototype needed a mask because its flag was dashed). |
| Rule 3: `[data-perm]`, `[data-switch]`, `[data-switch-thumb]`, `[data-perm-body]`, `.stamp` | `RightsSwitch`: `fieldset.s-switch` (buttons `aria-pressed`, background swap, no sliding thumb) + `div[aria-live=polite] > AnswerSheet key={view.id}`; stamp = `span.s-stamp` inside the private source's `s-note` row (`rotate: -2deg`). | ADD hooks; sliding thumb MISSING (small CSS if wanted). |
| `.rules.is-pinned` rules in `motion-rules.css` (grid overlay, `--pop`, `--land`, `--leave`, no hover fade) | none | MISSING (port as is, scoped). |
| Julie / Sophie by itself | `RightsSwitch` owns `index` privately. | MISSING control from outside (see 3.3). |

### 2.4 Developers

| Prototype hook | Real element | Status |
| --- | --- | --- |
| `section#developers[data-dev]` | `section.s-band.s-ink[aria-labelledby=assistant]` (`Developers()`, server). | ADD hook. |
| `h2[data-rv=1]` + `[data-hmark=1]` "dreaming" | `h2#assistant` plain text ("Give your AI assistant your team's context."). | MISSING mark; real copy has no "dreaming". |
| `.lead`, `dl.facts [data-fact=1..3]`, `.dev__line`, `.more` | `p.s-lead`, `ul > li.s-body` x3 (briefing, sessions, log), `ArrowLink`; no closing line. | OK / ADD. |
| `[data-story][data-step]`, strip `[data-dream]` with marker, `[data-story-step]` buttons, desk row with 3 sheets + thread, `[data-story-replay]`, evening and morning terminal bodies, 13 `[data-term-line]`, marks and source lines | **None of it exists. Real copy does not tell this story** (MCP: search, fetch, remember). | MISSING: new component with state `step`, new en+fr copy, new data. **A content decision for the founder, bigger than motion.** |
| `[data-term]` terminal | `div.s-term > p.s-term__bar + div.s-term__body[aria-hidden]` with 5 `p`: 3 prompt lines, a logos line (3 `ToolLogo`), a "saved" line. | ADD: lines printing (40 ms each) and the three logos popping are portable on today's content. |

### 2.5 Ambient

| Prototype hook | Real element | Status |
| --- | --- | --- |
| `[data-count="42"]` in the H2 | The number is inside the translated string `t('connTitle', {count})`. | MISSING: split with `t.rich` or a `<CountUp>` client island (server renders "42"). |
| `.marquee[data-marquee]`, `[data-marquee-row]`, `li.tool[data-clone]` | `div.s-marquee[aria-hidden]` > 2 x `div.s-marquee__row` (tools already doubled in the server markup, `s-roll` 42 s, row 2 `data-reverse`, paused on `:hover` / `:focus-within`). | OK, CSS. Differences: both rows 42 s (prototype 40 / 46: set `--dur`), hard stop instead of 0.42 s ease-to-stop, never paused off screen, tools have no swept stroke on hover (`.s-tool` has no hover rule), not focusable (decorative, `aria-hidden`; the footer switch covers WCAG 2.2.2). |
| `#conn-h`, `#brief-h`, `#sec-h` phrase wrapped by script | `h2 > span.s-mark.cN` already wraps the phrase in `Marked` for connectors (`connMark`) and briefing (`briefMark`); security heading `secTitle` has **no mark**. | OK x2, MISSING x1 (no mark in `Security()` today). |
| `[data-memo] [data-line]`, `[data-chip]` | `div.s-memo.s-sheet`: title `p`, per part `h3.s-small` + `ul > li` with `span.num.cN`. | ADD `--k` (or select `.s-memo > p, h3, li`); chips = `.num`. |
| `li[data-check] path[data-draw]` | `.s-facts li svg.s-check path` (`pathLength=1`, `stroke-dasharray:1` already in CSS), `CheckMark` / `ProgressMark` in `page-hero.tsx`. | OK: draw is `stroke-dashoffset 1 -> 0`. |
| `[data-sweep="close"]` stroke under "on record." | `CtaBand` in `parts.tsx`: `h2.s-h2` with `taglines.dit`, **no `mark` passed** from `HomeSignal`. | MISSING mark (pass `mark` and `tone={4}`). |
| `.close__form .signup` sheet landing | The real band has two pills, no form. | n/a, do not port. |
| `.foot .foot__grid > *` (5 blocks) | `footer.s-ink.s-foot > .s-grid.s-foot__grid`: brand `div`, `nav` (4 columns), `.s-foot__base`. | OK, ADD hooks (3 blocks, or the 4 column `div`s). |
| Control feedback | Pills: arrow 2 px + press .97 present; `.s-more` arrow 3 px present; footer underline is a colour fade; no nav underline growing, no keyboard arrow move. | Small CSS, optional. |

## 3. The page logic the motion leans on

### 3.1 Question switch and source selection (hero)

Today (`hero-demo.tsx`, `demo-card.tsx`):
- `HeroTabs` (client): `const [index, setIndex] = useState(0)`; `demos` = home demos minus `inconnu`; `tabs` refs; arrows call `go(i)` which does `setIndex` and focuses; `DemoScene key={demo.id}` **remounts** everything on a question change; the tabpanel `aria-labelledby` follows `demo.id`.
- `DemoScene` (client): `const [active, setActive] = useState(1)`; `shown = min(active, sources.length)`; `onPick = setActive` goes to `AnswerSheet` (cite buttons, `s-note` buttons) and `Pile` (computes `slot = (i - (active-1) + count) % count`, renders slots 0-2, `style.zIndex = 3 - slot`, `data-slot`). A second `DemoScene` lives in rule 1 (`pile={false}`) with its own state.
- `Leon.hooks.scenario(detail, commit)` = `HeroTabs` `setIndex`; `Leon.hooks.select` = `DemoScene` `setActive`; `Leon.state.top` = `active`. There is no event bus, no `commit()`.

Where the motion must hook in:
- **Build on mount (demo, and each new question).** Because the scene remounts on `key`, a mount-time animation replays for free. Do it as CSS (preferred): `DemoScene` root gets a class and `--k` indexes on question / marks / cites / notes / docs, and each item has `animation-delay: calc(var(--k) * 450ms + base)`. No JS, no flash, whole without JS, stops under `data-motion=off` by the global rule. Pace 0.7 s on a question change vs 0.45 s on load = a `data-pace` attribute or a class set by `HeroTabs` (it knows whether this is the first render).
- **Leave (0.2 s) before the swap.** In `HeroTabs`: one `choose(i)` used by `onClick` and by `go(i)`: if motion is off, `setIndex(i)`; else set `data-leaving` on the scene (CSS: answer content -8 px + fade, sheets +48 px, 0.2 s), then `setIndex(i)` on `animationend` or a 200 ms timer; a second call replaces the pending one (keep one ref; "last one asked comes in"). Optional: dropping the leave phase loses 0.2 s of polish, not the gesture.
- **Selection (Flip).** In `DemoScene.pick(n)`: set `data-was` on the three docs (`z-index` per old slot, via CSS) for 200 ms, add `is-pulling` on the chosen doc (CSS keyframe: x +14%, then back), then `setActive(n)`; the existing `translate`/`rotate` transitions do the travel (they already run 420 ms). Real FLIP (measure First in `pick`, Last/Invert/Play in `useLayoutEffect([shown])`) is only needed if the CSS version looks different from the film; keep `transition: none` on the sheet while FLIP runs (same trap as in the notes).
- **Tab indicator.** `useLayoutEffect([index])` in `HeroTabs` reading `tabs.current[index].offsetLeft/offsetWidth` into `--ind-l/--ind-r` on `.s-tabs` (and on resize / fonts ready).

### 3.2 Linked pointing

Prototype: `site.js` toggles `.is-lit` on all `[data-n]` of the pointed link. Real: no equivalent. It is hover/focus styling, not motion; list it, do not bundle it into the motion port.

### 3.3 Julie / Sophie (rule 3)

Today `RightsSwitch` (client) holds `index` privately and renders **only the chosen view** (`AnswerSheet key={view.id}`); Sophie's answer never contains Julie's email. The scroll-driven switch to Sophie at unit 25 (and back) needs state control from a parent: make `RightsSwitch` controlled (`value`, `onValueChange`), and let a new client parent (`PinnedRules`, which also owns the pin, the list and `current`) call it when the scroll crosses the threshold; a user click sets it directly and "holds until the scroll next crosses unit 25" (the prototype's `wanted`/`track` logic). The change animation wraps the swap: leaving (email slides off, answer fades) then `setIndex`, then arriving (swept marks, flag drawn, ticket travels) in a `useLayoutEffect([view])`. Keep the React state swap: do **not** render both views and cross-fade (it would put the private email in Sophie's DOM).

### 3.4 Server / client split

`Hero()`, `Rules()`, `Connectors()`, `Briefing()`, `Developers()`, `Security()` are server components (next-intl `useTranslations`). New client islands needed: `PinnedRules` (wraps the three server-rendered `Rule` children, owns the list, `current`, `view`, pin), a tiny `InView` (adds `data-in` once) or one `HomeMotion` effect that queries data hooks, `CountUp`, `DevTerminal` (printing) and, if the story is wanted, `DevStory`. Children passed as props keep the server HTML.

## 4. Pre-hidden states: no flash, and a page that is whole without JavaScript

Prototype: inline `<head>` script -> `html.js-motion`; each module hides only what it animates (`opacity:0`, plus `animation: var(--failsafe)`); `core.js` removes `js-motion` and each module sets its inline first states in the same task, so no frame is wrong. No JS, or reduced motion, or a library that fails: nothing hidden (3 s failsafe covers a late core).

In Next:
1. **Where the class is set.** `THEME_SCRIPT` in `src/app/layout.tsx` already runs before first paint and already reads `leon-motion`. Add to it: if `!matchMedia('(prefers-reduced-motion: reduce)').matches` and `leon-motion !== 'off'`, `d.classList.add('js-motion')`. `<html>` has `suppressHydrationWarning`, so a class added before hydration is not an error. No JS = no script = no class = nothing hidden: the SSR HTML is whole (`real-nojs` film).
2. **Where the rules live.** In `site.css`, scoped `html.js-motion .s-root [data-m] { opacity: 0; animation: leon-failsafe 1ms linear 3s forwards }` for exactly the nodes a JS sequence will own, never for what CSS already animates.
3. **The hand-over.** A client effect (`useLayoutEffect`, runs after hydration, before paint) removes `js-motion` and sets the first inline states in the same task, then plays. `useLayoutEffect` also covers client-side navigation back to `/accueil` (React renders on the client, no SSR paint, no `js-motion`): first states are set before paint, no flash. React 18+ Strict Mode runs effects twice in dev: the setup must be revertable (`gsap.context().revert()` or an `AbortController` + clearing inline styles).
4. **The Next-specific danger: hydration time.** The SSR HTML is painted before hydration; in `next dev` the film shows the CSS entrance already finished at the `load` event (more than 1.6 s). A JS sequence that starts at hydration would show a finished hero, then hide it and replay it. Therefore:
   - keep everything CSS already does as CSS (hero lines, strokes, lead, pill, tabs+stage block): it starts at first paint, with no dependence on hydration;
   - stage the demo **in CSS** (animation delays, section 3.1), so it also starts at first paint with the page, not after hydration;
   - pre-hide with `js-motion` only what JS must own (pin, story, count-up, terminal), and keep the hero visible (the headline text is the LCP element; do not hide it).
5. **Triggers for "once, when it enters".** Cheapest pattern that stays whole without JS: JS only flips a switch (`data-in` on the element via `IntersectionObserver`, or Motion `inView`); the keyframes are CSS, gated by `html.js-motion .x:not([data-in])`. Under `data-motion=off` the global `animation: none !important` already shows the end state.

## 5. Reduced motion, "Stop animations", touch, widths

Real rules: `globals.css` sets `animation: none !important; transition-duration: .01ms !important` under `[data-motion="off"]` and `prefers-reduced-motion`. That reaches CSS only. `instant.ts` exports `useInstant()` (system preference or switch, reactive through `useSyncExternalStore`), `isInstant()`, `motionOff()`.

| Case | Prototype | Real page must |
| --- | --- | --- |
| `prefers-reduced-motion` | `M.ok` false, no `js-motion`, Lenis off, nothing runs; page static. | Same: do not add `js-motion`; JS effects check `isInstant()` and return; CSS entrances already off. |
| Footer "Stop animations" (`data-motion=off`) | Not in the prototype. | Same as reduced motion **and live**: when `useInstant()` flips to true, every JS animation must be killed and reverted (inline styles cleared, pin torn down: the page gets about 1,700 px shorter, so re-measure), the marquee already stops (CSS). Flipping back to off: re-run the effects, or accept "applies on next load" for the pin. Needs the effect to depend on `useInstant()`. |
| No JS | Static page, 3 s failsafe irrelevant. | Same; SSR HTML whole. |
| Touch / `(hover:none) and (pointer:coarse)` | No Lenis (native scroll); pin still on at >= 1024 px with `scrub: 0.42 s` catch-up; the hero skips on `pointerdown` / `keydown`, the developers story only on `click` (a finger scrolling must not cut it); no `:hover` states. | Same: no smooth-scroll library, so nothing to switch off; pin by native `position: sticky` works with touch scrolling; the 14% "pull" and `.is-lit` hover have no touch role; `.cite` / `s-note` taps still call `onPick`. |
| 1024 px and wider | Rules pinned if one rule fits. | Real rule heights are 424 / 337 / 433 px at 1512 x 771 and 455 / 368 / 433 at 1280 x 800 (room under the 72 px bar: 699 / 728): fits, pin it. Rule `h + 32 > room` -> stacked. |
| 700 to 1099 px | Stack, pile shown from 1100 only in the real page. | Hero: no pile (`max-[1099px]:hidden`): the demo plays on the answer sheet alone; selection motion needs `pile.offsetParent` check. Rules stacked (below 1024) with the entrance only. `.s-line` inline: the headline rises without a mask. |
| Under 700 px (390 x 844: rules 633 / 546 / 634 px, page 7,734 px) | Everything stacked, phone bottom sheet. | Stacked; no pile; rows stay one column; marquee still rolls; count-up and ticks are viewport-triggered so nothing animates out of sight. |
| Resize / late fonts | `rebuild` (revert, measure, build). | Same, with a `ResizeObserver`; avoid layout reads while scrolling. |

## 6. What the real page already animates in CSS: keep, remove, or watch

| Real animation | Where | With the port |
| --- | --- | --- |
| `s-draw`, `s-dot`, `s-fade` on `.s-brand path / circle / text` | Header logo (once, 600 ms + 260 + 360). Founder's idea, not in the prototype. | **Keep.** Do not add the prototype's nav settle. |
| `s-line` on `.s-h1 .s-line > span` | Headline (600 ms, 80 ms apart, clip). | **Keep.** Equivalent to hero 0.05 / 0.13. Porting the hero JS would play it twice. |
| `s-wipe` on `.s-swp > i` | Three strokes under "Source included." (260 ms at 520 / 740 / 960 ms). | **Keep** (no Rough Notation: same gesture). |
| `s-arrive` (+ `--i`) | Lead, pill block, tabs+stage block. | **Keep.** The JS port must not also fade `[data-tabs]` / `[data-stage]`. |
| `s-land` on `.s-pile > .doc[data-slot="0"]` | Plays at mount **and** every time a doc becomes top. | **Keep as the selection landing** if the CSS route is taken; **remove** if a JS/Flip route handles selection, and replace by a per-doc delayed landing for the staged demo (otherwise the top doc lands once on mount, 0.4 s too early). |
| `.s-pile > .doc` transitions on `translate`, `rotate`, `opacity` (420 ms) | Pile slots. | **Keep.** It is already the sheet travel; Flip would need `transition: none` while it runs. |
| `.s-rv` with `animation-timeline: view()`, `entry 0% -> entry 60%` (`s-arrive`, scroll-linked, guarded by `@supports`) | 14 nodes: rule text and fragments, connectors head, briefing, developers, security, close. | **Mostly keep**: it is the entrance of the ambient module in a scroll-linked version (20 px + fade); it plays zero times in browsers without view timelines. **Remove from any node a JS or timed sequence owns** (pinned rules text and fragments, dev story fragment), because a CSS animation overrides inline `transform` / `opacity` while its range runs: it would play twice and fight the scrub. For timed gestures that must start once (count, memo lines, ticks, terminal) the wrapper's `.s-rv` is harmless (parent fades while children play) but pick one trigger per element. |
| `s-roll` on `.s-marquee__row` (42 s, reverse on row 2, paused on hover and focus-within) | Connectors rows. | **Keep.** Tweak: `--dur` 40 s and 46 s; optional ease-to-stop. Not paused off screen (performance only). |
| `s-fade` on `.s-menu[data-state=open]` | Use-cases menu. | Keep. |
| `.hl { transition: background-color var(--fast) }` | Marks. | **Watch**: the prototype's own known blink: when a sweep ends and hands back to the plain background, the 160 ms colour transition replays. Use `transition: none` while sweeping (`#stage.is-playing .hl` in the prototype). |
| `.s-tab` colour transition 150 ms; `.s-switch button` colour transition | Tabs, switch. | Keep; the sliding indicator / thumb are additions, not replacements. |
| `.s-btn` arrow 2 px + press `scale: .97`; `.s-more` arrow 3 px | Pills, arrow links. | Keep. |
| `.strokes i` transitions (kit.css) | The three strokes in `s-answer__q`, `s-memo`. | Keep. |

## 7. Libraries

What each module needs, and whether it can go "without changing what is seen". "Motion" = the `motion` 14.5.0 package already in `package.json` (vanilla exports `animate`, `scroll`, `inView`, `stagger`, `hover`, `press`, `spring`, checked in `node_modules`; `motion/react` is what the app uses).

| Library | Used by | Needed for | Can it go | Replacement |
| --- | --- | --- | --- | --- |
| GSAP core 3.13 | hero, rules, dev, ambient, core | Every tween and timeline: headline, sweep, flag pop, sheet land, count, memo lines, story timeline, scrubbed rules timeline. | **Mostly.** The gestures are opacity / transform / `--sweep` / `stroke-dashoffset`. Hero demo, entrances, memo, ticks, marks, terminal printing: CSS keyframes with `animation-delay`. Count-up, story, leave phase: Motion `animate()` (animates CSS variables and sequences). | CSS + Motion. GSAP stays only if the pinned scrub proves too fiddly with Motion `scroll()`. |
| ScrollTrigger | rules (pin + scrub, the only real need), core (`onEnter`, refresh, anchors), dev and ambient (`top 82%` entrances, off-screen pause) | Pin, scrub, once-on-enter triggers. | **Yes**, with work. Pin = CSS `position: sticky` in a tall wrapper; scrub = Motion `scroll(animation, { target, offset })` or a `scroll` listener feeding `animate` progress; once-on-enter = `IntersectionObserver` / Motion `inView`. `main` has `overflow-x: clip` (does not break sticky; `hidden` would). | Sticky + Motion `scroll()` / `inView`. The prototype's `frozen` / `slide` / travel code (about 70 lines) disappears: no in-page anchors on the real home. |
| Flip | hero only (the pile) | Three sheets travelling to new slots, chosen one over the others. | **Yes.** Slots already transition in CSS; add `data-was` and the 14% pull in CSS (3.1). | CSS transitions already in `site.css`; Motion `layout` projection is the fallback. |
| SplitText | nothing (registered in `core.js`, never called) | none | **Yes, drop.** | none |
| Lenis 1.3.4 | core | Inertial scroll, smooth scrub, anchor travel. | **Yes, without changing the choreography** (what changes: the scroll feel; the scrub follows the wheel steps; add a small catch-up if wanted: GSAP `scrub: 0.42` is the equivalent, in Motion a `spring` on progress). Native scrolling is also what the real site uses everywhere else. | none |
| Rough Notation 0.5.1 | core `M.rough`: 3 hero strokes, 7 headings (rules x3, developers, connectors, briefing, security) + close | Hand-drawn highlighter (slightly irregular, 0.2 to 0.52 s). | **Yes**, with a visible but small change: a straight left-to-right wipe instead of a rough hand stroke. Heading marks are inline spans: animate `background-size` on a gradient with the registered `@property --sweep` (already in `kit.css`) so multi-line wrapping keeps working; hero strokes are absolutely positioned `<i>` and already use `scaleX` (`s-wipe`). | CSS (`--sweep`, `s-wipe`). |

### Licences (as the packages state them)

| Package | `npm view license` | Licence text | Commercial product? |
| --- | --- | --- | --- |
| `gsap` 3.13.0 (core, ScrollTrigger, Flip, SplitText are all in this package) | `Standard 'no charge' license: https://gsap.com/standard-license.` (same on 3.15.1, the latest) | The 3.13.0 tarball ships **no LICENSE file** (README, package.json, source; file headers: "Copyright 2025, GreenSock. All rights reserved. Subject to the terms at https://gsap.com/standard-license"). The page (effective 30 Apr 2025, last modified 30 May 2025, Webflow): non-exclusive worldwide licence to use GSAP "on any website, web application, or digital interface"; **prohibited**: use in tools that let people build visual animations without code and compete with Webflow's animation building, or reverse engineering to make a competing product; keep notices; Webflow may terminate if terms are broken; Webflow may amend the terms (earlier versions stay under their earlier terms); it is incorporated in Webflow's Terms of Service. FAQ: "Commercial usage is covered under the standard license. All of GSAP including the plugins that were formerly 'members-only' like SplitText and MorphSVG can be used in commercial projects at no charge." The old "Plain English Summary" (end users must not be charged) is **commented out** in the page source. | **Yes**: Leon is not a visual animation builder, so the use is permitted. It is not an open-source licence (source-available, editable by the owner, termination clause). Read once by me, not legal advice; if GSAP is adopted, the founder may want it checked. |
| `lenis` 1.3.4 (1.3.27 latest) | `MIT` | `LICENSE`: "The MIT License, Copyright (c) 2024 darkroom.engineering". | Yes. |
| `rough-notation` 0.5.1 | `MIT` | `LICENSE`: "MIT License, Copyright (c) 2020 Preet Shihn"; no dependencies (its own drawing code). | Yes. |
| `motion` 14.5.0 (already in the repo; `framer-motion` 14.5.0, `motion-dom` 14.5.0 also `MIT`) | `MIT` | `LICENSE.md`: "The MIT License (MIT), Copyright (c) 2024 Motion B.V." | Yes. |

Weights (minified / gzip, from the tarballs): gsap 72.4 / 28.2 kB, ScrollTrigger 44.2 / 17.8, Flip 25.0 / 9.6, SplitText 7.2 / 3.4, Lenis 16.4 / 4.7, Rough Notation 10.8 / 4.0. About 176 kB / 68 kB for the whole prototype stack, loaded from CDNs; the real site would bundle what it uses.

**Recommendation: no new dependency.** CSS (keyframes, `@property --sweep`, `animation-timeline: view()` already used, `position: sticky`) + `motion` (already installed) cover every gesture; what is lost is Lenis' scroll feel and Rough Notation's hand wobble. If one is wanted back, Rough Notation (MIT, 4 kB) is the smallest, harmless one. Adding GSAP + ScrollTrigger is legal for Leon, but it is a new dependency (the port's brief forbade them), a non-OSS licence, and it brings the `translate` / `rotate` folding trap the notes describe, with this repo's kit built on individual `translate` / `rotate` / `scale` properties (`.s-pile .doc`, `.s-stamp`, `.s-btn:active`). Motion's behaviour with those properties is **not verified** here.

## 8. Risks, and the order in which to port

### Risks

1. **Content, not just motion.** The developers story (Evening / Night / Morning, sheets, thread, `codex` terminal), the rules' list of names, the mini documents, the "dreaming" mark, the security-heading mark and the sign-up sheet at the close do not exist in the real page or its copy (`messages/en.json`, `fr.json`). Each is a founder decision plus new en/fr strings; do not port them silently. Today's developer band is about the MCP server.
2. **Hydration flash / LCP.** Pre-hiding the hero until hydration hides the page's main content for the duration of hydration plus fonts (the failsafe waits 3 s; dev compile is slower). Keep the hero and the headline visible, stage the demo in CSS, pre-hide only what JS owns (section 4).
3. **Double play.** Real CSS animations (`s-arrive`, `s-rv`, `s-land`, transitions) plus a JS port = twice; and a running CSS animation overrides inline `transform` / `opacity`. Remove `.s-rv` / `s-arrive` / `s-land` from nodes JS owns (section 6).
4. **JS ignores `data-motion=off`.** The global CSS rule does not stop a tween, a scroll listener or a pin. Effects must read `useInstant()`, revert on change, and re-measure the page (pin height, about 1,700 px).
5. **React owns the DOM.** `key` remounts (question, view), controlled switch, Strict Mode double effects, `useLayoutEffect` before paint, inline styles written on React-managed nodes. Never write `innerHTML`; every setup must be revertable; kill tweens before a `key` remount (the old nodes disappear).
6. **Rule 3 privacy.** Sophie's DOM must never hold Julie's email: keep one view rendered at a time (3.3).
7. **Pin geometry.** Fixed 72 px bar, `.s-sec` padding, `main` `overflow-x: clip` (keep it `clip`, not `hidden`), rule heights 337 to 633 px depending on width, three differently tall fragments stretched into one panel (rules 2 and 3 leave about 190 px of empty desk in the prototype, real rule 2 is 337 vs 433 px tall), pin only when a rule fits. Header links and the skip link are the only anchors; `#contenu` must still work.
8. **Prototype defects not to copy:** the 160 ms `.hl` colour fade blinking after a sweep (real `.hl` has the same transition); the 3-line heading at 1024 to 1099 px when pinned; "Source included." strokes at 0.2 s vs Rough Notation's advised 0.45 to 0.6 s; GSAP transform folding; the story terminal taller than the window at 900 px.
9. **Scroll-driven CSS support.** `.s-rv` and any new `view()` / `scroll()` timelines are `@supports`-guarded; Firefox without them shows the final state (acceptable, and equal to today). `@property --sweep` is registered in `kit.css`; the sweep falls back to the plain stroke if unsupported.
10. **Untested everywhere:** Safari, Firefox, a real touch device, a real trackpad, a screen reader (same list as the prototype's notes). The two filmed stills only show Chrome headless at 1512 x 771.
11. **Two hero-like scenes.** `DemoScene` is mounted twice (hero, rule 1), each with its own `active`; hero-only logic must be scoped to the hero instance.

### Order (what gives the founder the most of what he saw, first)

1. **Scaffolding (small).** `js-motion` in `THEME_SCRIPT`, `leon-failsafe`, a `useInstant`-aware helper, an `InView` flag, the `--k` hooks in `AnswerText`, `Pile`, `AnswerSheet`. Everything below depends on it.
2. **Hero demo and question switch (medium).** First thing he opened and the biggest gap on the first screen: staged question -> marks swept -> numbers pop -> notes -> documents land, replay on question change (leave phase), sliding tab indicator, selection pass-over. Mostly CSS; no hydration dependency.
3. **Ambient, one by one (medium, many small wins):** heading marks drawn (7 places, one CSS gesture), count 0 -> 42, memo lines writing, ticks and rings drawing, footer and close rise, marquee 40 / 46 s and ease-to-stop, tool stroke, control feedback.
4. **Rules pinned (large).** The signature gesture: `PinnedRules` (list, marker, one-cell grid, pin, scrubbed timeline, controlled `RightsSwitch`, Sophie at unit 25). Depends on the founder's answer about mini documents (otherwise the `s-note` rows are the arriving sources).
5. **Developers (small then large).** Terminal printing and logo pop on today's five lines (small); the three-step story only after the founder decides it belongs in the real copy (large: new component, new strings, new data).

Effort estimates in the structured summary assume the no-new-dependency route.
