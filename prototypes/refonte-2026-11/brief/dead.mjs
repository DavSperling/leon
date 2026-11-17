#!/usr/bin/env node
// Clicks every visible link, button, summary and tab of a page, one at a time on a freshly loaded page, and says what
// each one did. It is how we know that nothing is dead. Headless Chrome, no package needed.
//
//   node dead.mjs --out DIR [--width 1440] [--height 900] name=<http url | /abs/file.html[?query]> ...
//
// Per page: DIR/<name>-dead.json (every control and its effect) and one summary line. Effects:
//   goes to <page>            the address changed to a page that exists
//   BROKEN LINK               the address changed to a page that does not load
//   jumps to #id              same page, an anchor that exists          DEAD ANCHOR  the anchor does not exist
//   changes the page          the document changed (a panel opened, a row changed, a message appeared): + the new words
//   copies                    wrote to the clipboard                    opens the file picker
//   asks for the field        a submit button in a form whose required fields are empty (the browser's own message)
//   external (says so)        a status message says the real product opens another tool
//   NOT IN PROTOTYPE          the "Not in this prototype" notice
//   already the current one   the open tab, the selected row: clicking it again rightly changes nothing
//   NOTHING                   no change at all: a dead control
// Form fields (inputs, selects, checkboxes, radios) are not clicked: they are fields, not actions.
// "selfChanging: true" in the summary means the page also changes by itself (a timer), so "changes the page" is less sure.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Browser, sleep } from '/Users/david/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';

