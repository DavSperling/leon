/* The kit page: every piece once, in its states. The first half also runs in Node (build.mjs writes its blocks). */
(function () {
  'use strict';
  const L = window.Leon, { A, esc } = L;
  const answer = L.answer('commitment'), unknown = L.answer('unknown');

  L.block('kit-cards', () => [
    L.card({ logo: 'gmail', name: 'Gmail', sub: 'Only you', hl: 1, label: 'Manage Gmail', attrs: 'data-demo="facts"' }),
    L.card({ logo: 'intercom', name: 'Intercom', sub: 'Disconnected', err: true, pill: 'Reconnect', ink: true, hl: 2, label: 'Reconnect Intercom', attrs: 'data-demo="form"' }),
    L.card({ av: 'Julie Martin', name: 'Julie Martin', sub: 'Account lead', hl: 1, attrs: 'data-demo="person"' }),
    L.card({ logo: 'pdf', name: 'Support handbook.pdf', sub: 'Team', hl: 3, attrs: 'data-demo="confirm"' }),
  ].join('\n'));
  L.block('kit-tiles', () => [
    L.tile({ logo: 'outlook', name: 'Outlook', pill: 'Connect', hl: 1, label: 'Connect Outlook', attrs: 'data-demo="work"' }),
    L.tile({ logo: 'excel', name: 'Q1 2027 pricing grid.xlsx', sub: 'Team', hl: 2, attrs: 'data-demo="confirm"' }),
    L.tile({ av: 'Karim Benali', name: 'Karim Benali', sub: 'Sales', hl: 3, attrs: 'data-demo="person"' }),
    L.tile({ name: L.suggestions[0].label, href: L.suggestions[0].href, hl: 4 }),
  ].join('\n'));
  L.block('kit-answer', () => L.answerHTML(answer));
  L.block('kit-sources', () => L.sourcesHTML(answer.sources));
  L.block('kit-unknown', () => L.answerHTML(unknown));
  L.block('kit-fields', () => L.field({ id: 'kit-name', label: 'Name' }) + L.field({ id: 'kit-mail', label: 'Work email', kind: 'email', placeholder: 'name@company.com' }) + L.field({ id: 'kit-role', label: 'Role', kind: 'select', options: ['Member', 'Admin'] }));
  L.block('kit-avs', () => A.members.slice(0, 4).map((m) => L.av(m.name)).join('') + A.members.slice(0, 4).map((m) => L.av(m.name, 'av--s')).join(''));
  if (!L.browser) return;

  const $ = (s) => document.querySelector(s);
  const doc = A.documents[6]; // Support handbook.pdf
  const demos = {
    // Rows of facts, a status row with its own small action
    facts: () => L.panel.open({
      logo: 'gmail', title: 'Gmail',
      body: `<div class="statusrow">${L.pill('Synced 4 min ago')}<button type="button" class="btn btn--xs btn--line" data-act="sync" data-focus>Sync now</button></div>${L.facts([['Account', esc(A.me.email)], ['Visible to', L.who('private')], ['Leon reads', esc(A.reads.gmail)]])}`,
      act: (name, el) => { if (name === 'sync') L.busy(el, 'Syncing…').then(() => L.done(el, 'Synced')); },
    }),
    person: () => L.panel.open({ av: 'Karim Benali', title: 'Karim Benali', sub: 'Sales', body: L.facts([['Email', 'karim@kestrel.example'], ['Role', 'Member'], ['Manager', 'Julie Martin']]) }),
    // A form: refused under the field when empty, then working, then done
    form: () => L.panel.open({
      title: 'Create a token',
      body: `<form class="form" id="panel-form" novalidate>${L.field({ id: 'tk-name', label: 'Name', placeholder: 'Assistant on my laptop' })}<p class="hint">${esc(A.tokenNote)}</p></form>`,
      foot: '<button type="submit" form="panel-form" class="btn">Create the token</button><button type="button" class="btn btn--quiet" data-close>Cancel</button>',
      submit: () => L.panel.busy('Creating…').then((still) => { if (still) demos.done('Token created', 'Copy it now; it won’t be shown again.'); }),
    }),
    done: (title, text) => L.panel.open({ title, body: `<div class="done"><h3><span class="mark is-on">${esc(title)}</span></h3><p>${esc(text)}</p></div>` }),
    // A removal is asked in place, in the foot
    confirm: () => L.panel.open({
      logo: doc.type, title: doc.name,
      body: L.facts([['Added by', esc(doc.addedBy)], ['Date', esc(doc.date)], ['Size', esc(doc.size)], ['Visible to', L.who(doc.visibility)]]),
      foot: '<button type="button" class="btn btn--quiet" data-act="ask-delete">Delete</button><button type="button" class="btn btn--line push" data-close data-focus>Done</button>',
      act: (name) => {
        if (name === 'ask-delete') L.panel.confirm({ title: 'Delete this document?', text: 'Leon forgets it for everyone. This cannot be undone.', yes: 'Delete', no: 'Keep it' }).then((yes) => { if (yes) { L.panel.close(); L.toast(`${doc.name} deleted.`); } });
      },
    }),
    // Working, then done: the main button says it, the highlighter runs along the foot
    work: () => L.panel.open({
      logo: 'outlook', title: 'Outlook',
      body: L.facts([['Leon will read', esc(A.reads.outlook)], ['Who will see it', '<b>Only you</b>, by default.']]),
      foot: `<button type="button" class="btn" data-act="go" data-focus>Continue to Outlook${L.icon('out')}</button><p class="panel__note">Outlook’s own sign-in page opens. Leon never sees your password.</p>`,
      act: () => L.panel.busy('Opening Outlook…').then((still) => { if (still) demos.done('Outlook is connected', 'Leon is reading Outlook for the first time.'); }),
    }),
    source: () => L.panel.source(answer.sources[0]),
  };

  document.addEventListener('click', (e) => {
    const d = e.target.closest('[data-demo]'), say = e.target.closest('[data-say]');
    if (d && !L.panel.el.contains(d)) demos[d.dataset.demo]();
    if (say) L.toast(say.dataset.say);
  });
  // What Leon writes: a sentence, a number or a source opens the original; the answer arrives once
  L.wire($('#kit-answer'), answer);
  L.wire($('[data-sources]'), answer);
  L.wire($('#kit-unknown'), unknown);
  $('#kit-arrive').addEventListener('click', () => L.arrive($('#kit-answer [data-answer]')));
  // Fields: refused under the field, then "Saving…", then "Saved"
  $('#kit-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('.btn');
    if (L.validate(e.target)) L.busy(btn, 'Saving…').then(() => L.done(btn, 'Saved'));
  });
  $('#kit-save').addEventListener('click', (e) => { const btn = e.currentTarget; L.busy(btn, 'Saving…').then(() => L.done(btn, 'Saved')); });
  $('#kit-chips').addEventListener('leon:chip', (e) => L.toast(`${e.detail} chosen.`));
})();
