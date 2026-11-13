# Leon « Papier » v2 — the home page only (the founder's go / no-go)

Read `common.md` first for the product, the founder's complaints, the voice and the demo data. Then this file, which
replaces `b.md` and overrides `common.md` wherever they differ (type, colours, sections, motion, page length).

## Where we are

Two prototypes were shown to the founder. He dropped version A and kept the idea of version B « Papier ». His words
(translated): "Keep only the Papier version. Add animations: animation is the basics, it matters a lot here. Organise
the elements better. The site must be modern, that is very important: an ultra-modern spirit. What you did with the
highlighter and the demos is rather good as an idea. Show me the home page first; I will decide whether I like it
before you do the rest."

So this round is ONE page: the marketing home, in `prototypes/refonte-2026-11/papier/`. It decides everything.
Version 1 is in `prototypes/refonte-2026-11/b/` (read `b/index.html`, `b/css/site.css`, `b/js/site.js`, `b/NOTES.md`
to see what he saw). `papier/css/tokens.css`, `papier/css/ui.css` and `papier/js/demo.js` are copies of version 1's
system: starting material you may rewrite freely. Do not edit anything in `b/` or `shared/`.

Why version 1 read as not modern, in the art director's judgement: a Times-like serif for the headline and the
answers; the headline shut inside a sheet of paper; a grey page; a third of the hero sheet empty; navigation links
floating in the middle; sections with dead space; almost no motion. It looked like a document, not like a product.

## Update 2 from the founder: sell the developer story

His words, given while this pipeline was running: "Do not forget something very important: how it works for
developers. It is a big commercial argument: working with agents, the ones that do dreaming and so on. We must sell
that well too. Many people at Anthropic talk about this problem, and we solve it."

Background (a talk on agent memory by a member of Anthropic's applied AI team, given to us to understand the
problem; do not quote it, name it or suggest any endorsement on the page): every session starts with a new context
window; an agent only sees its own session, so it repeats mistakes and cannot see what happened in other sessions or
other tools; shared memories go stale or wrong, so they need permissions and provenance; memory should follow you
across tools; and the best systems add a pass between sessions, called dreaming, that rereads past sessions and
prepares better context for the next ones.

What Leon really does. Only these facts may be claimed:
- At the end of each coding session, Leon receives the exchanges and what the session did (files written, branch,
  commits, pull requests, task list). Secrets are masked before sending and again on the server. A session is
  private to its author.
- Between sessions, on the server, Leon prepares a morning briefing for the project from those sessions, the
  repository, the tickets and the messages that mention you: what you did, what changed, what is still open, 250
  words at most, each line with its source.
- At the start of each session, the agent receives your recent sessions on this repository (up to four over seven
  days, whatever the tool) and that briefing, added to its context.
- It works with Claude Code, Codex, Cursor and Antigravity. One command installs it, and you approve what is sent.
- Your own assistant can also query Leon with your permissions (search, open a source, get the briefing, save a
  note); each source it opens in full is logged.
- Leon never rewrites what happened: the record is kept word for word and every line cites where it comes from.
Do not claim: that teammates' sessions are shared (they are private to their author), that agents write to a shared
memory, any speed, cost or accuracy figure, or anything about Anthropic. Naming the four coding tools is allowed
here, as compatibility facts: it is the one exception to "no assistant names".

## Update 3 from the founder: dreaming and shared memory, up front

His words after reading the first proposal for the developer section: "Yes, talk about dreaming, it is super
important! And talk about shared memory, of course." Section 5 below is rewritten accordingly: both words are in its
heading.

Checked on the main branch today, so that the page only says what the product does:
- Built: sessions from the four coding tools are captured and filed by work thread, together with the pull requests,
  tickets and tool content they relate to; Leon writes a summary of each session after it ends; the state of a
  thread and notes are versioned (nothing is rewritten); the morning briefing is prepared in advance on the server;
  the start block hands over the last sessions and the briefing; what the team's tools contain is shared with the
  team, with the visibility each connection's owner chose, and a person's sessions are private to that person;
  every read goes through that person's permissions; any assistant can also query Leon over MCP.
- Not built yet, so never claimed: lessons that the dream proposes and a person accepts or rejects; a team-wide
  dream; the agent reading a thread by command; teammates' sessions shared with the team.
"Dreaming" on this page therefore means exactly this: between sessions, Leon rereads what happened, files it,
summarises it and prepares the next session. Do not write that Leon "learns", "improves the agent" or "proposes
lessons", and give no speed, cost or accuracy figure.