// --base http://localhost:3040 : targets starting with "/" are routes of that server.
// --login <email> : signs in first on <base>/connexion (password in the environment variable SHOOT_PASSWORD).
// --theme light|dark : the app's stored theme choice, set before every page loads.
const setTheme = async (page, theme) => {
  if (!theme) return;
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('leon-theme',${JSON.stringify(theme)})}catch(e){}` });
};
const signIn = async (page, base, email) => {
  const password = process.env.SHOOT_PASSWORD;
  if (!password) throw new Error('SHOOT_PASSWORD is not set');
  await page.goto(`${base.replace(/\/$/, '')}/connexion`, { settleMs: 2500 });
  await page.eval(({ email, password }) => {
    const set = (name, value) => {
      const el = document.querySelector(`input[name="${name}"]`);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    };
    set('email', email);
    set('password', password);
    document.querySelector('input[name="password"]').form.requestSubmit();
  }, { email, password });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    const where = await page.eval(() => location.pathname).catch(() => '');
    if (where && where !== '/connexion') { await sleep(1200); return; }
  }
  throw new Error('sign-in refused (still on /connexion)');
};

const args = process.argv.slice(2);
const opt = { out: '.', width: 1440, height: 900, base: '', login: '', theme: '' };
const targets = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else { const eq = a.indexOf('='); targets.push([a.slice(0, eq), a.slice(eq + 1)]); }
}
opt.width = Number(opt.width); opt.height = Number(opt.height);
if (!targets.length) throw new Error('no target: name=<url or file>');
mkdirSync(opt.out, { recursive: true });
const urlOf = (t) => {
  if (/^(https?|file):\/\//.test(t)) return t;
  if (opt.base && t.startsWith('/')) return opt.base.replace(/\/$/, '') + t;
  const file = t.split(/[?#]/)[0];
  return pathToFileURL(resolve(file)).href + t.slice(file.length);
};

// In the page: the list of controls, in document order. Stable from one load to the next (the pages are static).
const listControls = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.pointerEvents !== 'none'; };
  const all = [...document.querySelectorAll('a[href], button, summary, [role="button"], [role="tab"]')];
  window.__controls = all;
  return all.map((el, i) => ({
    i,
    visible: vis(el),
    disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
    tag: el.tagName.toLowerCase(),
    text: (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70),
    href: el.getAttribute('href') || '',
    title: el.getAttribute('title') || '',
    where: (el.closest('[id]') || {}).id || (el.closest('header.side') ? 'sidebar' : ''),
  }));
};
// In the page, just before the click: remember the document, and listen for what a click can do without changing it.
const arm = (i) => {
  const el = window.__controls[i];
  window.__fx = { clip: false, file: false };
  try { const c = navigator.clipboard; if (c) c.writeText = () => { window.__fx.clip = true; return Promise.resolve(); }; } catch (e) {}
  document.addEventListener('click', (e) => { if (e.target && e.target.matches && e.target.matches('input[type="file"]')) { window.__fx.file = true; e.preventDefault(); } }, true);
  const form = el.form || el.closest('form');
  const submits = el.tagName === 'BUTTON' ? (el.type || 'submit') === 'submit' : false;
  window.__before = { html: document.documentElement.outerHTML, text: document.body.innerText, url: location.href };
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  // hit: false when the mouse cannot reach it (a skip link parked off screen): it is then clicked by script
  // current: the control is already the chosen one (the open tab, the selected source): clicking it again may rightly change nothing
  const current = el.getAttribute('aria-pressed') === 'true' || el.hasAttribute('aria-current') || el.getAttribute('aria-selected') === 'true';
  return { x, y, current, hit: !!top && (top === el || el.contains(top) || top.contains(el)), invalidForm: !!(form && submits && !form.checkValidity()) };
};
const after = () => {
  const b = window.__before;
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const status = [...document.querySelectorAll('[role="status"], [role="alert"], .notice')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | ');
  const was = new Set(b.text.split('\n').map((s) => s.trim()).filter(Boolean));
  const fresh = document.body.innerText.split('\n').map((s) => s.trim()).filter((s) => s && !was.has(s));
  return { url: location.href, changed: document.documentElement.outerHTML !== b.html, status, fresh: fresh.slice(0, 4).join(' / ').slice(0, 160), fx: window.__fx, anchorOk: !location.hash || !!document.getElementById(decodeURIComponent(location.hash.slice(1))) };
};

process.env.TASTE_SKILL_TMP = mkdtempSync(resolve(tmpdir(), 'dead-'));
const browser = await Browser.launch({ width: opt.width, height: opt.height });
// Reduced motion: the pages skip their one arrival animation, so the document only changes when something is clicked.
const page = await browser.newPage({ width: opt.width, height: opt.height, mobile: opt.width < 600, reducedMotion: true });
const mouse = (type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
let totalDead = 0;
try {
  await setTheme(page, opt.theme);
  if (opt.login) await signIn(page, opt.base, opt.login);
  for (const [name, target] of targets) {
    const url = urlOf(target);
    await page.goto('about:blank', { settleMs: 50 });
    await page.goto(url, { settleMs: 700 });
    const h0 = await page.eval(() => document.documentElement.outerHTML);
    await sleep(1500);
    const selfChanging = h0 !== await page.eval(() => document.documentElement.outerHTML);
    const controls = await page.eval(listControls);
    const rows = [];
    for (const c of controls) {
      if (!c.visible) { rows.push({ ...c, effect: 'hidden at rest (not clicked)' }); continue; }
      if (c.disabled) { rows.push({ ...c, effect: 'disabled' }); continue; }
      // A page may remember a choice (a collapsed sidebar): forget it, so every control is tried on the same fresh page
      await page.eval(() => { try { localStorage.clear(); sessionStorage.clear(); } catch (e) {} }).catch(() => {});
      await page.goto('about:blank', { settleMs: 50 }); // a #hash goto on the same file would not reload it
      await page.goto(url, { settleMs: 260 });
      await page.eval(listControls);
      const at = await page.eval(arm, c.i);
      if (at.hit) {
        await mouse('mouseMoved', at.x, at.y);
        await mouse('mousePressed', at.x, at.y);
        await mouse('mouseReleased', at.x, at.y);
      } else {
        await page.eval((i) => { window.__controls[i].click(); }, c.i).catch(() => {});
      }
      let r = null;
      for (const ms of [450, 900]) {
        await sleep(ms);
        r = await page.eval(after).catch(() => null); // null: the page is navigating
        if (!r) { await sleep(500); r = await page.eval(() => ({ url: location.href, gone: true })).catch(() => ({ url: '?', gone: true })); break; }
        if (r.url !== url || r.changed || r.status || r.fx.clip || r.fx.file) break;
      }
      const base = url.split('#')[0];
      let effect;
      if (/^chrome-error:/.test(r.url)) effect = 'BROKEN LINK';
      else if (r.url.split('#')[0] !== base) effect = `goes to ${r.url.replace(/^.*\//, '')}`;
      else if (r.gone) effect = 'reloads the page';
      else if (/not in this prototype/i.test(r.status)) effect = 'NOT IN PROTOTYPE';
      else if (/in the real product/i.test(r.status)) effect = `external (says so): ${r.status.slice(0, 80)}`;
      else if (r.fx.file) effect = 'opens the file picker';
      else if (r.fx.clip) effect = `copies${r.status ? `: ${r.status.slice(0, 60)}` : ''}`;
      else if (r.url !== url) effect = r.anchorOk ? `jumps to ${r.url.slice(r.url.indexOf('#'))}` : 'DEAD ANCHOR';
      else if (r.changed) effect = `changes the page${r.fresh ? `: ${r.fresh}` : r.status ? `: ${r.status.slice(0, 100)}` : ''}`;
      else if (at.invalidForm) effect = 'asks for the field';
      else if (at.current) effect = 'already the current one (no change)';
      else effect = 'NOTHING';
      rows.push({ ...c, effect });
    }
    const count = (re) => rows.filter((x) => re.test(x.effect)).length;
    const dead = count(/^(NOTHING|BROKEN LINK|DEAD ANCHOR)/);
    const notIn = count(/^NOT IN PROTOTYPE/);
    totalDead += dead + notIn;
    writeFileSync(resolve(opt.out, `${name}-dead.json`), JSON.stringify({ url, selfChanging, consoleErrors: page.consoleErrors.splice(0), controls: rows }, null, 2));
    console.log(`${name}: ${rows.length} controls · ${dead} dead · ${notIn} "not in this prototype" · ${count(/^external/)} external · ${count(/^hidden/)} hidden at rest${selfChanging ? ' · selfChanging: true' : ''}`);
    for (const x of rows) if (/^(NOTHING|BROKEN|DEAD|NOT IN)/.test(x.effect)) console.log(`   ${x.effect.padEnd(18)} <${x.tag}> "${x.text}"${x.where ? ` in #${x.where}` : ''}`);
  }
} finally {
  await browser.close();
}
process.exit(totalDead ? 1 : 0);
