/* Leon « Papier » v2 : the home page's interactions. Needs js/demo.js (LeonUI).
   The page is whole without this file (index.html carries every fragment pre-built). This file adds:
   the three questions, selecting a source (from a sentence, a number, a flag, a footnote row or a sheet of the pile),
   linked pointing and focus, the Julie / Sophie switch, the phone's bottom sheet, the navigation.
   No choreography here: state changes are instant or a short CSS transition. The motion pass plugs into window.Leon.

   window.Leon
     .ui                          LeonUI (the builders)
     .state                       { scenario, top, view }   read only
     .showScenario(id)            change the hero's question ('commitment' | 'bug' | 'departure')
     .select(n, {open})           choose source n in the hero (open: false = do not open the phone sheet)
     .showView(i)                 permissions: 0 = Julie, 1 = Sophie
     .showStep(k)                 developers: the story's step, 1 = evening, 2 = night, 3 = morning (the page's default).
                                  Sets data-step on [data-story]; the same step again is allowed (hook 'step', event 'leon:step')
     .light(root, n, on)          light or unlight both ends of link n inside a [data-linked] root
     .layoutFlags()               re-place every flag (call it after any change of layout or text)
     .openSheet(n) / .closeSheet()  the phone's bottom sheet
     .hooks                       { scenario, select, view }: set a function (detail, commit) to wrap a change.
                                  Call commit() when the DOM should change (it is synchronous), animate around it
                                  (for example Flip.getState before, Flip.from after). Without a hook, commit runs at once.
   Events on document, after each change: 'leon:scenario' {id, previous}, 'leon:select' {n, previous}, 'leon:view' {view, previous}. */
