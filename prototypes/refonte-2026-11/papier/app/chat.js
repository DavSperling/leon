/* Chat: asking Leon always opens a discussion. The question is the title; each answer is a sheet, its sentences under
   the highlighter, its sources as tiles under it; a sentence, a number or a source opens the original in the side panel.
   The field at the foot goes on with a follow-up. Built on the kit (Leon.answerHTML, Leon.sourcesHTML, Leon.wire,
   Leon.panel). The first half also runs in Node: build.mjs writes the new discussion (the page at rest) into chat.html.
   Addresses: ?d=<answer id> a discussion, ?q=<words> a question typed anywhere, ?d=new (or nothing) a new discussion,
   ?state=error the answer that could not arrive. State lives in the page: a reload starts again from the address. */
(function () {
  'use strict';
  const L = window.Leon, { esc, icon } = L;
  const MAX = 4000; // the real product refuses a longer question (DISCUSSION_MESSAGE_MAX_CHARS)

  // The three suggested questions are the kit's (Leon.asksHTML, the block "asks"): the same tiles as on Home
  L.selfCheck = (assert) => {
    const t = L.asksHTML();
    assert.equal((t.match(/<li/g) || []).length, 3);
    assert.doesNotMatch(t, /tl__sub/); // a question alone: no caption, no count, no date
    for (const id of ['commitment', 'bug', 'departure', 'unknown', 'date', 'verlant', 'nordia', 'pricing']) assert.ok(L.answer(id).query, id);
    assert.equal(L.answerFor('what is our refund policy').id, 'none');
  };
  if (!L.browser) return;

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const page = $('#chat'), title = $('#chat-title'), thread = $('#thread'), form = $('#ask-form'), field = $('#q'), del = $('#del');
  const recents = $('.recents ul');

  let cur = null;   // the open discussion: { href, title, date, ex: [section, …] }
  let gen = 0;      // a discussion opened meanwhile: answers on their way to the old one are dropped
  let busy = false; // Leon is replying in this discussion

  // ---------- Drawing ----------
  const markRecent = (href) => $$('a', recents).forEach((a) => { if (a.getAttribute('href') === href) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
  const setTitle = (t) => { title.textContent = t; document.title = `${t} · Leon`; };
  const cap = (q) => q.charAt(0).toUpperCase() + q.slice(1); // a question typed in lower case still reads as a title
  const fresh = () => {
    gen += 1; busy = false; cur = null;
    L.fieldError(field, ''); // a refusal belongs to the discussion it was made in
    page.classList.add('is-new');
    thread.replaceChildren();
    setTitle('New discussion');
    del.hidden = true;
    field.placeholder = 'How can Leon help?';
    markRecent('');
  };
  const begin = (href, t, date) => {
    gen += 1; busy = false;
    L.fieldError(field, '');
    recents.parentElement.hidden = false;
    cur = { href, title: t, date, ex: [] };
    page.classList.remove('is-new');
    thread.replaceChildren();
    setTitle(t);
    del.hidden = false;
    field.placeholder = 'Ask a follow-up…';
    if (!$$('a', recents).some((a) => a.getAttribute('href') === href)) { // a discussion that is not in the list yet comes first
      const same = (s) => s.trim().toLowerCase().replace(/\W+$/, '');
      $$('a', recents).forEach((a) => { if (same(a.textContent) === same(t)) a.closest('li').remove(); }); // the same question asked again takes the place of the older one: the list never shows a title twice
      recents.insertAdjacentHTML('afterbegin', `<li><a class="nav__item" href="${esc(href)}"><span>${esc(t)}</span></a></li>`);
    }
    markRecent(href);
  };
  // A follow-up is brought into view whole, its sources included, above the docked field (.ex has the scroll margins)
  const settle = (ex) => { if (cur && cur.ex.length > 1 && cur.ex.includes(ex)) ex.scrollIntoView({ block: 'end', behavior: calm ? 'auto' : 'smooth' }); };
  // One exchange: the question (the page's title for the first one), the sheet of the answer, its sources
  const exchange = (q) => {
    const ex = document.createElement('section');
    ex.className = 'ex';
    ex.setAttribute('aria-label', q);
    ex.innerHTML = `${cur.ex.length ? `<h2 class="ex__q">${esc(q)}</h2>` : ''}<article class="paper ans"></article>`;
    ex.q = q;
    cur.ex.push(ex);
    thread.append(ex);
    return ex;
  };
  const fill = (ex, a, arriving) => {
    const box = $('.ans', ex);
    box.className = 'paper ans';
    box.removeAttribute('role');
    box.innerHTML = `${L.answerHTML(a)}${a.sources.length ? '' : '<p class="ans__more"><a class="linkbtn" href="connections.html">Connect a tool</a></p>'}<button type="button" class="btn btn--quiet btn--xs ans__copy" data-copy-ans>${icon('copy')}Copy</button>`;
    if (a.sources.length) box.insertAdjacentHTML('afterend', L.sourcesHTML(a.sources));
    ex.a = a;
    if (!ex.wired) { L.wire(ex, a); ex.wired = true; }
    settle(ex);
    if (arriving && !calm) {
      L.arrive($('[data-answer]', box));
      const src = $('[data-sources]', ex);
      if (src) src.classList.add('is-in');
    }
  };
  const reading = (box, words, ms) => {
    box.className = 'paper ans ans--reading';
    box.setAttribute('role', 'status');
    box.innerHTML = `<p class="reading" style="--work:${ms}ms"><span class="mark">${words}</span></p>`;
  };
  const failed = (box) => {
    box.className = 'paper ans ans--fail';
    box.setAttribute('role', 'alert');
    box.innerHTML = '<p class="fail"><i class="dot" aria-hidden="true"></i>Leon couldn’t answer right now. Your question is saved.</p><button type="button" class="btn btn--line btn--sm" data-retry>Try again</button>';
  };

  // ---------- Leon replies: searching, reading, then the answer arrives once (or it could not) ----------
  const reply = async (ex, fail) => {
    const g = gen, box = $('.ans', ex), a = L.answerFor(ex.q), step = Math.round(L.WORK / 2);
    busy = true;
    reading(box, 'Leon is searching memory…', step);
    await wait(step);
    if (g !== gen) return;
    if (a.sources.length && !fail) { reading(box, 'Leon is reading a source…', step); await wait(step); if (g !== gen) return; }
    busy = false;
    if (fail || !navigator.onLine) return failed(box);
    fill(ex, a, true);
  };
  const ask = (q, fail) => {
    if (!cur) { // the first question opens the discussion: it becomes its title and takes the first place among the recent ones
      const href = `chat.html?q=${encodeURIComponent(q)}`;
      begin(href, cap(q), 'Today');
      if (L.page + location.search !== href) history.replaceState(null, '', href);
    }
    const ex = exchange(q);
    settle(ex);
    return reply(ex, fail);
  };
  // A discussion already on record: drawn at once
  const show = (id) => {
    const a = L.answer(id), d = L.discussions.find((x) => x.id === id);
    begin(`chat.html?d=${id}`, a.query, d ? d.date : 'Today');
    fill(exchange(a.query), a, false);
  };

  // ---------- The address says what to open ----------
  const route = () => {
    const p = new URLSearchParams(location.search), d = p.get('d'), q = (p.get('q') || '').trim(), state = p.get('state');
    const a = d && d !== 'none' && L.answer(d);
    if (state === 'error') { fresh(); return ask(q || (a ? a.query : L.suggestions[1].label), true); }
    if (q) { fresh(); return ask(q); }
    if (a) return show(d);
    fresh();
  };

  // ---------- The field at the foot ----------
  const grow = () => { field.style.height = 'auto'; field.style.height = `${Math.min(field.scrollHeight, 196)}px`; };
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = field.value.trim();
    if (!q) { field.focus(); return L.fieldError(field, 'Enter a question.'); } // the product has no sentence for an empty field: this one is cut from its "Enter a question of no more than 4,000 characters."
    if (q.length > MAX) return L.fieldError(field, 'Enter a question of no more than 4,000 characters.');
    if (busy) return L.fieldError(field, 'Leon was already replying in this discussion. Your question is back in the composer.');
    L.fieldError(field, '');
    field.value = ''; grow();
    ask(q);
  });
  field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } });
  field.addEventListener('input', () => { grow(); if (field.getAttribute('aria-invalid') && field.value.trim() && field.value.length <= MAX) L.fieldError(field, ''); });
  $('.composer', form).addEventListener('click', (e) => { if (!e.target.closest('button')) field.focus(); });

  // ---------- Clicks: a suggestion, Copy, Try again ----------
  page.addEventListener('click', (e) => {
    const sug = e.target.closest('[data-ask]'), cp = e.target.closest('[data-copy-ans]'), retry = e.target.closest('[data-retry]');
    if (sug) { e.preventDefault(); fresh(); ask(sug.querySelector('.tl__name').textContent); field.focus(); }
    if (cp) L.copy(L.copyText(cp.closest('.ex').a), cp);
    if (retry) { reply(retry.closest('.ex')); field.focus(); }
  });

  // ---------- Deleting the open discussion: confirmed in the panel, then the next one opens ----------
  del.addEventListener('click', () => {
    const c = cur, n = new Set(c.ex.flatMap((ex) => (ex.a ? ex.a.sources.map((s) => `${s.tool}:${s.title}`) : []))).size;
    L.panel.open({
      title: c.title,
      body: L.facts([['Visible to', L.who('private')], ['Started', esc(c.date)], ['Questions', String(c.ex.length)], ['Sources cited', n ? String(n) : 'None']]),
      foot: '<button type="button" class="btn btn--quiet" data-act="ask-delete">Delete</button><button type="button" class="btn btn--line push" data-close data-focus>Done</button>',
      act: (name) => { if (name === 'ask-delete') confirm(c); },
      back: del,
    });
    confirm(c);
  });
  const confirm = (c) => L.panel.confirm({ title: 'Delete this discussion?', text: 'The discussion and all its messages will be deleted. This can’t be undone.', yes: 'Delete', no: 'Keep it' })
    .then((yes) => yes && L.panel.busy('Deleting…').then(() => {
      L.panel.close();
      const links = $$('a', recents), at = links.findIndex((a) => a.getAttribute('href') === c.href);
      const next = links[at + 1] || links[at - 1];
      if (at >= 0) links[at].closest('li').remove();
      recents.parentElement.hidden = !recents.children.length; // no "Recent" over nothing
      history.replaceState(null, '', next ? next.getAttribute('href') : 'chat.html');
      route();
      L.toast('Discussion deleted.');
      setTimeout(() => field.focus(), 200); // after the panel has given focus back
    }));

  // ---------- Moving between discussions without leaving the page ----------
  document.addEventListener('click', (e) => { // capture: before the shell's own "already there"
    const a = e.target.closest('#side a[href^="chat.html"]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || document.documentElement.classList.contains('is-drawer')) return;
    e.preventDefault();
    const href = a.getAttribute('href');
    if (L.page + location.search !== href || (!cur && href !== 'chat.html')) { history.pushState(null, '', href); route(); scrollTo({ top: 0 }); }
    field.focus();
  }, true);
  addEventListener('popstate', route);

  route();
  grow();
  field.focus();
})();
