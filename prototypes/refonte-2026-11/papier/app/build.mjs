#!/usr/bin/env node
// Writes the shell and the data-driven markup into the pages, between markers, from the same templates the browser
// uses (app.js, then <page>.js when it exists). So every page is whole without script and the shells are identical.
//
//   node build.mjs                 every page of this folder
//   node build.mjs chat.html       only that page: each screen can be built on its own, at the same moment as the others
//
// A page says what it wants with pairs of markers:  <!--b:name--> … <!--/b:name-->
//   head, shell, top, end          the shell (app.js)
//   anything else                  a block the page's own script registers: Leon.block('name', () => html)
// A page's script may also set Leon.selfCheck = (assert) => { … }: it runs before anything is written.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const at = (p) => new URL(p, import.meta.url);
const asked = process.argv.slice(2);
const files = asked.length ? asked : readdirSync(at('.')).filter((f) => f.endsWith('.html')).sort();

for (const file of files) {
  const before = readFileSync(at(file), 'utf8');
  const names = [...new Set([...before.matchAll(/<!--b:([\w-]+)-->/g)].map((m) => m[1]))];
  if (!names.length) { console.log(`${file}: no marker, left as it is`); continue; }
  if (names.includes('shell')) for (const n of ['head', 'top', 'end']) assert.ok(names.includes(n), `${file}: the shell needs the marker "${n}" too`);

  // A fresh window per page: the page's script cannot leak into another page's build
  const win = vm.createContext({ LEON_PAGE: file });
  win.window = win;
  const own = file === 'index.html' ? 'home.js' : file.replace(/\.html$/, '.js'); // Home is index.html; its script keeps the screen's name
  for (const f of ['../../shared/demo-data.js', '../js/app-data.js', '../js/demo.js', 'app.js', ...(existsSync(at(own)) ? [own] : [])]) {
    vm.runInContext(readFileSync(at(f), 'utf8'), win, { filename: f });
  }
  const L = win.Leon;
  if (L.selfCheck) L.selfCheck(assert);

  let page = before;
  for (const name of names) {
    assert.ok(L.blocks[name], `${file}: no block "${name}" (Leon.block('${name}', …) in ${own})`);
    const html = String(L.blocks[name]());
    const re = new RegExp(`(<!--b:${name}-->)([\\s\\S]*?)(<!--/b:${name}-->)`, 'g');
    page = page.replace(re, (_, a, old, b) => { const nl = old.includes('\n') || html.includes('\n') ? '\n' : ''; return `${a}${nl}${html}${nl}${b}`; }); // a marker pair on one line stays on one line (a count in a flag)
  }
  assert.equal((page.match(/<!--b:/g) || []).length, (page.match(/<!--\/b:/g) || []).length, `${file}: a marker is not closed`);
  if (page !== before) writeFileSync(at(file), page);
  console.log(`${file}: ${names.join(', ')}${page === before ? ' (unchanged)' : ''}`);
}
