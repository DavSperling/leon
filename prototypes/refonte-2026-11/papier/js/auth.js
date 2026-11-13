/* Leon « Papier » v2 : sign-in and create-a-workspace. Both pages work without this file (the browser's own checks,
   then the form's action). It adds the designed states: an error under each field, the busy pill, Show / Hide on the
   password, focus on the view that opens, and ?state=error | loading to look at those two states directly.
   Nothing is sent anywhere: the fields have no name, and a valid form only moves on to its action. */
(function () {
  'use strict';
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const state = new URLSearchParams(location.search).get('state');

  // One field: empty, not an email, or too short. The words come from the field (data-empty, data-invalid).
  const check = (f) => {
    const value = f.value.trim();
    const wrong = (f.type === 'email' && !/^\S+@\S+\.\S+$/.test(value)) || (f.minLength > 0 && f.value.length < f.minLength);
    const msg = !value ? f.dataset.empty : wrong ? f.dataset.invalid : '';
    const err = document.getElementById(`${f.id}-err`);
    f.setAttribute('aria-invalid', String(!!msg));
    err.textContent = msg;
    err.hidden = !msg;
    return !msg;
  };

  const busy = (btn, on) => {
    if (on) { btn.dataset.html = btn.innerHTML; btn.textContent = btn.dataset.busy; } else if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
    btn.classList.toggle('is-busy', on);
    btn.disabled = on;
  };

  $$('form[data-auth]').forEach((form, i) => {
    const btn = form.querySelector('[type="submit"]');
    const fields = $$('.field', form);
    form.noValidate = true; // the designed errors replace the browser's bubbles
    fields.forEach((f) => f.addEventListener('input', () => { if (f.getAttribute('aria-invalid') === 'true') check(f); }));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const bad = fields.filter((f) => !check(f));
      if (bad.length) { bad[0].focus(); return; }
      $$('[data-state]', form).forEach((el) => { el.hidden = true; });
      busy(btn, true);
      setTimeout(() => { location.href = form.getAttribute('action'); busy(btn, false); }, 700);
    });
    if (state === 'loading' && i === 0) busy(btn, true);
  });

  // ?state=error shows the page's error (wrong password, address already used)
  $$('[data-state]').forEach((el) => { el.hidden = el.dataset.state !== state; });

  $$('[data-show]').forEach((b) => b.addEventListener('click', () => {
    const f = document.getElementById(b.dataset.show);
    const show = f.type === 'password';
    f.type = show ? 'text' : 'password';
    b.textContent = show ? 'Hide' : 'Show';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));

  // A view opens (#forgot, #sent, or back to the form): focus goes to its first control
  addEventListener('hashchange', () => {
    const first = (document.querySelector('.auth__view:target') || document).querySelector('.field, .btn');
    if (first) first.focus();
  });
})();
