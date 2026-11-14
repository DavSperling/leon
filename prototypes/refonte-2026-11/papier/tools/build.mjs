#!/usr/bin/env node
// Refills the regions <!--gen:NAME-->…<!--/gen--> of papier/index.html with the markup js/demo.js builds.
// Idempotent: index.html is the only source, this only replaces what sits between the markers.
//   node build.mjs /abs/path/to/prototypes/refonte-2026-11/papier
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node build.mjs <papier folder>');
globalThis.window = globalThis;
for (const f of [`${dir}/../shared/demo-data.js`, `${dir}/js/demo.js`]) vm.runInThisContext(readFileSync(f, 'utf8'), { filename: f });
const UI = globalThis.LeonUI;
const gen = {
  asheet: () => UI.asheetHTML(UI.scenario('commitment'), { notes: true, selected: 1 }),
  pile: () => UI.pileHTML(UI.scenario('commitment').sources, 1),
  rule1: () => UI.fragHTML(UI.scenario('bug')),
  rule2: () => UI.fragHTML(UI.scenario('unknown')),
  rule3: () => UI.permHTML(0),
  marquee: () => UI.connectorsHTML(),
  memo: () => UI.memoHTML(),
  dream: () => UI.dreamHTML(),
  terminal: () => UI.terminalHTML(),
};
const file = `${dir}/index.html`;
let n = 0;
const html = readFileSync(file, 'utf8').replace(/<!--gen:(\w+)-->[\s\S]*?<!--\/gen-->/g, (m, k) => {
  if (!gen[k]) throw new Error(`unknown region ${k}`);
  n += 1;
  return `<!--gen:${k}-->${gen[k]()}<!--/gen-->`;
});
writeFileSync(file, html);
console.log(`${n} regions rebuilt, ${html.length} bytes`);
