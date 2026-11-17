/* Leon « Papier » v2 : motion, module "ambient". What it owns and the hooks it may use: NOTES.md, "Motion core".
   Its pre-hidden states live in css/motion-ambient.css, under html.js-motion, each with the failsafe of css/motion.css.
   Timeline and triggers: NOTES-motion-ambient.md.

   Sections 3 (connectors), 4 (briefing), 6 (security), 7 (close) and the footer:
     entrances      each [data-rv] rises 20px when it enters; heading, text, fragment 70ms apart
     connectors     the count 0 -> 42, the endless two-row carousel, a drawn mark under "Nothing to migrate."
     briefing       the memo's lines write in 90ms apart, each number chip pops after its line
     security       ticks and half rings draw 70ms apart
     close          the hand-drawn stroke under "on record.", the sign-up sheet lands on its panel
   Every part is wrapped: if one throws, what it had hidden is shown again and the others still run. */
(function () {
  'use strict';
  if (!window.LeonMotion) return;
  LeonMotion.ready(function (M) {
    if (!M.ok || !M.enabled('ambient')) return;

    var gsap = window.gsap;
    var doc = document;
    var $ = function (sel, root) { return (root || doc).querySelector(sel); };
    var $$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };
    var STEP = 0.07;    // heading, text, fragment; one tick, one ring
    var WRITE = 0.09;   // one memo line after the other
    var TRAVEL = 20;
    var narrow = window.matchMedia('(max-width: 699px)').matches;

    // A part that throws must not leave anything hidden: its elements go back to the static page.
    var part = function (els, fn) {
      if (!els || els.length === 0) return; // the markup has no such part: nothing to do
      try { fn(); } catch (err) {
        if (window.console) console.error('[LeonMotion ambient]', err);
        gsap.killTweensOf(els);
        gsap.set(els, { clearProps: 'all' });
      }
    };

    /* ---------- Entrances (point 10) ----------
       Each element waits for its own arrival on screen, so a stacked phone layout never animates out of sight.
       Elements of one row arrive together and keep the order heading, text, fragment through their delay. */
    var after = []; // [element, fn(delay)] : what plays inside an element once it has started to rise
    var inside = function (el, fn) { if (el) after.push([el, fn]); };
    var rise = function (el, start) {
      var delay = ((parseInt(el.getAttribute('data-rv'), 10) || 1) - 1) * STEP;
      M.onEnter(el, function () {
        gsap.to(el, { opacity: 1, y: 0, duration: M.dur.slow, ease: M.ease.out, delay: delay, clearProps: 'transform,opacity' });
        after.forEach(function (pair) { if (pair[0] === el) part(el, function () { pair[1](delay); }); });
      }, { start: start || 'top 88%' });
    };
    var rv = $$('#connectors [data-rv], #briefing [data-rv], #security [data-rv], #close [data-rv]');
    var tall = $('#briefing .brief__memo'); // the memo writes itself: wait until enough of the sheet is on screen
    part(rv, function () {
      gsap.set(rv, { opacity: 0, y: TRAVEL });
      rv.forEach(function (el) { rise(el, el === tall ? 'top 74%' : null); });
    });

    /* ---------- One hand-drawn phrase per heading ----------
       The static page marks no phrase in these three headings, so the span is made here, and only when the
       stroke can really be drawn. It is born .is-drawn: the flat CSS stroke never shows. */
    var phrase = function (heading, words, colour) {
      if (!heading || !window.RoughNotation) return null;
      var marked = heading.querySelector('.hmark'); // the day the static page marks the phrase itself, use that one
      if (marked) return marked;
      var walker = doc.createTreeWalker(heading, window.NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        var at = node.nodeValue.indexOf(words);
        if (at < 0) continue;
        var hit = node.splitText(at);
        hit.splitText(words.length);
        var span = doc.createElement('span');
        span.className = 'hmark is-drawn';
        span.setAttribute('data-hmark', colour);
        hit.parentNode.replaceChild(span, hit);
        span.appendChild(hit);
        return span;
      }
      return null;
    };
    // Colours down the page: rules 1, 2, 3; connectors 2; briefing 3; developers 1; security 2; close 4.
    [['#conn-h', 'Nothing to migrate.', 2], ['#brief-h', 'every morning.', 3], ['#sec-h', 'in place', 2]].forEach(function (h) {
      var heading = $(h[0]);
      part(heading, function () {
        var span = phrase(heading, h[1], h[2]);
        // The stroke starts once the heading has nearly settled (expo.out: the travel is over long before the tween)
        inside(span && heading, function (delay) { M.rough(span, { color: h[2], delay: delay + 0.3 }); });
      });
    });

    /* ---------- 3. Connectors: the count, the carousel (point 5) ---------- */
    var count = $('#connectors [data-count]');
    part(count, function () {
      var total = parseInt(count.getAttribute('data-count'), 10);
      var heading = count.closest('[data-rv]');
      if (!total || !heading) return;
      // The number keeps the width of "42" while it counts, so the words after it never shift
      var em = count.getBoundingClientRect().width / parseFloat(window.getComputedStyle(count).fontSize);
      var done = function () {
        count.textContent = String(total);
        count.removeAttribute('style');
        heading.removeAttribute('aria-label');
      };
      heading.setAttribute('aria-label', heading.textContent); // a screen reader never hears "0 connectors"
      count.style.display = 'inline-block';
      count.style.width = em.toFixed(3) + 'em';
      count.style.textAlign = 'right'; // a lone digit stays against the word that follows
      inside(heading, function (delay) {
        count.textContent = '0'; // only now: until the heading enters, the page says 42
        var at = { n: 0 };
        var shown = 0;
        gsap.to(at, {
          // 800ms: home-v2.md, point 5. Ease-out: the single digits pass in two frames, the last numbers settle.
          n: total, duration: M.dur.count, delay: delay, ease: M.ease.out,
          onUpdate: function () {
            var n = Math.round(at.n);
            if (n !== shown) { shown = n; count.textContent = String(n); }
          },
          onComplete: done,
        });
      });
    });

    var marquee = $('#connectors [data-marquee]');
    part(marquee, function () {
      var rows = $$('[data-marquee-row]', marquee);
      if (!rows.length) return;
      // A second copy of each row's tools: half a rolling row is exactly one set (the row's right padding equals
      // its gap), so sliding by 50% puts the copy where the original was. No gap, no jump.
      rows.forEach(function (row) {
        $$('.tool', row).forEach(function (tool) {
          var copy = tool.cloneNode(true);
          copy.setAttribute('data-clone', '');
          copy.setAttribute('aria-hidden', 'true');
          row.appendChild(copy);
        });
      });
      $$('img', marquee).forEach(function (img) { img.loading = 'eager'; }); // a logo must be there before it rolls in
      marquee.classList.add('is-rolling');
      marquee.setAttribute('tabindex', '0'); // a keyboard can stop it: focus pauses
      marquee.setAttribute('role', 'group');
      marquee.setAttribute('aria-label', 'The 42 connectors, moving. The list pauses while it has the focus or the pointer.');

      // Opposite directions, slightly different speeds (about 40 seconds a loop, linear: home-v2.md, point 5).
      // The one thing on the page that loops; it stands still off screen.
      var loops = rows.map(function (row, i) {
        return gsap.fromTo(row, { xPercent: i % 2 ? -50 : 0 }, {
          xPercent: i % 2 ? 0 : -50, duration: i % 2 ? 46 : 40, ease: 'none', repeat: -1, paused: true,
        });
      });
      var held = { pointer: false, focus: false };
      var hold = function (key, on) {
        held[key] = on;
        var speed = held.pointer || held.focus ? 0 : 1;
        loops.forEach(function (loop) {
          gsap.to(loop, { timeScale: speed, duration: M.dur.base, ease: M.ease.out, overwrite: true }); // it slows to a stop
        });
      };
      marquee.addEventListener('pointerenter', function () { hold('pointer', true); });
      marquee.addEventListener('pointerleave', function () { hold('pointer', false); });
      marquee.addEventListener('pointercancel', function () { hold('pointer', false); });
      marquee.addEventListener('focusin', function () { hold('focus', true); });
      marquee.addEventListener('focusout', function () { hold('focus', false); });
      new window.IntersectionObserver(function (entries) {
        var seen = entries[entries.length - 1].isIntersecting;
        loops.forEach(function (loop) { loop.paused(!seen); });
      }, { rootMargin: '120px 0px' }).observe(marquee);
    });

    /* ---------- 4. Briefing: the lines write in, each chip pops after its line (point 6) ---------- */
    var memo = $('#briefing [data-memo]');
    var memoParts = memo ? $$('[data-line], [data-chip]', memo) : [];
    part(memoParts, function () {
      var HIDDEN = 'inset(-20% 100% -20% -2%)'; // wiped from the left; the box is let out a little so no glyph is cut
      var SHOWN = 'inset(-20% -2% -20% -2%)';
      var tl = gsap.timeline({ paused: true });
      $$('[data-line]', memo).forEach(function (line, i) {
        var t = i * WRITE;
        tl.fromTo(line, { clipPath: HIDDEN }, { clipPath: SHOWN, duration: M.dur.base, ease: M.ease.inOut, clearProps: 'clipPath' }, t);
        var chip = $('[data-chip]', line);
        if (chip) tl.add(M.flagPop(chip), t + 0.3); // the pen reaches the end of the line, then the number lands
      });
      inside(tall, function (delay) { tl.delay(delay + 0.1).restart(true); });
    });

    /* ---------- 6. Security: ticks and half rings draw (point 7) ---------- */
    var marks = $$('#security [data-check] path[data-draw]');
    part(marks, function () {
      var lists = $('#security .sec__lists');
      if (!lists) return;
      var tl = gsap.timeline({
        paused: true,
        onComplete: function () { gsap.set(marks, { clearProps: 'strokeDasharray,strokeDashoffset' }); },
      });
      marks.forEach(function (path, i) {
        var len = Math.ceil(path.getTotalLength());
        // The gap is longer than the dash and the start sits 2 units inside it: no round-cap dot before the stroke begins
        tl.fromTo(path, { strokeDasharray: len + ' ' + (len + 4), strokeDashoffset: len + 2 },
          { strokeDashoffset: 0, duration: M.dur.base, ease: M.ease.inOut }, i * STEP);
      });
      inside(lists, function (delay) { tl.delay(delay + 0.15).restart(true); });
    });

    /* ---------- 7. Close: the stroke under "on record.", the sheet lands (point 8) ---------- */
    var statement = $('#close-h');
    var stroke = $('#close [data-sweep="close"] [data-sweep-seg]');
    inside(stroke && statement, function (delay) { M.rough(stroke, { color: 4, delay: delay + 0.3 }); });

    var panel = $('#close .close__form');
    var sheet = panel && $('.signup', panel);
    inside(sheet && panel, function (delay) {
      // The panel rises first, then the sheet arrives on it. Less sideways travel on a phone: the sheet is 32px from the edge.
      M.sheetLand(sheet, { x: narrow ? 12 : 48, y: -24, rotate: narrow ? 2 : 3, delay: delay + 0.1 });
    });

    /* ---------- Footer ---------- */
    var foot = $$('.foot .foot__grid > *');
    part(foot, function () {
      gsap.set(foot, { opacity: 0, y: TRAVEL });
      M.onEnter($('.foot'), function () {
        gsap.to(foot, { opacity: 1, y: 0, duration: M.dur.slow, ease: M.ease.out, stagger: STEP, clearProps: 'transform,opacity' });
      }, { start: 'top 94%' });
    });
  });
})();
