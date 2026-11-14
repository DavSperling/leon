/* Leon « Papier » v2 : Team. The filter over the members table, and the invitation by link.
   The page is whole without this script: the filter field is not drawn, and the form shows its result at #invited. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const table = $('[data-members]');
  const form = $('[data-invite]');
  const tpl = $('#member-row');
  if (!table || !form || !tpl) return;
  const none = $('[data-none]', table);
  const people = () => [...table.tBodies[0].rows].filter((r) => r !== none);
  const said = (r) => [...r.cells].slice(0, 4).map((c) => c.textContent).join(' ').toLowerCase(); // not the action cell

  /* Filter: name, email, role, manager or status */
  const filter = $('#people-filter');
  const apply = () => {
    const q = filter.value.trim().toLowerCase();
    const shown = people().filter((r) => !(r.hidden = !said(r).includes(q))).length;
    none.hidden = shown > 0;
    $('[data-term]', none).textContent = `“${filter.value.trim()}”`;
    $('[data-shown]').textContent = shown;
  };
  filter.addEventListener('input', apply);
  $('[data-clear]', none).addEventListener('click', () => { filter.value = ''; apply(); filter.focus(); });

  /* Invite by link: a work email in, a one-time link out, and the person listed as invited */
  const email = $('#invite-email');
  const err = $('#invite-err');
  const out = $('#invited');
  const fail = (msg) => {
    err.textContent = msg;
    err.hidden = !msg;
    email.setAttribute('aria-invalid', String(!!msg));
    if (msg) email.focus();
  };
  form.noValidate = true; // the messages below replace the browser's
  email.addEventListener('input', () => { if (!err.hidden) fail(''); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = email.value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return fail('Enter a work email, like name@kestrel.example.');
    if (people().some((r) => said(r).includes(v))) return fail(`${v} is already in the list below.`);
    fail('');
    const row = tpl.content.firstElementChild.cloneNode(true);
    $('[data-name]', row).textContent = v;
    none.before(row);
    $('[data-invited]', out).textContent = `Link created for ${v}.`;
    const link = $('#invite-link');
    link.textContent = link.textContent.replace(/[^/]+$/, Math.random().toString(16).slice(2, 8)); // a new link each time
    out.classList.add('is-on');
    form.reset();
    filter.value = '';
    apply();
    $('[data-copy]', out).focus();
  });
})();
