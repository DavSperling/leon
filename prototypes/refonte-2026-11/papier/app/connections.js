/* Connections: the connected tools as cards, the tools to add as tiles, and one tool's panel (connect in one click
   or with a key, repair, manage, delete). Built on the kit: Leon.card, Leon.tile, Leon.panel. The first half also
   runs in Node (build.mjs writes its blocks into connections.html). ?state=empty: a new workspace. */
(function () {
  'use strict';
  const L = window.Leon, { D, A, esc, icon, conns, tools } = L;
  const HL = [1, 2, 3, 4, 1, 2]; // the stroke that passes under a name when it is pointed at, by family
  const isOn = (tool) => conns.some((c) => c.tool === tool);
  const toAdd = () => tools.filter((t) => !isOn(t.tool));

  // A connected tool: what it is and, only if something is wrong, what is wrong. The rest is in its panel.
  const connGrid = () => conns.map((c) => {
    const err = c.state === 'error';
    return L.card({ logo: c.tool, name: c.label, sub: err ? 'Disconnected' : c.scope === 'private' ? 'Only you' : 'Team', err, pill: err && 'Reconnect', ink: true, hl: HL[L.tool(c.tool).fi],
      label: `${err ? 'Reconnect' : 'Manage'} ${c.label}`, attrs: `data-manage="${c.id}" data-tool="${c.tool}"` });
  }).join('\n');
  const tiles = () => toAdd().map((t) => L.tile({ logo: t.tool, name: t.label, pill: 'Connect', hl: HL[t.fi], label: `Connect ${t.label}`,
    attrs: `data-open="${t.tool}" data-tool="${t.tool}"`, li: `data-f="${t.fi}" data-s="${esc(`${t.label} ${t.tool} ${t.family}`.toLowerCase())}"` })).join('\n');
  const chips = () => [['All', -1]].concat(D.catalogue.map((f, i) => [f.family, i]))
    .map(([l, i]) => `<button type="button" class="chip" data-v="${i}" aria-pressed="${i === -1}">${l}</button>`).join('\n');

  L.block('conns', connGrid);
  L.block('tiles', tiles);
  L.block('chips', chips);
  L.block('conn-count', () => conns.length);
  L.block('add-count', () => toAdd().length);
  // 8 cards with Intercom first and the only ink pill, 34 tiles, 7 chips, and none of the words the founder took off
  L.selfCheck = (assert) => {
    const n = (s, re) => (s.match(re) || []).length, c = connGrid(), t = tiles();
    assert.equal(n(c, /<li /g), 8);
    assert.match(c, /^<li[^>]*><button[^>]*class="tl card is-err"[^>]*aria-label="Reconnect Intercom"/);
    assert.equal(n(c, /class="btn btn--xs"/g), 1);
    assert.equal(n(t, /<li /g), 34);
    assert.equal(n(chips(), /<button/g), 7);
    for (const w of [/items/i, /synced/i, /min ago/, /every 15 minutes/i, /One click|API key/, /\d/]) assert.doesNotMatch((c + t).replace(/<[^>]*>/g, ''), w);
  };
  if (!L.browser) return;

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  let seq = conns.length;

  // ---------- The gallery: families and search ----------
  const qIn = $('#tool-q'), tilesEl = $('#tiles'), emptyEl = $('#empty'), knownEl = $('#known');
  let fam = -1;
  const applyFilter = () => {
    const q = qIn.value.trim().toLowerCase(), famOk = (fi) => fam < 0 || fi === fam;
    let n = 0;
    $$('li', tilesEl).forEach((li) => { const ok = famOk(+li.dataset.f) && (!q || li.dataset.s.includes(q)); li.hidden = !ok; n += ok; });
    // Letters that only find a tool already connected: say so, and lead to it
    const known = n || !q ? [] : [...new Set(conns.filter((c) => { const t = L.tool(c.tool); return famOk(t.fi) && `${t.label} ${t.tool}`.toLowerCase().includes(q); }).map((c) => c.tool))];
    knownEl.innerHTML = known.map((tool) => `<p>${L.logo(tool, 28)}<span><b>${esc(L.tool(tool).label)}</b> is already connected.</span><button type="button" class="linkbtn" data-open="${tool}">Manage<span class="vh"> ${esc(L.tool(tool).label)}</span></button></p>`).join('');
    tilesEl.hidden = !n; knownEl.hidden = !known.length; emptyEl.hidden = !!n || !!known.length;
    if (!n && !known.length) $('#empty-h').textContent = `No tool matches “${qIn.value.trim()}”${fam < 0 ? '' : ` in ${D.catalogue[fam].family}`}`;
    $('#tool-live').textContent = known.length ? known.map((tool) => `${L.tool(tool).label} is already connected.`).join(' ') : `${n} ${n === 1 ? 'tool' : 'tools'} shown`;
  };
  qIn.addEventListener('input', applyFilter);
  $('#chips').addEventListener('leon:chip', (e) => { fam = +e.detail; applyFilter(); });
  $('#clear').addEventListener('click', () => { qIn.value = ''; $('#chips .chip').click(); qIn.focus(); }); // the first chip is "All"

  // Everything that follows a change of the connections
  const refresh = () => {
    $('#conn-grid').innerHTML = connGrid();
    $('#conn-count').textContent = conns.length;
    $('#conn-grid').hidden = $('#conn-count').hidden = !conns.length;
    $('#conn-none').hidden = !!conns.length;
    tilesEl.innerHTML = tiles();
    $('#add-count').textContent = toAdd().length;
    applyFilter();
    L.shell.refresh();
  };

  // ---------- One tool's panel. P = { t: the tool, c: its connection or null, view: connect | connected | manage | repair } ----------
  let P = null;
  const pill = (c) => (c.state === 'error' ? L.pill('Disconnected', 'err')
    : c.state === 'first' ? L.pill('First sync in progress', 'work')
    : c.state === 'sync' ? `<span class="pill pill--work is-sweeping"><i class="dot"></i>Synced ${c.synced}</span>` : L.pill(`Synced ${c.synced}`));
  const whoDefault = (t) => (t.private
    ? `<b>Only you</b>, by default.<small>What Leon reads in ${esc(t.label)} isn’t shared with the team unless you share it.</small>`
    : `<b>Team</b>, by default.<small>Each item is shown only to the people who can already open it in ${esc(t.label)}.</small>`);
  const keyForm = (t) => `<form class="form" id="panel-form" novalidate>${t.fields.map((f, i) => L.field(Object.assign({ id: `kf-${i}` }, f))).join('')}<p class="where"><b>Where to find it.</b> ${esc(t.where)}</p></form>`;
  const KEY_NOTE = '<p class="panel__note">The key is encrypted. Only you can replace it.</p>';
  const view = () => {
    const { t, c } = P, name = esc(t.label);
    if (P.view === 'connect') return {
      body: `${L.facts([['Leon will read', esc(t.reads)], ['Who will see it', whoDefault(t)], ['How often', 'Every 15 minutes. Each item is kept word for word.']])}${t.how === 'key' ? keyForm(t) : ''}`,
      foot: t.how === 'oauth'
        ? `<button type="button" class="btn" data-act="oauth" data-focus>Continue to ${name}${icon('out')}</button><p class="panel__note">${name}’s own sign-in page opens. Leon never sees your password.</p>`
        : `<button type="submit" form="panel-form" class="btn">Connect ${name}</button>${KEY_NOTE}`,
    };
    if (P.view === 'repair') return {
      body: `<div class="statusrow">${pill(c)}<span>Last synced ${c.synced}</span></div><p class="panel__what">${esc(c.note || '')}</p>${L.facts([['Account', esc(c.account)], ['Visible to', L.who(c.scope)]])}${keyForm(t)}`,
      foot: `<button type="submit" form="panel-form" class="btn">Reconnect</button><button type="button" class="btn btn--quiet" data-close>Not now</button>${KEY_NOTE}`,
    };
    if (P.view === 'connected') return {
      body: `<div class="done">${pill(c)}<h3><span class="mark is-on">${name} is connected</span></h3><p>Leon is reading ${name} for the first time. After that, it picks up changes every 15 minutes.</p></div>${L.facts([['Visible to', L.who(c.scope)]])}`,
      foot: '<button type="button" class="btn" data-close data-focus>Done</button><button type="button" class="btn btn--line" data-act="manage">Manage</button>',
    };
    const syncing = c.state === 'sync';
    return {
      body: `<div class="statusrow" role="status">${pill(c)}${c.state === 'error' ? '<button type="button" class="btn btn--xs" data-act="repair" data-focus>Reconnect</button>'
        : `<button type="button" class="btn btn--xs btn--line" data-act="sync"${syncing ? ' disabled' : ' data-focus'}>${syncing ? 'Syncing…' : 'Sync now'}</button>`}</div>
${L.facts([['Account', esc(c.account)], ['Visible to', L.who(c.scope)], ['Items saved', c.items ? c.items.toLocaleString('en-US') : 'None yet'], ['Leon reads', esc(t.reads)]])}
<button type="button" class="linkbtn" data-act="another">Connect another ${name} account</button>`,
      foot: '<button type="button" class="btn btn--quiet" data-act="ask-delete">Delete connection</button><button type="button" class="btn btn--line push" data-close>Done</button>',
    };
  };
  const shown = (c) => L.panel.el.open && P && P.c === c;
  const connect = (label) => {
    const t = P.t;
    L.panel.busy(label).then((still) => {
      const c = { id: `c${++seq}`, tool: t.tool, label: t.label, account: t.private ? A.me.email : A.me.name, scope: t.private ? 'private' : 'team', state: 'first', synced: '', items: 0 };
      conns.push(c);
      refresh();
      if (still) open(t, c, 'connected');
    });
  };
  const repair = () => {
    const { t, c } = P;
    L.panel.busy('Reconnecting…').then((still) => {
      c.state = 'ok'; c.synced = 'just now'; delete c.note;
      refresh();
      if (still) open(t, c, 'manage');
    });
  };
  const act = (name) => {
    const { t, c } = P;
    if (name === 'oauth') connect(`Opening ${t.label}…`);
    if (name === 'another') open(t, null, 'connect');
    if (name === 'manage' || name === 'repair') open(t, c, name);
    if (name === 'sync') {
      c.state = 'sync'; open(t, c, 'manage');
      setTimeout(() => { c.state = 'ok'; c.synced = 'just now'; if (shown(c)) open(t, c, 'manage'); }, L.WORK);
    }
    if (name === 'ask-delete') {
      L.panel.confirm({ title: 'Delete this connection?', text: `Leon stops reading ${t.label} with ${c.account}. What it already saved stays.`, yes: 'Delete connection', no: 'Keep it' }).then((yes) => {
        if (!yes) return;
        conns.splice(conns.indexOf(c), 1);
        L.panel.close(); refresh();
        L.toast(`${c.label} connection deleted. What Leon saved stays.`);
      });
    }
  };
  function open(t, c, v) {
    P = { t, c, view: v };
    L.panel.open(Object.assign({ logo: t.tool, title: t.label, act, submit: () => (P.view === 'repair' ? repair() : connect('Connecting…')), back: `.tl[data-tool="${t.tool}"]` }, view()));
  }
  const openConn = (c) => open(L.tool(c.tool), c, c.state === 'error' ? 'repair' : 'manage');
  const openTool = (tool) => { const c = conns.find((x) => x.tool === tool); if (c) openConn(c); else if (L.tool(tool)) open(L.tool(tool), null, 'connect'); };
  L.openHere = openTool; // the sidebar's alert, the command bar and connections.html?open=<tool>

  document.addEventListener('click', (e) => {
    const m = e.target.closest('[data-manage]'), o = e.target.closest('[data-open]');
    if (m) { const c = conns.find((x) => x.id === m.dataset.manage); if (c) openConn(c); }
    if (o && !L.panel.el.contains(o)) openTool(o.dataset.open);
  });

  if (L.param('state') === 'empty') { conns.length = 0; refresh(); } // a new workspace: no tool connected yet
})();
