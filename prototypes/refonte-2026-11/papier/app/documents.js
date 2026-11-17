/* Documents: the files people added, as tiles; a file added with the button or dropped anywhere on the page; one
   document's panel (who added it, when, its size, who sees it, Delete). Built on the kit: Leon.tile, Leon.panel.
   The first half also runs in Node (build.mjs writes its blocks into documents.html). ?state=empty: nothing added yet.
   Rules from the real product: only the person who added a document changes who sees it or deletes it; an admin may
   delete the document of a former member. A new file is shared with the team by default. */
(function () {
  'use strict';
  const L = window.Leon, { A, esc } = L;
  const ME = A.me.name;
  const docs = A.documents.map((d) => Object.assign({}, d)); // the page's own copy: a reload starts again from the data
  const HL = { pdf: 1, excel: 2, word: 3, powerpoint: 4, text: 3 }; // the stroke under a name, by kind of file
  const scope = (d) => (d.visibility === 'private' ? 'Only you' : 'Team');
  // One document: its name (the picture already says what kind of file: no extension) and who sees it; while Leon
  // reads it, "Reading…" under the highlighter. The panel's title is the whole file name.
  const base = (name) => name.replace(/\.[a-z0-9]+$/i, '');
  // A text or code file has no brand: the shell's document icon stands in for a logo
  const plain = (px) => `<svg class="logo logo--text" width="${px}" height="${px}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-doc"/></svg>`;
  const tile = (d) => L.tile({ logo: d.type, name: base(d.name), sub: d.state === 'reading' ? 'Reading…' : scope(d), hl: HL[d.type], attrs: `data-doc="${esc(d.name)}"` })
    .replace('<span class="tl__sub">Reading…</span>', '<span class="tl__sub"><span class="rd">Reading…</span></span>')
    .replace(/<img class="logo" src="[^"]*\/text\.svg"[^>]*>/, plain(28));
  const tiles = () => docs.map(tile).join('\n');

  // What Leon reads, from the real product (lib/documents.ts): office files, text and code. Their picture: the kind.
  const KIND = { pdf: 'pdf', docx: 'word', odt: 'word', rtf: 'word', xlsx: 'excel', ods: 'excel', csv: 'excel', pptx: 'powerpoint' };
  const TEXT = 'epub html tex txt md mdx rst adoc log json jsonc yaml yml toml ini cfg conf xml css scss less js jsx mjs cjs ts tsx mts cts vue svelte astro py rb php go rs java kt kts scala swift m c h cc cpp hpp cs fs dart lua r jl ex exs erl clj hs ml elm sql prisma graphql gql proto sh bash zsh fish ps1 bat tf hcl nix'.split(' ');
  const ext = (name) => { const i = name.lastIndexOf('.'); return i > 0 ? name.slice(i + 1).toLowerCase() : ''; };
  const kindOf = (name) => KIND[ext(name)] || (TEXT.includes(ext(name)) ? 'text' : null);

  L.block('docs', tiles);
  L.block('doc-count', () => docs.length);
  L.block('accept', () => [...Object.keys(KIND), ...TEXT].map((x) => `.${x}`).join(','));
  // 7 tiles, and nothing on them but a name and who sees it: no size, no date, no person
  L.selfCheck = (assert) => {
    const t = tiles();
    assert.equal((t.match(/<li/g) || []).length, 7);
    assert.doesNotMatch(t.replace(/<[^>]*>/g, ''), /KB|MB|Nov|Oct|Today|Julie|Karim|\.pdf|\.xlsx/);
    assert.equal(kindOf('a.PDF'), 'pdf'); assert.equal(kindOf('notes.md'), 'text'); assert.match(tile({ name: 'a.md', type: 'text', visibility: 'team' }), /logo--text/); assert.equal(kindOf('film.mov'), null); assert.equal(kindOf('README'), null);
  };
  if (!L.browser) return;

  const $ = (s, el) => (el || document).querySelector(s);
  const grid = $('#docs'), count = $('#doc-count'), none = $('#doc-none'), refused = $('#refused'), live = $('#doc-live'), input = $('#file'), addBtn = $('#add-doc');
  const find = (name) => docs.find((d) => d.name === name);
  const tileOf = (d) => $(`.tl[data-doc="${CSS.escape(d.name)}"]`, grid);
  const READING = 2 * L.WORK;

  const draw = () => {
    grid.innerHTML = tiles();
    count.textContent = docs.length;
    grid.hidden = count.hidden = !docs.length;
    none.hidden = !!docs.length;
  };
  // One tile changes (read, shared): only that tile is drawn again, and it keeps the focus if it had it
  const redraw = (d) => {
    const el = tileOf(d);
    if (!el) return;
    const had = document.activeElement === el;
    el.parentElement.outerHTML = tile(d);
    if (had) tileOf(d).focus();
  };

  // ---------- Leon reads a new file ----------
  const read = (d) => setTimeout(() => {
    if (!docs.includes(d)) return; // deleted meanwhile
    d.state = 'read';
    redraw(d);
    live.textContent = `${d.name} is read.`;
    if (P === d && L.panel.el.open) { const row = $('.statusrow', L.panel.el); if (row) row.remove(); } // only what changed: the focus stays where it is
  }, READING);
  docs.filter((d) => d.state === 'reading').forEach(read);

  // ---------- Adding: the button opens the picker; a file dropped anywhere works too ----------
  const size = (b) => (b < 1048576 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1048576).toFixed(1)} MB`);
  const MAX = 10 * 1048576;
  const add = (files) => {
    const bad = [], added = [];
    [...files].forEach((f) => {
      const type = kindOf(f.name);
      if (!type || f.size > MAX) { bad.push(f.name); return; }
      const old = find(f.name);
      if (old) docs.splice(docs.indexOf(old), 1); // the same file again: it replaces the one before
      const d = { name: f.name, type, size: size(f.size), addedBy: ME, date: `Today, ${new Date().toTimeString().slice(0, 5)}`, visibility: 'team', state: 'reading' };
      docs.unshift(d); added.push(d);
    });
    if (added.length) { draw(); added.forEach(read); }
    const q = (names) => names.map((n) => `“${esc(n)}”`).join(', ');
    refused.innerHTML = bad.length ? `<p><i class="dot" aria-hidden="true"></i><span><b>${q(bad)}</b> ${bad.length > 1 ? 'were' : 'was'} not added. Leon reads PDF, Word, Excel, PowerPoint, text and code files of 10 MB max.</span><button type="button" class="iconbtn" data-dismiss aria-label="Dismiss">${L.icon('x')}</button></p>` : '';
    refused.hidden = !bad.length;
    if (added.length) live.textContent = `${added.map((d) => d.name).join(', ')} added. Leon is reading ${added.length > 1 ? 'them' : 'it'}.`;
    input.value = '';
  };
  addBtn.addEventListener('click', () => input.click());
  input.addEventListener('change', () => add(input.files));
  refused.addEventListener('click', (e) => { if (e.target.closest('[data-dismiss]')) { refused.hidden = true; addBtn.focus(); } });

  const drop = $('#drop');
  const held = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  addEventListener('dragover', (e) => { if (held(e)) { e.preventDefault(); drop.hidden = false; } });
  addEventListener('dragleave', (e) => { if (!e.relatedTarget) drop.hidden = true; });
  addEventListener('drop', (e) => { if (!held(e)) return; e.preventDefault(); drop.hidden = true; add(e.dataTransfer.files); });

  // ---------- One document's panel ----------
  let P = null;
  const mine = (d) => d.addedBy === ME;
  const member = (name) => A.members.find((m) => m.name === name) || {};
  const canDelete = (d) => mine(d) || (A.me.role === 'Admin' && member(d.addedBy).status === 'left');
  const SAY = {
    team: `Everyone in ${esc(A.workspace.name)} can find it in search and in answers.`,
    private: 'Only you can find it. It isn’t shared with the team.',
  };
  const visible = (d) => (mine(d)
    ? `<select class="field" id="doc-vis"><option value="team"${d.visibility === 'team' ? ' selected' : ''}>Team</option><option value="private"${d.visibility === 'private' ? ' selected' : ''}>Only you</option></select><small id="doc-vis-say">${SAY[d.visibility === 'private' ? 'private' : 'team']}</small>`
    : `<b>${scope(d)}</b><small>${SAY[d.visibility === 'private' ? 'private' : 'team']}</small>`);
  const by = (d) => (mine(d) ? `<span class="avs">${L.av(ME, 'av--s')}</span>You`
    : `<span class="avs">${L.av(d.addedBy, 'av--s')}</span>${esc(d.addedBy)}${member(d.addedBy).status === 'left' ? '<small>Former member</small>' : ''}`);
  function open(d) {
    P = d;
    const reading = d.state === 'reading';
    L.panel.open({
      logo: d.type === 'text' ? '' : d.type, title: d.name,
      body: `${reading ? '<div class="statusrow"><span class="pill pill--work is-sweeping"><i class="dot"></i>Reading…</span><span>Searchable once read</span></div>' : ''}
${L.facts([['Added by', by(d)], ['Added', esc(d.date)], ['Size', esc(d.size)], [mine(d) ? '<label for="doc-vis">Visible to</label>' : 'Visible to', visible(d)]])}`,
      foot: canDelete(d)
        ? '<button type="button" class="btn btn--quiet" data-act="ask-delete">Delete</button><button type="button" class="btn btn--line push" data-close data-focus>Done</button>'
        : '',
      act: (name) => { if (name === 'ask-delete') askDelete(d); },
      back: `.tl[data-doc="${CSS.escape(d.name)}"]`,
    });
    if (d.type === 'text') $('.panel__head', L.panel.el).insertAdjacentHTML('afterbegin', plain(44)); // never asks for a logo file that does not exist
  }
  const askDelete = (d) => L.panel.confirm({
    title: `Delete ${d.name}?`,
    text: 'It leaves Leon: search and answers stop using it, for everyone. This can’t be undone.',
    yes: 'Delete', no: 'Keep it',
  }).then((yes) => {
    if (!yes) return;
    const i = docs.indexOf(d);
    docs.splice(i, 1);
    L.panel.close(); draw();
    L.toast(`${d.name} deleted.`);
    setTimeout(() => { const next = grid.querySelectorAll('.tl')[Math.min(i, docs.length - 1)]; (next || addBtn).focus({ preventScroll: true }); }, 200);
  });
  // Who sees it: saved at once, as in the product
  L.panel.el.addEventListener('change', (e) => {
    if (e.target.id !== 'doc-vis' || !P) return;
    P.visibility = e.target.value;
    $('#doc-vis-say').textContent = SAY[P.visibility].replace(/&amp;/g, '&');
    redraw(P);
    L.toast('Sharing saved.');
  });

  document.addEventListener('click', (e) => {
    const t = e.target.closest('.tl[data-doc]');
    if (t && grid.contains(t)) { const d = find(t.dataset.doc); if (d) open(d); }
  });
  L.openHere = (name) => { const d = find(name); if (d) open(d); }; // the command bar, a source "Open in Documents", ?open=<file name>

  if (L.param('state') === 'empty') { docs.length = 0; draw(); } // a new workspace: nothing added yet
})();
