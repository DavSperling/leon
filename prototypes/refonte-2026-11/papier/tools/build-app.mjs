#!/usr/bin/env node
// Refills the regions <!--gen:EXPRESSION-->…<!--/gen--> of the app pages with what the builders return.
// EXPRESSION is a call on LeonApp (js/app.js) or LeonUI (js/demo.js), for example:
//   <!--gen:LeonApp.resultHTML('commitment')-->…<!--/gen-->
//   <!--gen:LeonApp.answerHTML(LEON_DEMO.permissions.views[0], { selected: 1 })-->…<!--/gen-->
// Idempotent: the page is the only source, this only replaces what sits between the markers.
//   node tools/build-app.mjs /abs/path/to/papier app-search.html [app-chat.html …]
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const [dir, ...pages] = process.argv.slice(2);
if (!dir || !pages.length) throw new Error('usage: node build-app.mjs <papier folder> <page.html> [more pages]');
globalThis.window = globalThis;
for (const f of ['../shared/demo-data.js', 'js/app-data.js', 'js/demo.js', 'js/app.js']) {
  vm.runInThisContext(readFileSync(`${dir}/${f}`, 'utf8'), { filename: f });
}
for (const page of pages) {
  const file = `${dir}/${page}`;
  let n = 0;
  const html = readFileSync(file, 'utf8').replace(/<!--gen:(.+?)-->[\s\S]*?<!--\/gen-->/g, (m, expr) => {
    n += 1;
    return `<!--gen:${expr}-->${vm.runInThisContext(expr)}<!--/gen-->`;
  });
  writeFileSync(file, html);
  console.log(`${page}: ${n} region(s) rebuilt, ${html.length} bytes`);
}
