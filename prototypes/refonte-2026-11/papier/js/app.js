/* Leon « Papier » v2 : the app after login. Two parts.
   1. window.LeonApp: the builders of what Leon writes inside the app, as HTML strings (no DOM needed). The pages carry
      their output already (tools/build-app.mjs pastes it between <!--gen:…--> markers), so nothing here is needed to
      see a page. Needs ../shared/demo-data.js and js/demo.js (LeonUI) before it.
        .answerHTML(answer, {selected})     <div class="answer" data-answer>: one stroke per source, a number after each
                                            sentence, a dashed "no source" mark after a sentence nothing supports.
                                            When the answer is "I don't know" (answer.unknown), the closest record is in
                                            plain ink with its number: it is not an answer, so it carries no stroke
        .sourcesHTML(sources, {selected, link})   <ol class="srcs">: the source rows (buttons; link: true = <a>, no selection)
        .originalHTML(source, {hidden})     LeonUI.docHTML, with the app's wording for a private source ("Only you"), the
                                            flag as a mark (not a button) and "Open in …" as data-ext
        .resultHTML(id, selected, query)    the whole answer screen for an answer: answer, sources, originals
        .copyText(answer)                   the answer as plain text, with [n] and the list of sources
        .answer(id)                         a demo answer by its id: commitment | bug | departure | unknown (the scenarios),
                                            date (the permissions question, as Julie sees it), verlant | nordia | pricing
                                            (LEON_APP.answers), none (LEON_APP.noAnswer: nothing on record)
        .match(words)                       the id of the demo answer some typed words are about, or "none"
      The app has its own answer builder because its sentences carry no flag on the sheet's edge (LeonUI.answerHTML does).
   2. Behaviour every page gets: the current entry, the account menu, the menu under 900px, copy buttons, selection on
      the answer screen, and the kit pieces of the finishing round (markup and rules in NOTES-app.md):
        data-open="<id>" on a button        a disclosure: shows and hides that element (LeonApp.open, LeonApp.close;
                                            events leon:open and leon:close on the element). data-close-label swaps the
                                            label, data-close inside closes, Escape closes, [data-one-open] keeps one open
        .confirm + data-confirm="<action>"  a confirmation in place: the choice sends leon:confirm from the .confirm
        LeonApp.say(text)                   the notice (role="status"), 2.4 s
        LeonApp.done(button, 'Saved')       the button says it for 1.6 s
        LeonApp.busy(element, text, ms)     the .busy line in the element for ms, then its content back; a promise
        data-ext="<Tool>"                   a link that leaves Leon: the notice says where it goes in the real product
      The notice on controls marked title="Not in this prototype" is still here; no page should need it any more. */