(function () {
  'use strict';
  const UI = window.LeonUI;
  if (!UI) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const phone = window.matchMedia('(max-width: 699px)');
  const NOT = 'Not in this prototype';

  const state = { scenario: 'commitment', top: 1, view: 0, step: 3 };
  const api = { ui: UI, state, hooks: { scenario: null, select: null, view: null, step: null } };
  const change = (name, detail, commit) => {
    const done = () => { commit(); document.dispatchEvent(new CustomEvent(`leon:${name}`, { detail })); };
    const hook = api.hooks[name];
    if (typeof hook === 'function') hook(detail, done); else done();
  };

  /* ---------- "Not in this prototype": a quiet notice instead of a jump to the top ---------- */
  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.hidden = true;
  notice.setAttribute('role', 'status');
  document.body.append(notice);
  let noticeTimer;
  const say = (what) => {
    notice.textContent = `${what}: not in this prototype.`;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 2400);
  };
  document.addEventListener('click', (e) => {
    const el = e.target.closest(`[title="${NOT}"]`);
    if (!el) return;
    e.preventDefault();
    say(el.textContent.trim());
  });
  $$('form[data-inert]').forEach((f) => f.addEventListener('submit', (e) => { e.preventDefault(); say('Create a workspace'); }));

  /* ---------- Navigation: a line after 24px of scroll, the phone's panel ---------- */
  const nav = $('[data-nav]');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 24);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  const menu = $('[data-nav-menu]');
  const panel = $('[data-nav-panel]');
  const setMenu = (open) => { panel.classList.toggle('is-open', open); menu.setAttribute('aria-expanded', String(open)); };
  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setMenu(false); menu.focus(); } });

  /* ---------- Flags: level with their sentence, after fonts load and on every resize ---------- */
  api.layoutFlags = () => UI.layoutFlags(document);
  api.layoutFlags();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(api.layoutFlags);
  window.addEventListener('load', api.layoutFlags);
  if ('ResizeObserver' in window) {
    const ro = new ResizeObserver(api.layoutFlags);
    $$('[data-linked]').forEach((el) => ro.observe(el));
  } else window.addEventListener('resize', api.layoutFlags);

  /* ---------- Linking: pointing at or focusing one end lights the other ---------- */
  let lit = null;
  api.light = (root, n, on) => $$(`[data-n="${n}"]`, root).forEach((el) => el.classList.toggle('is-lit', on));
  const lightFrom = (target) => {
    const el = target && target.closest && target.closest('[data-n]');
    const root = el && el.closest('[data-linked]');
    if (lit && (!root || lit.root !== root || lit.n !== el.dataset.n)) { api.light(lit.root, lit.n, false); lit = null; }
    if (root && !lit) { lit = { root, n: el.dataset.n }; api.light(root, lit.n, true); }
  };
  document.addEventListener('pointerover', (e) => { if (e.pointerType !== 'touch') lightFrom(e.target); });
  document.addEventListener('focusin', (e) => lightFrom(e.target));
  document.addEventListener('focusout', () => lightFrom(null));

  /* ---------- Selecting a source inside a [data-linked] root ---------- */
  const mark = (root, n) => {
    $$('[data-cite], [data-flag], [data-note], [data-docflag]', root).forEach((b) => { if (b.matches('button')) b.setAttribute('aria-pressed', String(b.dataset.n === String(n))); });
    $$('[data-sentence][data-n], .mini[data-source]', root).forEach((el) => el.classList.toggle('is-selected', el.dataset.n === String(n)));
  };
  const stage = $('#stage');
  const answerBox = $('#hero-answer');
  const pile = $('#pile');
  const sources = () => UI.scenario(state.scenario).sources;

  const setSlots = (n) => {
    const slots = UI.slotsFor(sources(), n);
    $$('.doc', pile).forEach((d) => { d.dataset.slot = slots[d.dataset.n]; });
  };
  api.select = function (n, o = {}) {
    n = +n;
    if (!sources().some((s) => s.n === n)) return;
    if (n !== state.top) {
      const detail = { n, previous: state.top };
      change('select', detail, () => { state.top = n; mark(stage, n); setSlots(n); });
    }
    if (phone.matches && o.open !== false) api.openSheet(n);
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-n]');
    const root = el && el.closest('[data-linked]');
    if (!root || e.target.closest('a')) return;
    const n = +el.dataset.n;
    if (root !== stage) return mark(root, n);
    // The flag of the sheet already on top sends you back to its sentence
    if (el.matches('[data-docflag]') && n === state.top) {
      const cite = $(`[data-cite="${n}"]`, answerBox);
      if (cite) cite.focus();
      return;
    }
    // On the top sheet only its flag acts; a sheet lying behind comes up from anywhere on it
    if (el.closest('.doc[data-slot="top"]') && !el.matches('[data-docflag]')) return;
    api.select(n);
  });

  /* ---------- The three questions ---------- */
  const tabs = $('[data-tabs]');
  const tabList = $$('[role="tab"]', tabs);
  const placeIndicator = () => {
    const on = tabList.find((t) => t.getAttribute('aria-selected') === 'true');
    if (!on) return;
    tabs.style.setProperty('--ind-l', `${on.offsetLeft}px`);
    tabs.style.setProperty('--ind-r', `${on.offsetLeft + on.offsetWidth}px`);
  };
  placeIndicator();
  tabs.classList.add('has-ind');
  window.addEventListener('resize', placeIndicator);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(placeIndicator);

  api.showScenario = function (id) {
    const sc = UI.scenario(id);
    if (sc.id === state.scenario) return;
    const detail = { id: sc.id, previous: state.scenario };
    tabList.forEach((t) => {
      const on = t.dataset.scenario === sc.id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on) { $('#stage-panel').setAttribute('aria-labelledby', t.id); if (phone.matches) t.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    });
    placeIndicator();
    change('scenario', detail, () => {
      state.scenario = sc.id;
      state.top = 1;
      answerBox.innerHTML = UI.asheetHTML(sc, { notes: true, selected: 1 });
      pile.innerHTML = UI.pileHTML(sc.sources, 1);
      for (const box of [answerBox, pile]) { box.classList.remove('is-swapping'); void box.offsetWidth; box.classList.add('is-swapping'); }
      lit = null;
      api.layoutFlags();
    });
  };
  tabs.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) api.showScenario(t.dataset.scenario); });
  tabs.addEventListener('keydown', (e) => {
    const i = tabList.indexOf(e.target);
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    const edge = { Home: 0, End: tabList.length - 1 }[e.key];
    if (i < 0 || (!step && edge === undefined)) return;
    e.preventDefault();
    const next = tabList[edge !== undefined ? edge : (i + step + tabList.length) % tabList.length];
    next.focus();
    api.showScenario(next.dataset.scenario);
  });

  /* ---------- Permissions: the same question, asked by two people ---------- */
  const perm = $('[data-perm]');
  api.showView = function (i) {
    i = +i;
    if (!perm || i === state.view) return;
    const detail = { view: i, previous: state.view };
    const sw = $('.switch', perm);
    sw.dataset.view = i;
    $$('[data-view]', sw).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.view === i)));
    change('view', detail, () => {
      state.view = i;
      const body = $('[data-perm-body]', perm);
      body.innerHTML = UI.permHTML(i); // Sophie's view never contains the email
      body.classList.remove('is-swapping'); void body.offsetWidth; body.classList.add('is-swapping');
      lit = null;
      api.layoutFlags();
    });
  };
  if (perm) $('.switch', perm).addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) api.showView(b.dataset.view); });

  /* ---------- Phone: a source opens as a sheet sliding up from the bottom ---------- */
  const sheet = $('#bsheet');
  api.openSheet = function (n) {
    const s = sources().find((x) => x.n === +n);
    if (!s || !sheet || !sheet.showModal) return;
    $('[data-bsheet-body]', sheet).innerHTML = UI.docHTML(s, { slot: 'top' });
    if (!sheet.open) sheet.showModal();
    requestAnimationFrame(() => sheet.classList.add('is-open'));
  };
  api.closeSheet = function () {
    if (!sheet || !sheet.open) return;
    sheet.classList.remove('is-open');
    setTimeout(() => sheet.close(), 320);
  };
  if (sheet) {
    sheet.addEventListener('cancel', (e) => { e.preventDefault(); api.closeSheet(); });
    sheet.addEventListener('click', (e) => { if (e.target === sheet || e.target.closest('[data-bsheet-close]')) api.closeSheet(); });
  }

  /* ---------- Developers: the story's three steps (1 evening, 2 night, 3 morning = what the page shows by default) ---------- */
  const story = $('[data-story]');
  api.showStep = function (k) {
    k = +k;
    if (!story || ![1, 2, 3].includes(k)) return;
    // The step already shown is allowed again: a hook may replay it
    change('step', { step: k, previous: state.step }, () => {
      state.step = k;
      story.dataset.step = k;
      $$('[data-story-step]', story).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.storyStep === k)));
    });
  };
  if (story) story.addEventListener('click', (e) => { const b = e.target.closest('[data-story-step]'); if (b) api.showStep(b.dataset.storyStep); });

  window.Leon = api;
})();
