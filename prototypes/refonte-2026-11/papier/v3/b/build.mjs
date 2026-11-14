#!/usr/bin/env node
// Writes the markup of the data-driven parts of connections.html (the connected tools, the family chips, the tools to
// add, the sidebar's alert, the two flags) from the same templates app.js uses in the browser, so the page is whole
// without script. Run it after changing the data files or a template:  node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

const at = (p) => new URL(p, import.meta.url);
const ctx = vm.createContext({ window: {} });
for (const f of ['../../../shared/demo-data.js', '../../js/app-data.js', 'app.js']) vm.runInContext(readFileSync(at(f), 'utf8'), ctx, { filename: f });
const { html: h, count } = ctx.window.LeonV3;
const blocks = { conns: h.connGrid(), chips: h.chips(), tiles: h.tiles(), health: h.health() };

// Self-check: 8 connected tiles with Intercom first and the only ink pill, 34 tools to add, 7 chips without numbers,
// and none of the words the founder took off the cards
const n = (s, re) => (s.match(re) || []).length;
assert.equal(n(blocks.conns, /<li /g), 8);
assert.match(blocks.conns, /^<li [^>]*><button[^>]*class="tl is-err"[^>]*aria-label="Reconnect Intercom"/);
assert.equal(n(blocks.conns, /class="btn btn--xs"/g), 1);
assert.equal(n(blocks.tiles, /<li /g), 34);
assert.equal(count.conns(), 8);
assert.equal(count.add(), 34);
assert.equal(n(blocks.chips, /<button/g), 7);
assert.doesNotMatch(blocks.chips.replace(/<[^>]*>/g, ""), /\d/);
assert.match(blocks.health, /Intercom needs reconnecting/);
for (const w of [/items/i, /synced/i, /min ago/, /every 15 minutes/i, /One click|API key/]) assert.doesNotMatch(blocks.conns + blocks.tiles + blocks.health, w);

let page = readFileSync(at('connections.html'), 'utf8');
for (const [name, html] of Object.entries(blocks)) {
  const re = new RegExp(`(<!--b:${name}-->)[\\s\\S]*?(<!--/b:${name}-->)`);
  assert.ok(re.test(page), `marker ${name} is missing`);
  page = page.replace(re, (_, a, b) => `${a}\n${html}\n${b}`);
}
for (const [id, v] of [['conn-count', count.conns()], ['add-count', count.add()]]) {
  const re = new RegExp(`(id="${id}">)\\d+<`);
  assert.ok(re.test(page), `flag ${id} is missing`);
  page = page.replace(re, `$1${v}<`);
}
writeFileSync(at('connections.html'), page);
console.log(`connections.html: 4 blocks and 2 flags written (${count.conns()} connected, ${count.add()} to add, 7 chips)`);
