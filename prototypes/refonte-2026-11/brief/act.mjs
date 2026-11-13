#!/usr/bin/env node
// Plays a list of steps on one page in headless Chrome and captures the states. No package needed.
//
//   node act.mjs --out DIR --url <http url | /abs/file.html[?query]> [--width 1440] [--height 900] [--reduced] [--settle 600] step step ...
//
// Steps, played in order:
//   click=<target>           a real mouse click at the centre of the target (scrolled into view first)
//   type=<target>::<text>    clicks the field, replaces its value by typing the text
//   pick=<target>::<label>   chooses the option of a <select> by its visible label
//   key=<Key>                Escape, Enter, Tab, Shift+Tab, Space, ArrowDown, ArrowUp, ArrowLeft, ArrowRight
//   wait=<ms>
//   shot=<name>              DIR/<name>.jpg, the viewport            full=<name>   the whole page
//   eval=<js expression>     prints its JSON value
//   goto=<url or file>
//   state                    prints url, title, sideways overflow, the focused element, visible status messages, console errors
// A target is a CSS selector, or text=<words> (the first visible link, button, summary, tab or label whose text
// contains the words, case-insensitive). Add >>N to take the Nth match (1-based): "text=Manage>>3", ".btn--sm>>2".
// A failing step prints "FAIL <step>: <reason>" and the run goes on. Exit code 1 if a step failed or the page threw.
import { mkdirSync, mkdtempSync } from 'node:fs';
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
const opt = { out: '.', url: '', width: 1440, height: 900, settle: 600, reduced: false, base: '', login: '', theme: '' };
const steps = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--reduced') opt.reduced = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else steps.push(a);
}
for (const k of ['width', 'height', 'settle']) opt[k] = Number(opt[k]);
if (!opt.url) throw new Error('--url is required');
mkdirSync(opt.out, { recursive: true });
const urlOf = (t) => {
  if (/^(https?|file):\/\//.test(t)) return t;
  if (opt.base && t.startsWith('/')) return opt.base.replace(/\/$/, '') + t;
  const [file, query = ''] = t.split(/(?=[?#])/);
  return pathToFileURL(resolve(file)).href + t.slice(file.length);
};

// Finds the target in the page, scrolls it into view, returns its centre and what covers it (if anything).
const locate = (target) => {
  const m = target.match(/^(.*?)(?:>>(\d+))?$/);
  const sel = m[1];
  const nth = Number(m[2] || 1) - 1;
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  let list;
  if (sel.startsWith('text=')) {
    const words = sel.slice(5).toLowerCase();
    list = [...document.querySelectorAll('a, button, summary, label, [role="tab"], [role="button"]')].filter((el) => visible(el) && el.textContent.replace(/\s+/g, ' ').toLowerCase().includes(words));
  } else {
    list = [...document.querySelectorAll(sel)].filter(visible);
  }
  const el = list[nth];
  if (!el) return { error: `no visible match (${list.length} found)` };
  el.scrollIntoView({ block: 'center', inline: 'nearest' });
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const top = document.elementFromPoint(x, y);
  const covered = top && top !== el && !el.contains(top) && !top.contains(el) ? `${top.tagName.toLowerCase()}.${String(top.className).split(' ')[0]}` : '';
  window.__actEl = el;
  return { x, y, w: Math.round(r.width), h: Math.round(r.height), covered, tag: el.tagName.toLowerCase(), text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 60) };
};

const KEYS = { Escape: 27, Enter: 13, Tab: 9, Space: 32, ArrowDown: 40, ArrowUp: 38, ArrowLeft: 37, ArrowRight: 39, Backspace: 8 };

process.env.TASTE_SKILL_TMP = mkdtempSync(resolve(tmpdir(), 'act-'));
const browser = await Browser.launch({ width: opt.width, height: opt.height });
const page = await browser.newPage({ width: opt.width, height: opt.height, mobile: opt.width < 600, reducedMotion: opt.reduced });
let failed = 0;
const mouse = async (type, x, y) => page.send('Input.dispatchMouseEvent', { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: type === 'mouseMoved' ? 0 : 1 });
const click = async (target) => {
  const at = await page.eval(locate, target);
  if (at.error) throw new Error(at.error);
  if (at.covered) console.log(`  note: ${target} is covered by ${at.covered} at its centre`);
  await mouse('mouseMoved', at.x, at.y);
  await mouse('mousePressed', at.x, at.y);
  await mouse('mouseReleased', at.x, at.y);
  return at;
};
try {
  await setTheme(page, opt.theme);
  if (opt.login) await signIn(page, opt.base, opt.login);
  await page.goto(urlOf(opt.url), { settleMs: opt.settle });
  for (const step of steps) {
    const eq = step.indexOf('=');
    const verb = eq < 0 ? step : step.slice(0, eq);
    const rest = eq < 0 ? '' : step.slice(eq + 1);
    try {
      if (verb === 'click') {
        const at = await click(rest);
        await sleep(120);
        console.log(`click ${rest} -> <${at.tag}> "${at.text}" ${at.w}x${at.h}`);
      } else if (verb === 'type') {
        const [target, text = ''] = rest.split('::');
        await click(target);
        await page.eval(() => { const el = window.__actEl; if (el && el.select) el.select(); });
        if (text) await page.send('Input.insertText', { text });
        else await page.eval(() => { const el = window.__actEl; el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.eval(() => window.__actEl && window.__actEl.dispatchEvent(new Event('change', { bubbles: true })));
        console.log(`type ${target} <- "${text}"`);
      } else if (verb === 'pick') {
        const [target, label = ''] = rest.split('::');
        const at = await page.eval(locate, target);
        if (at.error) throw new Error(at.error);
        const ok = await page.eval((want) => {
          const el = window.__actEl;
          const o = [...el.options].find((x) => x.textContent.trim() === want || x.value === want);
          if (!o) return false;
          el.value = o.value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, label);
        if (!ok) throw new Error(`no option "${label}"`);
        console.log(`pick ${target} <- "${label}"`);
      } else if (verb === 'key') {
        const shift = rest.startsWith('Shift+');
        const key = shift ? rest.slice(6) : rest;
        const code = KEYS[key];
        if (!code) throw new Error('unknown key');
        const base = { key: key === 'Space' ? ' ' : key, code: key, windowsVirtualKeyCode: code, modifiers: shift ? 8 : 0 };
        const text = key === 'Enter' ? '\r' : key === 'Space' ? ' ' : undefined;
        await page.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', ...base, ...(text ? { text } : {}) });
        await page.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        await sleep(80);
        console.log(`key ${rest}`);
      } else if (verb === 'wait') {
        await sleep(Number(rest));
      } else if (verb === 'shot' || verb === 'full') {
        const path = resolve(opt.out, `${rest}.jpg`);
        await page.screenshot({ path, quality: 78, fullPage: verb === 'full' });
        console.log(`${verb} ${path}`);
      } else if (verb === 'eval') {
        console.log(`eval ${rest} -> ${JSON.stringify(await page.eval(rest))}`);
      } else if (verb === 'goto') {
        await page.goto(urlOf(rest), { settleMs: opt.settle });
        console.log(`goto ${rest}`);
      } else if (verb === 'state') {
        const s = await page.eval(() => {
          const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
          const a = document.activeElement;
          return {
            url: location.href.replace(/^.*\//, ''), title: document.title,
            overflow: document.documentElement.scrollWidth - innerWidth,
            focus: a && a !== document.body ? `${a.tagName.toLowerCase()}${a.id ? `#${a.id}` : ''} "${(a.textContent || a.value || '').replace(/\s+/g, ' ').trim().slice(0, 40)}"` : 'body',
            status: [...document.querySelectorAll('[role="status"], [role="alert"], .field-error')].filter(vis).map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean),
          };
        });
        console.log(`state ${JSON.stringify({ ...s, consoleErrors: page.consoleErrors })}`);
      } else {
        throw new Error('unknown step');
      }
    } catch (e) {
      failed++;
      console.log(`FAIL ${step}: ${e.message}`);
    }
  }
  if (page.consoleErrors.length) console.log(`console errors: ${JSON.stringify(page.consoleErrors)}`);
} finally {
  await browser.close();
}
process.exit(failed || page.consoleErrors.length ? 1 : 0);
