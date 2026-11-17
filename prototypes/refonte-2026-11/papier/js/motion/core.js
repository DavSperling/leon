/* Leon « Papier » v2 : the shared motion core, window.LeonMotion.
   The contract between the page and its four motion modules (hero, rules, dev, ambient). Full notes: NOTES.md, "Motion core".

   Optional libraries, loaded before this file with defer. The page is whole without any of them:
     GSAP 3.13 (+ ScrollTrigger, Flip, SplitText), Lenis 1.3, Rough Notation 0.5.

   LeonMotion (M)
     .ok                 true when GSAP is loaded and motion is allowed. False: a module does nothing, the page is final.
     .reduced            prefers-reduced-motion
     .enabled(name)      false when the address carries ?only=<another module> (to film one module alone)
     .dur                { fast: 0.2, base: 0.42, slow: 0.6 }   the only three durations (seconds)
     .ease               { out: 'expo.out', inOut: 'power2.inOut', pop: 'back.out(1.8)' }   pop is for flags only
     .ready(fn)          fn(M) once the DOM is parsed, the fonts are loaded (1.5 s at most) and the libraries are checked
     .sweep(el, o)       the highlighter sweep: --sweep 0 -> 1 on el (gets .is-sweep).  o: duration, delay, ease, keep
     .flagPop(el, o)     a flag pops from its attached edge (scale .6 -> 1, ease pop).   o: duration, delay, keep
     .sheetLand(el, o)   a sheet arrives and lands.                                      o: x, y, rotate, duration, delay, keep
     .rough(el, o)       a hand-drawn highlight over el (Rough Notation).                o: color (1-4 or CSS), delay, duration, padding, onDone
     .onEnter(el, fn, o) fn(el) once, when el enters the viewport.                       o: start ('top 82%'), rootMargin
     .lenis              the Lenis instance, or null (reduced motion, touch-first device, library missing)
     .refresh()          a debounced ScrollTrigger.refresh
   The three gestures return a GSAP tween (add it to a timeline, or let it play), or null when motion is off.
   "keep: true" leaves the tween's inline styles in place: use it inside a scrubbed timeline, which must play backwards.

   Pre-hidden states: an inline script in <head> puts .js-motion on <html> (never under reduced motion). A module may
   pre-hide what its own load or entrance animates, under html.js-motion, with the failsafe of css/motion.css.
   Just before the modules run, this file removes .js-motion: from that instant only a module's own inline states
   (gsap.set, from, fromTo, set synchronously in its ready callback) hide anything. Nothing here ever throws. */
