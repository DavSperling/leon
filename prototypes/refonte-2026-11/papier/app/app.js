/* Leon « Papier » v3 · the app: the shell and the kit, shared by every screen. One global: window.Leon.
   Part 1 (data, helpers, templates, the shell's markup) also runs in Node: build.mjs calls it to write the same markup
   into the pages, so every page is whole without script. Part 2 is the behaviour of the shell and of the kit.
   Loaded after ../../shared/demo-data.js, ../js/app-data.js and ../js/demo.js. No dependency. The guide is NOTES.md.

   Leon
     .D .A .page .browser               LEON_DEMO, LEON_APP, this page's file name, false in Node
     .esc(s) .icon(id) .logo(file, px) .av(name, cls) .initials(name) .col(n) .param(name)
     .tools .tool(id) .conns .bad()     the 42 tools, one of them, the live list of connections, the one that is broken
     .discussions .suggestions          the five recent discussions and the three suggested questions, with id and href
     .answer(id) .match(words) .answerFor(words)       a demo answer; the id some words are about; the answer to them
     .card(o) .tile(o)                  a thing on the desk, as <li>: { logo | av, name, sub, err, pill, ink, num, hl, href, label, attrs, li }
     .facts(rows) .field(o) .pill(text, kind) .who(scope)
     .answerHTML(answer) .sourcesHTML(sources) .docHTML(source) .copyText(answer)
     .block(name, fn) .blocks           what build.mjs writes between <!--b:name--> and <!--/b:name-->
   and, in the browser:
     .toast(text)                       says once what happened
     .busy(button, label[, ms])         the button works, then comes back: a promise
     .done(button, text)                the button says it for 1.6 s ("Saved", "Copied")
     .copy(text[, button])              to the clipboard, and the button says "Copied"
     .validate(form) .fieldError(field, text)          refusals under the fields ([data-req="<Name>"])
     .arrive(el) .wire(el, answer)      an answer arrives once; its sentences, numbers and sources open the original
     .panel.open(o) .close() .busy(label[, ms]) .confirm(o) .source(source)       the side panel
     .ask(words) .go(kind, id) .openHere .shell.refresh()                         see NOTES.md */
