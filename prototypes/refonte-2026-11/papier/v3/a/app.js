/* Leon « Papier » v3, take A « Feuille » : the shell and the Connections screen.
   The first part (templates) is also run by build.mjs to write the same markup into connections.html. */
(function () {
  'use strict';

  /* ---------- Templates, shared with build.mjs ---------- */
  const LOGOS = '../../../shared/logos/';
  const PATHS = {
    home: 'M2.5 7.2 8 2.7l5.5 4.5v5.3a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM6.5 13.5v-4h3v4',
    chat: 'M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v5.5A1.5 1.5 0 0 1 12 11H7.2L4 13.5V11a1.5 1.5 0 0 1-1.5-1.5z',
    docs: 'M4 2.5h5l3 3v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zM9 2.5v3h3M5.5 8.5h5M5.5 11h3.5',
    team: 'M6 7.5A2.25 2.25 0 1 0 6 3a2.25 2.25 0 0 0 0 4.5zM1.75 13c.3-2.1 2-3.25 4.25-3.25s3.95 1.15 4.25 3.25M10.5 3.2a2.25 2.25 0 0 1 0 4.1M11.75 9.9c1.4.4 2.3 1.5 2.5 3.1',
    plug: 'M5.5 2v3M10.5 2v3M3.5 5h9v2.5a4.5 4.5 0 0 1-9 0zM8 12v2',
    sliders: 'M2.5 4.5h5M10.5 4.5h3M9 3v3M2.5 11.5h3M8.5 11.5h5M7 10v3',
    side: 'M2.5 4A1.5 1.5 0 0 1 4 2.5h8A1.5 1.5 0 0 1 13.5 4v8a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12zM6 2.5v11',
    plus: 'M8 3.5v9M3.5 8h9',
    x: 'M4 4l8 8M12 4l-8 8',
    chev: 'M6 3.5 10.5 8 6 12.5',
    updown: 'M5 6.25 8 3.5l3 2.75M5 9.75l3 2.75 3-2.75',
    check: 'M3.5 8.5l3 3 6-7',
    person: 'M8 7.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5c.4-2.4 2.4-3.75 5-3.75s4.6 1.35 5 3.75',
    sync: 'M13 8a5 5 0 0 1-8.9 3.1M3 8a5 5 0 0 1 8.9-3.1M12.2 2.3v2.8H9.4M3.8 13.7v-2.8h2.8',
  };
  const ico = (n) => `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${PATHS[n]}"/></svg>`;
  const strokes = '<svg class="strokes" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h11"/><path d="M2.5 8h8"/><path d="M2.5 12h5"/></svg>';
  const logo = (tool) => `<span class="logo"><img src="${LOGOS}${tool}.svg" alt="" width="18" height="18"></span>`;
  const num = (n) => Number(n).toLocaleString('en-US');
  const scope = (c) => `<span class="scope">${ico(c.scope === 'team' ? 'team' : 'person')}${c.scope === 'team' ? 'Team' : 'Only you'}</span>`;
  const pill = (c) => c.state === 'error' ? `<span class="pill pill--bad">Last synced ${c.synced}</span>`
    : c.state === 'first' ? '<span class="pill pill--first">First sync in progress</span>'
    : `<span class="pill">Synced ${c.synced}</span>`;

  // One connected tool, as a row of the list. The name is the control: its ::after covers the whole row.
  const row = (c, reads) => {
    const bad = c.state === 'error';
    return `<li class="row${bad ? ' row--bad' : ''}" data-tool="${c.tool}">${logo(c.tool)}`
      + `<div class="row__id"><button type="button" class="row__name" data-open="${c.tool}">${c.label}<span class="vh">: ${bad ? 'reconnect' : 'manage'}</span></button><span class="row__acct">${c.account}</span></div>`
      + `<p class="row__reads">${bad ? c.note : reads}</p>${scope(c)}${pill(c)}`
      + `<span class="row__items">${c.state === 'first' ? '' : `<b>${num(c.items)}</b> items`}</span>`
      + (bad ? `<button type="button" class="btn row__fix" data-open="${c.tool}">Reconnect</button>`
        : `<span class="row__act" aria-hidden="true">Manage${ico('chev')}</span>`) + '</li>';
  };
  // The action of a gallery tile, by the state of its connection (none: "Connect").
  const go = (t, c) => !c ? `<button type="button" class="tile__go" data-open="${t.tool}">Connect<span class="vh"> ${t.label}</span></button>`
    : c.state === 'error' ? `<button type="button" class="tile__go is-bad" data-open="${t.tool}">Reconnect<span class="vh"> ${t.label}</span></button>`
    : `<button type="button" class="tile__go is-on" data-open="${t.tool}">${ico('check')}Connected<span class="vh">: manage ${t.label}</span></button>`;
  const tile = (t, c, reads) => `<li class="tile" data-tool="${t.tool}" data-fam="${t.fam}">${logo(t.tool)}<h3 class="tile__name">${t.label}</h3>${go(t, c)}<p class="tile__reads">${reads}</p></li>`;

  const V = window.LeonV3 = { ico, strokes, logo, row, tile, pill };
  if (!window.document) return; // build.mjs stops here

  /* ---------- State ---------- */
  const D = window.LEON_DEMO, A = window.LEON_APP;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => [...(r || document).querySelectorAll(s)];
  const tools = {};
  D.catalogue.forEach((f, i) => f.tools.forEach(([tool, label]) => { tools[tool] = { tool, label, fam: i, family: f.family }; }));
  const conns = D.connections.map((c) => ({ ...c }));
  const conn = (tool) => conns.find((c) => c.tool === tool);
  const WORK = 1100; // how long a pretend connection or sync takes

  /* ---------- Toast: the one place for short notices ---------- */
  const toasts = $('.toasts');
  let toastTimer;
  function toast(text) {
    toasts.innerHTML = `<p class="toast">${text}</p>`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toasts.innerHTML = ''; }, 3600);
  }
  const undrawn = (name) => toast(`${name}: not drawn in this proposal.`);

  /* ---------- The connected list, the marks on the gallery, the counts, the shell's health ---------- */
  function render(changed) {
    const bad = conns.filter((c) => c.state === 'error'), good = conns.filter((c) => c.state !== 'error');
    $('[data-rows="bad"]').innerHTML = bad.map((c) => row(c, A.reads[c.tool])).join('');
    $('[data-rows="ok"]').innerHTML = good.map((c) => row(c, A.reads[c.tool])).join('')
      || '<li class="rows__none">No tool is connected. Choose one below.</li>';
    const n = { on: conns.length, bad: bad.length, ok: good.length };
    $$('[data-n]').forEach((el) => { el.textContent = n[el.dataset.n]; });
    $$('[data-if-bad]').forEach((el) => { el.hidden = !bad.length; });
    $$('.tile').forEach((li) => { $('.tile__go', li).outerHTML = go(tools[li.dataset.tool], conn(li.dataset.tool)); });
    $('.health__t').textContent = bad.length ? `${bad[0].label} needs reconnecting` : conns.length ? `All ${conns.length} tools in sync` : 'No tool connected';
    $('.health').classList.toggle('is-bad', bad.length > 0);
    $('.strip').innerHTML = conns.map((c) => `<i${c.state === 'error' ? ' class="bad"' : ''}></i>`).join('');
    const li = changed && $(`.row[data-tool="${changed}"]`);
    if (li) li.classList.add('is-new'); // the highlighter passes over the row once
  }

  /* ---------- The gallery: families and search ---------- */
  const search = $('#tool-search');
  let fam = 'all';
  function filter() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    $$('.tile').forEach((li) => {
      const t = tools[li.dataset.tool];
      const ok = (fam === 'all' || Number(fam) === t.fam) && (!q || `${t.label} ${t.family}`.toLowerCase().includes(q));
      li.hidden = !ok;
      shown += ok;
      // the letters found are marked, as Leon marks the passage it found
      const i = q ? t.label.toLowerCase().indexOf(q) : -1;
      $('.tile__name', li).innerHTML = i < 0 ? t.label : `${t.label.slice(0, i)}<mark class="hl hl-4">${t.label.slice(i, i + q.length)}</mark>${t.label.slice(i + q.length)}`;
    });
    $$('[data-fam-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.famPick === fam)));
    $('.none').hidden = shown > 0;
    $('[data-none-q]').textContent = search.value.trim();
  }
  search.addEventListener('input', () => { fam = 'all'; filter(); }); // a search looks in every family

  /* ---------- One tool's panel: the second sheet ---------- */
  const panel = $('#panel');
  let cur = null;
  const field = (f, i) => `<label class="fld"><span class="fld__l">${f.label}</span>` + (f.kind === 'select'
    ? `<select class="inp" name="f${i}">${f.options.map((o) => `<option>${o}</option>`).join('')}</select>`
    : `<input class="inp" name="f${i}" type="${f.kind === 'secret' ? 'password' : 'text'}" placeholder="${f.placeholder || ''}" autocomplete="off" spellcheck="false" required data-label="${f.label}">`) + '</label>';
  const keyForm = (k, kind, button) => `<form class="form" data-form="${kind}" novalidate>${k.fields.map(field).join('')}`
    + `<p class="hint">${k.where}</p><button type="submit" class="btn btn--lg">${button}</button></form>`;

  function drawPanel(done) {
    const t = tools[cur], c = conn(cur), k = A.connect[cur], reads = A.reads[cur];
    const mode = !c ? 'connect' : c.state === 'error' ? 'fix' : 'manage';
    let body = done ? `<p class="done" role="status"><span class="hl hl-2">${done[0]}</span> ${done[1]}</p>` : '';
    const facts = () => '<dl class="facts">'
      + `<div><dt>Account</dt><dd>${c.account}</dd></div>`
      + `<div><dt>Visible to</dt><dd>${scope(c)}</dd></div>`
      + (c.state === 'first' ? '' : `<div><dt>Items saved</dt><dd>${num(c.items)}</dd></div>`)
      + (mode === 'manage' ? `<div><dt>Last sync</dt><dd>${c.state === 'first' ? 'In progress' : c.synced}<button type="button" class="btn btn--line btn--xs" data-sync>Sync now</button></dd></div>` : '')
      + `</dl><section class="sec"><h3>What Leon reads</h3><p>${reads}</p></section>`
      + `<section class="sec sec--del"><button type="button" class="btn btn--line btn--xs btn--danger" data-del>Delete connection</button>`
      + `<div class="confirm" hidden><h3>Delete the ${t.label} connection?</h3><p>Leon stops reading ${t.label} with ${c.account}. What it already saved stays.</p>`
      + '<p class="confirm__act"><button type="button" class="btn btn--xs btn--danger" data-del-yes>Delete connection</button><button type="button" class="btn btn--line btn--xs" data-del-no>Cancel</button></p></div></section>';

    if (mode === 'connect') {
      body += `<section class="sec sec--main"><h3>What Leon will read</h3><p>${reads}</p></section>`
        + `<section class="sec"><h3>Who will see it</h3><p>${k.private
          ? `<b>Only you</b>, by default. What Leon reads from ${t.label} stays private to you.`
          : '<b>Team</b>, by default. Each item is shown only to the people who can already open it.'}</p></section>`
        + (k.how === 'oauth'
          ? `<form class="form" data-form="connect" novalidate><button type="submit" class="btn btn--lg">Continue to ${t.label}</button>`
            + `<p class="hint">One click. ${t.label} asks you to approve read access, then brings you back here.</p></form>`
          : keyForm(k, 'connect', `Connect ${t.label}`));
    } else if (mode === 'fix') {
      body += `<section class="alert"><h3>${c.note.split('. ')[0]}.</h3>`
        + `<p>Leon last read ${t.label} ${c.synced}. Enter a new ${k.fields[0].label.toLowerCase()} to resume.</p>${keyForm(k, 'fix', 'Reconnect')}</section>${facts()}`;
    } else body += facts();

    panel.dataset.mode = mode;
    panel.innerHTML = (mode === 'fix' ? '<span class="fl fl--left panel__flag" aria-hidden="true"></span>' : '')
      + `<header class="panel__head">${logo(cur)}<div class="panel__t"><h2 id="panel-t">${t.label}</h2><span>${t.family}</span></div>`
      + `${c ? pill(c) : ''}<button type="button" class="ib" data-close aria-label="Close" title="Close (Esc)">${ico('x')}</button></header>`
      + `<div class="panel__body">${body}</div>`;
  }
  function openPanel(tool) {
    cur = tool;
    drawPanel();
    if (!panel.open) panel.showModal();
    ($('.inp', panel) || $('.form .btn', panel) || $('[data-close]', panel)).focus();
  }
  // The highlighter passes over the button while Leon works.
  function busy(btn, text) { btn.disabled = true; btn.classList.add('is-busy'); btn.textContent = text; }
  function finish(tool, done) {
    render(tool);
    if (panel.open && cur === tool) { drawPanel(done); $('[data-close]', panel).focus(); } else toast(`${tools[tool].label}: ${done[0].toLowerCase()}`);
  }

  panel.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target, tool = cur, t = tools[tool], k = A.connect[tool];
    $$('.fld__err', form).forEach((el) => el.remove());
    const empty = [...form.elements].find((el) => el.required && !el.value.trim());
    if (empty) { // refused: say which field, and go to it
      empty.setAttribute('aria-invalid', 'true');
      empty.insertAdjacentHTML('afterend', `<span class="fld__err" role="alert">Enter the ${empty.dataset.label.toLowerCase()}.</span>`);
      empty.focus();
      return;
    }
    const fix = form.dataset.form === 'fix';
    busy($('[type="submit"]', form), fix ? 'Reconnecting…' : k.how === 'oauth' ? `Waiting for ${t.label}…` : 'Connecting…');
    setTimeout(() => {
      if (fix) Object.assign(conn(tool), { state: 'ok', synced: 'just now' });
      else conns.push({ tool, label: t.label, account: A.me.email, scope: k.private ? 'private' : 'team', state: 'first', synced: '', items: 0 });
      finish(tool, fix ? ['Reconnected.', 'Leon reads it again, every 15 minutes.'] : ['Connected.', 'First sync in progress.']);
    }, WORK);
  });
  panel.addEventListener('input', (e) => { // typing lifts the refusal
    if (e.target.getAttribute('aria-invalid')) { e.target.removeAttribute('aria-invalid'); $$('.fld__err', panel).forEach((el) => el.remove()); }
  });
  panel.addEventListener('click', (e) => {
    const on = (sel) => e.target.closest(sel);
    if (e.target === panel || on('[data-close]')) panel.close(); // the veil, or the cross
    else if (on('[data-sync]')) {
      const tool = cur;
      busy(on('[data-sync]'), 'Syncing…');
      setTimeout(() => { Object.assign(conn(tool) || {}, { state: 'ok', synced: 'just now' }); if (conn(tool)) finish(tool, ['Synced.', 'Nothing new since the last read.']); }, WORK);
    } else if (on('[data-del]') || on('[data-del-no]')) {
      const open = !!on('[data-del]');
      $('[data-del]', panel).hidden = open;
      $('.confirm', panel).hidden = !open;
      $(open ? '[data-del-no]' : '[data-del]', panel).focus();
    } else if (on('[data-del-yes]')) {
      const t = tools[cur];
      conns.splice(conns.indexOf(conn(cur)), 1);
      panel.close();
      render();
      toast(`${t.label} connection deleted. What Leon already saved stays.`);
      ($('.row__name') || search).focus();
    }
  });

  /* ---------- The command bar ---------- */
  const cmd = $('#cmd'), cin = $('#cmd-in'), clist = $('#cmd-list');
  const NAV = [['Home', 'home'], ['Chat', 'chat'], ['Documents', 'docs'], ['Team', 'team'], ['Connections', 'plug'], ['Settings', 'sliders']];
  let items = [], at = 0;
  function drawCmd() {
    const q = cin.value.trim(), has = (s) => !q || s.toLowerCase().includes(q.toLowerCase());
    items = [];
    if (q) items.push({ g: 'Ask', lead: strokes, label: `Ask Leon: “${q.replace(/</g, '&lt;')}”`, hint: 'Chat', run: () => undrawn('Chat') });
    NAV.filter((n) => has(n[0])).forEach(([name, icon]) => items.push({ g: 'Go to', lead: ico(icon), label: name, hint: name === 'Connections' ? 'You are here' : '', run: () => name !== 'Connections' && undrawn(name) }));
    Object.values(tools).filter((t) => q ? has(t.label) : (conn(t.tool) || {}).state === 'error').slice(0, 6).forEach((t) => {
      const c = conn(t.tool);
      items.push({ g: 'Tools', lead: logo(t.tool), label: t.label, hint: !c ? 'Connect' : c.state === 'error' ? 'Reconnect' : 'Manage', run: () => openPanel(t.tool) });
    });
    D.discussions.filter((d) => has(d.title)).forEach((d) => items.push({ g: 'Recent', lead: ico('chat'), label: d.title, hint: d.date, run: () => undrawn('Chat') }));
    at = Math.min(at, items.length - 1);
    if (at < 0) at = 0;
    let g = '';
    clist.innerHTML = items.map((it, i) => (it.g !== g ? `<li class="cmd__g" role="presentation">${g = it.g}</li>` : '')
      + `<li class="cmd__o" role="option" id="cmd-o${i}" data-i="${i}" aria-selected="${i === at}">${it.lead}<span class="cmd__l">${it.label}</span><span class="cmd__h">${it.hint}</span></li>`).join('');
    cin.setAttribute('aria-activedescendant', items.length ? `cmd-o${at}` : '');
    const sel = $('[aria-selected="true"]', clist);
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function openCmd() { if (panel.open) panel.close(); cin.value = ''; at = 0; drawCmd(); cmd.showModal(); cin.focus(); }
  function runCmd(i) { const it = items[i]; if (!it) return; cmd.close(); it.run(); }
  cin.addEventListener('input', () => { at = 0; drawCmd(); });
  cin.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = (at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % (items.length || 1); drawCmd(); }
    else if (e.key === 'Enter') { e.preventDefault(); runCmd(at); }
  });
  clist.addEventListener('click', (e) => { const o = e.target.closest('.cmd__o'); if (o) runCmd(Number(o.dataset.i)); });
  cmd.addEventListener('click', (e) => { if (e.target === cmd) cmd.close(); });

  /* ---------- The shell: rail, drawer, menu, keys ---------- */
  const narrow = window.matchMedia('(max-width: 899px)');
  const menu = $('#acct-menu');
  function setSide(cls, on) {
    document.body.classList.toggle(cls, on);
    const open = narrow.matches ? document.body.classList.contains('is-drawer') : !document.body.classList.contains('is-rail');
    $$('[data-side]').forEach((b) => b.setAttribute('aria-expanded', String(open)));
  }
  menu.addEventListener('toggle', (e) => $('.acct').setAttribute('aria-expanded', String(e.newState === 'open')));

  document.addEventListener('click', (e) => {
    const on = (sel) => e.target.closest(sel);
    let el;
    if (on('.veil')) setSide('is-drawer', false);
    else if (on('[data-side]')) narrow.matches ? setSide('is-drawer', !document.body.classList.contains('is-drawer')) : setSide('is-rail', !document.body.classList.contains('is-rail'));
    else if ((el = on('[data-undrawn]'))) { e.preventDefault(); if (menu.matches(':popover-open')) menu.hidePopover(); setSide('is-drawer', false); undrawn(el.dataset.undrawn); }
    else if (on('[data-cmd]')) { setSide('is-drawer', false); openCmd(); }
    else if ((el = on('.health'))) { const bad = conns.find((c) => c.state === 'error'); setSide('is-drawer', false); if (bad) { e.preventDefault(); openPanel(bad.tool); } }
    else if ((el = on('[data-fam-pick]'))) { fam = el.dataset.famPick; search.value = ''; filter(); }
    else if (on('[data-clear]')) { search.value = ''; fam = 'all'; filter(); search.focus(); }
    else if (on('a[href="#add"]')) setTimeout(() => search.focus({ preventScroll: true }), 0);
    else if (!panel.contains(e.target) && (el = on('[data-open]'))) openPanel(el.dataset.open);
  });
  document.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); cmd.open ? cmd.close() : openCmd(); }
    else if (e.key === '/' && !typing && !panel.open && !cmd.open) { e.preventDefault(); search.scrollIntoView({ block: 'center' }); search.focus(); }
    else if (e.key === 'Escape' && document.body.classList.contains('is-drawer')) setSide('is-drawer', false);
  });

  // Self-check: the page was written from the same data the script reads.
  console.assert($$('.tile').length === Object.keys(tools).length && $$('.row').length === conns.length, 'connections.html is out of date: run node build.mjs');
  if (!/Mac|iPhone|iPad/.test(navigator.platform)) $$('[data-mod]').forEach((k) => { k.textContent = 'Ctrl'; });
  filter();
})();
