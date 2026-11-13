/* Leon « Papier » v2 : Chat. The page is whole without this file. It adds: opening an original under its sources,
   switching discussion (?d=commitment | bug | departure | unknown | new | first), and asking (a line while Leon reads, then the answer; an error when offline).
   For review: ?state=loading and ?state=error show those two states on the open discussion.
   Needs ../shared/demo-data.js, js/demo.js and js/app.js (LeonApp builders) before it. */
(function () {
  'use strict';
  const UI = window.LeonUI, App = window.LeonApp || {};
  const thread = document.querySelector('[data-thread]');
  const form = document.querySelector('[data-composer]');
  const done = () => document.documentElement.classList.remove('is-swapping');
  if (!UI || !App.answerHTML || !thread || !form) return done();
  const $$ = (s, r = thread) => [...r.querySelectorAll(s)];
  const tpl = (id) => document.getElementById(id).content.firstElementChild.cloneNode(true);
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mould = thread.querySelector('[data-turn]').cloneNode(true); // the turn written in the page is the mould of the others
  let copies = 1;

  // One original at a time, under the sources of its turn. n = '' closes it.
  const show = (turn, n, scroll) => {
    $$('[data-cite], [data-src]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === n && turn.contains(b))));
    $$('.seg[data-n]').forEach((s) => s.classList.toggle('is-selected', s.dataset.n === n && turn.contains(s)));
    $$('[data-source]').forEach((doc) => {
      const on = doc.dataset.n === n && turn.contains(doc);
      doc.classList.toggle('is-in', on && doc.hidden);
      doc.hidden = !on;
      if (on && scroll) doc.scrollIntoView({ block: 'nearest', behavior: calm ? 'auto' : 'smooth' });
    });
  };
  // A sentence, a number or a row opens that original; the row of the open one closes it. A suggested question asks it.
  thread.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-ask]');
    if (chip) { e.preventDefault(); return ask(chip.textContent); }
    const el = e.target.closest('[data-n]');
    const turn = el && el.closest('[data-turn]');
    if (!turn || el.closest('[data-source]')) return;
    show(turn, el.matches('[data-src][aria-pressed="true"]') ? '' : el.dataset.n, true);
  });

  const turnOf = (sc, when) => {
    const t = mould.cloneNode(true);
    const id = `copy-${++copies}`;
    t.querySelector('[data-q]').textContent = sc.query;
    t.querySelector('[data-when]').textContent = when;
    t.querySelector('[data-answer]').outerHTML = App.answerHTML(sc);
    t.querySelector('.ans__note').textContent = sc.unknown ? 'Nothing on record answers this. The closest source is below.' : 'Written from the sources below. Check them.';
    t.querySelector('[data-srcs]').outerHTML = App.sourcesHTML(sc.sources);
    t.querySelector('[data-orig]').innerHTML = sc.sources.map((s) => App.originalHTML(s, { hidden: true })).join('');
    Object.assign(t.querySelector('[data-copy-text]'), { id, textContent: App.copyText(sc) });
    t.querySelector('[data-copy]').dataset.copy = `#${id}`;
    return t;
  };

  // Asking. The prototype answers with one of the four demo questions, picked by keyword as on the answer screen.
  const pick = (q) => UI.scenario(/verlant|price/i.test(q) ? 'unknown' : /pdf|bug|export/i.test(q) ? 'bug' : /thomas/i.test(q) ? 'departure' : 'commitment');
  function ask(q, state) {
    const t = turnOf(pick(q), 'You · Just now');
    const run = (mode) => {
      $$('.busy, .alert', t).forEach((x) => x.remove());
      t.classList.add('is-pending');
      t.append(tpl('t-busy'));
      if (mode === 'loading') return;
      setTimeout(() => {
        t.querySelector('.busy').remove();
        if (mode === 'error' || !navigator.onLine) return t.appendChild(tpl('t-error')).querySelector('[data-retry]').addEventListener('click', () => run());
        t.classList.remove('is-pending');
        const a = t.querySelector('[data-answer]'); // once: each stroke sweeps, then its number pops (classes from css/app.css)
        const segs = $$('.seg', a);
        if (calm) return;
        segs.forEach((s, i) => { s.style.setProperty('--k', i); s.classList.add('is-sweep'); });
        a.classList.add('is-arriving');
        setTimeout(() => { a.classList.remove('is-arriving'); segs.forEach((s) => s.classList.remove('is-sweep')); }, segs.length * 240 + 700);
      }, mode ? 0 : 900);
    };
    if (thread.querySelector('[data-empty]')) { // the first question of a new discussion: it takes its place at the top of the list
      thread.replaceChildren();
      const list = document.querySelector('[data-list]') || Object.assign(document.createElement('ul'), { className: 'rows' });
      if (!list.isConnected) document.querySelector('.chat__none').replaceWith(list);
      list.insertAdjacentHTML('afterbegin', '<li><a class="row" href="#main" aria-current="true"><span class="row__title"></span><span class="row__meta">Just now</span></a></li>');
      list.querySelector('.row__title').textContent = t.querySelector('[data-q]').textContent;
    }
    form.elements.q.placeholder = 'Ask another question…';
    thread.append(t);
    run(state);
    t.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = form.elements.q.value.trim();
    form.reset();
    if (q) ask(q);
  });

  // Which discussion: the page carries "Did ACME accept the new migration date?"; ?d= shows another one or an empty state
  const p = new URLSearchParams(location.search);
  const d = p.get('d');
  done(); // before the field takes focus: nothing out of sight can
  const sc = d && UI.data.scenarios.find((x) => x.id === d);
  if (sc) { // ?d=<scenario id>: one of the four demo questions, as a discussion
    const row = document.querySelector(`.row[data-d="${d}"]`);
    thread.replaceChildren(turnOf(sc, `You · ${row ? row.querySelector('.row__meta').textContent : 'Today'}`));
    // continued from the answer screen and not in the list yet: it takes the first place
    if (!row) document.querySelector('[data-list]').insertAdjacentHTML('afterbegin', `<li><a class="row" data-d="${d}" href="app-chat.html?d=${d}"><span class="row__title">${UI.esc(sc.query)}</span><span class="row__meta">Today</span></a></li>`);
    document.title = `${sc.query} · Leon`;
  }
  if (d === 'new' || d === 'first') { thread.replaceChildren(tpl('t-new')); form.elements.q.placeholder = 'Ask a question…'; form.elements.q.focus(); }
  if (d === 'first') document.querySelector('[data-list]').replaceWith(tpl('t-nolist'));
  if (d) $$('.row[data-d]', document).forEach((r) => (r.dataset.d === d ? r.setAttribute('aria-current', 'true') : r.removeAttribute('aria-current')));
  if (p.get('state')) ask('', p.get('state'));
})();
