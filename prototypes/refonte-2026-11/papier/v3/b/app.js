/* Leon « Papier » v3 · take B « Bureau »: the shell and the Connections screen.
   The first half (data and templates) also runs in Node: build.mjs calls it to write the same markup into
   connections.html, so the page is whole without script. The second half is the behaviour. No dependency. */
(function (root) {
  'use strict';
  const D = root.LEON_DEMO, A = root.LEON_APP;
  if (!D || !A) return;

  // ---------- Data ----------
  const LOGO = '../../../shared/logos/';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (n) => n.toLocaleString('en-US');
  const icon = (id) => `<svg class="i" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const logo = (tool, size) => `<img class="logo" src="${LOGO}${tool}.svg" alt="" width="${size}" height="${size}">`;
  const initials = (name) => name.split(' ').map((w) => w[0]).join('');

  const tools = [];
  D.catalogue.forEach((f, fi) => f.tools.forEach(([tool, label]) => tools.push(Object.assign({ tool, label, family: f.family, fi, reads: A.reads[tool] }, A.connect[tool]))));
  const byTool = Object.fromEntries(tools.map((t) => [t.tool, t]));
  let seq = 0;
  // state: ok | error | sync | first. The one that needs you comes first, and keeps its place once repaired.
  const conns = D.connections.map((c) => Object.assign({ id: 'c' + (++seq) }, c)).sort((a, b) => (b.state === 'error') - (a.state === 'error'));
  const isOn = (tool) => conns.some((c) => c.tool === tool);
  const bad = () => conns.find((c) => c.state === 'error');
  const toAdd = () => tools.filter((t) => !isOn(t.tool));

  // ---------- Templates ----------
  const pill = (c) => c.state === 'error' ? '<span class="pill pill--err"><i class="dot"></i>Disconnected</span>'
    : c.state === 'first' ? '<span class="pill pill--work"><i class="dot"></i>First sync in progress</span>'
    : `<span class="pill${c.state === 'sync' ? ' pill--work is-sweeping' : ''}"><i class="dot"></i>Synced ${c.synced}</span>`;
  const scopeWord = (c) => (c.scope === 'private' ? 'Only you' : 'Team');
  const name = (label) => `<span class="tl__name"><span class="mark">${esc(label)}</span></span>`;

  // A connected tool: what it is and, only if something is wrong, what is wrong. The rest is in its panel.
  const connTile = (c) => {
    const err = c.state === 'error';
    return `<li data-f="${byTool[c.tool].fi}"><button type="button" class="tl${err ? ' is-err' : ''}" data-manage="${c.id}" data-tool="${c.tool}" aria-label="${err ? 'Reconnect' : 'Manage'} ${esc(c.label)}" aria-describedby="s-${c.id}">
  ${logo(c.tool, 36)}${err ? '<i class="tl__dot"></i>' : ''}<span class="tl__id">${name(c.label)}<span class="tl__sub" id="s-${c.id}">${err ? 'Disconnected' : scopeWord(c)}</span></span>
  ${err ? '<span class="btn btn--xs">Reconnect</span>' : icon('chev')}
</button></li>`;
  };
  const connGrid = () => conns.map(connTile).join('\n');

  // A tool to add
  const tile = (t) => `<li data-f="${t.fi}" data-s="${esc(`${t.label} ${t.tool} ${t.family}`.toLowerCase())}"><button type="button" class="tl" data-open="${t.tool}" data-tool="${t.tool}" aria-label="Connect ${esc(t.label)}">
  ${logo(t.tool, 28)}<span class="tl__id">${name(t.label)}</span><span class="btn btn--line btn--xs">Connect</span>
</button></li>`;
  const tiles = () => toAdd().map(tile).join('\n');
  const chips = () => [['All', -1]].concat(D.catalogue.map((f, i) => [f.family, i]))
    .map(([l, i]) => `<button type="button" class="chip" data-fam="${i}" aria-pressed="${i === -1}">${l}</button>`).join('\n');

  // The sidebar says something only when something is wrong
  const health = () => {
    const b = bad();
    return b ? `<button type="button" class="alert" data-open="${b.tool}"><i class="dot"></i><span>${esc(b.label)} needs reconnecting</span></button>` : '';
  };

  // One tool's panel. p = { t: the tool, c: its connection or null, view: connect | connected | manage | confirm | repair }
  const facts = (rows) => `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
  const whoDefault = (t) => (t.private
    ? `<b>Only you</b>, by default.<small>What Leon reads in ${esc(t.label)} isn’t shared with the team unless you share it.</small>`
    : `<b>Team</b>, by default.<small>Each item is shown only to the people who can already open it in ${esc(t.label)}.</small>`);
  const whoNow = (c) => (c.scope === 'private'
    ? `<span class="avs"><span class="av av--s">${initials(A.me.name)}</span></span><b>Only you</b><small>Not shared with the team.</small>`
    : `<span class="avs">${A.members.slice(0, 3).map((m, i) => `<span class="av av--s av--${[3, 1, 2][i]}">${initials(m.name)}</span>`).join('')}</span><b>Team</b><small>The ${A.workspace.people} people of ${esc(A.workspace.name)}, each seeing only what they can already open.</small>`);
  const keyField = (f, i) => {
    const id = `kf-${i}`;
    const ctl = f.kind === 'select'
      ? `<select class="field" id="${id}">${f.options.map((o) => `<option>${esc(o)}</option>`).join('')}</select>`
      : `<input class="field" id="${id}" type="${f.kind === 'secret' ? 'password' : 'text'}" autocomplete="off" spellcheck="false"${f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : ''} aria-describedby="${id}-e" data-req="${esc(f.label)}">`;
    return `<div><label class="label" for="${id}">${esc(f.label)}</label>${ctl}<p class="field-error" id="${id}-e" role="alert"></p></div>`;
  };
  const keyForm = (t) => `<form class="keyform" id="keyform" novalidate>${t.fields.map(keyField).join('')}<p class="where"><b>Where to find it.</b> ${esc(t.where)}</p></form>`;
  const panel = (p) => {
    const t = p.t, c = p.c, L = esc(t.label);
    const head = `<header class="panel__head">${logo(t.tool, 32)}<h2 id="panel-title">${L}</h2><button type="button" class="iconbtn" data-close aria-label="Close">${icon('x')}</button></header>`;
    if (p.view === 'connect') return `${head}
<div class="panel__body">
  ${facts([['Leon will read', esc(t.reads)], ['Who will see it', whoDefault(t)], ['How often', 'Every 15 minutes. Each item is kept word for word.']])}
  ${t.how === 'key' ? keyForm(t) : ''}
</div>
<footer class="panel__foot">
  ${t.how === 'oauth'
    ? `<button type="button" class="btn" data-act="oauth" data-focus>Continue to ${L}${icon('out')}</button><p class="panel__note">${L}’s own sign-in page opens. Leon never sees your password.</p>`
    : `<button type="submit" form="keyform" class="btn">Connect ${L}</button><p class="panel__note">The key is encrypted. Only you can replace it.</p>`}
  <i class="work"></i>
</footer>`;
    if (p.view === 'repair') return `${head}
<div class="panel__body">
  <div class="statusrow">${pill(c)}<span>Last synced ${c.synced}</span></div>
  <p class="panel__what">${esc(c.note || '')}</p>
  ${facts([['Account', esc(c.account)], ['Visible to', whoNow(c)]])}
  ${keyForm(t)}
</div>
<footer class="panel__foot">
  <button type="submit" form="keyform" class="btn">Reconnect</button><button type="button" class="btn btn--quiet" data-close>Not now</button>
  <p class="panel__note">The key is encrypted. Only you can replace it.</p>
  <i class="work"></i>
</footer>`;
    if (p.view === 'connected') return `${head}
<div class="panel__body">
  <div class="done">${pill(c)}<h3><span class="mark is-on">${L} is connected</span></h3><p>Leon is reading ${L} for the first time. After that, it picks up changes every 15 minutes.</p></div>
  ${facts([['Visible to', whoNow(c)]])}
</div>
<footer class="panel__foot"><button type="button" class="btn" data-close data-focus>Done</button><button type="button" class="btn btn--line" data-act="manage">Manage</button></footer>`;
    const err = c.state === 'error', foc = p.view === 'confirm' ? '' : ' data-focus';
    return `${head}
<div class="panel__body">
  <div class="statusrow" role="status">${pill(c)}${err ? `<button type="button" class="btn btn--xs" data-act="repair"${foc}>Reconnect</button>`
    : `<button type="button" class="btn btn--xs btn--line" data-act="sync"${c.state === 'sync' ? ' disabled' : foc}>${c.state === 'sync' ? 'Syncing…' : 'Sync now'}</button>`}</div>
  ${facts([['Account', esc(c.account)], ['Visible to', whoNow(c)], ['Items saved', c.items ? num(c.items) : 'None yet'], ['Leon reads', esc(t.reads)]])}
  <button type="button" class="linkbtn" data-act="another">Connect another ${L} account</button>
</div>
<footer class="panel__foot">${p.view === 'confirm'
    ? `<div class="confirm" role="alert"><b>Delete this connection?</b><p>Leon stops reading ${L} with ${esc(c.account)}. What it already saved stays.</p><button type="button" class="btn btn--danger" data-act="delete">Delete connection</button> <button type="button" class="btn btn--quiet" data-act="keep" data-focus>Keep it</button></div>`
    : '<button type="button" class="btn btn--quiet" data-act="ask-delete">Delete connection</button><button type="button" class="btn btn--line push" data-close>Done</button>'}</footer>`;
  };

  root.LeonV3 = { html: { connGrid, tiles, chips, health }, count: { conns: () => conns.length, add: () => toAdd().length } };
  if (typeof document === 'undefined') return; // Node: build.mjs only needs the templates

  // ---------- Behaviour ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const html = document.documentElement, main = $('#main');
  const narrow = matchMedia('(max-width: 899px)');
  const WORK = parseFloat(getComputedStyle(html).getPropertyValue('--work')) || 1300;

  // Toasts, and the notice of the screens this proposal does not draw
  const toast = (msg) => {
    const t = document.createElement('p');
    t.className = 'toast'; t.textContent = msg;
    $('#toasts').replaceChildren(t);
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 200); }, 3600);
  };
  const undrawn = (what) => toast(`${what} · Not drawn in this proposal`);

  // The sidebar: rail on a desktop (remembered; the <head> applies it before the first paint), drawer under 900px
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

  // Everything that follows a change of the connections
  const healthEl = $('#health'), qIn = $('#tool-q'), tilesEl = $('#tiles'), emptyEl = $('#empty'), knownEl = $('#known');
  const refresh = () => {
    $('#conn-grid').innerHTML = connGrid();
    $('#conn-count').textContent = conns.length;
    tilesEl.innerHTML = tiles();
    $('#add-count').textContent = toAdd().length;
    applyFilter();
    healthEl.innerHTML = health(); healthEl.hidden = !bad();
    $('#nav-flag').hidden = $('#nav-dot').hidden = !bad();
  };

  // The gallery: families and search
  let fam = -1;
  function applyFilter() {
    const q = qIn.value.trim().toLowerCase(), famOk = (fi) => fam < 0 || fi === fam;
    let n = 0;
    $$('li', tilesEl).forEach((li) => { const ok = famOk(+li.dataset.f) && (!q || li.dataset.s.includes(q)); li.hidden = !ok; n += ok; });
    // Letters that only find a tool already connected: say so, and lead to it
    const known = n || !q ? [] : [...new Set(conns.filter((c) => { const t = byTool[c.tool]; return famOk(t.fi) && `${t.label} ${t.tool}`.toLowerCase().includes(q); }).map((c) => c.tool))];
    knownEl.innerHTML = known.map((tool) => `<p>${logo(tool, 28)}<span><b>${esc(byTool[tool].label)}</b> is already connected.</span><button type="button" class="linkbtn" data-open="${tool}">Manage<span class="vh"> ${esc(byTool[tool].label)}</span></button></p>`).join('');
    tilesEl.hidden = !n; knownEl.hidden = !known.length; emptyEl.hidden = !!n || !!known.length;
    if (!n && !known.length) $('#empty-h').textContent = `No tool matches “${qIn.value.trim()}”${fam < 0 ? '' : ` in ${D.catalogue[fam].family}`}`;
    $('#tool-live').textContent = known.length ? known.map((tool) => `${byTool[tool].label} is already connected.`).join(' ') : `${n} ${n === 1 ? 'tool' : 'tools'} shown`;
  }
  const setFam = (i) => { fam = i; $$('#chips .chip').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.fam === fam))); applyFilter(); };
  qIn.addEventListener('input', applyFilter);
  $('#chips').addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) setFam(+b.dataset.fam); });
  $('#clear').addEventListener('click', () => { qIn.value = ''; setFam(-1); qIn.focus(); });

  // One tool's panel
  const panelEl = $('#panel');
  let P = null;
  const renderPanel = () => { panelEl.innerHTML = panel(P); const f = $('[data-focus]', panelEl) || $('.keyform .field', panelEl); if (f) f.focus(); };
  const openPanel = (t, c, view) => { P = { t, c, view }; panelEl.classList.remove('is-closing'); if (!panelEl.open) panelEl.showModal(); renderPanel(); };
  const openConn = (c) => openPanel(byTool[c.tool], c, c.state === 'error' ? 'repair' : 'manage');
  const openTool = (tool) => { const c = conns.find((x) => x.tool === tool); if (c) openConn(c); else openPanel(byTool[tool], null, 'connect'); };
  const closePanel = () => { if (!panelEl.open) return; panelEl.classList.add('is-closing'); setTimeout(() => { panelEl.classList.remove('is-closing'); panelEl.close(); }, 140); };
  panelEl.addEventListener('close', () => setTimeout(() => { // after the browser's own focus return: the tile that opened it may have been redrawn, or moved to the other section
    const f = document.activeElement;
    if (P && !panelEl.open && (!f || f === document.body || panelEl.contains(f))) { const b = $(`.tl[data-tool="${P.t.tool}"]`); if (b) b.focus({ preventScroll: true }); }
  }));
  const busy = (label, done) => {
    const btn = $('.panel__foot .btn', panelEl), c = P.c, t = P.t;
    btn.disabled = true; btn.textContent = label;
    $$('.field', panelEl).forEach((f) => { f.readOnly = true; });
    $$('.panel__foot .btn--quiet', panelEl).forEach((b) => { b.hidden = true; });
    $('.panel__foot', panelEl).classList.add('is-working');
    setTimeout(() => done(t, c), WORK);
  };
  const connect = (label) => busy(label, (t) => {
    const c = { id: 'c' + (++seq), tool: t.tool, label: t.label, account: t.private ? A.me.email : A.me.name, scope: t.private ? 'private' : 'team', state: 'first', synced: '', items: 0 };
    conns.push(c);
    refresh();
    if (P && P.t === t && panelEl.open) { P = { t, c, view: 'connected' }; renderPanel(); }
  });
  const repair = () => busy('Reconnecting…', (t, c) => {
    c.state = 'ok'; c.synced = 'just now'; delete c.note;
    refresh();
    if (P && P.c === c && panelEl.open) { P.view = 'manage'; renderPanel(); }
  });
  panelEl.addEventListener('submit', (e) => {
    e.preventDefault();
    let first = null;
    $$('[data-req]', panelEl).forEach((f) => {
      const miss = !f.value.trim();
      if (miss) f.setAttribute('aria-invalid', 'true'); else f.removeAttribute('aria-invalid');
      $(`#${f.id}-e`).textContent = miss ? `${f.dataset.req} is missing.` : '';
      if (miss && !first) first = f;
    });
    if (first) return first.focus();
    if (P.view === 'repair') repair(); else connect('Connecting…');
  });
  panelEl.addEventListener('click', (e) => {
    if (e.target === panelEl || e.target.closest('[data-close]')) return closePanel();
    const act = (e.target.closest('[data-act]') || { dataset: {} }).dataset.act, c = P && P.c;
    if (act === 'oauth') connect(`Opening ${P.t.label}…`);
    if (act === 'another') openPanel(P.t, null, 'connect');
    if (act === 'manage' || act === 'keep') { P.view = 'manage'; renderPanel(); }
    if (act === 'ask-delete') { P.view = 'confirm'; renderPanel(); }
    if (act === 'repair') { P.view = 'repair'; renderPanel(); }
    if (act === 'sync') {
      c.state = 'sync'; renderPanel();
      setTimeout(() => { c.state = 'ok'; c.synced = 'just now'; if (P && P.c === c && panelEl.open) renderPanel(); }, WORK);
    }
    if (act === 'delete') {
      conns.splice(conns.indexOf(c), 1);
      closePanel(); refresh();
      toast(`${c.label} connection deleted. What Leon saved stays.`);
    }
  });

  // The ask bar opens the command bar, in place
  const ask = $('#ask'), cmd = $('#cmd'), cmdIn = $('#cmd-input'), cmdList = $('#cmd-list');
  const NAV = [['Home', 'home'], ['Chat', 'chat'], ['Documents', 'doc'], ['Team', 'team'], ['Connections', 'plug'], ['Settings', 'sliders']];
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
    const q = cmdIn.value.trim(), lq = q.toLowerCase(), has = (s) => s.toLowerCase().includes(lq), groups = [];
    const b = bad();
    const found = q ? tools.filter((t) => has(t.label)).sort((x, y) => !x.label.toLowerCase().startsWith(lq) - !y.label.toLowerCase().startsWith(lq)).slice(0, 6) : []; // names that start with the letters first
    if (found.length) groups.push(['Tools', found.map((t) => ({ h: `${logo(t.tool, 18)}<span><b>${isOn(t.tool) ? 'Manage' : 'Connect'} ${esc(t.label)}</b></span><span class="sub">${isOn(t.tool) ? 'Connected' : t.family}</span>`, run: () => openTool(t.tool) }))]);
    if (q) groups.push(['Ask', [{ h: `<span class="strokes" aria-hidden="true"><i></i><i></i><i></i></span><span>Ask Leon <b>“${esc(q)}”</b></span>`, run: () => undrawn('Leon’s answer') }]]);
    if (!q && b) groups.push(['Needs attention', [{ h: `${logo(b.tool, 18)}<span><b>Reconnect ${esc(b.label)}</b></span>`, run: () => openTool(b.tool) }]]);
    const rec = D.discussions.filter((d) => !q || has(d.title));
    if (rec.length) groups.push(['Recent discussions', rec.map((d) => ({ h: `${icon('chat')}<span>${esc(d.title)}</span><span class="sub">${d.date}</span>`, run: () => undrawn('Chat') }))]);
    const nav = NAV.filter(([l]) => !q || has(l));
    if (nav.length) groups.push(['Go to', nav.map(([l, i]) => ({ h: `${icon(i)}<span>${l}</span>${l === 'Connections' ? '<span class="sub">You are here</span>' : ''}`, run: () => (l === 'Connections' ? scrollTo({ top: 0 }) : undrawn(l)) }))]);
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

  // Clicks and keys of the page
  document.addEventListener('click', (e) => {
    const u = e.target.closest('[data-undrawn]'), cur = e.target.closest('a[aria-current]');
    const m = e.target.closest('[data-manage]'), o = e.target.closest('[data-open]');
    if (cur) e.preventDefault();
    if (u) { const pop = u.closest('[popover]'); if (pop) pop.hidePopover(); if (html.classList.contains('is-drawer')) setDrawer(false); undrawn(u.dataset.undrawn); }
    if ((m || o) && html.classList.contains('is-drawer')) setDrawer(false);
    if (m) { const c = conns.find((x) => x.id === m.dataset.manage); if (c) openConn(c); }
    if (o && !panelEl.contains(o)) openTool(o.dataset.open);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmd.open ? cmd.close() : openCmd(); }
    else if (e.key === 'Escape' && html.classList.contains('is-drawer')) setDrawer(false);
    else if (e.key === '/' && !$('dialog[open]') && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) { e.preventDefault(); qIn.focus(); }
  });
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $$('.mod').forEach((k) => { k.textContent = 'Ctrl'; });
})(typeof window !== 'undefined' ? window : globalThis);
