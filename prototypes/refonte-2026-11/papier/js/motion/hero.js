/* Leon « Papier » v2 : motion, module "hero". The navigation's entrance and section 1. Notes: NOTES-motion-hero.md.
   Its pre-hidden states live in css/motion-hero.css, under html.js-motion, each with the failsafe of css/motion.css.

   1. Load, once, 2.6 s (seconds from the first frame):
        0.00  the navigation settles
        0.05  the headline's two lines rise out of a clip, 80ms apart
        0.40  the sentence, then the pill
        0.50  the tabs and the stage rise 24px; the three strokes are drawn under "Source included." (pink, green, blue)
        0.65  the demo plays itself: the question, then for each sentence, 450ms apart:
              the sentence, its highlighter sweep, its flag, its document landing on the pile with its footnote row
      Any click or key press jumps to the end state.
   2. Another question: the answer and the sheets leave together in 200ms, then the demo builds one sentence at a time, never faster than the first play.
      (The tab's indicator already slides in CSS.)
   3. Selecting a source: its sheet is pulled out of the pile and laid on top in one move (Flip).
   The selection logic stays in js/site.js: this file only wraps Leon.hooks.scenario and Leon.hooks.select. */
(function () {
  'use strict';
  if (!window.LeonMotion) return;
  LeonMotion.ready(function (M) {
    if (!M.ok || !M.enabled('hero')) return;
    var gsap = window.gsap;
    var Flip = window.Flip;
    var Leon = window.Leon;
    var $ = function (s, r) { return (r || document).querySelector(s); };
    var $$ = function (s, r) { return gsap.utils.toArray((r || document).querySelectorAll(s)); };
    var stage = $('#stage');
    var answer = $('#hero-answer');
    var pile = $('#pile');
    if (!stage || !answer || !pile) return;

    var BEAT = 0.45; // from one sentence to the next, on load (the whole load stays under 2.8 s)
    var CALM = 0.7;  // …and when a question is changed: each sentence has its sweep, flag and document before the next
    var rise = 'transform,opacity';

    /* The pile's sheets rest on CSS `translate` / `rotate` and change slot with a CSS transition. While GSAP moves a
       sheet it folds that resting place into its own `transform`, so the transition stays off until the sheet is
       handed back to the stylesheet: otherwise the hand-back itself would slide. */
    var hold = function (docs) { docs.forEach(function (d) { d.style.transition = 'none'; }); };
    var letGo = function (docs) {
      gsap.set(docs, { clearProps: 'transform' });
      void pile.offsetWidth; // the hand-back is computed while the transition is still off
      docs.forEach(function (d) { d.style.transition = ''; });
    };

    /* ---------- The demo: question, then sentence by sentence. Every first state is set here, synchronously. ---------- */
    var play = function (beat) {
      var docs = $$('.doc', pile);
      var landed = {};
      var tl = gsap.timeline({ onComplete: function () { letGo(docs); stage.classList.remove('is-playing'); } });
      stage.classList.add('is-playing');
      hold(docs);
      tl.fromTo($$('[data-question]', answer), { opacity: 0, y: 8 }, { opacity: 1, y: 0, clearProps: rise }, 0);
      $$('[data-sentence]', answer).forEach(function (seg, i) {
        var t = 0.2 + i * (beat || BEAT);
        var n = seg.dataset.n;
        // "found here": the words, then the stroke under them
        tl.fromTo(seg, { opacity: 0 }, { opacity: 1, duration: M.dur.fast, ease: M.ease.inOut, clearProps: 'opacity' }, t);
        if (n) tl.add(M.sweep(seg), t + 0.06);
        // "linked": the flag pops out of the sheet's edge
        $$('[data-flag][data-for="' + seg.dataset.sentence + '"]', answer).forEach(function (flag) { tl.add(M.flagPop(flag), t + 0.28); });
        // "the source arrives": its document lands on the pile, its footnote row is written
        if (!n || landed[n]) return;
        landed[n] = true;
        $$('[data-source="' + n + '"]', pile).forEach(function (doc) { tl.add(M.sheetLand(doc, { x: 140, y: -28, rotate: 4 }), t + 0.25); });
        tl.fromTo($$('[data-note="' + n + '"]', answer), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: M.dur.fast, clearProps: rise }, t + 0.3);
      });
      return tl;
    };

    /* ---------- 1. Page load ---------- */
    var lines = $$('[data-h1-line]');
    var strokes = [];
    var active = gsap.timeline();
    active.fromTo('.nav__in', { opacity: 0, y: -10 }, { opacity: 1, y: 0, clearProps: rise }, 0);
    if (lines.length && getComputedStyle(lines[0]).display === 'block') {
      // The line slides up while its clip slides down by the same amount: the mask stays where the line will rest.
      // The clip reaches 15% under the line box, so descenders are never cut.
      active.fromTo(lines, { yPercent: 115, clipPath: 'inset(-5% -5% 100% -5%)' },
        { yPercent: 0, clipPath: 'inset(-5% -5% -15% -5%)', duration: M.dur.slow, stagger: 0.08, clearProps: 'transform,clipPath' }, 0.05);
    } else {
      // Phone: the headline wraps freely, its lines are not boxes. It rises as one block.
      active.fromTo('#h1', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: M.dur.slow, clearProps: rise }, 0.05);
    }
    $$('[data-sweep="hero"] [data-sweep-seg]').forEach(function (seg, i) {
      strokes.push(M.rough(seg, { color: i + 1, delay: 0.5 + i * 0.16, duration: M.dur.fast }));
    });
    active.fromTo('[data-hero-lead], [data-hero-cta]', { opacity: 0, y: 16 }, { opacity: 1, y: 0, stagger: 0.07, clearProps: rise }, 0.4);
    active.fromTo([$('[data-tabs]'), stage], { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: M.dur.slow, clearProps: rise }, 0.5);
    active.add(play(), 0.65); // the question is written while the stage settles

    /* Any click or key press jumps to the end state (of the load, or of a question's replay) */
    var cutAt = 0; // when a click or a key last cut a sequence short
    var finish = function () {
      strokes.splice(0).forEach(function (note) { // a stroke shown again while it draws is redrawn whole, at once
        try { if (note) { note.animate = false; note.show(); } } catch (err) { /* the flat CSS stroke is hidden only once a drawing exists */ }
      });
      if (active.progress() < 1) { cutAt = Date.now(); active.progress(1); }
    };
    document.addEventListener('pointerdown', finish, true);
    document.addEventListener('keydown', finish, true);
    if (window.scrollY > stage.offsetTop + stage.offsetHeight) finish(); // reloaded further down the page: nothing to watch here

    if (!Leon) return;

    /* ---------- 3. Selecting: the sheet comes out of the pile and lands on top, one continuous move ---------- */
    var flip = null;
    Leon.hooks.select = function (detail, commit) {
      finish();
      if (flip) flip.progress(1);
      var docs = $$('.doc', pile);
      var up = $('[data-source="' + detail.n + '"]', pile);
      if (!Flip || !up || !pile.offsetParent) return commit(); // on a phone there is no pile: the source opens as a sheet
      // Until the sheet is out, the pile keeps its order and the sheet on top stays written (data-was, motion-hero.css):
      // nothing jumps in front, and no blank sheet shows before it is covered. An attribute, not an inline z-index:
      // Flip puts inline styles back when it ends, which would drop the sheet behind again for a frame.
      docs.forEach(function (d) { d.dataset.was = d.dataset.slot; });
      var over = function () { docs.forEach(function (d) { d.removeAttribute('data-was'); }); };
      hold(docs);
      var state = Flip.getState(docs);
      gsap.set(docs, { clearProps: 'transform' }); // reading the state folded the old slot into `transform`: hand it back before the slots change
      commit();
      // Flip measures through the stage, which makes GSAP read it again and leave `translate: none` on it: cleared with the sheets
      flip = gsap.timeline({ onComplete: function () { over(); letGo(docs.concat(stage)); flip = null; } })
        .add(Flip.from(state, { duration: M.dur.slow, ease: M.ease.inOut }), 0)
        .to(up, { xPercent: 14, duration: M.dur.fast, ease: M.ease.inOut }, 0) // pulled out to the right…
        .call(over, null, M.dur.fast) // …over the others…
        .to(up, { xPercent: 0, duration: M.dur.base }, M.dur.fast); // …and down on top
    };

    /* ---------- 2. Another question: the sheets leave together, then the answer builds at a calm pace (update 5) ---------- */
    var pending = null;
    var leaving = null;
    var askedAt = 0;
    Leon.hooks.scenario = function (detail, commit) {
      var now = Date.now();
      // Another question while one is still leaving or building: never two sequences. The new question is shown in
      // its end state at once (site.js fades it in).
      if (leaving || now - cutAt < 500 || now - askedAt < 400) {
        if (leaving) leaving.kill();
        leaving = pending = null;
        askedAt = now;
        finish();
        if (flip) flip.progress(1);
        return commit();
      }
      askedAt = now;
      pending = commit;
      finish();
      if (flip) flip.progress(1);
      var docs = $$('.doc', pile);
      hold(docs);
      leaving = gsap.timeline({
        onComplete: function () {
          var go = pending;
          leaving = pending = null;
          go(); // site.js rebuilds the answer and the pile, and places the flags
          answer.classList.remove('is-swapping'); // its CSS fade would play over the demo
          pile.classList.remove('is-swapping');
          active = play(CALM);
        },
      })
        .to(answer.children, { opacity: 0, y: -8, duration: M.dur.fast, ease: M.ease.inOut }, 0)
        .to(docs, { opacity: 0, x: 48, duration: M.dur.fast, ease: M.ease.inOut }, 0); // together
    };
  });
})();