(function (root) {
  'use strict';
  const UI = root.LeonUI;
  const App = {};

  if (UI) {
    const { esc, col } = UI;
    const marked = (s, n) => esc(s).replace(/\*\*(.+?)\*\*/g, (_, t) => `<mark class="hl hl-${col(n)}">${t}</mark>`);
    const visText = (s) => (s.visibility === 'private' ? 'Only you' : 'Shared with the team');
    // A sentence ends with a full stop unless the next one continues it ("…, and a revised quote…")
    const stop = (segs, i) => (segs[i + 1] && /^[a-z]/.test(segs[i + 1].text) ? '' : '.');
    // Where "Open in …" goes: an uploaded document is in Leon (Documents); anything else leaves Leon for its tool (data-ext)
    const away = (s) => (s.upload ? 'href="app-documents.html"' : `href="#" data-ext="${esc(s.toolLabel)}"`);

    // Every demo answer by its id, and the id some typed words are about ("none": nothing on record answers them)
    App.answer = function (id) {
      const d = UI.data;
      const a = root.LEON_APP || {};
      if (id === 'date') return { id, query: d.permissions.query, ...d.permissions.views[0] };
      if (id === 'none') return a.noAnswer || null;
      return [...d.scenarios, ...(a.answers || [])].find((s) => s.id === id) || null;
    };
    const ABOUT = [ // in this order: the first that matches wins
      ['pricing', /pricing|q1/], ['nordia', /nordia/], ['verlant', /verlant.*(own|account)|(own|who).*verlant/], ['unknown', /verlant|price/],
      ['bug', /pdf|bug|export/], ['departure', /thomas/], ['date', /migration|accept|dec(ember)? 2/], ['commitment', /acme|v2|promis/],
    ];
    App.match = function (words) {
      const t = String(words || '').toLowerCase();
      return (ABOUT.find(([, re]) => re.test(t)) || ['none'])[0];
    };

    App.answerHTML = function (answer, o = {}) {
      const segs = answer.segments;
      const mk = answer.unknown ? 'span' : 'mark'; // "I don't know": the closest record keeps its number, not its stroke
      const name = (n) => { const s = (answer.sources || []).find((x) => x.n === n); return s ? `: ${s.toolLabel}, ${s.title}` : ''; };
      return `<div class="answer" data-answer><p class="answer__p">${segs.map((seg, i) => {
        const t = esc(seg.text);
        if (!seg.cites.length) return `<span class="seg seg--none" data-sentence="${i + 1}">${t}${stop(segs, i)}<span class="nosrc">no source</span></span>`;
        const n = seg.cites[0];
        const cut = t.lastIndexOf(' '); // the last word, the full stop and the number never part across a line
        const cites = seg.cites.map((c) => `<button type="button" class="cite c${col(c)}" data-cite="${c}" data-n="${c}" aria-pressed="${c === o.selected}" aria-label="Source ${c}${esc(name(c))}">${c}</button>`).join('');
        const hl = answer.unknown ? 'plain' : `hl hl-${col(n)}`;
        return `<span class="seg${n === o.selected ? ' is-selected' : ''}" data-sentence="${i + 1}" data-n="${n}"><${mk} class="${hl} hl--a">${t.slice(0, cut + 1)}</${mk}><span class="nw"><${mk} class="${hl} hl--b">${t.slice(cut + 1)}${stop(segs, i)}</${mk}>${cites}</span></span>`;
      }).join(' ')}</p></div>`;
    };

    App.sourcesHTML = function (sources, o = {}) {
      return `<ol class="srcs" data-srcs aria-label="Sources">${sources.map((s) => {
        const open = o.link ? `a class="src c${col(s.n)}" ${away(s)}` : `button type="button" class="src c${col(s.n)}" data-src="${s.n}" data-n="${s.n}" aria-pressed="${s.n === o.selected}"`;
        return `<li><${open}><span class="num"><span class="vh">Source </span>${s.n}</span>${UI.logo(s.tool)}<span class="src__title">${esc(s.title)}</span><span class="src__vis${s.visibility === 'private' ? ' vis--only' : ''}">${visText(s)}</span><span class="src__meta">${esc(s.toolLabel)} · ${esc(s.kind)} · ${esc(s.author)} · ${esc(s.date)}</span><span class="src__passage">${marked(s.passage, s.n)}</span></${o.link ? 'a' : 'button'}></li>`;
      }).join('')}</ol>`;
    };

    App.originalHTML = function (s, o = {}) {
      return UI.docHTML(s)
        .replace('href="#" title="Not in this prototype"', away(s))
        // in the app the flag on the sheet's edge is a mark, not a control: the rows and the numbers choose the source
        .replace(/<button type="button" class="flag flag--left"[^>]*>(\d+)<\/button>/, '<span class="flag flag--left" aria-hidden="true">$1</span>')
        .replace('<span class="stamp">Private to you</span>', '<span class="vis vis--only">Only you</span>')
        .replace('<article ', `<article ${o.hidden ? 'hidden ' : ''}`);
    };

    // « query »: the words that were typed, when they are not the answer's own question (they go on to Chat)
    App.resultHTML = function (id, selected, query) {
      if (!App.answer(id)) id = 'commitment';
      const sc = App.answer(id);
      const none = !!sc.unknown;
      if (selected === undefined) selected = none ? 0 : 1; // "I don't know" opens no original: nothing answers
      const count = sc.sources.length;
      const chat = id === 'none' ? `q=${encodeURIComponent(query || '')}` : `d=${id}`;
      return `<div class="duo result">
<div>
<section class="ans" aria-labelledby="ans-h">
<h2 class="h-sec" id="ans-h">Leon’s answer</h2>
${App.answerHTML(sc, { selected })}
<p class="ans__note">${!none ? 'Written from the sources below. Check them.' : count ? 'Nothing on record answers this. The closest source is below.' : 'Nothing on record answers this.'}</p>${none ? `
<p class="ans__hint">Leon answers only from what is on record and what you can open. If the answer is in a tool that is not connected yet, <a class="link" href="app-connections.html">connect it</a>.</p>` : ''}
<p class="ans__actions"><a class="btn btn--line btn--sm" href="app-chat.html?${chat}">Continue in chat</a><button type="button" class="btn btn--line btn--sm" data-copy="answer">Copy with sources</button></p>
</section>${count ? `
<section class="sec" aria-labelledby="src-h">
<div class="sec__head"><h2 class="h-sec" id="src-h">${none ? 'Closest on record' : 'Sources'}</h2><p class="sec__meta">${count} ${count === 1 ? 'source' : 'sources'}</p></div>
${App.sourcesHTML(sc.sources, { selected })}
</section>` : ''}
</div>${count ? `
<aside class="orig" aria-labelledby="orig-h" data-orig>
<h2 class="h-sec" id="orig-h">Original</h2>
<p class="orig__none" data-orig-none${selected ? ' hidden' : ''}>Choose a source to read its original, opened at the passage.</p>
${sc.sources.map((s) => App.originalHTML(s, { hidden: s.n !== selected })).join('\n')}
</aside>` : ''}
</div>`;
    };

    App.copyText = function (answer) {
      const segs = answer.segments;
      return `${segs.map((s, i) => s.text + stop(segs, i) + s.cites.map((c) => ` [${c}]`).join('')).join(' ')}\n\n${answer.sources.map((s) => `[${s.n}] ${s.toolLabel} · ${s.title} · ${s.author}, ${s.date}`).join('\n')}`;
    };
  }

  root.LeonApp = App;
  if (!root.document) return; // tools/build-app.mjs stops here

  /* ================= Behaviour ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* The current entry: aria-current="page" is written in each page; <body data-screen> is the safety net */
  const screen = document.body.dataset.screen;
  if (screen && !$('.side__link[aria-current]')) {
    const entry = $(`.side__link[data-nav="${screen}"]`);
    if (entry) entry.setAttribute('aria-current', 'page');
  }

  /* The account menu: opens under the workspace row; closes on Escape, on a click outside, when focus leaves */
  const acct = $('[data-acct]');
  const menu = acct && document.getElementById(acct.getAttribute('aria-controls'));
  if (menu) {
    const setMenu = (open, refocus) => {
      menu.hidden = !open;
      acct.setAttribute('aria-expanded', String(open));
      if (!open && refocus) acct.focus();
    };
    acct.addEventListener('click', () => setMenu(menu.hidden));
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.acct')) setMenu(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) setMenu(false, true); });
    acct.parentNode.addEventListener('focusout', (e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setMenu(false); });
  }

  /* Under 900px: the sidebar is a top bar and its body opens with the Menu button */
  const side = $('[data-side]');
  const menuBtn = $('[data-side-menu]');
  if (side && menuBtn) {
    menuBtn.addEventListener('click', () => {
      const open = side.classList.toggle('is-open');
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
    });
  }

  /* ---------- Feedback ----------
     say: something happened elsewhere on the page, or left the page (a row removed, a link that leaves Leon).
     done: the button that was pressed says the result for 1.6 s. busy: an element shows that it is working. */
  let notice;
  let noticeTimer;
  App.say = function (text, ms = 2400) {
    if (!notice) {
      notice = document.createElement('p');
      notice.className = 'notice';
      notice.setAttribute('role', 'status');
      document.body.appendChild(notice);
    }
    notice.textContent = text;
    notice.hidden = false;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice.hidden = true; }, ms);
  };

  const labels = new WeakMap(); // a button saying "Saved" → its own label and the timer that brings it back
  App.done = function (btn, label = 'Saved') {
    const was = labels.get(btn) || { text: btn.textContent };
    if (!labels.has(btn)) btn.style.minWidth = `${btn.offsetWidth}px`; // the button does not shrink around a shorter word
    clearTimeout(was.timer);
    btn.setAttribute('aria-live', 'polite');
    btn.textContent = label;
    was.timer = setTimeout(() => { btn.textContent = was.text; labels.delete(btn); }, 1600);
    labels.set(btn, was);
  };

  // The element's content gives way to the .busy line for ms, then comes back (focus too). Resolves with the element.
  App.busy = function (el, text, ms = 700) {
    const kids = [...el.childNodes];
    const had = el.contains(document.activeElement) ? document.activeElement : null;
    const line = document.createElement('span');
    line.className = 'busy';
    line.setAttribute('role', 'status');
    line.textContent = text;
    if (el.matches('button, .btn')) el.style.minWidth = `${el.offsetWidth}px`;
    el.setAttribute('aria-busy', 'true');
    el.replaceChildren(line);
    return new Promise((resolve) => setTimeout(() => {
      el.replaceChildren(...kids);
      el.removeAttribute('aria-busy');
      if (had && had.isConnected && !had.contains(document.activeElement)) had.focus();
      resolve(el);
    }, ms));
  };
  // While something is busy it does not take a second click or a second Enter
  document.addEventListener('click', (e) => { if (e.target.closest('[aria-busy="true"]')) { e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('submit', (e) => { if (e.target.querySelector('[aria-busy="true"]')) { e.preventDefault(); e.stopPropagation(); } }, true);

  /* ---------- Disclosure: data-open="<id>" on a button shows and hides the element with that id ----------
     Its first use is the row detail (tr.detail or li > .detail), then the confirmation (.confirm). */
  const stack = []; // what is open, the latest last: { el, opener }
  const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';
  const byId = (x) => (typeof x === 'string' ? document.getElementById(x) : x);
  const prune = () => { for (let i = stack.length - 1; i >= 0; i -= 1) if (!stack[i].el.isConnected) stack.splice(i, 1); }; // a row that left the page
  const holder = (node) => { prune(); return [...stack].reverse().find((x) => x.el.contains(node)); }; // the innermost open element around a node
  const mark = (t, open) => {
    if (!t.id) return;
    $$(`[data-open="${t.id}"]`).forEach((b) => {
      b.setAttribute('aria-controls', t.id);
      b.setAttribute('aria-expanded', String(open));
      if (!b.dataset.closeLabel) return;
      if (!b.dataset.openLabel) b.dataset.openLabel = b.textContent;
      b.textContent = open ? b.dataset.closeLabel : b.dataset.openLabel;
    });
  };
  $$('[data-open]').forEach((b) => { // what the page says at rest
    const t = byId(b.dataset.open);
    if (!t) return;
    b.setAttribute('aria-controls', t.id);
    b.setAttribute('aria-expanded', String(!t.hidden));
  });

  App.close = function (target, refocus = true) {
    const t = byId(target);
    if (!t || t.hidden) return;
    prune();
    stack.filter((x) => x.el !== t && t.contains(x.el)).forEach((x) => App.close(x.el, false)); // what it holds closes with it
    const i = stack.findIndex((x) => x.el === t);
    const opener = i < 0 ? null : stack.splice(i, 1)[0].opener;
    t.hidden = true;
    mark(t, false);
    t.dispatchEvent(new CustomEvent('leon:close', { bubbles: true, detail: { opener } }));
    if (refocus && opener && opener.isConnected) opener.focus();
  };

  App.open = function (target, opener) {
    const t = byId(target);
    if (!t) return;
    prune();
    const group = t.parentElement && t.parentElement.closest('[data-one-open]'); // one thing open at a time, except what holds this one
    if (group) stack.filter((x) => x.el !== t && group.contains(x.el) && !x.el.contains(t)).forEach((x) => App.close(x.el, false));
    t.hidden = false;
    if (!stack.some((x) => x.el === t)) stack.push({ el: t, opener: opener || null });
    mark(t, true);
    t.dispatchEvent(new CustomEvent('leon:open', { bubbles: true, detail: { opener: opener || null } })); // a screen may fill it now
    // A confirmation is a named group, and "Cancel" takes focus. Anything else: its first control, or itself.
    const ask = t.matches('.confirm') ? t : t.querySelector('.confirm:not([hidden])');
    if (ask && !ask.hasAttribute('role')) {
      ask.setAttribute('role', 'group');
      if (ask.querySelector('b')) ask.setAttribute('aria-label', ask.querySelector('b').textContent);
    }
    const to = t.querySelector('[data-focus]') || (ask && ask.querySelector('[data-close]')) || $$(FOCUSABLE, t).find((x) => x.getClientRects().length) || t;
    if (to === t && !t.hasAttribute('tabindex')) t.tabIndex = -1;
    to.focus({ preventScroll: true });
    t.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  };

  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-open]');
    const t = opener && byId(opener.dataset.open);
    if (t) {
      e.preventDefault();
      if (t.hidden) App.open(t, opener); else App.close(t);
      return;
    }
    // "Cancel" or "Close" inside something open
    const closer = e.target.closest('[data-close]');
    const around = closer && holder(closer);
    if (around) { e.preventDefault(); App.close(around.el); return; }
    // The choice of a confirmation: the screen listens to leon:confirm and does the work (see NOTES-app.md)
    const yes = e.target.closest('.confirm [data-confirm]');
    if (yes) {
      const ask = yes.closest('.confirm');
      const from = holder(ask);
      ask.dispatchEvent(new CustomEvent('leon:confirm', { bubbles: true, detail: { action: yes.dataset.confirm, opener: from ? from.opener : null } }));
      return;
    }
    // A link that leaves Leon for the tool itself: the one thing a prototype cannot do
    const ext = e.target.closest('[data-ext]');
    if (ext) { e.preventDefault(); App.say(`Opens ${ext.dataset.ext} in the real product.`); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || (menu && !menu.hidden)) return;
    prune();
    const x = holder(document.activeElement) || stack[stack.length - 1];
    if (x) { e.preventDefault(); App.close(x.el); }
  });

  /* Controls that led nowhere in the prototype said so. No page should need this any more (see data-ext). */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('a[title="Not in this prototype"], button[title="Not in this prototype"], [aria-disabled="true"]');
    if (!el) return;
    e.preventDefault();
    App.say('Not in this prototype', 2200);
  });

  /* Copy buttons: data-copy="answer" copies the answer with its sources; data-copy="#id" copies that element's text */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy]');
    if (!btn) return;
    const what = btn.dataset.copy;
    const box = $('[data-result]');
    const text = what === 'answer' && box && UI ? App.copyText(App.answer(box.dataset.scenario)) : (($(what) || btn).textContent || '');
    const write = navigator.clipboard ? navigator.clipboard.writeText(text.trim()) : Promise.reject(new Error('no clipboard'));
    write.then(() => App.done(btn, 'Copied'), () => App.done(btn, 'Copy failed'));
  });

  /* The answer screen */
  const result = $('[data-result]');
  if (result) {
    // Which question: ?s=<answer id>, or the words typed in an ask field (?q=): the demo answer they are about, or
    // "I don't know" (none). The page itself carries "commitment". The field keeps the words that were typed.
    const p = new URLSearchParams(root.location.search);
    const s = p.get('s');
    const q = (p.get('q') || '').trim();
    const id = !UI ? result.dataset.scenario : s && App.answer(s) ? s : q ? App.match(q) : result.dataset.scenario;
    if (UI && (id !== result.dataset.scenario || q)) {
      const asked = q || App.answer(id).query;
      result.innerHTML = App.resultHTML(id, undefined, asked);
      result.dataset.scenario = id;
      const field = $('.ask__input');
      if (field) field.value = asked;
      document.title = `${asked} · Leon`;
    }
    document.documentElement.classList.remove('is-swapping');

    // Selecting a sentence, a number or a row shows that original: the sheet arrives (again, if it was already the one
    // shown: "here it is"), and under 900px, where it sits below the sources, it comes into view
    const stacked = root.matchMedia('(max-width: 899px)');
    const select = (n) => {
      $$('[data-cite], [data-src]', result).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.n === n)));
      $$('.seg[data-n]', result).forEach((s) => s.classList.toggle('is-selected', s.dataset.n === n));
      $$('[data-orig-none]', result).forEach((p) => { p.hidden = true; });
      $$('[data-source]', result).forEach((doc) => {
        const on = doc.dataset.n === n;
        doc.hidden = !on;
        doc.classList.toggle('is-in', false);
        if (!on) return;
        doc.getBoundingClientRect(); // so that the arrival starts again
        doc.classList.toggle('is-in', true);
        if (stacked.matches) doc.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
      });
    };
    result.addEventListener('click', (e) => {
      const el = e.target.closest('[data-n]');
      if (el && !el.closest('[data-source]')) select(el.dataset.n);
    });
    // Up and Down move through the source rows
    result.addEventListener('keydown', (e) => {
      const row = e.target.closest('[data-src]');
      if (!row || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return;
      const rows = $$('[data-src]', result);
      const to = rows[rows.indexOf(row) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (!to) return;
      e.preventDefault();
      to.focus();
      select(to.dataset.n);
    });

    // Once, when the answer arrives: each stroke sweeps, then its number pops
    const answer = $('[data-answer]', result);
    if (answer && !reduced) {
      const segs = $$('.seg', answer);
      segs.forEach((s, i) => { s.style.setProperty('--k', i); s.classList.add('is-sweep'); });
      answer.classList.add('is-arriving');
      setTimeout(() => {
        answer.classList.remove('is-arriving');
        segs.forEach((s) => s.classList.remove('is-sweep'));
      }, segs.length * 240 + 700);
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
