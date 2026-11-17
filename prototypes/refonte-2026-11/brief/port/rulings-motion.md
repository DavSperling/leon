# Lead designer's scope and rulings for the motion port (they override the map where they differ)

1. Order: the map's order. Scaffolding; the hero (staged demo, the leave before a question swap, the sliding tab
   indicator, the selection pass-over); the ambient gestures; the three rules pinned and scrubbed; the developers band.
2. The library. GSAP is approved by the founder for this port ("yes, with GSAP"). Use it for what JavaScript drives: the
   staged timelines that run after first paint, the question switch, the pile's travel (Flip), the pinned and scrubbed
   three rules (ScrollTrigger), the count-up. Whatever must be right at first paint (the headline's lines, the strokes
   under it, the first staging of the hero demo) stays or goes in CSS, so that the server's HTML is never shown finished,
   then hidden, then replayed. Never the same gesture twice. No Lenis. No SplitText. The hand-drawn strokes keep their
   hand-drawn look (rough-notation at an exact version, MIT; or an equivalent rough SVG path): a straight wipe is not
   the design. If, gesture after gesture, GSAP turns out to carry nothing that CSS and the installed `motion` package
   do not carry as well, do not add it, and say so: the founder wants the animations of the prototype, not a library.
3. Content: invent no claim.
   a. Rules: add the list of the three rules' names with its marker (the three names of the prototype's index.html in
      English; write the French). For the "mini documents", use the source rows the real fragments already have: they
      arrive the way the documents do in the notes. No new objects. Rule 3: the Julie / Sophie switch becomes
      controlled so that the scroll can switch it; never render the two views at once (Sophie's DOM must never hold
      Julie's email).
   b. Developers band: animate TODAY's content only (its entrance, the terminal printed line by line, the three logos
      popping). The prototype's three-step story (evening, night, morning) is NOT ported: its copy does not exist in
      the real page. Say so in notDone.
   c. Ambient: draw the marks of the headings that have a mark today; add no mark and no copy the real page lacks; the
      count-up of the connectors' number; the briefing lines, the ticks and the rings; the tool hover; the marquee's
      speeds.
4. The traps of the map's "Risks" are yours to avoid. In particular: GSAP folds translate, rotate and scale into
   `transform` while the kit uses the individual properties (animate x / y / rotation only on nodes whose CSS does not
   use the individual properties, or animate CSS variables); the 160 ms colour transition of `.hl` blinking after a
   sweep; pin only when a rule fits under the bar; `main` keeps `overflow-x: clip`; the hero's DemoScene is mounted
   twice (hero and rule 1): scope hero-only logic to the hero instance.
5. src/app/layout.tsx: you may add to its existing inline head script (the one that already reads the theme and
   `leon-motion`) the one line that sets `js-motion` on <html> when motion is allowed and the address is a public site
   page. Nothing else in that file.
6. A verifier is reading the site right now (it edits nothing). The founder looks at http://localhost:3040/accueil.
7. Time: aim to return within about ninety minutes. If you must cut, cut from the end of the order (the developers'
   terminal, then ambient details), never the checks; list what you cut in notDone.
