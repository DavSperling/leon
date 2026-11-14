/* Settings: four groups (Profile, Security, Assistants, Workspace), one shown at a time (#security, #assistants,
   #workspace). A group is a sheet of rows; what takes steps opens the side panel (Leon.panel). Computers and tokens
   are cards, what can be added is a tile. Everything is checked against the real app (messages/en.json, the
   « reglages » components). The first half also runs in Node: build.mjs writes its blocks into settings.html. */
(function () {
  'use strict';
  const L = window.Leon, { A, esc, icon } = L;
  const me = A.me, ws = A.workspace, owner = A.members.find((m) => m.role === 'Owner');
  // The page's own state: a reload starts again from the data
  const computers = A.computers.map((c, i) => Object.assign({ id: `pc${i + 1}` }, c));
  const tokens = A.tokens.map((t, i) => Object.assign({ id: `tk${i + 1}` }, t));

  // A computer or a token has no logo: its picture is the kit's icon, drawn on a blank square of the logos' size.
  // shortcut: Leon.card/tile take a logo or initials only; move `glyph` into the kit if another screen needs it.
  const glyph = (id) => `<span class="glyph" aria-hidden="true">${icon(id)}</span>`;
  const withGlyph = (html, id) => html.replace('<span class="tl__id">', `${glyph(id)}<span class="tl__id">`);
  const cards = () => [
    ...computers.map((c, i) => withGlyph(L.card({ name: c.name, sub: c.tools.join(', '), hl: i + 1, label: `Manage ${c.name}`, attrs: `data-pc="${c.id}"` }), 'laptop')),
    ...tokens.map((t, i) => withGlyph(L.card({ name: t.name, sub: t.shown, hl: ((computers.length + i) % 4) + 1, label: `Manage the token ${t.name}`, attrs: `data-tk="${t.id}"` }), 'key')),
  ].join('\n');
  const ADD = [['computer', 'Computer', 'laptop', 'Connect', 'Connect a computer'], ['assistant', 'Assistant', 'chat', 'Connect', 'Connect an assistant'], ['token', 'Token', 'key', 'Create', 'Create a token']];
  const tiles = () => ADD.map(([id, name, ic, verb, label], i) => withGlyph(L.tile({ name, pill: verb, hl: i + 1, label, attrs: `data-add="${id}"` }), ic)).join('\n');

  L.block('set-cards', cards);
  L.block('set-tiles', tiles);
  L.block('set-count', () => computers.length + tokens.length);
  L.block('set-me', () => `${L.av(me.name)}<span><b><span class="mark" id="me-name">${esc(me.name)}</span></b><span>${esc(me.role)} · ${esc(ws.name)}</span></span>`);
  L.block('set-ws', () => `<span class="ws__tile" aria-hidden="true">${esc(ws.name[0])}</span><span><b>${esc(ws.name)}</b><span>Open beta · no billing yet</span></span>`);
  L.block('set-owner', () => `${L.av(owner.name, 'av--s')}${esc(owner.name)}`);
  // 3 cards and 3 tiles, and nothing on a rectangle but a name and one caption: no count, no date
  L.selfCheck = (assert) => {
    const c = cards(), t = tiles(), n = (s) => (s.match(/<li/g) || []).length;
    assert.equal(n(c), 3);
    assert.equal(n(t), 3);
    for (const w of [/sessions?\b/i, /Oct|Nov|Yesterday|Today/, /created|last/i]) assert.doesNotMatch((c + t).replace(/<[^>]*>/g, ''), w);
  };
  if (!L.browser) return;

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const P = L.panel;
  const CANCEL = '<button type="button" class="btn btn--quiet" data-close>Cancel</button>';
  const doneHTML = (title, text) => `<div class="done"><h3><span class="mark is-on">${esc(title)}</span></h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
  const hinted = (field, hint) => field.replace(/<\/div>$/, `<p class="hint">${hint}</p></div>`);
  const secret = (id, label) => L.field({ id, label, kind: 'secret' });
  // A value to copy: a read-only field in the type of code, and its button
  const copyLine = (id, label, value) => `<div><label class="label" for="${id}">${esc(label)}</label><div class="copyline"><input class="field code" id="${id}" type="text" value="${esc(value)}" readonly spellcheck="false"><button type="button" class="btn btn--line" data-copy="#${id}">Copy</button></div></div>`;
  // After a refusal that the "server" gives (a wrong password), the frozen panel comes back to life
  const thaw = (label) => {
    const foot = $('.panel__foot', P.el), btn = $('.btn:not(.btn--quiet)', foot);
    $$('.field', P.el).forEach((f) => { if (!f.hasAttribute('data-ro')) f.readOnly = false; });
    $$('.btn--quiet', foot).forEach((b) => { b.hidden = false; });
    if (btn) { btn.disabled = false; btn.textContent = label; }
  };
  const refuse = (id, msg) => { const f = $(`#${id}`); L.fieldError(f, msg); f.focus(); };
  const wrong = (v) => v.trim().toLowerCase() === 'wrong'; // the demo's wrong password: type "wrong"

  // ---------- The four groups ----------
  const GROUPS = ['profile', 'security', 'assistants', 'workspace'];
  const set = $('.set'), chips = $('#set-chips');
  let current = 'profile';
  const show = (g) => {
    current = GROUPS.includes(g) ? g : 'profile';
    GROUPS.forEach((x) => $(`#${x}`).classList.toggle('is-on', x === current));
    $$('.chip', chips).forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.v === current)));
    const url = current === 'profile' ? location.pathname + location.search : `#${current}`;
    if (location.hash.slice(1) !== (current === 'profile' ? '' : current)) history.replaceState(null, '', url);
    saveShown();
  };
  set.classList.add('is-js');
  chips.addEventListener('leon:chip', (e) => show(e.detail));
  addEventListener('hashchange', () => { const h = location.hash.slice(1); if (GROUPS.includes(h)) show(h); }); // #main (the skip link) is not a group

  // ---------- Profile: the ink pill "Save" appears when something changed ----------
  const form = $('#profile-form'), save = $('#save'), nameIn = $('#p-name'), aboutIn = $('#p-about');
  let saved = { name: nameIn.value, about: aboutIn.value };
  const dirty = () => nameIn.value !== saved.name || aboutIn.value !== saved.about;
  function saveShown() { save.hidden = !(save.dataset.was || save.disabled || (current === 'profile' && dirty())); }
  form.addEventListener('input', saveShown);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!dirty() || save.disabled) return;
    if (!L.validate(form)) return;
    if (aboutIn.value.length > 500) return refuse('p-about', '500 characters at most.');
    L.busy(save, 'Saving…').then(() => {
      const name = nameIn.value.trim();
      saved = { name, about: aboutIn.value };
      nameIn.value = name;
      // her name, everywhere it is written on this page
      $$('.me__text b, #me-name').forEach((b) => { b.textContent = name; });
      $$('.me .av, .menu__who .av, .rows__head .av').forEach((a) => { a.textContent = L.initials(name); });
      $('.me').dataset.tip = name;
      const m = $('#me-name'); m.classList.remove('is-on'); void m.offsetWidth; m.classList.add('is-on');
      L.done(save, 'Saved');
      nameIn.focus({ preventScroll: true }); // the pill that had focus is about to leave
      setTimeout(saveShown, 1700);
    });
  });

  // ---------- Security: the password ----------
  const password = () => P.open({
    title: 'Change password',
    body: `<form class="form" id="panel-form" novalidate>${secret('pw-cur', 'Current password')}${hinted(secret('pw-new', 'New password'), 'At least 8 characters.')}${secret('pw-again', 'Confirm new password')}</form>`,
    foot: `<button type="submit" form="panel-form" class="btn">Change password</button>${CANCEL}<p class="panel__note">Your other sessions will be signed out.</p>`,
    back: '[data-step="password"]',
    submit: () => {
      const nw = $('#pw-new').value, again = $('#pw-again').value;
      if (nw.length < 8 || nw.length > 128) return refuse('pw-new', 'Your password must be 8 to 128 characters long.');
      if (again !== nw) return refuse('pw-again', 'Passwords don’t match.');
      P.busy('Changing…').then((still) => {
        if (!still) return;
        if (wrong($('#pw-cur').value)) { thaw('Change password'); return refuse('pw-cur', 'Incorrect password.'); }
        P.open({ title: 'Change password', body: doneHTML('Password changed', 'Your other sessions have been signed out.'), back: '[data-step="password"]' });
      });
    },
  });

  // ---------- Security: two-step sign-in, as the product does it ----------
  let tfa = false;
  const CODES = ['7k2m9-xq4tr', 'b8w3n-p6ved', 'r4t7c-m2kzq', 'h9d6s-w3nfa', 'x2p8l-q7mvc', 'n5g4k-t9wbe', 'c3v7r-z8hdm', 'e6q2j-k4spy', 'u8m5t-b3rlx', 'f7a9w-d2ncq'];
  const NEW_CODES = ['q3n8v-h7tkw', 'z6c2m-r9pfd', 'k4w7s-e2bxn', 'p9t3f-m6lqa', 'g2r8d-v5zcj', 'w7k4b-n3qhe', 's5x9p-c2mtv', 'j8e3q-y6wkr', 'a4h7n-t9dfz', 'm2v6c-k8psb'];
  // A QR code drawn from a fixed seed: the three corner squares and a field of modules (it does not scan)
  const qr = () => {
    let s = 7, r = '';
    const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const finder = (x, y) => (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
    for (let y = 0; y < 25; y++) for (let x = 0; x < 25; x++) {
      if (finder(x, y)) continue;
      if (rnd() > 0.52) r += `M${x} ${y}h1v1h-1z`;
    }
    const sq = (x, y) => `M${x} ${y}h7v7h-7zM${x + 1} ${y + 1}v5h5v-5zM${x + 2} ${y + 2}h3v3h-3z`;
    return `<svg class="qr" viewBox="-2 -2 29 29" role="img" aria-label="QR code to scan with an authenticator app"><path fill-rule="evenodd" d="${sq(0, 0)}${sq(18, 0)}${sq(0, 18)}${r}"/></svg>`;
  };
  const codesHTML = (codes) => `<div class="codes"><div class="codes__head"><h3>Backup codes</h3><button type="button" class="btn btn--line btn--xs" data-act="copy-codes">Copy codes</button></div><p class="hint">Save them now, outside Leon: they replace the app if you lose your phone. Each code works only once.</p><ul>${codes.map((c) => `<li>${c}</li>`).join('')}</ul></div>`;
  const tfaRow = () => {
    $('#tfa-state').textContent = tfa ? 'On' : 'Off';
    const b = $('[data-step="tfa"]');
    b.textContent = tfa ? 'Manage' : 'Set up';
    b.setAttribute('aria-label', `${tfa ? 'Manage' : 'Set up'} two-step sign-in`);
  };
  let shownCodes = CODES;
  const tfaAct = (name, el) => {
    if (name === 'copy-codes') L.copy(shownCodes.join('\n'), el);
    if (name === 'saved-codes') P.close();
    if (name === 'new-codes' || name === 'off') {
      const pw = $('#tfa-pw');
      if (!pw.value.trim()) return refuse('tfa-pw', 'Your Leon password is missing.');
      L.fieldError(pw, '');
      pw.readOnly = true;
      L.busy(el, name === 'off' ? 'Turning off…' : 'Creating…').then(() => {
        if (!P.el.open) return;
        pw.readOnly = false;
        if (wrong(pw.value)) return refuse('tfa-pw', 'Incorrect password.');
        if (name === 'off') { tfa = false; tfaRow(); return P.open({ title: 'Two-step sign-in', body: doneHTML('Two-step sign-in is off'), back: '[data-step="tfa"]', act: tfaAct }); }
        shownCodes = NEW_CODES;
        P.open({ title: 'Two-step sign-in', body: codesHTML(NEW_CODES), foot: '<button type="button" class="btn" data-act="saved-codes" data-focus>I’ve saved my codes</button>', back: '[data-step="tfa"]', act: tfaAct });
      });
    }
  };
  const tfaOpen = () => {
    if (tfa) return P.open({
      title: 'Two-step sign-in',
      body: `<div class="statusrow">${L.pill('On')}<span>Authenticator app</span></div><p class="panel__what">To get new backup codes or turn it off, confirm with the password you use to sign in to Leon.</p><form class="form" id="panel-form" novalidate>${hinted(secret('tfa-pw', 'Your Leon password'), 'New backup codes replace the old ones: those stop working.')}</form>`,
      foot: '<button type="button" class="btn btn--quiet" data-act="off">Turn off</button><button type="button" class="btn btn--line push" data-act="new-codes">New backup codes</button><button type="button" class="btn btn--line" data-close>Done</button>',
      back: '[data-step="tfa"]', act: tfaAct, submit: () => {},
    });
    shownCodes = CODES;
    P.open({
      title: 'Two-step sign-in',
      body: `<p class="panel__what">After your password, Leon asks for a 6-digit code from an authenticator app on your phone. To start, confirm it’s you.</p><form class="form" id="panel-form" novalidate>${secret('tfa-pw', 'Your Leon password')}</form>`,
      foot: `<button type="submit" form="panel-form" class="btn">Continue</button>${CANCEL}`,
      back: '[data-step="tfa"]',
      submit: () => P.busy('Checking…').then((still) => {
        if (!still) return;
        if (wrong($('#tfa-pw').value)) { thaw('Continue'); return refuse('tfa-pw', 'Incorrect password.'); }
        P.open({
          title: 'Two-step sign-in',
          body: `<p class="panel__what">Scan this QR code with an authenticator app, then confirm with the code it shows.</p><div class="scan">${qr()}<details><summary>Show setup key</summary><p class="code">KVKF U3SH JBXW 4ZLP 7Q2M</p></details></div>${codesHTML(CODES)}<form class="form" id="panel-form" novalidate>${L.field({ id: 'tfa-code', label: '6-digit code', placeholder: '123456' })}</form>`,
          foot: `<button type="submit" form="panel-form" class="btn">Turn on</button>${CANCEL}`,
          back: '[data-step="tfa"]', act: tfaAct,
          submit: () => {
            const code = $('#tfa-code').value.replace(/\s/g, '');
            if (!/^\d{6}$/.test(code)) return refuse('tfa-code', 'Enter the 6-digit code.');
            P.busy('Turning on…').then((ok) => {
              if (!ok) return;
              if (code === '000000') { thaw('Turn on'); return refuse('tfa-code', 'Incorrect code. Check the app and try again.'); }
              tfa = true; tfaRow();
              P.open({ title: 'Two-step sign-in', body: doneHTML('Two-step sign-in is on', 'Your other sessions have been signed out.'), back: '[data-step="tfa"]' });
            });
          },
        });
      }),
    });
  };
  // The code field takes digits only, as the product's does
  P.el.addEventListener('input', (e) => { if (e.target.id === 'tfa-code' || e.target.id === 'del-code') e.target.value = e.target.value.replace(/[^\d\s]/g, '').slice(0, 7); });

  // ---------- Profile: delete my account, as the product asks for it ----------
  const deleteAccount = () => P.open({
    title: 'Delete my account',
    body: `<p class="panel__what"><b>This can’t be undone.</b></p><ul class="effects"><li>You won’t be able to sign in to Leon anymore.</li><li>Leon stops collecting from the tools you connected: an administrator will have to reconnect them for the team.</li><li>What you produced stays with ${esc(ws.name)}, under your name followed by “former member”.</li></ul>
<form class="form" id="panel-form" novalidate>${secret('del-pw', 'Your Leon password')}${tfa ? L.field({ id: 'del-code', label: '6-digit code' }) : ''}${L.field({ id: 'del-word', label: 'To confirm, type “DELETE”', req: false })}</form>`,
    foot: `<button type="submit" form="panel-form" class="btn btn--danger">Delete permanently</button>${CANCEL}`,
    back: '[data-step="delete-account"]',
    submit: () => {
      if (tfa && !/^\d{6}$/.test($('#del-code').value.replace(/\s/g, ''))) return refuse('del-code', 'Enter the 6-digit code.');
      if ($('#del-word').value.trim() !== 'DELETE') return refuse('del-word', 'Type the word “DELETE” exactly to confirm.');
      L.fieldError($('#del-word'), '');
      P.busy('Deleting…').then((still) => {
        if (!still) return;
        if (wrong($('#del-pw').value)) { thaw('Delete permanently'); return refuse('del-pw', 'Incorrect password.'); }
        P.open({ title: 'Delete my account', body: doneHTML('Your account has been deleted', `Leon sent a confirmation to ${me.email}.`), foot: '<a class="btn" href="signin.html" data-focus>Go to sign-in</a>' });
      });
    },
  });

  // ---------- Assistants: computers and tokens ----------
  const grid = $('#a-grid');
  const redraw = () => {
    grid.innerHTML = cards();
    const n = computers.length + tokens.length;
    $('#a-count').textContent = n;
    grid.hidden = $('#a-count').hidden = !n;
    $('#a-none').hidden = !!n;
  };
  const remove = (list, x) => { list.splice(list.indexOf(x), 1); redraw(); };
  const computer = (c) => P.open({
    title: c.name,
    body: L.facts([['Coding tools', esc(c.tools.join(', '))], ['System', esc(c.os)], ['Connected', esc(c.connected)], ['Last session', esc(c.lastSession)], ['Leon receives', 'The coding sessions you accepted: what was said and what was done, with secrets masked.']]),
    foot: '<button type="button" class="btn btn--quiet" data-act="ask">Disconnect</button><button type="button" class="btn btn--line push" data-close data-focus>Done</button>',
    back: `[data-pc="${c.id}"], [data-add="computer"]`,
    act: (name) => {
      if (name !== 'ask') return;
      P.confirm({ title: `Disconnect “${c.name}”?`, text: 'It stops sending your sessions to Leon. To connect it again, paste the install command on it.', yes: 'Disconnect', no: 'Keep it' }).then((yes) => {
        if (!yes) return;
        remove(computers, c); P.close(); L.toast('Computer disconnected.');
      });
    },
  });
  const token = (t) => P.open({
    title: t.name,
    body: `${L.facts([['Token', esc(t.shown)], ['Created', esc(t.created)], ['Last used', esc(t.lastUsed || 'Never used')]])}<p class="hint">${esc(A.tokenNote)}</p>`,
    foot: '<button type="button" class="btn btn--quiet" data-act="ask">Revoke</button><button type="button" class="btn btn--line push" data-close data-focus>Done</button>',
    back: `[data-tk="${t.id}"], [data-add="token"]`,
    act: (name) => {
      if (name !== 'ask') return;
      P.confirm({ title: `Revoke “${t.name}”?`, text: 'Tools using it lose access to Leon right away.', yes: 'Revoke', no: 'Keep it' }).then((yes) => {
        if (!yes) return;
        remove(tokens, t); P.close(); L.toast('Token revoked.');
      });
    },
  });
  const B62 = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const createToken = () => P.open({
    title: 'Create a token',
    body: `<form class="form" id="panel-form" novalidate>${L.field({ id: 'tk-name', label: 'Device name', placeholder: 'Assistant on my laptop' })}<p class="hint">${esc(A.tokenNote)}</p></form>`,
    foot: `<button type="submit" form="panel-form" class="btn">Create token</button>${CANCEL}`,
    back: '[data-add="token"]',
    submit: () => {
      const name = $('#tk-name').value.trim();
      if (name.length > 80) return refuse('tk-name', 'Enter a device name of up to 80 characters.');
      P.busy('Creating…').then((still) => {
        const value = `leon_${Array.from({ length: 32 }, () => B62[Math.floor(Math.random() * B62.length)]).join('')}`;
        const t = { id: `tk${Date.now()}`, name, shown: `leon_…${value.slice(-4)}`, created: 'Today', lastUsed: '' };
        tokens.push(t); redraw();
        if (still) P.open({
          title: 'Create a token',
          body: `${doneHTML('Token created', 'Paste it into the tool you’re connecting.')}<div class="form">${copyLine('tk-value', name, value).replace('data-copy=', 'data-focus data-copy=')}<p class="hint">Copy it now; it won’t be shown again.</p></div>`,
          foot: '<button type="button" class="btn btn--line push" data-close>Done</button>',
          back: `[data-tk="${t.id}"]`,
        });
      });
    },
  });
  const connectComputer = () => P.open({
    title: 'Connect a computer',
    body: `<div class="form">${copyLine('pc-cmd', 'Install command', A.install)}<p class="hint">Open a terminal on the computer and paste this command. Your browser opens so you can authorize it.</p></div>${L.facts([['Works with', esc(A.codingTools.join(', ').replace(/, ([^,]*)$/, ' and $1'))], ['Before it sends', 'It asks which tools to connect and shows what is sent before anything leaves your computer.'], ['Leon receives', 'The coding sessions you accept: what was said and what was done, with secrets masked.']])}`,
    back: '[data-add="computer"]',
  });
  const MCP = 'https://leonmemory.com/api/mcp';
  const code = (s) => `<span class="code">${esc(s)}</span>`;
  const connectAssistant = () => P.open({
    title: 'Connect an assistant',
    body: `<div class="form">${copyLine('as-url', 'Address', MCP)}<p class="hint">Paste this address into the assistant. Leon asks you to authorize it, and the assistant then reads Leon with your access rights.</p></div>${L.facts([
      ['claude.ai and Claude Desktop', 'Customize › Connectors › Add custom connector, then paste the address.'],
      ['ChatGPT', 'Plugins › Add custom MCP server, then paste the address.'],
      ['Cursor and VS Code', 'Add the address as the url of a server in mcp.json.'],
      ['Claude Code', `Run this command. No token to paste.<small>${code(`claude mcp add --transport http leon ${MCP}`)}</small>`],
      ['Codex', `Run these two commands.<small>${code(`codex mcp add leon --url ${MCP}`)}</small><small>${code('codex mcp login leon')}</small>`],
    ])}`,
    back: '[data-add="assistant"]',
  });

  // ---------- Workspace: company single sign-on, in its real steps ----------
  let sso = null, ssoForm = { proto: 'OIDC (Okta, Entra, Auth0…)' };
  const ID = 'sso-4f9c2e7a1b3d', DNS = `_leon-verification-${ID}`;
  const ssoRow = () => {
    $('#sso-state').textContent = !sso ? 'Not set up' : sso.verified ? 'On' : 'Domain to verify';
    const b = $('[data-step="sso"]');
    b.textContent = sso ? 'Manage' : 'Set up';
    b.setAttribute('aria-label', `${sso ? 'Manage' : 'Set up'} company single sign-on`);
  };
  const ssoFields = () => {
    const saml = ssoForm.proto === 'SAML', v = (k) => ssoForm[k] || '';
    const f = (o, hint) => { const h = L.field(Object.assign({ value: v(o.id) }, o)); return hint ? hinted(h, hint) : h; };
    return `${L.field({ id: 'sso-proto', label: 'Protocol', kind: 'select', options: ['OIDC (Okta, Entra, Auth0…)', 'SAML'], value: ssoForm.proto })}
${f({ id: 'sso-domain', label: 'Email domain', placeholder: ws.domain }, `Addresses @${esc(v('sso-domain') || ws.domain)} will go through this SSO.`)}
${saml
    ? `${f({ id: 'sso-entry', label: 'Sign-in address (SSO URL)', placeholder: `https://${ws.domain.split('.')[0]}.okta.com/app/sso/saml` }, 'Given by your identity provider.')}<div><label class="label" for="sso-meta">Provider metadata (XML)</label><textarea class="field code" id="sso-meta" rows="5" spellcheck="false" aria-describedby="sso-meta-e" data-req="Provider metadata">${esc(v('sso-meta'))}</textarea><p class="field-error" id="sso-meta-e" role="alert"></p><p class="hint">Paste the SAML metadata file: it holds the certificate.</p></div>`
    : `${f({ id: 'sso-issuer', label: 'Issuer', placeholder: `https://${ws.domain.split('.')[0]}.okta.com` }, 'Your provider’s address, without /.well-known.')}${f({ id: 'sso-client', label: 'Client ID' })}${L.field({ id: 'sso-secret', label: 'Client secret', kind: 'secret' })}`}`;
  };
  const keep = () => $$('#panel-form .field').forEach((x) => { if (x.id !== 'sso-secret') ssoForm[x.id === 'sso-proto' ? 'proto' : x.id] = x.value; });
  const ssoSetup = () => P.open({
    title: 'Company single sign-on',
    body: `<p class="panel__what">Your team signs in with the company account. Anyone who signs in this way joins ${esc(ws.name)} directly.</p><form class="form" id="panel-form" novalidate>${ssoFields()}</form>`,
    foot: `<button type="submit" form="panel-form" class="btn">Save SSO</button>${CANCEL}`,
    back: '[data-step="sso"]',
    submit: () => {
      keep();
      const dom = $('#sso-domain'), https = (id) => { const x = $(`#${id}`); return !x || /^https:\/\/[^\s/]+\.[^\s]+$/.test(x.value.trim()); };
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(dom.value.trim())) return refuse('sso-domain', 'Write a domain, like acme.com.');
      for (const id of ['sso-issuer', 'sso-entry']) if (!https(id)) return refuse(id, 'Write an address that starts with https://.');
      P.busy('Saving…').then((still) => {
        sso = { saml: ssoForm.proto === 'SAML', domain: dom.value.trim().toLowerCase(), verified: false, tries: 0 };
        ssoRow();
        if (still) ssoStatus();
      });
    },
  });
  const ssoStatus = (err) => {
    const s = sso, base = 'https://leonmemory.com/api/auth/sso';
    const ends = s.saml
      ? `${copyLine('sso-acs', 'ACS address, to declare with the provider', `${base}/saml2/sp/acs/${ID}`)}${copyLine('sso-entity', 'Leon’s identifier (Entity ID / Audience)', `${base}/saml2/sp/metadata?providerId=${ID}`)}`
      : copyLine('sso-redirect', 'Redirect address, to declare with the provider', `${base}/callback/${ID}`);
    P.open({
      title: 'Company single sign-on',
      body: `${s.verified ? doneHTML('SSO is on', `Addresses @${s.domain} sign in with the company account.`) : ''}<div class="statusrow">${s.verified ? L.pill('Domain verified') : L.pill('Domain to verify', 'work')}<span>${esc(s.domain)} · ${s.saml ? 'SAML' : 'OIDC'}</span></div>
<div class="form sso-out">${ends}${s.verified ? '' : `<p class="hint">Prove the domain is yours: add this TXT record at your DNS host, then click “Verify the domain”. Nobody signs in through SSO before that.</p>${copyLine('sso-dns', 'TXT record name', `${DNS}.${s.domain}`)}${copyLine('sso-val', 'Value', `${DNS}=c2K8pQ4wN7tR1vX9mZ3bF6hD`)}${err ? `<p class="field-error" role="alert">${err}</p>` : ''}`}</div>`,
      foot: s.verified
        ? '<button type="button" class="btn btn--quiet" data-act="remove">Remove SSO</button><button type="button" class="btn btn--line push" data-close data-focus>Done</button>'
        : '<button type="button" class="btn" data-act="verify" data-focus>Verify the domain</button><button type="button" class="btn btn--quiet" data-act="remove">Remove SSO</button>',
      back: '[data-step="sso"]',
      act: (name) => {
        if (name === 'verify') P.busy('Verifying…').then((still) => {
          // DNS takes a few minutes: the first try finds nothing, the next one finds the record
          if (++sso.tries > 1) { sso.verified = true; ssoRow(); }
          if (still) ssoStatus(sso.verified ? '' : 'Record not found yet. DNS can take a few minutes, try again.');
        });
        if (name === 'remove') P.confirm({ title: 'Remove SSO?', text: 'Accounts stay; they’ll sign in another way.', yes: 'Remove SSO', no: 'Keep it' }).then((yes) => {
          if (!yes) return;
          sso = null; ssoRow(); P.close(); L.toast('SSO removed.');
        });
      },
    });
  };
  P.el.addEventListener('change', (e) => { if (e.target.id === 'sso-proto') { keep(); $('#panel-form').innerHTML = ssoFields(); $('#sso-proto').focus(); } });

  // ---------- Workspace: deleting it belongs to its owner ----------
  const deleteWorkspace = () => P.open({
    title: 'Delete the workspace',
    body: `<p class="panel__what">Everything in “${esc(ws.name)}” would be erased, for everyone: collected sources, documents, discussions and morning briefings.</p><div class="statusrow">${L.pill('Only the owner can delete it', 'err')}<span>You are an admin</span></div>${L.facts([['Owner', `${L.av(owner.name, 'av--s')} <b>${esc(owner.name)}</b><small>${esc(owner.email)}</small>`]])}`,
    back: '[data-step="delete-ws"]',
  });

  // ---------- Every control of the page ----------
  const STEPS = { password, tfa: tfaOpen, 'delete-account': deleteAccount, sso: () => (sso ? ssoStatus() : ssoSetup()), 'delete-ws': deleteWorkspace };
  const ADDS = { computer: connectComputer, assistant: connectAssistant, token: createToken };
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-step]'), a = e.target.closest('[data-add]'), pc = e.target.closest('[data-pc]'), tk = e.target.closest('[data-tk]');
    if (s) STEPS[s.dataset.step]();
    if (a) ADDS[a.dataset.add]();
    if (pc) { const c = computers.find((x) => x.id === pc.dataset.pc); if (c) computer(c); }
    if (tk) { const t = tokens.find((x) => x.id === tk.dataset.tk); if (t) token(t); }
  });

  show(location.hash.slice(1));
})();