(function (root) {
  'use strict';
  const D = root.LEON_DEMO, A = root.LEON_APP, UI = root.LeonUI;
  if (!D || !A || !UI) return;
  const L = root.Leon = { D, A, browser: typeof document !== 'undefined', blocks: {} };
  L.page = root.LEON_PAGE || (L.browser && location.pathname.split('/').pop()) || 'index.html';
  L.block = (name, fn) => { L.blocks[name] = fn; };

  // ---------- Helpers ----------
  const LOGO = UI.logoBase = '../../shared/logos/';
  const esc = L.esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const col = L.col = UI.col; // colour n of source n: 1 to 4, then round again
  const icon = L.icon = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const logo = L.logo = (file, size) => `<img class="logo" src="${LOGO}${file}.svg" alt="" width="${size}" height="${size}">`;
  const initials = L.initials = (name) => { const w = name.trim().split(/\s+/); return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase(); }; // one word: its first two letters
  // Initials on a pastel: a person keeps the same tint everywhere (their place in the team; Julie is pink)
  const av = L.av = (name, cls) => {
    let i = A.members.findIndex((m) => m.name === name);
    if (i < 0) i = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
    return `<span class="av av--${[3, 1, 2, 4][i % 4]}${cls ? ` ${cls}` : ''}" aria-hidden="true">${esc(initials(name))}</span>`;
  };
  L.param = (name) => (L.browser ? new URLSearchParams(location.search).get(name) : null);

  // ---------- Data ----------
  const tools = L.tools = [];
  D.catalogue.forEach((f, fi) => f.tools.forEach(([tool, label]) => tools.push(Object.assign({ tool, label, family: f.family, fi, reads: A.reads[tool] }, A.connect[tool]))));
  const byTool = Object.fromEntries(tools.map((t) => [t.tool, t]));
  L.tool = (id) => byTool[id];
  // state: ok | error | sync | first. The one that needs you comes first, and keeps its place once repaired.
  // shortcut: the state lives in the page (a reload or another screen starts again from the data); keep it in
  // sessionStorage if a repaired tool must stay repaired from one screen to the next.
  const conns = L.conns = D.connections.map((c, i) => Object.assign({ id: `c${i + 1}` }, c)).sort((a, b) => (b.state === 'error') - (a.state === 'error'));
  const bad = L.bad = () => conns.find((c) => c.state === 'error');
  L.discussions = D.discussions.map((d) => Object.assign({ href: `chat.html?d=${d.id}` }, d));
  L.suggestions = A.suggestions.map((s) => { const id = s.href.split('s=')[1]; return { id, label: s.label, href: `chat.html?d=${id}` }; });

  // Every demo answer by its id: commitment | bug | departure | unknown (the scenarios), date (the permissions
  // question, as Julie sees it), verlant | nordia | pricing, none (nothing on record)
  L.answer = (id) => {
    if (id === 'date') return Object.assign({ id, query: D.permissions.query }, D.permissions.views[0]);
    if (id === 'none') return A.noAnswer;
    return [...D.scenarios, ...A.answers].find((s) => s.id === id) || null;
  };
  const ABOUT = [ // in this order: the first that matches wins
    ['pricing', /pricing|q1/], ['nordia', /nordia/], ['verlant', /verlant.*(own|account)|(own|who).*verlant/], ['unknown', /verlant|price/],
    ['bug', /pdf|bug|export/], ['departure', /thomas/], ['date', /migration|accept|dec(ember)? 2/], ['commitment', /acme|v2|promis/],
  ];
  L.match = (words) => (ABOUT.find(([, re]) => re.test(String(words || '').toLowerCase())) || ['none'])[0];
  // What Leon answers to words typed anywhere: the demo answer they are about, or the honest "I don't know"
  L.answerFor = (words) => { const a = L.answer(L.match(words)); return a.id === 'none' ? Object.assign({}, a, { query: words }) : a; };

  // ---------- The kit, as markup ----------
  // A thing on the desk: a card (88px, 36px picture, name at 15px) or a tile (52px, 28px, 14px). One name, at most one
  // quiet caption and, only if something is wrong, what is wrong. The whole rectangle is the control.
  const thing = (size) => (o) => {
    const media = (o.num ? `<span class="num c${col(o.num)}"><span class="vh">Source </span>${o.num}</span>` : '')
      + (o.logo ? logo(o.logo, size) : o.av ? av(o.av) : '') + (o.err ? '<i class="tl__dot"></i>' : '');
    const id = `<span class="tl__id"><span class="tl__name"><span class="mark">${esc(o.name)}</span></span>${o.sub ? `<span class="tl__sub">${esc(o.sub)}</span>` : ''}</span>`;
    const end = o.pill ? `<span class="btn ${o.ink ? '' : 'btn--line '}btn--xs">${esc(o.pill)}</span>` : icon('chev');
    const cls = `tl ${size === 36 ? 'card' : 'tile'}${o.err ? ' is-err' : ''}`;
    const tag = o.href ? 'a' : 'button';
    return `<li${o.hl ? ` class="c${o.hl}"` : ''}${o.li ? ` ${o.li}` : ''}><${tag} ${o.href ? `href="${o.href}"` : 'type="button"'} class="${cls}"${o.label ? ` aria-label="${esc(o.label)}"` : ''}${o.attrs ? ` ${o.attrs}` : ''}>
  ${media}${id}
  ${end}
</${tag}></li>`;
  };
  L.card = thing(36);
  L.tile = thing(28);

  // Rows of facts in the panel: [[label, value as HTML], …]
  L.facts = (rows) => `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  // A field with its label and the place of its error. o: { id, label, kind: text | secret | email | select, options,
  // placeholder, value, req: false when it may stay empty }
  L.field = (o) => {
    const ctl = o.kind === 'select'
      ? `<select class="field" id="${o.id}">${o.options.map((v) => `<option${v === o.value ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select>`
      : `<input class="field" id="${o.id}" type="${o.kind === 'secret' ? 'password' : o.kind === 'email' ? 'email' : 'text'}" autocomplete="off" spellcheck="false"${o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : ''}${o.value ? ` value="${esc(o.value)}"` : ''} aria-describedby="${o.id}-e"${o.req === false ? '' : ` data-req="${esc(o.label)}"`}>`;
    return `<div><label class="label" for="${o.id}">${esc(o.label)}</label>${ctl}<p class="field-error" id="${o.id}-e" role="alert"></p></div>`;
  };
  // A status pill. kind: '' (the green dot) | 'err' | 'work'
  L.pill = (text, kind) => `<span class="pill${kind ? ` pill--${kind}` : ''}"><i class="dot"></i>${esc(text)}</span>`;
  // Who can see a thing, as the value of a "Visible to" row
  L.who = (scope) => (scope === 'private'
    ? `<span class="avs">${av(A.me.name, 'av--s')}</span><b>Only you</b><small>Not shared with the team.</small>`
    : `<span class="avs">${A.members.slice(0, 3).map((m) => av(m.name, 'av--s')).join('')}</span><b>Team</b><small>The ${A.workspace.people} people of ${esc(A.workspace.name)}, each seeing only what they can already open.</small>`);

  // What Leon writes. A sentence is under the highlighter of its source and ends with its number; a sentence nothing
  // supports says "no source". When the answer is "I don't know" (answer.unknown) the closest record keeps its number
  // but gets no stroke: it is not an answer.
  const stop = (segs, i) => (segs[i + 1] && /^[a-z]/.test(segs[i + 1].text) ? '' : '.');
  L.answerHTML = (answer) => {
    const segs = answer.segments, mk = answer.unknown ? 'span' : 'mark';
    const name = (n) => { const s = answer.sources.find((x) => x.n === n); return s ? `: ${s.toolLabel}, ${s.title}` : ''; };
    return `<div class="answer" data-answer><p>${segs.map((seg, i) => {
      const t = UI.esc(seg.text);
      if (!seg.cites.length) return `<span class="seg seg--none">${t}${stop(segs, i)}<span class="nosrc">no source</span></span>`;
      const n = seg.cites[0], cut = t.lastIndexOf(' '); // the last word, the full stop and the number never part across a line
      const cites = seg.cites.map((c) => `<button type="button" class="cite c${col(c)}" data-n="${c}" aria-label="Source ${c}${UI.esc(name(c))}">${c}</button>`).join('');
      const hl = answer.unknown ? 'plain' : `hl hl-${col(n)}`;
      return `<span class="seg" data-n="${n}"><${mk} class="${hl} hl--a">${t.slice(0, cut + 1)}</${mk}><span class="nw"><${mk} class="${hl} hl--b">${t.slice(cut + 1)}${stop(segs, i)}</${mk}>${cites}</span></span>`;
    }).join(' ')}</p></div>`;
  };
  // The sources as tiles: the number in its colour, the tool's logo, the title, "Only you" when it is private
  L.sourcesHTML = (sources) => `<ul class="grid grid--3" data-sources aria-label="Sources">
${sources.map((s) => L.tile({ num: s.n, logo: s.tool, name: s.title, sub: s.visibility === 'private' ? 'Only you' : '', hl: col(s.n), attrs: `data-n="${s.n}" title="${esc(s.title)}"`, label: `Source ${s.n}: ${s.toolLabel}, ${s.title}${s.visibility === 'private' ? ', only you' : ''}` })).join('\n')}
</ul>`;
  // The three questions to try, as tiles: the question alone, read whole (Home and a new discussion)
  L.asksHTML = () => L.suggestions.map((q, i) => L.tile({ name: q.label, href: q.href, hl: i + 1, attrs: `data-ask="${q.id}"` })).join('\n');
  L.block('asks', L.asksHTML);
  // The original of a source as a sheet, opened at its passage (LeonUI.docHTML; a source that only has a passage, as
  // the briefing's, gets a sheet made of it). Its foot ("Open in …", who sees it) is the panel's, so it is cut here.
  L.docHTML = (s) => UI.docHTML(s.original ? s : Object.assign({}, s, { original: { type: 'note', meta: `${s.author} · ${s.date}`, body: [s.passage] } }))
    .replace(/<footer class="doc__foot">[\s\S]*?<\/footer>/, '')
    .replace(/<button type="button" class="flag flag--left"[^>]*>(\d+)<\/button>/, '<span class="flag flag--left" aria-hidden="true">$1</span>');
  L.copyText = (answer) => `${answer.segments.map((s, i, segs) => s.text + stop(segs, i) + s.cites.map((c) => ` [${c}]`).join('')).join(' ')}${answer.sources.length ? `\n\n${answer.sources.map((s) => `[${s.n}] ${s.toolLabel} · ${s.title} · ${s.author}, ${s.date}`).join('\n')}` : ''}`;

  // ---------- The shell, as markup (build.mjs writes it into every page) ----------
  const NAV = [['index.html', 'Home', 'home'], ['chat.html', 'Chat', 'chat'], ['documents.html', 'Documents', 'doc'], ['team.html', 'Team', 'team'], ['connections.html', 'Connections', 'plug'], ['settings.html', 'Settings', 'sliders']];
  const MARK = '<path d="M140 157C196 157 236 226 300 226M140 226H300M140 294C196 294 236 226 300 226" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round"/><circle cx="313" cy="226" r="17" fill="currentColor"/>';
  const STROKES = '<span class="strokes" aria-hidden="true"><i></i><i></i><i></i></span>';
  const me = A.me, ws = A.workspace;
  // The sidebar says something only when something is wrong
  const alertHTML = () => { const b = bad(); return b ? `<a class="alert" href="connections.html?open=${b.tool}" data-go="tool:${b.tool}"><i class="dot"></i><span>${esc(b.label)} needs reconnecting</span></a>` : ''; };

  L.block('head', () => `<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='131 126 200 200'%3E%3Cpath d='M140 157C196 157 236 226 300 226M140 226H300M140 294C196 294 236 226 300 226' fill='none' stroke='%230F0F0D' stroke-width='17' stroke-linecap='round'/%3E%3Ccircle cx='313' cy='226' r='17' fill='%230F0F0D'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&family=STIX+Two+Text:ital,wght@0,400;1,400&display=swap">
<link rel="stylesheet" href="../css/tokens.css">
<link rel="stylesheet" href="../css/ui.css">
<link rel="stylesheet" href="app.css">
<script>try { if (localStorage.getItem('leon-rail') === '1') document.documentElement.classList.add('is-rail'); } catch (e) { /* not remembered */ }</script>`);

  L.block('shell', () => {
    const b = bad();
    const entry = ([href, label, ic]) => `<li><a class="nav__item" href="${href}"${href === L.page ? ' aria-current="page"' : ''} data-tip="${label}">${icon(ic)}<span class="lbl">${label}</span>${href === 'connections.html' ? `<span class="tag c4 nav__tag" id="nav-flag"${b ? '' : ' hidden'}><span class="vh">Tools that need reconnecting: </span>1</span><i class="nav__dot" id="nav-dot" aria-hidden="true"${b ? '' : ' hidden'}></i>` : ''}</a></li>`;
    return `<a class="skip" href="#main">Skip to content</a>

<!-- Icons: one stroke, one weight -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/></symbol>
  <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></symbol>
  <symbol id="i-doc" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></symbol>
  <symbol id="i-team" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></symbol>
  <symbol id="i-plug" viewBox="0 0 24 24"><path d="M12 22v-5M9 8V2M15 8V2M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/></symbol>
  <symbol id="i-sliders" viewBox="0 0 24 24"><path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/></symbol>
  <symbol id="i-panel" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></symbol>
  <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></symbol>
  <symbol id="i-updown" viewBox="0 0 24 24"><path d="m8 15 4 4 4-4M8 9l4-4 4 4"/></symbol>
  <symbol id="i-chev" viewBox="0 0 24 24"><path d="m9 6 6 6-6 6"/></symbol>
  <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
  <symbol id="i-out" viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></symbol>
  <symbol id="i-exit" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></symbol>
  <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
  <symbol id="i-up" viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></symbol>
  <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></symbol>
  <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></symbol>
  <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></symbol>
  <symbol id="i-laptop" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2 20h20"/></symbol>
  <symbol id="i-key" viewBox="0 0 24 24"><circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/></symbol>
</svg>

<aside class="side" id="side" aria-label="Leon">
  <div class="side__brand">
    <span class="brand"><svg viewBox="131 126 200 200" role="img" aria-label="Leon">${MARK}</svg><span class="lbl" aria-hidden="true">Leon</span></span>
    <button type="button" class="iconbtn" id="rail-btn" aria-label="Collapse sidebar" aria-expanded="true" aria-controls="side">${icon('panel')}</button>
  </div>
  <div class="ws" data-tip="${esc(ws.name)}"><span class="ws__tile" aria-hidden="true">${esc(ws.name[0])}</span><span class="lbl ws__text"><b>${esc(ws.name)}</b><span id="ws-people">${ws.people} people</span></span></div>

  <nav class="nav" aria-label="Main">
    <ul>
      ${NAV.slice(0, 2).map(entry).join('\n      ')}
    </ul>
    <ul>
      ${NAV.slice(2).map(entry).join('\n      ')}
    </ul>
  </nav>

  <div class="recents">
    <p class="nav__label" id="rec-h">Recent</p>
    <ul aria-labelledby="rec-h">
      ${L.discussions.map((d) => `<li><a class="nav__item" href="${d.href}"><span>${esc(d.title)}</span></a></li>`).join('\n      ')}
    </ul>
  </div>

  <div class="side__end">
    <div class="health" id="health"${b ? '' : ' hidden'}>${alertHTML()}</div>
    <button type="button" class="me" popovertarget="user-menu" aria-expanded="false" data-tip="${esc(me.name)}">${av(me.name)}<span class="lbl me__text"><b>${esc(me.name)}</b><span>${esc(me.email)}</span></span><span class="vh">Account menu</span>${icon('updown')}</button>
  </div>
</aside>
<div class="scrim" id="scrim" hidden></div>

<div class="menu" id="user-menu" popover>
  <div class="menu__who">${av(me.name)}<span class="me__text"><b>${esc(me.name)}</b><span>${esc(me.email)}</span></span></div>
  <a class="menu__item" href="settings.html">${icon('sliders')}Settings<span>${esc(me.role)}</span></a>
  <a class="menu__item" href="signin.html">${icon('exit')}Sign out</a>
</div>`;
  });

  L.block('top', () => `  <div class="top">
    <button type="button" class="iconbtn top__menu" id="menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="side">${icon('menu')}</button>
    <button type="button" class="ask" id="ask" aria-haspopup="dialog" aria-keyshortcuts="Meta+K Control+K">
      ${STROKES}
      <span class="ask__label">Ask Leon…</span>
      <span class="ask__keys" aria-hidden="true"><kbd class="mod">⌘</kbd><kbd>K</kbd></span>
    </button>
  </div>`);

  L.block('end', () => `<dialog class="cmd" id="cmd" aria-label="Ask Leon or search">
  <div class="cmd__field">
    ${STROKES}
    <input id="cmd-input" type="text" placeholder="Ask Leon, or find a tool, a person, a document" aria-label="Ask Leon or search" role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-autocomplete="list" autocomplete="off" spellcheck="false" autofocus>
    <kbd aria-hidden="true">Esc</kbd>
  </div>
  <div class="cmd__list" id="cmd-list" role="listbox" aria-label="Results"></div>
  <div class="cmd__foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> to move</span><span><kbd>Enter</kbd> to open</span><span><kbd>Esc</kbd> to close</span></div>
</dialog>

<dialog class="panel" id="panel" aria-labelledby="panel-title"></dialog>
<div class="toasts" id="toasts" role="status" aria-live="polite" popover="manual"></div>

<script src="../../shared/demo-data.js"></script>
<script src="../js/app-data.js"></script>
<script src="../js/demo.js"></script>
<script src="app.js"></script>`);

  if (!L.browser) return; // Node: build.mjs only needs the data and the markup

  // ---------- Behaviour: what any page may use, with or without the shell ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const html = document.documentElement;
  const WORK = L.WORK = parseFloat(getComputedStyle(html).getPropertyValue('--work')) || 1300;
  const wait = (ms) => new Promise((r) => { setTimeout(r, ms); });

  // The toast: what happened elsewhere on the page, or cannot be seen in place. It lies above an open panel.
  L.toast = (msg) => {
    let box = $('#toasts');
    if (!box) { box = Object.assign(document.createElement('div'), { id: 'toasts', className: 'toasts', popover: 'manual' }); box.setAttribute('role', 'status'); document.body.append(box); }
    const t = Object.assign(document.createElement('p'), { className: 'toast', textContent: msg });
    box.replaceChildren(t);
    try { box.hidePopover(); box.showPopover(); } catch (e) { /* no popover: it stays in the page */ }
    clearTimeout(L.toast.timer);
    L.toast.timer = setTimeout(() => { t.classList.add('is-out'); setTimeout(() => { t.remove(); if (!box.children.length) try { box.hidePopover(); } catch (e) { /* same */ } }, 200); }, 3600);
  };
  // A button that works, then comes back; a button that says what it did
  L.busy = (btn, label, ms = WORK) => {
    const was = btn.innerHTML;
    btn.style.minWidth = `${btn.offsetWidth}px`; btn.disabled = true; btn.textContent = label;
    return wait(ms).then(() => { btn.disabled = false; btn.innerHTML = was; });
  };
  L.done = (btn, text) => {
    if (btn.dataset.was) return;
    btn.dataset.was = btn.innerHTML; btn.style.minWidth = `${btn.offsetWidth}px`; btn.textContent = text;
    setTimeout(() => { btn.innerHTML = btn.dataset.was; delete btn.dataset.was; }, 1600);
  };
  L.copy = (text, btn) => {
    Promise.resolve().then(() => navigator.clipboard.writeText(text)).catch(() => { /* a file page may not copy: the button still answers */ });
    if (btn) L.done(btn, 'Copied');
  };
  // Refusals, under the fields. A field that must be filled carries data-req="<its name>"; an address is checked too.
  L.fieldError = (f, msg) => {
    if (msg) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid');
    const e = document.getElementById(`${f.id}-e`);
    if (e) e.textContent = msg || '';
  };
  L.validate = (form) => {
    let first = null;
    $$('[data-req]', form).forEach((f) => {
      const v = f.value.trim();
      const msg = !v ? `${f.dataset.req} is missing.` : f.type === 'email' && !/^\S+@\S+\.\S+$/.test(v) ? 'This is not an email address.' : '';
      L.fieldError(f, msg);
      if (msg && !first) first = f;
    });
    if (first) first.focus();
    return !first;
  };
  // An answer arrives once: every stroke is drawn from the left
  L.arrive = (el) => {
    el.classList.add('is-sweep', 'is-arriving');
    el.addEventListener('animationend', () => el.classList.remove('is-sweep', 'is-arriving'), { once: true });
  };

  document.addEventListener('click', (e) => {
    const ext = e.target.closest('[data-ext]'), cp = e.target.closest('[data-copy]'), chip = e.target.closest('[data-chips] .chip');
    if (ext) { e.preventDefault(); L.toast(`Opens ${ext.dataset.ext} in the real product.`); }
    if (cp) { const src = $(cp.dataset.copy); L.copy(src ? (src.value || src.textContent).trim() : '', cp); }
    if (chip) { // one chip pressed at a time; the group says which
      const group = chip.closest('[data-chips]');
      $$('.chip', group).forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      group.dispatchEvent(new CustomEvent('leon:chip', { bubbles: true, detail: chip.dataset.v }));
    }
  });

  const side = $('#side'), main = $('#main');
  if (!side || !main) return; // a page outside the shell (sign-in): the helpers above are all it gets

  // ---------- The shell ----------
  const narrow = matchMedia('(max-width: 899px)');
  const railBtn = $('#rail-btn'), menuBtn = $('#menu-btn'), scrim = $('#scrim');
  const setDrawer = (on) => {
    html.classList.toggle('is-drawer', on);
    scrim.hidden = !on; main.inert = on;
    menuBtn.setAttribute('aria-expanded', String(on));
    (on ? railBtn : menuBtn).focus();
  };
  const railLabel = () => {
    const rail = html.classList.contains('is-rail'), l = narrow.matches ? 'Close menu' : rail ? 'Expand sidebar' : 'Collapse sidebar';
    railBtn.setAttribute('aria-label', l); railBtn.dataset.tip = l; railBtn.setAttribute('aria-expanded', String(narrow.matches || !rail));
  };
  railBtn.addEventListener('click', () => {
    if (narrow.matches) return setDrawer(false);
    const rail = html.classList.toggle('is-rail');
    try { localStorage.setItem('leon-rail', rail ? '1' : '0'); } catch (e) { /* private window: not remembered */ }
    railLabel();
  });
  menuBtn.addEventListener('click', () => setDrawer(true));
  scrim.addEventListener('click', () => setDrawer(false));
  narrow.addEventListener('change', () => { if (html.classList.contains('is-drawer')) setDrawer(false); railLabel(); });
  railLabel();
  $('#user-menu').addEventListener('toggle', (e) => $('.me').setAttribute('aria-expanded', String(e.newState === 'open'))); // the popover itself is the browser's
  addEventListener('scroll', () => $('.top').classList.toggle('is-stuck', scrollY > 8), { passive: true });
  // The open discussion is marked among the recent ones
  const here = L.page + location.search;
  $$('.recents a').forEach((a) => { if (a.getAttribute('href') === here) a.setAttribute('aria-current', 'true'); });
  // The alert line and the flag follow the connections: call it after changing Leon.conns
  L.shell = {
    refresh: () => { $('#health').innerHTML = alertHTML(); $('#health').hidden = $('#nav-flag').hidden = $('#nav-dot').hidden = !bad(); },
    people: (n) => { $('#ws-people').textContent = `${n} ${n === 1 ? 'person' : 'people'}`; }, // the Team screen calls it when someone joins or leaves
  };

  // Going to one thing from anywhere: its screen opens its panel (?open=<id>); on that screen, Leon.openHere(id) does
  const WHERE = { tool: 'connections.html', person: 'team.html', doc: 'documents.html' };
  L.go = (kind, id) => { if (WHERE[kind] === L.page && L.openHere) L.openHere(id); else location.href = `${WHERE[kind]}?open=${encodeURIComponent(id)}`; };
  // Asking always opens a discussion (the Chat screen replaces this to answer in place)
  L.ask = (words) => { location.href = `chat.html?q=${encodeURIComponent(words)}`; };
  document.addEventListener('DOMContentLoaded', () => { const id = L.param('open'); if (id && L.openHere) L.openHere(id); });

  // ---------- The side panel: one function opens it with any content ----------
  const panelEl = $('#panel'), panel = L.panel = { el: panelEl };
  let PO = null, answerConfirm = null, opener = null;
  // o: { logo | av, title, sub, body, foot, act(name, el), submit(form), back }. Called while it is open, it redraws it.
  panel.open = (o) => {
    if (answerConfirm) answerConfirm(false);
    if (!panelEl.open) opener = document.activeElement;
    PO = o;
    panelEl.innerHTML = `<header class="panel__head">${o.logo ? logo(o.logo, 44) : o.av ? av(o.av) : ''}<div class="panel__title"><h2 id="panel-title">${esc(o.title)}</h2>${o.sub ? `<p class="panel__sub">${esc(o.sub)}</p>` : ''}</div><button type="button" class="iconbtn" data-close aria-label="Close">${icon('x')}</button></header>
<div class="panel__body">${o.body || ''}</div>
<footer class="panel__foot">${o.foot || '<button type="button" class="btn btn--line push" data-close data-focus>Done</button>'}<i class="work"></i></footer>`;
    panelEl.classList.remove('is-closing');
    if (!panelEl.open) panelEl.showModal();
    ($('[data-focus]', panelEl) || $('.form .field', panelEl) || $('[data-close]', panelEl)).focus();
  };
  panel.close = () => {
    if (!panelEl.open) return;
    panelEl.classList.add('is-closing');
    setTimeout(() => { panelEl.classList.remove('is-closing'); panelEl.close(); }, 140);
  };
  panelEl.addEventListener('close', () => {
    if (answerConfirm) answerConfirm(false);
    const o = PO; PO = null;
    // after the browser's own focus return: what opened it may have been redrawn (o.back: an element or a selector)
    setTimeout(() => {
      const f = document.activeElement, b = o && o.back && (typeof o.back === 'string' ? $(o.back) : o.back);
      if (b && b.isConnected && (!f || f === document.body || f === opener || panelEl.contains(f))) b.focus({ preventScroll: true });
    });
  });
  // The main button says what is being done, the highlighter runs along the foot, the fields are frozen. The promise
  // gives true when the panel still shows the same thing afterwards (then redraw it: Leon.panel.open(next)).
  panel.busy = (label, ms = WORK) => {
    const foot = $('.panel__foot', panelEl), btn = $('.btn:not(.btn--quiet)', foot), mine = PO;
    if (btn) { btn.disabled = true; btn.textContent = label; }
    $$('.field', panelEl).forEach((f) => { f.readOnly = true; });
    $$('.btn--quiet', foot).forEach((b) => { b.hidden = true; });
    foot.classList.add('is-working');
    return wait(ms).then(() => { foot.classList.remove('is-working'); return panelEl.open && PO === mine; });
  };
  // The confirmation, in place of the foot: the question that names the thing, what happens next, the red verb, and
  // the way back, which takes focus. A promise of true or false.
  panel.confirm = (o) => new Promise((res) => {
    const foot = $('.panel__foot', panelEl), was = foot.innerHTML;
    foot.innerHTML = `<div class="confirm" role="alert"><b>${esc(o.title)}</b><p>${esc(o.text)}</p><button type="button" class="btn btn--danger" data-confirm="yes">${esc(o.yes)}</button> <button type="button" class="btn btn--quiet" data-confirm="no">${esc(o.no || 'Cancel')}</button></div>`;
    $('[data-confirm="no"]', foot).focus();
    answerConfirm = (yes) => {
      answerConfirm = null;
      if (!yes && foot.isConnected) { foot.innerHTML = was; const b = $('.btn', foot); if (b) b.focus(); }
      res(yes);
    };
  });
  // The original of a source, as a sheet opened at its passage
  panel.source = (s, back) => panel.open({
    back, logo: s.tool, title: s.title,
    body: `<div class="well">${L.docHTML(s)}</div>${L.facts([['Visible to', L.who(s.visibility)]])}`,
    foot: `${s.upload ? `<a class="btn btn--line" href="documents.html?open=${encodeURIComponent(s.title)}">Open in Documents</a>` : `<a class="btn btn--line" href="#" data-ext="${esc(s.toolLabel)}">Open in ${esc(s.toolLabel)}${icon('out')}</a>`}<button type="button" class="btn btn--line push" data-close data-focus>Done</button>`,
  });
  // A sentence, a number or a source tile of this answer opens its original
  L.wire = (el, answer) => el.addEventListener('click', (e) => {
    const n = e.target.closest('[data-n]'), s = n && el.contains(n) && answer.sources.find((x) => x.n === +n.dataset.n);
    if (s) panel.source(s, n.matches('.seg') ? $('.cite', n) : n); // a sentence is not a control: the focus comes back to its number
  });
  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl) { // beside the panel: on another thing that opens it, that thing opens at once; else the panel closes
      const hit = (el) => [...el.getClientRects()].some((r) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
      const next = $$('button.tl, .brow, .cite', main).find((el) => !el.closest('[hidden]') && hit(el));
      if (!next) return panel.close();
      next.click();
      if (PO && !PO.back) PO.back = next;
      return;
    }
    if (e.target.closest('[data-close]')) return panel.close();
    const c = e.target.closest('[data-confirm]'), a = e.target.closest('[data-act]');
    if (c && answerConfirm) answerConfirm(c.dataset.confirm === 'yes');
    else if (a && PO && PO.act) PO.act(a.dataset.act, a);
  });
  panelEl.addEventListener('cancel', (e) => { if (answerConfirm) { e.preventDefault(); answerConfirm(false); } }); // Escape on a confirmation is its way back: the panel stays
  panelEl.addEventListener('submit', (e) => { e.preventDefault(); if (L.validate(e.target) && PO && PO.submit) PO.submit(e.target); });

  // ---------- The ask bar opens the command bar, in place ----------
  const ask = $('#ask'), cmd = $('#cmd'), cmdIn = $('#cmd-input'), cmdList = $('#cmd-list');
  let runs = [], at = 0;
  const setAt = (i) => {
    const opts = $$('.cmd__opt', cmdList);
    if (!opts.length) return;
    at = (i + opts.length) % opts.length;
    opts.forEach((o, k) => { o.classList.toggle('is-active', k === at); o.setAttribute('aria-selected', String(k === at)); });
    cmdIn.setAttribute('aria-activedescendant', opts[at].id);
    opts[at].scrollIntoView({ block: 'nearest' });
  };
  const renderCmd = () => {
    const q = cmdIn.value.trim(), lq = q.toLowerCase(), has = (s) => s.toLowerCase().includes(lq), starts = (s) => s.toLowerCase().startsWith(lq);
    const find = (list, name) => (q ? list.filter((x) => has(name(x))).sort((x, y) => !starts(name(x)) - !starts(name(y))).slice(0, 5) : []); // names that start with the letters first
    const isOn = (tool) => conns.some((c) => c.tool === tool), b = bad();
    const ft = find(tools, (t) => t.label), fp = find(A.members, (m) => m.name), fd = find(A.documents, (d) => d.name);
    const names = [];
    if (ft.length) names.push(['Tools', ft.map((t) => ({ h: `${logo(t.tool, 18)}<span><b>${isOn(t.tool) ? 'Manage' : 'Connect'} ${esc(t.label)}</b></span><span class="sub">${isOn(t.tool) ? 'Connected' : t.family}</span>`, run: () => L.go('tool', t.tool) }))]);
    if (fp.length) names.push(['People', fp.map((m) => ({ h: `${av(m.name, 'av--s')}<span><b>${esc(m.name)}</b></span><span class="sub">${esc(m.title)}</span>`, run: () => L.go('person', m.email) }))]);
    if (fd.length) names.push(['Documents', fd.map((d) => ({ h: `${logo(d.type, 18)}<span><b>${esc(d.name)}</b></span><span class="sub">${d.visibility === 'private' ? 'Only you' : 'Team'}</span>`, run: () => L.go('doc', d.name) }))]);
    const asking = q ? [['Ask', [{ h: `${STROKES}<span>Ask Leon <b>“${esc(q)}”</b></span>`, run: () => L.ask(q) }]]] : [];
    // A name that starts with the letters comes before the question; anything else is first of all a question
    const named = [ft[0] && ft[0].label, fp[0] && fp[0].name, fd[0] && fd[0].name].some((n) => n && starts(n));
    const groups = named ? [...names, ...asking] : [...asking, ...names];
    if (!q && b) groups.push(['Needs attention', [{ h: `${logo(b.tool, 18)}<span><b>Reconnect ${esc(b.label)}</b></span>`, run: () => L.go('tool', b.tool) }]]);
    const rec = L.discussions.filter((d) => !q || has(d.title));
    if (rec.length) groups.push(['Recent discussions', rec.map((d) => ({ h: `${icon('chat')}<span>${esc(d.title)}</span><span class="sub">${d.date}</span>`, run: () => { location.href = d.href; } }))]);
    const nav = NAV.filter(([, l]) => !q || has(l));
    if (nav.length) groups.push(['Go to', nav.map(([href, l, i]) => ({ h: `${icon(i)}<span>${l}</span>${href === L.page ? '<span class="sub">You are here</span>' : ''}`, run: () => { if (href === L.page) scrollTo({ top: 0 }); else location.href = href; } }))]);
    runs = [];
    cmdList.innerHTML = groups.map(([title, items]) => `<div role="group" aria-label="${title}"><p class="cmd__group">${title}</p>${items.map((it) => {
      const i = runs.push(it.run) - 1;
      return `<button type="button" role="option" class="cmd__opt" id="cmd-o${i}" data-i="${i}" aria-selected="false" tabindex="-1">${it.h}<kbd class="go">Enter</kbd></button>`;
    }).join('')}</div>`).join('');
    setAt(0);
  };
  const openCmd = () => {
    if (cmd.open) return;
    const r = ask.getBoundingClientRect();
    if (narrow.matches) cmd.removeAttribute('style');
    else Object.assign(cmd.style, { left: `${r.left}px`, top: `${Math.max(8, r.top)}px`, width: `${r.width}px`, translate: 'none' });
    cmdIn.value = ''; renderCmd(); cmd.showModal(); cmdIn.focus();
  };
  const runCmd = (i) => { const f = runs[i]; cmd.close(); if (f) f(); };
  ask.addEventListener('click', openCmd);
  cmdIn.addEventListener('input', renderCmd);
  cmdIn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAt(at + (e.key === 'ArrowDown' ? 1 : -1)); }
    if (e.key === 'Enter') { e.preventDefault(); runCmd(at); }
  });
  cmdList.addEventListener('mousemove', (e) => { const o = e.target.closest('.cmd__opt'); if (o && +o.dataset.i !== at) setAt(+o.dataset.i); });
  cmd.addEventListener('click', (e) => { const o = e.target.closest('.cmd__opt'); if (o) runCmd(+o.dataset.i); else if (e.target === cmd) cmd.close(); });

  // ---------- Clicks and keys of the shell ----------
  document.addEventListener('click', (e) => {
    const cur = e.target.closest('a[aria-current]'), go = e.target.closest('[data-go]');
    if (cur && cur.getAttribute('href') === here) e.preventDefault(); // already there
    if (go) { // "tool:intercom": on its own screen the panel opens in place, elsewhere the link is followed
      const [kind, id] = go.dataset.go.split(':');
      if (WHERE[kind] === L.page && L.openHere) { e.preventDefault(); if (html.classList.contains('is-drawer')) setDrawer(false); L.openHere(id); }
    }
  });
  document.addEventListener('keydown', (e) => {
    const slash = $('[data-slash]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (cmd.open) cmd.close(); else openCmd(); }
    else if (e.key === 'Escape' && html.classList.contains('is-drawer')) setDrawer(false);
    else if (e.key === '/' && slash && !$('dialog[open]') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); slash.focus(); }
  });
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $$('.mod').forEach((k) => { k.textContent = 'Ctrl'; });
})(typeof window !== 'undefined' ? window : globalThis);