(function (root) {
  'use strict';
  var doc = root.document;
  var html = doc.documentElement;
  var gsap = root.gsap || null;
  var ST = root.ScrollTrigger || null;
  var mq = function (q) { return !!(root.matchMedia && root.matchMedia(q).matches); };
  var safe = function (fn, arg) {
    try { return fn(arg); } catch (err) { if (root.console) root.console.error('[LeonMotion]', err); }
  };

  var reduced = mq('(prefers-reduced-motion: reduce)');
  var only = safe(function () { return new URLSearchParams(root.location.search).get('only'); }) || null;

  var M = {
    ok: !!gsap && !reduced,
    reduced: reduced,
    dur: { fast: 0.2, base: 0.42, slow: 0.6, count: 0.8, travel: 1.1 }, // three for gestures; the count-up and an anchor jump are named too
    ease: { out: 'expo.out', inOut: 'power2.inOut', pop: 'back.out(1.8)' },
    lenis: null,
    travel: null,  // { to, y, held } while an anchor jump is under way
    quick: false,  // true while an entrance is put straight into its final state
    anchor: {},    // id -> function giving where an anchor jump to that section lands (the pinned rules)
    enabled: function (name) { return !only || only === name; },
  };

  /* ---------- Libraries ---------- */
  if (M.ok) {
    safe(function () {
      [ST, root.Flip, root.SplitText].forEach(function (plugin) { if (plugin) gsap.registerPlugin(plugin); });
      gsap.defaults({ duration: M.dur.base, ease: M.ease.out });
    });
  } else {
    html.classList.remove('js-motion'); // nothing will animate: nothing stays pre-hidden
  }

  /* ---------- ScrollTrigger: one debounced refresh, also when the page's height changes ---------- */
  var refreshTimer;
  M.refresh = function () {
    if (!M.ok || !ST) return;
    root.clearTimeout(refreshTimer);
    refreshTimer = root.setTimeout(function () { safe(function () { ST.refresh(); }); }, 160);
  };
  if (M.ok && ST) {
    safe(function () {
      var seen = 0; // ScrollTrigger already listens to the window's resize; this catches content that changes height
      ST.addEventListener('refresh', function () { seen = html.scrollHeight; });
      if ('ResizeObserver' in root) {
        new root.ResizeObserver(function () {
          if (html.scrollHeight !== seen) { seen = html.scrollHeight; M.refresh(); }
        }).observe(doc.body);
      }
      root.addEventListener('load', M.refresh);
    });
  }

  /* ---------- Lenis: inertial scrolling, in step with ScrollTrigger. Native scrolling on touch screens. ---------- */
  if (M.ok && root.Lenis && !mq('(hover: none) and (pointer: coarse)')) {
    safe(function () {
      var lenis = new root.Lenis({ autoRaf: false });
      if (ST) lenis.on('scroll', ST.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
      // A scroll Lenis did not make (a script's window.scrollTo, a key pressed during a glide) wins at once:
      // without this, Lenis finishes its glide and puts the page back where it was heading.
      root.addEventListener('scroll', function () {
        if (lenis.isScrolling === 'smooth' && Math.abs(root.scrollY - lenis.animatedScroll) > 2) {
          lenis.scrollTo(root.scrollY, { immediate: true, force: true });
        }
      }, { passive: true });
      M.lenis = lenis;
    });
  }
  /* ---------- Anchor jumps: one calm move of a fixed length, whatever the distance (home-v2.md, update 5) ----------
     While the page travels nothing plays along the way. The entrances of the sections it passes are put straight
     into their final state before it leaves; the ones it lands on wait for the arrival and play once there. Modules
     are told by the event "leon:travel" on document (detail: { phase: 'start' | 'end', to, y }): the pinned rules use
     it so that they neither hold the page nor scrub in passing. The section's content lands 32px under the bar. */
  var enters = []; // every M.onEnter that has not played yet
  var fire = function (entry, quick) {
    if (entry.done) return;
    entry.done = true;
    if (!quick) return safe(entry.fn, entry.el);
    M.quick = true; // M.rough draws at once; a module can read it (the developers' story goes to its end)
    // Whatever the entrance sets going is taken to its end: what it creates, what it un-pauses (a timeline built
    // earlier), and what those endings start in turn (a delayed call that creates the tweens). Everything that was
    // already running (the carousel, a tween in flight) is left alone.
    var running = function () {
      return gsap.globalTimeline.getChildren(false, true, true).filter(function (a) { return !a.paused() && a.totalProgress() < 1; });
    };
    var before = running();
    safe(entry.fn, entry.el);
    for (var depth = 0; depth < 6; depth++) {
      var started = running().filter(function (a) { return before.indexOf(a) < 0; });
      if (!started.length) break;
      started.forEach(function (a) { safe(function () { a.totalProgress(1); }); });
      before = before.concat(started); // one that would not end is not tried twice
    }
    M.quick = false;
    if (entry.st && entry.st.kill) entry.st.kill();
  };
  var endTravel = null;
  var mover = null;
  var travel = function (target, id) {
    if (endTravel) endTravel();
    if (mover) mover.kill();
    // First, because a section put in its final state can change height (the developers' terminal in the morning)
    enters.slice().forEach(function (entry) {
      if (entry.done) return;
      if (ST && entry.st && ST.getAll().indexOf(entry.st) < 0) { entry.done = true; return; } // its module dropped it
      if (target.compareDocumentPosition(entry.el) & 2) fire(entry, true); // 2: the element comes before the destination
    });
    var bar = doc.querySelector('[data-nav]');
    var from = root.scrollY;
    var own = M.anchor[id] ? safe(M.anchor[id]) : null;
    var y = id === 'top' ? 0 : own != null ? own
      : target.getBoundingClientRect().top + from + (parseFloat(root.getComputedStyle(target).paddingTop) || 0) - (bar ? bar.offsetHeight : 0) - 32;
    y = Math.max(0, Math.min(Math.round(y), html.scrollHeight - root.innerHeight));
    var state = M.travel = { to: target, y: y, held: [] };
    html.classList.add('is-travelling');
    doc.dispatchEvent(new root.CustomEvent('leon:travel', { detail: { phase: 'start', to: target, y: y } }));
    var timer = 0;
    endTravel = function () {
      endTravel = null;
      root.clearTimeout(timer);
      html.style.scrollBehavior = '';
      M.travel = null;
      html.classList.remove('is-travelling');
      doc.dispatchEvent(new root.CustomEvent('leon:travel', { detail: { phase: 'end', to: target, y: y } }));
      if (ST) safe(function () { ST.update(); });
      state.held.forEach(function (entry) { fire(entry); }); // only the destination plays its entrance, on arrival
    };
    var done = function () { if (M.travel === state && endTravel) endTravel(); };
    if (Math.abs(y - from) < 2) return done();
    timer = root.setTimeout(done, M.dur.travel * 1000 + 400); // a travel that was cut short still lets go
    if (M.lenis) return M.lenis.scrollTo(y, { duration: M.dur.travel, easing: gsap.parseEase(M.ease.inOut), lock: true, force: true, onComplete: done });
    html.style.scrollBehavior = 'auto'; // no Lenis (a touch screen): the same move, driven by GSAP
    var pos = { y: from };
    mover = gsap.to(pos, { y: y, duration: M.dur.travel, ease: M.ease.inOut, onUpdate: function () { root.scrollTo({ top: pos.y, behavior: 'instant' }); }, onComplete: done });
  };
  // In-page links travel. A module that handles a link itself calls preventDefault first (it runs before this).
  doc.addEventListener('click', function (e) {
    if (!M.ok || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var link = e.target.closest && e.target.closest('a[href^="#"]');
    var id = link && link.getAttribute('href').slice(1);
    var target = id && doc.getElementById(id);
    if (!target) return;
    e.preventDefault();
    safe(function () {
      travel(target, id);
      if (root.history && root.history.pushState) root.history.pushState(null, '', '#' + id);
      // The keyboard follows: the next Tab starts inside the section that was asked for
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  /* ---------- The three gestures of Leon's language ---------- */
  var num = function (v, fallback) { return v == null ? fallback : v; };

  // "Found here": the highlighter fills from the left. el is a sentence (an ancestor of its .hl strokes).
  M.sweep = function (el, o) {
    o = o || {};
    if (!M.ok || !el) return null;
    el.classList.add('is-sweep');
    return gsap.fromTo(el, { '--sweep': 0 }, {
      '--sweep': 1,
      duration: num(o.duration, M.dur.base),
      delay: o.delay || 0,
      ease: o.ease || M.ease.inOut,
      onComplete: function () {
        if (o.keep) return;
        el.classList.remove('is-sweep'); // back to the plain stroke, which deepens when pointed at
        el.style.removeProperty('--sweep');
      },
    });
  };

  // "Linked": the flag pops out of the edge it is attached to (a .flag--left sticks out to the left).
  M.flagPop = function (el, o) {
    o = o || {};
    if (!M.ok || !el) return null;
    return gsap.fromTo(el, { scale: 0.6, opacity: 0, transition: 'none' }, {
      scale: 1,
      opacity: 1,
      transformOrigin: el.classList.contains('flag--left') ? '100% 50%' : '0% 50%',
      duration: num(o.duration, M.dur.base),
      delay: o.delay || 0,
      ease: M.ease.pop,
      clearProps: o.keep ? '' : 'transform,transformOrigin,opacity,transition',
    });
  };

  // "The source arrives": a sheet travels, turns slightly and settles on its resting place. A sheet may rest on a CSS
  // `translate` / `rotate` (the pile's slots, the small sheets' tilt). GSAP folds those into its own transform the
  // moment it touches the element, so the tween ends on them, not on zero: nothing jumps when the sheet is handed back.
  M.sheetLand = function (el, o) {
    o = o || {};
    if (!M.ok || !el) return null;
    var cs = root.getComputedStyle(el);
    var shift = String(cs.translate || 'none').split(' ');
    var px = function (v, size) { return (parseFloat(v) || 0) * (/%$/.test(v || '') ? size / 100 : 1); };
    var tx = px(shift[0], el.offsetWidth);
    var ty = px(shift[1], el.offsetHeight);
    var turn = parseFloat(cs.rotate) || 0;
    return gsap.fromTo(el, { x: tx + num(o.x, 64), y: ty + num(o.y, -20), rotation: turn + num(o.rotate, 3), opacity: 0 }, {
      x: tx,
      y: ty,
      rotation: turn,
      opacity: 1,
      duration: num(o.duration, M.dur.slow),
      delay: o.delay || 0,
      ease: M.ease.out,
      clearProps: o.keep ? '' : 'transform,opacity',
    });
  };

  /* ---------- The marketing voice, drawn by hand (Rough Notation). The flat CSS stroke is the fallback. ---------- */
  var highlighter = function (c) { // 1 to 4: a highlighter of the palette; anything else: a CSS colour
    var n = /^[1-4]$/.test(String(c)) ? c : null;
    if (c && !n) return c;
    return root.getComputedStyle(html).getPropertyValue('--m' + (n || 4)).trim() || '#FFD48F';
  };
  M.rough = function (el, o) {
    o = o || {};
    var RN = root.RoughNotation;
    if (!M.ok || !el || !RN || typeof RN.annotate !== 'function') return null; // the CSS stroke stays
    var host = (el.closest && el.closest('.swp, .hmark')) || el;
    var ms = Math.round(num(o.duration, M.dur.base) * 1000);
    try {
      var note = RN.annotate(el, {
        type: 'highlight',
        color: highlighter(o.color),
        multiline: true,
        iterations: 1,
        animationDuration: ms,
        padding: num(o.padding, [1, 3]),
      });
      host.classList.add('is-drawn'); // the flat stroke steps aside at once, so the two never show together
      var quick = M.quick; // an entrance passed by an anchor jump: drawn whole, at once
      var draw = function () {
        try { if (quick) note.animate = false; note.show(); } catch (err) { host.classList.remove('is-drawn'); return; }
        if (typeof o.onDone === 'function') gsap.delayedCall(quick ? 0 : ms / 1000, function () { safe(o.onDone, note); });
      };
      if (quick) draw(); else gsap.delayedCall(o.delay || 0, draw);
      return note;
    } catch (err) {
      host.classList.remove('is-drawn');
      return null;
    }
  };

  /* ---------- Entering the viewport, once ---------- */
  M.onEnter = function (el, fn, o) {
    o = o || {};
    if (!el || typeof fn !== 'function') return null;
    var entry = { el: el, fn: fn, done: false, st: null };
    // During an anchor jump an entrance waits for the arrival (see "Anchor jumps")
    var call = function () { if (M.travel) M.travel.held.push(entry); else fire(entry); };
    if (M.ok && ST) {
      enters.push(entry);
      entry.st = safe(function () { return ST.create({ trigger: el, start: o.start || 'top 82%', once: true, onEnter: call }); }) || null;
      return entry.st;
    }
    if ('IntersectionObserver' in root) {
      var io = new root.IntersectionObserver(function (entries) {
        if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
        io.disconnect();
        call();
      }, { rootMargin: o.rootMargin || '0px 0px -18% 0px' });
      io.observe(el);
      return io;
    }
    call();
    return null;
  };

  /* ---------- ready: DOM parsed, fonts loaded (or 1.5 s), libraries checked ---------- */
  var queue = [];
  var started = false;
  var run = function (fn) { safe(fn, M); };
  M.ready = function (fn) {
    if (typeof fn !== 'function') return;
    if (started) run(fn); else queue.push(fn);
  };
  var start = function () {
    if (started) return;
    started = true;
    // The CSS pre-hides let go here; each module sets its own first states in the same task, before any paint.
    html.classList.remove('js-motion');
    queue.splice(0).forEach(run);
    if (M.ok) html.classList.add('motion-on');
    M.refresh();
  };
  var fonts = doc.fonts && doc.fonts.ready ? doc.fonts.ready : Promise.resolve();
  var armed = false;
  var arm = function () {
    if (armed) return;
    armed = true;
    if (!M.ok) return start();
    // A slow font must not hold the page back: after 1.5 s the modules start anyway, and a late font refreshes the triggers
    var cap = new Promise(function (resolve) { root.setTimeout(resolve, 1500); });
    Promise.race([fonts, cap]).then(start, start);
    fonts.then(M.refresh, function () {});
  };
  // Deferred scripts run before DOMContentLoaded: waiting for it lets every module register before anything starts.
  if (doc.readyState === 'complete') arm();
  else {
    doc.addEventListener('DOMContentLoaded', arm, { once: true });
    root.addEventListener('load', arm, { once: true });
  }

  root.LeonMotion = M;
})(window);