## Update 4 from the founder, after seeing the static page

His words: "At first sight it looks rather good. We will have to see what the animations give. For the connectors I
would see a kind of loop where it moves forward, passes and comes back, over all the connectors. For the agent
part I hope it is enough: we need to see the animations, and the person must really understand how it works. And
for security, instead of 'Not yet' we can put 'In progress'."

What changes (the static page on disk still has the earlier wording: whoever works on the page first applies this):
1. Connectors. The moving rows are a seamless, endless carousel of all 42 connectors: the list wraps around, so when
   the last tool leaves the first one follows, with no gap and no jump. Two rows, opposite directions, slightly
   different speeds, edge to edge, each tool with its logo and its name. Pause on hover and on focus; the tool
   under the pointer takes one highlighter stroke. Under reduced motion: the static wrapped grid.
2. Developers. The visitor must understand how it works, not just see something move. The dreaming strip becomes a
   small story in three steps, each with one plain caption, played in order when the section enters; each step is
   also a button that shows its state again, and a text button "Replay" plays the whole story.
   - Evening. Caption: "A session ends. Leon keeps what was said and done." The terminal (title "claude ·
     kestrel/app") shows the end of a session, with the facts of the first session in the data ("PR #482 updated ·
     3 commits · 4 files"), and three small sheets leave it.
   - Night. Caption: "Leon dreams: it rereads the sessions, files them by thread, writes the summary and prepares
     the briefing." The three sheets slide into the pile of the thread "fix/export-pagination", their flags pop.
   - Morning. Caption: "The next session starts, in another tool, already up to date." The terminal's title
     becomes "codex · kestrel/app" and it prints the context block line by line, then the three coloured source
     marks pop.
   Six seconds at most for the whole story, skippable by any click or key. Without script and under reduced motion
   the section shows the Morning state, with the three captions readable as a list.
3. Security. The heading becomes "What is in place, and what is in progress." The second list is titled "In
   progress" and its items are written as work under way: "SOC 2 and ISO 27001" · "Mirroring each tool's own
   permissions" · "Data export". Their marks are half-drawn circles (in progress), not empty ones.

## Update 5 from the founder, while trying the animated page

His words: "There is one more thing you must review. When you click the buttons at the top, it gets a bit
disorganised, because the animations go very fast, maybe much too fast. You have to look at all that."

Two things match "the buttons at the top". Review and fix both; QA tests both, on film and by script.
1. The navigation links (Product, Connectors, Developers, Security, Pricing, and the footer links). A click makes
   the page travel through sections it does not stop at, so their entrances, the pinned rules and the developers'
   story all fire in passing, at speed. Required: an anchor jump is one calm move of a fixed length, 0.9 to 1.2
   seconds whatever the distance, ease in-out. While it travels nothing plays along the way: the sections it passes
   are put straight into their final state (entrances done; the pinned rules neither hold the travel nor scrub
   visibly; the developers' story does not start unless it is the destination). On arrival only the destination
   plays its entrance, once, and the heading of the destination ends just under the navigation bar. Going back up
   is just as calm.
2. The three question tabs above the demo. Changing question must read as one ordered sequence, not a flurry. The
   outgoing sheets leave together (200ms), then the new answer builds at the same pace as the first play, not
   faster: the earlier rule "one and a half times the speed" is withdrawn. One sentence at a time, each with its
   sweep, its flag and its document, nothing overlapping the previous step. A second click during the sequence
   jumps cleanly to the end state of the newly chosen question: never two sequences at once, never a half-built
   pile, never a flag left behind.
Then watch the whole page at normal speed for pace: where a group of gestures feels rushed, widen the stagger
between the gestures rather than slowing each one (the three durations of the core stay).
QA: click every navigation link from the top of the page and from the bottom and film the travel with a frame every
100ms; click the three tabs in quick succession (150ms apart) and check the end state.

## What stays: the soul

- Provenance in colour. Each sentence of an answer is marked with the highlighter colour of the document it came
  from. Source n always has colour n: on the sentence, on its flag, on its document. The number is always there too.
- The page-marker flag: a small tab with a V notch, sticking out of the edge of a sheet. A real button.
- Documents as sheets you can open at the passage; the pile of sources beside the answer.
- The three demo questions, the "no source" answer as a designed state, the Julie / Sophie permissions switch.
- The shared demo data (`../shared/demo-data.js`), the logos, the "Fictional example" note, the honest voice.

## What changes

### 1. Type: modern, one voice for Leon, one for the originals
Schibsted Grotesk (Google Fonts, 400, 500, 600, 700) for everything Leon says and for all interface text: headline,
headings, answers, navigation, buttons, labels. STIX Two Text (400, italic 400) only for the words of an original
document shown word for word (the lines of a meeting, the body of a note or an email). Leon speaks in sans; the
record speaks in serif. Nothing else.
H1 56px/600, tracking -0.03em, leading 1.04, two lines at most (phone 32 to 34px). H2 40px/600, -0.025em, leading 1.08
(phone 28px). Lead 18px/1.5. Body 16px/1.55. Small 13.5px. Answers in the demos 20px/1.5 (phone 17px). Interface text
in fragments 14px (13px minimum). Five sizes at most outside fragments.

### 2. Canvas: white, crisp, with ink
```
--ground: #FFFFFF;   /* the page */
--desk: #F1F1EE;     /* the stage bands where sheets lie */
--desk-2: #E6E6E1;   /* idle tabs */
--sheet: #FFFFFF;
--ink: #0F0F0D;  --ink-2: #5B5B55;  --line: #E2E2DC;
--m1: #FFB0D4;  --m2: #A4F2BE;  --m3: #A6D2FF;  --m4: #FFD48F;   /* highlighters, source 1 to 4 */
--f1: #FF6FB0;  --f2: #44D98A;  --f3: #5AAEFF;  --f4: #FFAD3D;   /* flags, ink text on them */
--ok: #1F7A4D;  --danger: #B42318;
```
The page is white. Sheets are white with a 6px radius, a 1px `--line` edge and the one allowed shadow
(`0 1px 0 rgba(15,15,13,.05), 0 16px 28px -16px rgba(15,15,13,.22)`); they lie on `--desk` bands that run edge to
edge. Two bands are full ink (security, footer). Colour appears only as highlighter strokes and flags, never as a
panel or a button fill. Buttons are ink pills (fully round), 48px tall on the page, with a small arrow that moves on
hover; the secondary button is an ink outline pill. No gradients, no glass, no glow, no blur.

### 3. Organisation: one strict grid, nothing left empty
A 12-column grid, 48px outer margins at 1440 (24px at 768, 16px at 390), content 1344px wide at most, 24px gutters.
Every section uses the full grid: when text sits on one side, the other side holds its fragment. No sheet is taller
than its content. No blank stretch taller than 300px. 140 to 180px between sections on desktop (88 to 112 on a phone).

### 4. Motion: a real motion system (see the last section), built with open-source libraries

The founder's word, given after this pipeline started: "there are plenty of good open-source things on GitHub for
animation, use them." This supersedes any library or version named elsewhere in your instructions. Use these three.
All are free and open source, all were checked today and answer 200. Pin the versions, load them with `defer`.

- **GSAP 3.13.0** (greensock/GSAP), from cdnjs: `https://cdnjs.cloudflare.com/ajax/libs/gsap/3.13.0/gsap.min.js`, and
  beside it `ScrollTrigger.min.js`, `Flip.min.js`, `SplitText.min.js` (SplitText is free since 3.13). The one timeline
  engine for everything choreographed: the load sequence, the pinned rules (pin and scrub), Flip for the pile,
  SplitText for the H1's lines.
- **Lenis 1.3.4** (darkroomengineering/lenis, MIT): `https://unpkg.com/lenis@1.3.4/dist/lenis.min.js` and
  `https://unpkg.com/lenis@1.3.4/dist/lenis.css`. Smooth, inertial scrolling for the whole page, synchronised with
  ScrollTrigger (`lenis.on('scroll', ScrollTrigger.update)`, drive `lenis.raf` from `gsap.ticker`,
  `gsap.ticker.lagSmoothing(0)`). Anchor links go through `lenis.scrollTo`. Off under reduced motion. Native
  scrolling stays on touch screens.
- **Rough Notation 0.5.1** (rough-stuff/rough-notation, MIT):
  `https://unpkg.com/rough-notation@0.5.1/lib/rough-notation.iife.js`. A highlighter that draws itself like a real
  marker stroke, slightly irregular. Use it for the headline-scale highlights only: "Source included." in the H1
  (three strokes in sequence, pink, green, blue: an annotation group), "on record." in the close, and at most one
  highlighted phrase per section heading as it enters (rotate the three colours). Start from: type `highlight`,
  `multiline: true`, `iterations: 1`, `animationDuration` 450 to 600, a small padding. The stroke must sit behind
  the text (`mix-blend-mode: multiply` on the annotation's svg) and redraw correctly on resize and after the fonts
  load. Inside the product fragments (answers, originals) keep the precise CSS highlighter: the marketing voice is
  drawn by hand, the product is exact.

One more is allowed if you truly need it, never two: Motion (motion.dev, MIT) or anime.js 4 (MIT). Do not mix
timeline engines. Not wanted: WebGL or three.js scenes, particle libraries, cursor trails, tilt libraries, Lottie
without real authored assets. They would bring back the generated look.

The page must be complete and readable if none of these scripts load: the CSS highlight shows instead of the drawn
stroke, native scrolling replaces Lenis, and nothing is ever left hidden.

## The page, top to bottom (1440 × 900 first)

**Navigation.** A plain white bar, 72px, sticky: wordmark left; on the right, in this order, Product, Connectors,
Developers, Security, Pricing, Sign in, and the ink pill "Create a workspace". After 24px of scroll it gains a 1px `--line`
bottom edge. Phone: wordmark, the pill, a menu button opening a full-width panel.

**1. Hero.**
- H1 on columns 1 to 8, its top 136px from the top of the page: "Know exactly what you promised." / "Source
  included." The two words "Source included." are highlighted: three adjacent highlighter segments (pink, green,
  blue) behind them, which sweep in one after the other on load. This is the brand in one gesture: several sources,
  one sentence. It is the only decorated headline moment above the fold.
- On columns 9 to 12, bottom-aligned with the H1: the sentence (18px) and under it the ink pill "Create a
  workspace" with the note "Open beta · no billing yet".
- At about 340px: three index tabs starting at the left margin (the three questions; the selected tab is `--desk`
  and joined to the stage, the others `--desk-2`), then the stage: a `--desk` band, edge to edge, about 620px tall.
- On the stage, 40px under its top, inside the margins:
  - Columns 1 to 7: the answer sheet. The question row (initials tile, the question, 15px/600). The answer as one
    flowing paragraph at 20px, each sentence under its highlighter colour and followed by its small number chip.
    On the sheet's right edge, sticking out, one flag per sentence, level with the line where that sentence
    starts; when two sentences start on the same line the flags sit side by side, never on a wrong line. Under
    the answer, inside the sheet, the sources as three compact footnote rows (number chip in its flag colour,
    logo, "Granola · Meeting", title, date, who can see it): each row is a button that selects that source.
  - Columns 8 to 12: the pile. The selected source on top, straight and fully readable: flag on its left edge,
    logo, tool and kind, title, meta line, the original in its own shape with the passage under its highlighter
    (the original's words in STIX Two Text), "Open in Granola" (outline pill) and "Shared with the team". The two
    other sources behind it, turned by at most 1.5 degrees, showing their flag and title.
  - "Fictional example" at the stage's bottom-left, 13.5px.
  The answer, its flags and the top source must be fully visible above the fold at 1440 × 900 and at 1280 × 800.
- Phone: H1, sentence, pill; the tabs scroll sideways; the answer sheet at full width with its flags on the right
  edge; the footnote rows; tapping a sentence, a flag or a row opens that source as a sheet sliding up from the
  bottom with a close button.

**2. Three rules, told by scrolling (one pinned section).** White ground. The section pins for about three screens
of scroll. Left, columns 1 to 5: a short vertical list of the three rule names ("Cited", "Not on record", "Yours
only") with an ink marker that moves to the current one; under it the current rule's H2 and text, which change as
the visitor scrolls. Right, columns 6 to 12: one `--desk` panel (6px radius) holding the sheets, which animate
from state to state:
- Rule 1. H2 "Every sentence wears the colour of its source." Text: "A pink sentence, a pink flag, a pink document.
  Click any of the three and read the original, opened at the passage." Fragment: the "known bug" answer; its
  three sentences get marked one after another while their three documents slide in.
- Rule 2. H2 "When the record is silent, Leon says so." Text from the copy deck (section 2). Fragment: the Verlant
  question; "I don’t know…" stays unmarked and an empty dashed flag draws itself beside it, labelled "no source";
  then the second sentence takes colour 1 and the Pipedrive note slides in.
- Rule 3. H2 "Leon sees what you see. Nothing more." Text from the copy deck (section 3). Fragment: the
  permissions question with the "Asked by Julie / Asked by Sophie" switch. First Julie's view: the private email
  sheet carries the stamp "Private to you". Further down the scroll the switch moves to Sophie by itself: the
  email sheet slides away, the second sentence loses its colour and gets the empty dashed flag. The switch stays
  clickable. Never show that a hidden document exists.
Phone and reduced motion: no pinning. The three rules are three stacked blocks, each with its fragment in its final
state, and the switch works by tap.

**3. Connectors.** White. H2 "42 connectors. Nothing to migrate." on columns 1 to 6, text on columns 8 to 12. The
number counts up from 0 to 42 when the heading enters. Below, edge to edge, two rows of tool items (logo 24px and
name 16px/500, 44px between items) moving slowly in opposite directions; they pause on hover and on focus. Then,
inside the margins, the link "See all 42 connectors" and the small line about the browser extension.

**4. Morning briefing.** A `--desk` band. Columns 1 to 6: the memo sheet ("Morning briefing", "Tuesday, November 10,
2026 · 08:45", the three headed lists, each item followed by its number chip). Columns 8 to 12, vertically centred
on the sheet: H2 "A briefing every morning.", the text, the small line about your own AI assistant, the link.
The memo's lines write themselves in one after another when the section enters.

**5. For developers: shared memory and dreaming.** The founder: "talk about dreaming, it is super important, and
about shared memory of course." This is a major commercial argument: give it full weight. An ink band, white text.
Read "Update 2" and "Update 3" for the background and for the only facts that may be claimed.
- Columns 1 to 5: H2 "Shared memory and dreaming for your coding agents." Text: "Every session opens with an empty
  context, and an agent only sees its own session. Leon gives the whole team one memory, and works on it between
  sessions." Then three facts, each a 16px/600 title and one or two 16px lines:
  "One memory, shared by the team." / "Pull requests, tickets, meetings and messages, filed by work thread
  alongside your sessions. Every agent reads it with its owner's permissions. Your sessions stay yours."
  "Dreaming, between sessions." / "While you are away, Leon rereads what happened, files it by thread, summarises
  each session and prepares the next briefing."
  "Handed over when the next one starts." / "Claude Code, Codex, Cursor and Antigravity open with your last
  sessions and the briefing. A tool you never used starts with what the others did."
  Under them one line: "Versioned, permissioned, cited. Leon writes the memory, not the agents, and every line names
  the session, pull request or ticket it comes from." and the link "Read the documentation".
- Columns 7 to 12, at the top: the dreaming strip. One line across the columns with three steps: "Evening: the
  session ends" · "Night: Leon dreams" · "Morning: the next session starts". Under the middle step, three small
  sheets with their flags (pink, green, blue) lying in one pile labelled with the work thread's name, taken from
  the data (the branch of the first session, "fix/export-pagination"). It speaks the page's own language (sheets
  and flags), here on ink: sheets stay white, the line and the labels are white.
- Under the strip: a terminal at real size showing exactly what the agent receives when a session starts, from
  LEON_DEMO.agentContext: a title row "claude · kestrel/app" (plain text, no coloured window dots); then
  "Leon · context for github.com/kestrel/app"; "Your last sessions on this repository" and its three lines (date,
  tool, branch, what was done); "Morning briefing" with its "Prepared by Leon..." line and the three headed groups,
  each line ending with its [n]; then "Sources" with the three sources. This is real terminal output, so a
  monospace face is right here and nowhere else on the page (ui-monospace, SFMono-Regular, Menlo, monospace;
  13.5px; line-height 1.6). The panel is a step lighter than the band (#1C1C19, 1px #2E2E2A edge, 6px radius).
  Provenance in colour continues inside the terminal: each [n] and its source line take the flag colour of that
  source (colours 1, 2, 3), as coloured text on the dark panel.
- "Fictional example" under the terminal, 13.5px.
- Phone: the text first, then the strip as three stacked steps, then the terminal at full width; long lines wrap,
  nothing scrolls sideways.

**6. Security.** White ground. H2 "What is in place, and what is not yet." on columns 1 to 5. On columns
7 to 12, two short lists side by side. "In place": "Each company’s data isolated with row-level security" ·
"Credentials encrypted with AES-256-GCM" · "Permissions checked before anything is ranked". "Not yet": "No SOC 2 or
ISO 27001" · "Source-tool permissions are not mirrored" · "No data export". Each "in place" item has a tick that
draws itself; each "not yet" item has an empty dashed circle. Under them the link "Read the security page".

**7. Close.** A `--desk` band. Columns 1 to 7: the closing line as a large statement, 56px/600, two lines at most:
"Everything your team said, on record." with "on record." under one highlighter sweep; the sentence; the ink pill
"Create a workspace" and the outline pill "Sign in". Columns 9 to 12: the sheet "Name your workspace" (a field
holding "Kestrel Studio", editable; "Work email"; an ink pill) lying on a small `--desk` panel.

**Footer.** An ink band: wordmark, the three link columns, language, copyright, in white.

Links to pages that do not exist in this round (Sign in, Create a workspace, Pricing, the security page, the
documentation, the connectors list) point to "#" with title="Not in this prototype". Product, Connectors, Developers
and Security scroll smoothly to their sections.

Limits: 620 words of prose at most outside fragments. Total scroll length at 1440 × 900: 9 screens at most,
including the pinned section. Nothing under 13px. Headings two lines at most.

## Motion: the system

Principles. Every movement means something in Leon's language: a highlighter sweep means "found here", a flag
popping means "linked", a sheet landing means "the source arrives". Fast and physical: 200 to 600ms, an
exponential ease-out for arrivals, a slight overshoot for flags only. Transform, opacity and clip-path only.
Everything is visible by default: script only adds the motion, it never reveals content. Under
`prefers-reduced-motion: reduce` every element is in its final state, nothing is pinned and nothing loops.

1. Page load. The navigation settles; the H1's two lines rise out of a clip (600ms, 80ms apart); the three
   highlighter segments sweep under "Source included." (160ms each); the sentence and the pill fade up; the tabs
   and the stage rise 24px. Then the demo plays itself once: the question appears; sentence 1 arrives, its
   highlighter sweeps left to right, its flag pops, and its document flies in from the right and lands on the
   pile; then sentence 2; then sentence 3. Under 2.8 seconds in all. Any click or key press jumps to the end state.
2. Changing question. The sheets leave quickly (200ms) and the same sequence replays at one and a half times the
   speed. The tab indicator slides from tab to tab.
3. Linking. Pointing at or focusing a sentence, its flag, its footnote row or its document lights both ends: the
   two flags grow to 1.1, the highlighter deepens, the document lifts 6px. Selecting brings the document to the top
   of the pile with a continuous move (Flip), never a jump cut.
4. The pinned rules: the transitions above are tied to the scroll position (scrubbed), with the list marker and the
   text changing at each third.
5. Connectors: the count-up (800ms, once) and the two moving rows (about 40 seconds a loop, linear, paused on hover
   and focus, a static wrapped grid under reduced motion). This is the only thing on the page that loops.
6. Briefing: lines write in 90ms apart, chips pop after their line.
7. Security: ticks and dashed circles draw with stroke-dashoffset, 70ms apart.
8. Close: the highlighter sweeps under "on record." when the line enters; the sheet lands.
9. Controls: the pill's arrow moves 3px on hover and the pill presses to 0.97; navigation links grow an underline
   from the left; the switch's thumb slides; fields show a clear focus; every focus-visible ring is ink, 2px, offset
   2px.
10. Section entrances: heading, then text, then fragment, 70ms apart, 20px of travel, once.
11. Developers: as the section enters, a marker travels along the dreaming strip. At "Evening" the first step
    lights; at "Night" the three small sheets fly into their thread pile one after another and their flags pop;
    at "Morning" the terminal prints its block line by line (30 to 45ms a line), then the three coloured source
    marks pop. Under 3.4 seconds in all, once. Everything printed and in place under reduced motion.

## Checking

Still pictures: `node <SCRATCH>/tools/shoot.mjs --out <SCRATCH>/shots/papier --slices 10 home=<abs>/papier/index.html`
(add `--width 1280 --height 800`, or `--width 390 --height 844`). Read home.json first.
Motion: `node <SCRATCH>/tools/film.mjs --out <SCRATCH>/film/papier --url <abs>/papier/index.html --times 0,150,400,800,1400,2000,2800,3600 --scroll 0,500,900,1300,1700,2100,2500,2900,3300,3700,4300,4900,5500`
writes `sheet-load.jpg` and `sheet-scroll.jpg` (every frame on one image: look at those two, not at single frames).
Add `--reduced` to check reduced motion and `--nojs` to check the page without script (all content visible).
Look at pictures at most twice per round; fix everything you saw in one batch.
