/* Sign in, create a workspace, join by invitation, reset a password. The pages are whole without this file (each form
   then goes to its action, #sso and #sent open by :target). It adds what the real product does: the refusals under
   the fields (its own words, messages/en.json › auth), "Signing in…" then the app, Show / Hide on a password, the two
   marks of a new password, Company SSO, ?state=error and ?invite=1. Nothing is sent anywhere: the fields have no name.
   Uses the kit's helpers (Leon.validate, Leon.fieldError, Leon.busy): app.js runs before it. */
(function () {
  'use strict';
  const L = window.Leon;
  if (!L || !L.browser) return;
  const $ = (s, el) => (el || document).querySelector(s);
  const go = (btn, label, href) => L.busy(btn, label).then(() => { location.href = href; });
  const invite = L.param('invite') === '1' && !!$('#signup');

  // signup.html?invite=1: Priya opens the link she was sent. She joins Kestrel Studio: no workspace to name.
  if (invite) {
    document.body.classList.add('is-invite');
    document.title = `Join ${L.A.workspace.name} · Leon`;
    $('#company').removeAttribute('data-req');
    const p = L.A.members.find((m) => m.status === 'invited');
    $('#name').value = p.name; $('#email').value = p.email;
    document.querySelectorAll('[data-provider]').forEach((a) => { a.href = 'index.html'; });
  }

  // Google and Microsoft: their own page opens, then comes back signed in (simulated)
  document.querySelectorAll('[data-provider]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    if (!a.disabled) go(a, `Opening ${a.dataset.provider}…`, a.getAttribute('href'));
  }));

  // Show / Hide on a password
  document.querySelectorAll('[data-show]').forEach((b) => {
    const f = $(`#${b.dataset.show}`);
    b.hidden = false;
    b.addEventListener('click', () => {
      const show = f.type === 'password';
      f.type = show ? 'text' : 'password';
      b.textContent = show ? 'Hide' : 'Show';
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  // A field that was refused is checked again as it is typed, so the refusal leaves as soon as it is wrong no more
  document.addEventListener('input', (e) => {
    const f = e.target;
    if (f.getAttribute('aria-invalid') === 'true' && f.value.trim()) L.fieldError(f, '');
  });

  // ---------- Sign in ----------
  const signin = $('#signin');
  if (signin) {
    const pw = $('#password');
    const refuse = () => { pw.value = ''; L.fieldError(pw, 'Incorrect email or password.'); pw.focus(); };
    if (L.param('state') === 'error') { pw.value = ''; L.fieldError(pw, 'Incorrect email or password.'); }
    signin.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!L.validate(signin)) return;
      const btn = $('[type="submit"]', signin);
      if (btn.disabled) return;
      // shortcut: any address signs in; a password containing "wrong" is the refused one
      if (/wrong/i.test(pw.value)) L.busy(btn, 'Signing in…').then(refuse);
      else go(btn, 'Signing in…', 'index.html');
    });

    // Company SSO, as the product does it: a work address, then the company's own sign-in
    const sso = $('#sso'), ssoIn = $('#sso-email'), opener = $('#sso-open');
    const ssoOpen = () => location.hash === '#sso';
    const sync = () => { if (ssoOpen()) ssoIn.focus(); };
    addEventListener('hashchange', sync);
    sync();
    sso.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      L.fieldError(ssoIn, '');
      location.hash = '';
      opener.focus();
    });
    sso.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!L.validate(sso)) return;
      const btn = $('[type="submit"]', sso);
      if (btn.disabled) return;
      // shortcut: Kestrel Studio's domain has SSO set up; every other address is refused as the product refuses it
      if (ssoIn.value.trim().toLowerCase().endsWith(`@${L.A.workspace.domain}`)) go(btn, 'Opening your sign-in…', 'index.html');
      else L.busy(btn, 'Checking…', 600).then(() => { L.fieldError(ssoIn, 'No company SSO is set up for this address. Sign in another way, or ask your workspace admin.'); ssoIn.focus(); });
    });
  }

  // ---------- Create a workspace, or join one ----------
  const signup = $('#signup');
  if (signup) {
    const pw = $('#password'), confirm = $('#confirm');
    const marks = () => {
      $('[data-rule="length"]').classList.toggle('is-ok', pw.value.length >= 8);
      $('[data-rule="match"]').classList.toggle('is-ok', !!pw.value && confirm.value === pw.value);
    };
    pw.addEventListener('input', marks); confirm.addEventListener('input', marks);
    signup.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!L.validate(signup)) return;
      const company = $('#company'), email = $('#email');
      const taken = invite && L.A.members.some((m) => m.status === 'active' && m.email === email.value.trim().toLowerCase());
      const wrong = [
        [!invite && (company.value.trim().length < 2 || company.value.trim().length > 100), company, 'Enter your company name (2 to 100 characters).'],
        [taken, email, 'This email address is already in use.'],
        [pw.value.length < 8 || pw.value.length > 128, pw, 'Your password must be 8 to 128 characters long.'],
        [confirm.value !== pw.value, confirm, 'Passwords don’t match.'],
      ].filter(([bad, f, msg]) => { L.fieldError(f, bad ? msg : ''); return bad; });
      if (wrong.length) return wrong[0][1].focus();
      const btn = $('#signup-go');
      if (!btn.disabled) go(btn, invite ? 'Joining…' : 'Creating…', invite ? 'index.html' : 'connections.html?state=empty');
    });
  }

  // ---------- Forgot your password? ----------
  const forgot = $('#forgot');
  if (forgot) {
    forgot.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!L.validate(forgot)) return;
      const btn = $('[type="submit"]', forgot);
      if (!btn.disabled) L.busy(btn, 'Sending…').then(() => { location.hash = 'sent'; $('#sent-h').focus(); });
    });
    if (location.hash === '#sent') $('#sent-h').focus();
  }
})();
