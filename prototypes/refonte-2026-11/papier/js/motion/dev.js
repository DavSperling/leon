/* Leon « Papier » v2 : motion, module "dev" (section 5, for developers). Timeline and triggers: NOTES-motion-dev.md.
   Its one pre-hidden state (the section's entrance) lives in css/motion-dev.css, with the failsafe of css/motion.css.

   1. Entrance, once: heading, lead, the three facts, the closing line, the link, then the story, 70 ms apart; the
      word "dreaming" is drawn by hand as the heading arrives.
   2. The story, once, when its strip is 16% of the way down the screen (5.7 s): Evening, Night, Morning. Any click
      or key jumps to its end.
   3. Each step is a button that plays its own part again; "Replay" plays the three.
   Every part starts from the resting state of the step before it and ends in its own resting state, which is exactly
   what the static page draws for that step (css/ui.css, data-step): rest(k) only removes what this file added. */
(function () {
  'use strict';
  if (!window.LeonMotion) return;
  LeonMotion.ready(function (M) {
    if (!M.ok || !M.enabled('dev')) return;
    var gsap = window.gsap;
    var section = document.getElementById('developers');
    if (!section) return;
    var $ = function (sel, root) { return (root || section).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || section).querySelectorAll(sel)); };

    // An anchor jump lands the band's top on the bar: from 1100px wide the whole section is then on screen (css/site.css)
    M.anchor.developers = function () {
      var bar = document.querySelector('[data-nav]');
      if (!window.matchMedia('(min-width: 1100px)').matches) return null;
      return section.getBoundingClientRect().top + window.scrollY - (bar ? bar.offsetHeight : 0);
    };

    /* ---------- 1. Entrance ---------- */
    // Document order: the heading, the lead, each fact, the closing line, the link, then the story's fragment
    var entering = $$('.h2[data-rv], .lead[data-rv], [data-fact], .dev__line, .more[data-rv], [data-story]');
    gsap.set(entering, { opacity: 0, y: 20 }); // same task as the hand-over: the CSS pre-hide has just let go
    var enteredAt = null;
    M.onEnter($('.dev__grid') || section, function () {
      enteredAt = gsap.ticker.time;
      gsap.to(entering, { opacity: 1, y: 0, duration: M.dur.slow, stagger: 0.07, clearProps: 'transform,opacity' });
      // On ink the marked word is ink too: it appears as the stroke passes under it
      var mark = $('[data-hmark]');
      if (mark) M.rough(mark, { color: +mark.dataset.hmark || 1, delay: 0.12 });
    });

    /* ---------- 2 and 3. The story ---------- */
    var Leon = window.Leon;
    var story = $('[data-story]');
    var term = $('[data-term]');
    var marker = story && $('[data-dream-marker]', story);
    if (!Leon || !Leon.hooks || !story || !term || !marker) return;

    var steps = $$('[data-dream-step]', story);
    var sheets = $$('[data-dream-sheet]', story);
    var flags = sheets.map(function (sheet) { return $('.flag', sheet); });
    var thread = $('[data-dream-thread]', story);
    var codex = $('[data-term-title="morning"]', term);
    var ended = $('[data-term-body="evening"]', term);
    var endLines = $$('[data-term-end]', term);    // the evening's screen: the session that ends…
    var kept = endLines.slice(3);                  // …and, from "Leon · session kept" on, what Leon keeps of it
    var lines = $$('[data-term-line]', term);      // the morning's screen: what the next agent receives
    var marks = $$('[data-term-mark]', term);
    var replay = $('[data-story-replay]', story);
    var pane = $('.term__screen', term);         // the terminal's screen: as tall as what it shows
    // Everything a part may leave an inline style on
    var touched = [marker, thread, codex, ended, pane].concat(steps, sheets, flags, endLines, lines, marks).filter(Boolean);

    var LINE = 0.04;              // the terminal prints a line every 40 ms
    var HOLD = [0, 1.7, 1.9, 1.7]; // seconds each part keeps the stage: 5.3 s, plus the captions coming back = 5.72 s
    var tl = null;                // the play in progress
    var goal = 3;                 // the step a skip jumps to
    var quiet = false;            // true while this module changes the step itself
    var auto = true;              // nothing has played yet and the visitor has not chosen a step
    var offered = false;          // "Replay" is shown

    var setStep = function (k) {
      if (Leon.state.step === k) return; // already there: no second "leon:step" for the same step
      quiet = true;
      try { Leon.showStep(k); } finally { quiet = false; }
    };
    var left = function (el) { return el.getBoundingClientRect().left; };
    // Where a sheet lies at rest: its centre (a turn about the centre leaves it in place), and the CSS `translate` and
    // `rotate` that put it there. While GSAP holds a transform on an element it sets those two properties to none and
    // carries them in its own x, y and rotation: so a sheet's tween must end on these values, not on zero, or the
    // sheet would jump when the tween lets go. Measure with no tween on the sheet.
    var place = function (el) {
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      var shift = cs.translate.split(' ').map(parseFloat); // "none", "9px" or "26px 2px"
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, tx: shift[0] || 0, ty: shift[1] || 0, turn: parseFloat(cs.rotate) || 0 };
    };
    var settle = function () { gsap.killTweensOf(sheets); gsap.set(sheets, { clearProps: 'all' }); };

    // Step k at rest, as the static page draws it
    function rest(k) {
      if (tl) tl.kill();
      tl = null;
      gsap.killTweensOf(touched);
      gsap.set(touched, { clearProps: 'all' });
      if (codex) codex.classList.remove('is-fresh');
      window.removeEventListener('click', skip, true);
      window.removeEventListener('keydown', skip, true);
      setStep(k);
      if (replay && !offered && !auto) { // something has played: it can be played again
        offered = true;
        gsap.to(replay, { autoAlpha: 1, duration: M.dur.base, clearProps: 'opacity,visibility' });
      }
    }
    // "click", not "pointerdown": a finger that scrolls the page must not cut the story short
    function skip(e) {
      if (e.type === 'keydown' && /^(Shift|Control|Alt|Meta)$/.test(e.key)) return;
      rest(goal);
    }

    // The step changes: its caption stays lit, the two others step back, the marker travels to its dot
    function go(k, t, from) {
      if (from == null) from = left(marker);
      setStep(k);
      var dx = from - left(marker); // 0 on a phone, where the strip is a list without marker
      if (dx) tl.add(gsap.fromTo(marker, { x: dx }, { x: 0, duration: M.dur.base, ease: M.ease.inOut, clearProps: 'transform' }), t);
      tl.to(steps, { opacity: function (i) { return i === k - 1 ? 1 : 0.4; }, duration: M.dur.base }, t);
    }

    var part = [null,
      // Evening. The session has ended on the terminal; what Leon keeps prints under it, then leaves it as three sheets.
      function (t, from) {
        go(1, t, from);
        gsap.set(kept, { opacity: 0 });
        kept.forEach(function (line, i) { tl.set(line, { opacity: 1 }, t + 0.1 + i * LINE); });
        var origin = (kept[1] || term).getBoundingClientRect(); // "What was said…": the sheets start from there
        sheets.forEach(function (sheet, i) {
          // The gesture of M.sheetLand (travel, a slight turn settling, opacity; slow, ease out), landing on the
          // sheet's own resting place instead of zero
          var p = place(sheet);
          tl.add(gsap.fromTo(sheet,
            { x: p.tx + origin.left + 120 + i * 28 - p.x, y: p.ty + origin.top + 11 - p.y, rotation: p.turn + 4, opacity: 0 },
            { x: p.tx, y: p.ty, rotation: p.turn, opacity: 1, duration: M.dur.slow, ease: M.ease.out, clearProps: 'transform,opacity' }), t + 0.5 + i * 0.12);
        });
      },
      // Night. The sheets are filed in the thread's pile (first, last, invert, play), their flags pop, the thread is named.
      function (t, from) {
        settle();
        var first = sheets.map(place);
        go(2, t, from);
        sheets.forEach(function (sheet, i) {
          var last = place(sheet);
          tl.add(gsap.fromTo(sheet,
            { x: last.tx + first[i].x - last.x, y: last.ty + first[i].y - last.y, rotation: first[i].turn },
            { x: last.tx, y: last.ty, rotation: last.turn, duration: M.dur.slow, ease: M.ease.out, clearProps: 'transform' }), t + 0.05 + i * 0.09);
          tl.add(M.flagPop(flags[i]), t + 0.4 + i * 0.09);
        });
        if (thread) tl.add(gsap.fromTo(thread, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: M.dur.base, clearProps: 'transform,opacity' }), t + 0.7);
      },
      // Morning. Another tool opens: its name takes the title, the context prints line by line, then each source's marks pop.
      function (t, from) {
        // The cleared screen keeps the height it had, then grows line by line, as a terminal does
        if (pane) gsap.set(pane, { minHeight: pane.offsetHeight });
        gsap.set(lines, { display: 'none' });
        gsap.set(marks, { opacity: 0 });
        go(3, t, from);
        if (codex) {
          codex.classList.add('is-fresh'); // white while the part plays (css/motion-dev.css)
          tl.add(gsap.fromTo(codex, { opacity: 0 }, { opacity: 1, duration: M.dur.fast, clearProps: 'opacity' }), t);
        }
        // The evening's screen, which the step has just hidden, fades instead of blinking out
        if (ended) tl.add(gsap.fromTo(ended, { display: 'block', opacity: 1 }, { opacity: 0, duration: M.dur.fast, clearProps: 'all' }), t);
        var start = t + M.dur.fast;
        lines.forEach(function (line, i) { tl.set(line, { display: 'block' }, start + i * LINE); });
        var printed = start + lines.length * LINE + 0.1;
        ['1', '2', '3'].forEach(function (n, i) { // a source's number in the briefing and on its source line pop together
          marks.forEach(function (mark) { if (mark.dataset.termMark === n) tl.add(M.flagPop(mark), printed + i * 0.12); });
        });
      },
    ];
    // A part that fails must leave nothing hidden
    var run = function (k, t, from) {
      try { part[k](t, from); } catch (err) { if (window.console) window.console.error('[LeonMotion dev]', err); rest(goal); }
    };

    // Play these steps in order. [1, 2, 3] is the story; [k] is one step's own part.
    function play(parts) {
      var from = left(marker); // before anything moves: the marker travels from where the visitor saw it
      rest(Math.max(1, parts[0] - 1));
      auto = false;
      goal = parts[parts.length - 1];
      window.addEventListener('click', skip, true);
      window.addEventListener('keydown', skip, true);
      tl = gsap.timeline({ onComplete: function () { rest(goal); } });
      var t = 0;
      parts.forEach(function (k, i) {
        if (!tl) return; // the first part failed: rest() has already put everything back
        if (i) tl.call(run, [k, t], t); else run(k, 0, from); // the first part now: no frame shows the state before it
        t += HOLD[k];
      });
      if (tl) tl.to(steps, { opacity: 1, duration: M.dur.base }, t); // the three captions come back
    }

    // A step's button (js/site.js calls the hook): play that step's part. This module's own changes pass through.
    Leon.hooks.step = function (detail, commit) {
      if (quiet) return commit();
      play([detail.step]);
      if (Leon.state.step !== detail.step) commit(); // the part failed before it changed the step
    };
    if (replay) {
      // In the layout from the start, so that nothing moves when it is offered (on a phone it has a row of its own);
      // invisible, and out of the keyboard's way, until something has played
      replay.hidden = false;
      gsap.set(replay, { autoAlpha: 0 });
      replay.addEventListener('click', function () { play([1, 2, 3]); });
    }

    // Before the story: the evening, the session just ended on the terminal, nothing kept yet and no sheet out. The
    // fragment is hidden by the entrance at this instant, so nothing shows the change from the page's default (Morning).
    setStep(1);
    gsap.set(sheets.concat(kept), { opacity: 0 });
    // It starts when the three captions, the desk and the terminal's first lines are all on screen: the strip a fifth of
    // the way down; on a phone, where the strip is a tall list, just under the bar (62px, plus 48)
    var stacked = window.matchMedia('(max-width: 699px)');
    M.onEnter(story, function () {
      if (!auto) return;
      // Loaded further down, or passed by an anchor jump (core.js): nothing to tell, the section is in its last state
      if (M.quick || section.getBoundingClientRect().bottom < 0) { auto = false; return rest(3); }
      // After an anchor jump the entrance and the story arrive together: the story waits until its fragment is there
      var lag = enteredAt == null ? 1 : Math.max(0, enteredAt + 1 - gsap.ticker.time);
      gsap.delayedCall(lag, function () { if (auto) play([1, 2, 3]); });
    }, { start: function () { return stacked.matches ? 'top 110px' : 'top 30%'; } });
    // Off screen, the play waits
    if (window.ScrollTrigger) {
      window.ScrollTrigger.create({
        trigger: section, start: 'top bottom', end: 'bottom top',
        onToggle: function (self) { if (tl) tl.paused(!self.isActive); },
      });
    }
  });
})();
