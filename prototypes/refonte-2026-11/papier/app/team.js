/* Team: the people of the workspace as tiles, a search, one person's panel (address, role, manager, Remove) and the
   invitation (a link shown once). Built on the kit: Leon.tile, Leon.panel. The first half also runs in Node.
   Rules from the real product (src/server/auth/members.ts, messages/en.json › settings): an owner or an admin invites,
   sets a manager, changes a role between Member and Admin, removes someone; never an owner, never oneself. An
   invitation link has a name to tell links apart, a department, a role and a seniority; it works once, expires in
   7 days, and Leon does not send it. */
(function () {
  'use strict';
  const L = window.Leon, { A, esc } = L;
  const people = A.members.map((m, i) => Object.assign({ key: m.email, hl: [3, 1, 2, 4][i % 4] }, m)); // the page's own copy; hl: their own tint
  const caption = (m) => (m.you ? 'You' : m.status === 'invited' ? 'Invited' : m.status === 'left' ? 'Former member' : m.title);
  const tile = (m) => L.tile({ av: m.name, name: m.name, sub: caption(m), hl: m.hl, attrs: `data-person="${esc(m.key)}"`,
    li: `data-s="${esc(`${m.name} ${m.title || ''} ${m.email || ''}`.toLowerCase())}"` });
  const tiles = () => people.map(tile).join('\n');

  L.block('people', tiles);
  L.block('people-count', () => people.length);
  // 38 tiles, "You" once, and nothing but a name and one caption: no address, no role, no date
  L.selfCheck = (assert) => {
    const t = tiles(), text = t.replace(/<[^>]*>/g, ' ');
    assert.equal((t.match(/<li/g) || []).length, 38);
    assert.equal((text.match(/\bYou\b/g) || []).length, 1);
    assert.doesNotMatch(text, /@|Admin|Owner|Nov|Oct/);
  };
  if (!L.browser) return;

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const grid = $('#people'), count = $('#people-count'), qIn = $('#people-q'), none = $('#people-none'), live = $('#people-live');
  const byKey = (k) => people.find((m) => m.key === k);
  const byName = (n) => people.find((m) => m.name === n);

  // ---------- The search ----------
  const filter = () => {
    const q = qIn.value.trim().toLowerCase();
    let n = 0;
    $$('li', grid).forEach((li) => { const ok = !q || li.dataset.s.includes(q); li.hidden = !ok; n += ok; });
    grid.hidden = !n; none.hidden = !!n;
    if (!n) $('#people-none-h').textContent = `Nobody matches “${qIn.value.trim()}”`;
    live.textContent = q ? `${n} ${n === 1 ? 'person' : 'people'} shown` : '';
  };
  qIn.addEventListener('input', filter);
  $('#people-clear').addEventListener('click', () => { qIn.value = ''; filter(); qIn.focus(); });
  const draw = () => { grid.innerHTML = tiles(); count.textContent = people.length; L.shell.people(people.length); filter(); }; // the sidebar counts the same people

  // ---------- One person's panel ----------
  let P = null;
  const ROLES = ['Member', 'Admin'];
  const reports = (m) => people.filter((x) => x.manager === m.name && x.status !== 'left');
  const select = (id, values, value, labels) => `<select class="field" id="${id}" aria-describedby="${id}-e">${values.map((v, i) => `<option value="${esc(v)}"${v === value ? ' selected' : ''}>${esc(labels ? labels[i] : v)}</option>`).join('')}</select><p class="field-error" id="${id}-e" role="alert"></p>`;
  const managerField = (m) => {
    const others = people.filter((x) => x !== m && x.status !== 'left' && !x.fresh).map((x) => x.name);
    return select('p-manager', ['', ...others], m.manager, ['Nobody', ...others]);
  };
  function openPerson(m) {
    P = m;
    if (m.fresh) return openFresh(m);
    const left = m.status === 'left', fixedRole = m.role === 'Owner' || m.you || left;
    const rs = reports(m);
    const rows = [['Email', esc(m.email)]];
    if (m.status !== 'active') rows.push(['Status', `<b>${left ? 'Former member' : 'Invited'}</b><small>${esc(m.statusLabel)}</small>`]);
    rows.push([fixedRole ? 'Role' : '<label for="p-role">Role</label>', fixedRole ? `<b>${esc(m.role)}</b>` : select('p-role', ROLES, m.role)]);
    if (!left) rows.push(['<label for="p-manager">Manager</label>', managerField(m)]);
    if (rs.length) rows.push(['Reports', `<span class="avs">${rs.slice(0, 4).map((x) => L.av(x.name, 'av--s')).join('')}</span>${esc(rs.map((x) => x.name.split(' ')[0]).join(', '))}`]);
    const removable = !fixedRole;
    L.panel.open({
      av: m.name, title: m.name, sub: m.title,
      body: L.facts(rows),
      foot: removable ? '<button type="button" class="btn btn--quiet" data-act="ask-remove">Remove from the workspace</button><button type="button" class="btn btn--line push" data-close data-focus>Done</button>' : '',
      act: (name) => { if (name === 'ask-remove') askRemove(m); },
      back: `.tl[data-person="${CSS.escape(m.key)}"]`,
    });
  }
  const askRemove = (m) => L.panel.confirm({
    title: `Remove ${m.name} from the workspace?`,
    text: 'This person loses access right away: search, discussions, tokens and connections. What they already brought into Leon stays.',
    yes: 'Remove', no: 'Cancel',
  }).then((yes) => {
    if (!yes) return;
    const i = people.indexOf(m);
    people.splice(i, 1);
    people.forEach((x) => { if (x.manager === m.name) x.manager = ''; }); // the people under them have nobody above them now
    L.panel.close(); draw();
    L.toast(`${m.name} was removed from the workspace.`);
    setTimeout(() => { const next = $$('.tl', grid)[Math.min(i, people.length - 1)]; (next || $('#invite')).focus({ preventScroll: true }); }, 200);
  });
  // A role or a manager is saved at once, as in the product; a manager that would make a loop is refused
  const above = (name, target) => { for (let x = byName(name), n = 0; x && n < 50; x = byName(x.manager), n++) if (x.name === target) return true; return false; };
  L.panel.el.addEventListener('change', (e) => {
    const f = e.target, m = P;
    if (!m || !/^p-(role|manager)$/.test(f.id)) return;
    if (f.id === 'p-role') { m.role = f.value; L.fieldError(f, ''); L.toast('Role saved.'); return; }
    const why = m.role === 'Owner' ? 'Only an owner can change who is above an owner.'
      : f.value && above(f.value, m.name) ? 'Not possible: this person is already above the chosen manager.' : '';
    L.fieldError(f, why);
    if (why) { f.value = m.manager; return; }
    m.manager = f.value;
    L.toast('Manager saved.');
  });

  // ---------- Invite: the link, shown once ----------
  // Departments, roles and seniority: the real product's lists (messages/en.json › onboarding)
  const DEPTS = {
    Engineering: ['Backend engineer', 'Frontend engineer', 'Full-stack engineer', 'Mobile engineer', 'DevOps / SRE', 'QA engineer', 'Engineering manager', 'CTO'],
    Product: ['Product manager', 'Product owner', 'Head of Product', 'CPO'],
    Design: ['Product designer', 'UX researcher', 'Art director'],
    Data: ['Data analyst', 'Data engineer', 'Data scientist'],
    Sales: ['SDR / BDR', 'Account executive', 'Account manager', 'Sales ops', 'VP Sales'],
    Marketing: ['Growth marketer', 'Content marketer', 'Product marketing manager', 'Communications', 'CMO'],
    'Support & Customer Success': ['Support agent', 'Customer success manager', 'Onboarding / Implementation', 'Head of Support'],
    'Operations & Finance': ['Office manager', 'Accountant', 'Financial controller', 'CFO', 'COO'],
    People: ['Recruiter', 'HR generalist', 'Head of People'],
    Legal: ['Legal counsel', 'General counsel'],
    Leadership: ['CEO / Founder', 'Managing director', 'Partner'],
  };
  const SENIORITY = ['Intern', 'Apprentice', 'Junior', 'Mid-level', 'Senior', 'Lead', 'Head of / Director', 'C-level / Founder'];
  const choose = (id, label, list) => `<div><label class="label" for="${id}">${label}</label>${select(id, ['', ...list], '', ['Choose…', ...list])}</div>`;
  let fresh = 0;
  const openInvite = () => {
    P = null;
    L.panel.open({
      title: `Invite to ${A.workspace.name}`,
      body: `<form class="form" id="panel-form" novalidate>
  <div><label class="label" for="inv-name">Name</label><input class="field" id="inv-name" type="text" placeholder="e.g. Inès" autocomplete="off" spellcheck="false" aria-describedby="inv-name-h inv-name-e"><p class="hint" id="inv-name-h">To tell links apart.</p><p class="field-error" id="inv-name-e" role="alert"></p></div>
  ${choose('inv-dept', 'Department', Object.keys(DEPTS))}
  ${choose('inv-job', 'Role', [])}
  ${choose('inv-sen', 'Seniority', SENIORITY)}
</form>`,
      foot: '<button type="submit" form="panel-form" class="btn">Create the link</button><button type="button" class="btn btn--quiet" data-close>Cancel</button>',
      submit: create,
      back: '#invite',
    });
  };
  // The roles follow the department
  L.panel.el.addEventListener('change', (e) => {
    if (e.target.id !== 'inv-dept') return;
    const job = $('#inv-job');
    job.innerHTML = ['<option value="">Choose…</option>', ...(DEPTS[e.target.value] || []).map((j) => `<option>${esc(j)}</option>`)].join('');
    L.fieldError(e.target, '');
  });
  function create(form) {
    const name = $('#inv-name', form), dept = $('#inv-dept', form), job = $('#inv-job', form), sen = $('#inv-sen', form);
    const why = [[name, name.value.trim().length > 100 ? 'Use 100 characters or fewer.' : ''], [dept, dept.value ? '' : 'Choose a department.'],
      [job, job.value ? '' : 'Choose a role.'], [sen, sen.value ? '' : 'Choose a seniority level.']];
    why.forEach(([f, msg]) => L.fieldError(f, msg));
    const bad = why.find(([, msg]) => msg);
    if (bad) { bad[0].focus(); return; }
    const m = { key: `new-${++fresh}`, fresh: true, name: name.value.trim() || job.value /* no name given: the link is told apart by its role */, title: job.value, dept: dept.value, seniority: sen.value, role: 'Member', manager: '', status: 'invited', hl: 4 };
    L.panel.busy('Creating…').then((still) => {
      m.link = A.inviteLink.replace(/[^/]+$/, Math.random().toString(16).slice(2, 8));
      people.unshift(m); draw();
      live.textContent = 'Invitation link created.';
      if (still) linkShown(m);
    });
  }
  // The link, shown this once
  const linkShown = (m) => L.panel.open({
    title: `Invite to ${A.workspace.name}`,
    body: `<div class="done"><h3><span class="mark is-on">Invitation link created</span></h3></div>
<div><label class="label" for="inv-link">Link for ${esc(m.name)}</label><input class="field" id="inv-link" type="text" readonly value="${esc(m.link)}"><p class="hint">Copy it now; it won’t be shown again.</p></div>
${L.facts([['Works', 'Once, to create one account'], ['Expires', 'In 7 days'], ['Sending', 'Send it yourself. Leon doesn’t send emails.']])}`,
    foot: '<button type="button" class="btn" data-copy="#inv-link" data-focus>Copy link</button><button type="button" class="btn btn--line push" data-close>Done</button>',
    back: `.tl[data-person="${m.key}"]`,
  });
  // Someone invited from this page: what the link carries
  function openFresh(m) {
    L.panel.open({
      av: m.name, title: m.name, sub: m.title,
      body: L.facts([['Status', '<b>Invited</b><small>Today. The link works once and expires in 7 days.</small>'], ['Department', esc(m.dept)], ['Seniority', esc(m.seniority)]]),
      back: `.tl[data-person="${m.key}"]`,
    });
  }

  $('#invite').addEventListener('click', openInvite);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('.tl[data-person]');
    if (t && grid.contains(t)) { const m = byKey(t.dataset.person); if (m) openPerson(m); }
  });
  L.openHere = (email) => { const m = byKey(email); if (m) openPerson(m); }; // the command bar, ?open=<email>
})();
