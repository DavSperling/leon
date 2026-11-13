/* Leon « Papier » v2 : motion, module "rules" (section 2, #product). Styles: css/motion-rules.css. Notes: NOTES-motion-rules.md.

   Wide screens (1024px and more, when one rule fits under the bar): the section is pinned for about two screens of
   scroll and one timeline is scrubbed through the three rules, 10 units each:
     rule 1   0.4 -  6.7   each sentence is swept in its colour, its number and flag pop, its document lands
     turn     9.4 - 11.7   the sheets leave, the marker moves, the text changes, the next answer arrives
     rule 2  12.0 - 16.3   the empty dashed flag draws itself beside "I don't know", then colour 1 and the Pipedrive note
     turn    19.2 - 21.7   the same, then the switch and Julie's view arrive
     rule 3  21.6          "Private to you" is stamped (timed)
             25.0          the switch moves to Sophie by itself (timed, through Leon.showView; scrolling back returns to Julie)
   Between them the finished state of each rule holds for 2.7 to 5 units, so that it can be read and used.
   Elsewhere (narrower, a rule taller than the screen, no ScrollTrigger): the stacked blocks, with their entrance only.
   Reduced motion or no GSAP: nothing runs (M.ok is false), the page is the static page. */
(function () {
  'use strict';
  if (!window.LeonMotion) return;
  LeonMotion.ready(function (M) {
    if (!M.ok || !M.enabled('rules')) return;
    var gsap = window.gsap;
    var ST = window.ScrollTrigger;
    var Leon = window.Leon;
    var section = document.querySelector('[data-rules]');
    if (!section) return;
    var $ = function (s, r) { return (r || section).querySelector(s); };
    var $$ = function (s, r) { return Array.prototype.slice.call((r || section).querySelectorAll(s)); };
    var wrap = $('.wrap');
    var list = $('[data-rules-list]');
    var marker = $('[data-rules-marker]');
    var links = $$('[data-rule-link]');
    var body = $('[data-perm-body]');
    var sw = $('[data-switch]');
    var rule = function (k) { return $('[data-rule="' + k + '"]'); };
    var text = function (k) { return $('[data-rule-text="' + k + '"]'); };
    var frag = function (k) { return $('[data-rule-frag="' + k + '"]'); };
    var add = function (tl, tween, at) { if (tween) tl.add(tween, at); return tl; };

    var T = 30;                    // the scrubbed timeline: 10 units a rule
    var CUT = [0, 10, 19.8];       // from CUT[k] on, rule k + 1 is the current one: the marker is half-way
    var REST = [8, 17.6, 23.2];    // where each rule is complete and at rest: the list's links go there
    var STAMP = 21.6;              // Julie's view has landed: "Private to you" is stamped
    var SOPHIE = 25;               // from here on, Sophie is asking
    var MARKER = 32;               // the marker's step (css/site.css)

    var wide = window.matchMedia('(min-width: 1024px)');
    var ctx = null;      // everything the pinned version creates, to revert it in one call
    var st = null;       // its ScrollTrigger; null = stacked
    var current = 0;     // the rule on screen
    var wanted = 0;      // the view the scroll position asks for
    var stamped = false;
    var entered = false;

    /* ---------- The headings' hand-drawn marks: each one is drawn once, when its rule first shows ---------- */
    var drawn = {};
    var mark = function (k, delay) {
      if (drawn[k]) return;
      drawn[k] = true;
      M.rough($('[data-hmark]', rule(k)), { color: k, delay: delay || 0 });
    };

    /* ---------- The gestures, scrubbed ---------- */
    // "Found here". Once a sentence is fully marked it goes back to the plain stroke, which deepens when pointed at.
    var sweep = function (seg, d) {
      var t = M.sweep(seg, { keep: true, duration: d, ease: 'none' });
      t.eventCallback('onUpdate', function () { seg.classList.toggle('is-sweep', t.progress() < 1); });
      return t;
    };
    // "Linked": M.flagPop's gesture (0.6 to 1, the flags' overshoot) on --pop, which CSS turns into `scale`.
    // An inline transform kept by the scrub would cancel the flag's growth when it is pointed at.
    var pop = function (els, d) {
      return gsap.fromTo(els.filter(Boolean), { '--pop': 0 }, { '--pop': 1, duration: d, ease: M.ease.pop });
    };
    // "The source arrives", for the small sheets: M.sheetLand's gesture (64px, -20px, 3 degrees, the arrivals' ease)
    // on --land, which CSS turns into `transform`. GSAP's own x / y / rotation would write `rotate: none` and
    // `translate: none` on the sheet for as long as the scrub holds it: its resting tilt and its lift when pointed at
    // would be lost.
    var land = function (el, d) {
      return el ? gsap.fromTo(el, { '--land': 0 }, { '--land': 1, duration: d, ease: M.ease.out }) : null;
    };
    // "No source": the empty dashed flag draws itself. A dashed line cannot be drawn with its own dash offset, so a
    // solid stroke runs round the same outline inside a mask and the flag's white fills in behind it; then its label.
    var masks = 0;
    var drawFlag = function (flag, d) {
      var shape = flag && flag.querySelector('.ef--wide polygon[data-draw]');
      if (!shape || !shape.getTotalLength) return null;
      var len = Math.ceil(shape.getTotalLength());
      var mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
      var pen = shape.cloneNode(false);
      mask.id = 'rules-pen-' + (++masks);
      mask.setAttribute('maskUnits', 'userSpaceOnUse');
      ['x', 'y', 'width', 'height'].forEach(function (a, i) { mask.setAttribute(a, [-4, -4, 92, 32][i]); });
      pen.removeAttribute('data-draw');
      pen.setAttribute('style', 'fill:#fff;stroke:#fff;stroke-width:4;stroke-dasharray:' + len + ' ' + len);
      mask.appendChild(pen);
      shape.parentNode.insertBefore(mask, shape);
      var masked = function (on) { if (on) shape.setAttribute('mask', 'url(#' + mask.id + ')'); else shape.removeAttribute('mask'); };
      var draw = gsap.timeline({ onUpdate: function () { masked(draw.progress() < 1); } }); // drawn: exactly the static flag
      masked(true);
      draw.fromTo(pen, { strokeDashoffset: len, fillOpacity: 0 }, { strokeDashoffset: 0, fillOpacity: 1, duration: d, ease: 'none' }, 0)
        .fromTo(flag.querySelector('.flag__label'), { opacity: 0 }, { opacity: 1, duration: d * 0.3, ease: 'none' }, d * 0.7);
      return draw;
    };
    var stamp = function () {
      var el = $('.stamp', body);
      return el ? gsap.fromTo(el, { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1, duration: M.dur.base, ease: M.ease.out, clearProps: 'transform,opacity' }) : null;
    };

    /* ---------- What follows the scroll position without being scrubbed ---------- */
    var setCurrent = function (k) {
      if (k === current) return;
      current = k;
      section.dataset.current = k;
      // A rule that is not on screen leaves the tab order, the search and the accessibility tree; the list of names reaches it
      [1, 2, 3].forEach(function (i) { var r = rule(i); if (r) r.inert = !!st && i !== k; });
      links.forEach(function (a) {
        if (+a.dataset.ruleLink === k) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
      if (entered) mark(k, M.dur.fast);
    };
    var track = function (t) {
      setCurrent(t < CUT[1] ? 1 : t < CUT[2] ? 2 : 3);
      if (!stamped && t >= STAMP) { stamped = true; stamp(); }
      var want = t >= SOPHIE ? 1 : 0;
      if (want !== wanted) { wanted = want; setView(want); } // only when the threshold is crossed: a click holds until then
    };
    var go = function (k) {
      if (!st) return;
      var y = Math.round(st.start + (st.end - st.start) * REST[k - 1] / T);
      if (M.lenis) M.lenis.scrollTo(y); else window.scrollTo(0, y);
    };

    /* ---------- Julie / Sophie: the change of view, played around site.js's rebuild of the fragment ---------- */
    var pre = null;   // before the rebuild: what leaves
    var post = null;  // after it: what arrives
    var flush = function () { if (pre) pre.progress(1); if (post) post.progress(1); };
    var setView = function (i) { flush(); if (Leon) Leon.showView(i); };
    var arrive = function (toSophie, from) {
      post = gsap.timeline({ onComplete: function () { post = null; } });
      post.fromTo($('.answer', body), { opacity: 0 }, { opacity: 1, duration: M.dur.fast, ease: M.ease.inOut, clearProps: 'opacity' }, 0);
      $$('[data-sentence][data-n]', body).forEach(function (seg, i) {
        var n = seg.dataset.n;
        var at = i * M.dur.fast;
        add(post, M.sweep(seg), at);
        add(post, M.flagPop($('[data-cite="' + n + '"]', body)), at + M.dur.fast);
        add(post, M.flagPop($('[data-flag="' + n + '"]', body)), at + M.dur.fast);
      });
      // The ticket both of them can open stays on the desk. Both views hold it against the right edge: it travels
      // from there, and where the new sheet is wider it unfolds to the left (the clip leaves room for its flag and shadow).
      var ticket = $('.mini[data-source="' + (toSophie ? 1 : 2) + '"]', body);
      if (ticket && from) {
        var to = ticket.getBoundingClientRect();
        var grow = Math.round(to.width - from.width);
        var clip = function (left) { return 'inset(-40px -40px -40px ' + left + 'px)'; };
        post.fromTo(ticket, { x: from.right - to.right, y: from.top - to.top, clipPath: clip(grow > 0 ? grow : -40) },
          { x: 0, y: 0, clipPath: clip(-40), duration: M.dur.base, ease: M.ease.out, clearProps: 'transform,clipPath' }, 0);
      }
      if (toSophie) add(post, drawFlag($('[data-flag="0"]', body), M.dur.slow), M.dur.fast);
      else {
        add(post, land($('.mini[data-source="1"]', body), M.dur.slow), M.dur.fast); // the private email comes back
        add(post, stamp(), M.dur.fast + M.dur.base);
      }
    };
    if (Leon) {
      Leon.hooks.view = function (detail, commit) {
        if (!st) return commit(); // stacked: the plain swap of site.js
        flush();
        var toSophie = detail.view === 1;
        var ticket = $('.mini[data-source="' + (toSophie ? 2 : 1) + '"]', body); // source 2 for Julie, 1 for Sophie
        var from = ticket && ticket.getBoundingClientRect();
        pre = gsap.timeline({
          onComplete: function () {
            pre = null;
            commit(); // Sophie's markup never contains the email
            body.classList.remove('is-swapping');
            arrive(toSophie, from);
          },
        });
        // The private email slides off the desk; the answer written from it goes with it
        if (toSophie) add(pre, gsap.to($('.mini[data-source="1"]', body), { x: 96, rotation: 4, opacity: 0, duration: M.dur.base, ease: M.ease.inOut }), 0);
        // The question stays (it is the same one); only the initials change with the person
        pre.to($('.answer', body), { opacity: 0, duration: M.dur.fast, ease: M.ease.inOut }, toSophie ? M.dur.base - M.dur.fast : 0);
      };
      // A click during a change first ends it, so that site.js reads the state the screen shows
      if (sw) sw.addEventListener('click', flush, true);
    }

    /* ---------- The pinned version ---------- */
    var build = function () {
      if (!ST || !wide.matches || !wrap || !list) return false;
      section.classList.add('is-pinned');
      // Measured here, once per build; nothing is measured while scrolling
      var bar = document.querySelector('[data-nav]');
      var navH = bar ? bar.offsetHeight : 0;
      var room = window.innerHeight - navH;
      var textH = Math.max.apply(null, [1, 2, 3].map(function (k) { return text(k).offsetHeight; }));
      var h = wrap.offsetHeight;
      if (h + 32 > room) { section.classList.remove('is-pinned'); return false; } // a rule would not fit under the bar
      section.style.setProperty('--rules-top', Math.max(0, Math.round((h - textH) / 2)) + 'px');
      wrap.style.minHeight = h + 'px'; // Sophie's shorter view must not shrink the panel
      drift = Math.round(h / 4);
      var top = Math.round(navH + (room - h) / 2 - (parseFloat(window.getComputedStyle(section).paddingTop) || 0));
      if (Leon) Leon.layoutFlags();

      ctx = gsap.context(function () {
        var tl = gsap.timeline({
          defaults: { ease: 'none' },
          scrollTrigger: {
            trigger: section,
            pin: true,
            start: 'top top' + (top < 0 ? '-=' + -top : '+=' + top), // the rule sits in the middle of the room under the bar
            end: '+=' + Math.min(2000, Math.round(window.innerHeight * 2.2)),
            scrub: M.lenis ? true : M.dur.base, // Lenis already smooths the scroll
            anticipatePin: 0, // Lenis smooths the scroll; with 1 a long key jump put the panel in place 160px early
            refreshPriority: 1, // measured before the triggers further down the page, which its spacer pushes
            onUpdate: function (self) { if (!frozen) track(self.progress * T); },
          },
        });
        st = tl.scrollTrigger;

        // One sentence of fragment k: swept, its number and its flag pop, its document lands
        var cite = function (k, s, at) {
          var f = frag(k);
          var seg = $('[data-sentence="' + s + '"]', f);
          var n = seg.dataset.n;
          add(tl, sweep(seg, 1.4), at);
          add(tl, pop([$('[data-cite="' + n + '"]', f), $('[data-flag="' + n + '"]', f)], 0.8), at + 1.1);
          add(tl, land($('.mini[data-source="' + n + '"]', f), 1.6), at + 0.5);
        };
        // Rule k gives way to rule k + 1: its sheets leave (faster than they came), the marker moves, the text changes
        var turn = function (k, at) {
          tl.to($('.asheet', frag(k)), { opacity: 0, y: -16, duration: 0.7 }, at)
            .fromTo($$('.mini', frag(k)), { '--leave': 0 }, { '--leave': 1, duration: 0.7, stagger: 0.08 }, at + 0.08)
            .to(text(k), { opacity: 0, y: -12, duration: 0.6 }, at + 0.2)
            .to(marker, { y: MARKER * k, duration: 0.9, ease: M.ease.inOut }, at + 0.4)
            .fromTo(text(k + 1), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7 }, at + 0.8);
        };

        cite(1, 1, 0.4);
        cite(1, 2, 2.5);
        cite(1, 3, 4.6);
        turn(1, 9.4);
        // Answer sheets arrive straight: a turned sheet would mislead layoutFlags, which measures where each sentence starts
        add(tl, M.sheetLand($('.asheet', frag(2)), { keep: true, rotate: 0, duration: 1.4 }), 10.3);
        add(tl, drawFlag($('[data-flag="0"]', frag(2)), 1.8), 12);
        cite(2, 2, 14.2);
        turn(2, 19.2);
        // Rule 3 is rebuilt at every change of view: the scrub only holds its two stable containers
        tl.fromTo(sw, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7 }, 20.1);
        add(tl, M.sheetLand(body, { keep: true, rotate: 0, duration: 1.4 }), 20.3);
        tl.set({}, {}, T);

        var seal = !stamped && Leon && Leon.state.view === 0 && $('.stamp', body);
        if (seal) gsap.set(seal, { opacity: 0 });
      });

      wanted = Leon ? Leon.state.view : 0;
      setCurrent(1);
      return true;
    };
    var teardown = function () {
      flush();
      if (thaw) thaw();
      [1, 2, 3].forEach(function (i) { var r = rule(i); if (r) r.inert = false; });
      if (ctx) ctx.revert(); // kills the timeline and its trigger, unpins, gives every element its own styles back
      ctx = st = null;
      current = 0;
      section.classList.remove('is-pinned');
      section.removeAttribute('data-current');
      section.style.removeProperty('--rules-top');
      if (wrap) wrap.style.minHeight = '';
      $$('[data-sentence], .flag, .cite, .mini').forEach(function (el) {
        el.classList.remove('is-sweep');
        ['--sweep', '--pop', '--land', '--leave'].forEach(function (p) { el.style.removeProperty(p); });
      });
      $$('[mask]').forEach(function (el) { el.removeAttribute('mask'); });
      $$('mask').forEach(function (el) { el.remove(); });
      links.forEach(function (a) { a.removeAttribute('aria-current'); });
    };

    /* ---------- Start: the layout, then the entrance (heading, text, fragment: 70ms apart, 20px, once) ---------- */
    var waiting = [];
    var hide = function (els) { gsap.set(els, { opacity: 0, y: 20 }); return els; };
    var show = function (els) { gsap.to(els, { opacity: 1, y: 0, duration: M.dur.slow, stagger: 0.07, clearProps: 'transform,opacity' }); };
    var pinned = build();
    if (pinned) {
      // Rules 2 and 3 are held by the scrub; the section enters with rule 1
      var first = hide([list].concat($$('[data-rv]', rule(1))));
      waiting.push(M.onEnter(section, function () { entered = true; show(first); mark(current || 1, M.dur.base); }));
    } else {
      [1, 2, 3].forEach(function (k) {
        var els = hide($$('[data-rv]', rule(k)));
        waiting.push(M.onEnter(rule(k), function () { show(els); mark(k, M.dur.base); }));
      });
    }

    /* ---------- The list of names and the keyboard ---------- */
    if (list) {
      list.addEventListener('click', function (e) {
        var a = e.target.closest('[data-rule-link]');
        if (!a || !st) return;
        e.preventDefault(); // the core then leaves this link alone
        go(+a.dataset.ruleLink);
      });
    }
    // The three rules are stacked: a control that takes the focus in a rule that is not on screen brings it there
    section.addEventListener('focusin', function (e) {
      var art = st && e.target.closest('[data-rule]');
      if (art && +art.dataset.rule !== current) go(+art.dataset.rule);
    });

    /* ---------- An anchor jump (core.js, "leon:travel"): the section neither holds the page nor scrubs in passing ----------
       For the length of the travel the timeline is frozen: on rule 1 at rest when the page comes from above, as it
       stands when it comes from below, at its start when this section is the destination. And when the page passes
       right through, the block stays on screen, still, and only rises by a quarter of its height over the pin's length:
       it is seen going by, and the screen is never empty (moved back by the whole pin, it left a blank spacer behind).
       On arrival the scroll position takes over again. */
    var frozen = null;  // the scrubbed timeline, held for the length of a travel
    var slide = false;  // the pinned block is being moved back
    var drift;          // how far the block rises while the page crosses the pin: a quarter of its height. Set in build, which has already run: no initialiser here
    var unpin = function () {
      if (st && wrap) gsap.set(wrap, { y: -Math.round((drift || 0) * Math.max(0, Math.min(1, (window.scrollY - st.start) / (st.end - st.start)))) });
    };
    var thaw = function () {
      if (!frozen) return;
      var tl = frozen;
      frozen = null;
      if (slide) { gsap.ticker.remove(unpin); if (wrap) gsap.set(wrap, { clearProps: 'transform' }); }
      slide = false;
      delete tl.totalProgress;
      if (st) { tl.totalProgress(st.progress); track(st.progress * T); }
    };
    M.anchor.product = function () { return st ? Math.ceil(st.start) : null; };
    document.addEventListener('leon:travel', function (e) {
      thaw();
      if (e.detail.phase === 'end' || !st) return;
      var tl = st.animation;
      var from = window.scrollY;
      var here = e.detail.to === section;
      if (here && from >= st.start && from <= st.end) return; // back to its own start from inside: the scrub rewinds it
      flush();
      var p = here ? 0 : from < st.start ? REST[0] / T : tl.totalProgress();
      tl.totalProgress(p);
      if (here) { track(0); flush(); }
      tl.totalProgress = function () { return arguments.length ? tl : p; }; // the scrub cannot move it until the arrival
      frozen = tl;
      slide = from < st.start || from > st.end + window.innerHeight;
      if (slide) gsap.ticker.add(unpin);
    });

    /* ---------- Resize, late fonts: measure again; the scroll position puts the timeline back where it was ---------- */
    var rebuild = function () {
      var was = pinned;
      teardown();
      pinned = build();
      if (pinned !== was) {
        // Another layout: nothing may stay hidden behind a trigger that was measured in the old one
        waiting.splice(0).forEach(function (t) { if (t && t.kill) t.kill(); else if (t && t.disconnect) t.disconnect(); });
        var all = $$('[data-rv]').concat(list || []);
        gsap.killTweensOf(all);
        gsap.set(all, { clearProps: 'transform,opacity' });
        entered = true;
        [1, 2, 3].forEach(function (k) { mark(k); });
      }
      if (ST) ST.sort();
      M.refresh();
    };
    var w = window.innerWidth;
    var h = window.innerHeight;
    var timer;
    window.addEventListener('resize', function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(function () {
        if (window.innerWidth === w && window.innerHeight === h) return;
        w = window.innerWidth;
        h = window.innerHeight;
        rebuild();
      }, 200);
    });
    if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(rebuild);
  });
})();
