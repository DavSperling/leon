#!/usr/bin/env node
// Writes connections.html from the two data files, with the templates of app.js (one source for the rows and tiles).
//   node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const here = new URL('.', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, here), 'utf8');
const window = {};
for (const f of ['../../../shared/demo-data.js', '../../js/app-data.js', 'app.js']) runInNewContext(read(f), { window });
const { LEON_DEMO: D, LEON_APP: A, LeonV3: V } = window;
const { ico, strokes, row, tile } = V;

const conn = (tool) => D.connections.find((c) => c.tool === tool);
const bad = D.connections.filter((c) => c.state === 'error');
const good = D.connections.filter((c) => c.state !== 'error');
const all = D.catalogue.flatMap((f, fam) => f.tools.map(([tool, label]) => ({ tool, label, fam })));
const mark = '<svg class="mark" viewBox="131 126 200 200" aria-hidden="true"><path d="M140 157C196 157 236 226 300 226M140 226H300M140 294C196 294 236 226 300 226" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round"/><circle cx="313" cy="226" r="17" fill="currentColor"/></svg>';
const nav = [['Home', 'home'], ['Chat', 'chat'], ['Documents', 'docs'], ['Team', 'team'], ['Connections', 'plug'], ['Settings', 'sliders']];
const initials = A.me.name.split(' ').map((w) => w[0]).join('');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connections · Leon</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='131 126 200 200'%3E%3Cpath d='M140 157C196 157 236 226 300 226M140 226H300M140 294C196 294 236 226 300 226' fill='none' stroke='%230F0F0D' stroke-width='17' stroke-linecap='round'/%3E%3Ccircle cx='313' cy='226' r='17' fill='%230F0F0D'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="../../css/tokens.css">
<link rel="stylesheet" href="../../css/ui.css">
<link rel="stylesheet" href="app.css">
</head>
<body>
<!-- Written by build.mjs from shared/demo-data.js and js/app-data.js. Edit build.mjs, not this file. -->
<a class="skip" href="#main">Skip to content</a>

<aside class="side" id="side" aria-label="Leon">
  <div class="side__top">
    <a class="brand" href="#" data-undrawn="Home" aria-label="Leon, home">${mark}<span class="lbl">Leon</span></a>
    <button type="button" class="ib" data-side aria-expanded="true" aria-controls="side" aria-label="Sidebar" title="Collapse or open the sidebar">${ico('side')}</button>
  </div>
  <button type="button" class="ask" data-cmd aria-haspopup="dialog" aria-label="Ask or search" title="Ask or search">${strokes}<span class="lbl">Ask or search</span><span class="keys lbl" aria-hidden="true"><kbd data-mod>⌘</kbd><kbd>K</kbd></span></button>
  <nav class="nav" aria-label="Main">
    <ul>
${nav.map(([name, icon]) => name === 'Connections'
    ? `      <li><a href="connections.html" aria-current="page" title="Connections">${ico(icon)}<span class="lbl">Connections</span><span class="fl" data-if-bad><span data-n="bad">${bad.length}</span><span class="vh"> needs attention</span></span></a></li>`
    : `      <li><a href="#" data-undrawn="${name}" title="${name}">${ico(icon)}<span class="lbl">${name}</span></a></li>`).join('\n')}
    </ul>
  </nav>
  <section class="recent lbl" aria-labelledby="recent-t">
    <h2 id="recent-t">Recent</h2>
    <ul>
${D.discussions.map((d) => `      <li><a href="#" data-undrawn="Chat" title="${d.title} · ${d.date}">${d.title}</a></li>`).join('\n')}
    </ul>
  </section>
  <div class="side__foot">
    <a class="health is-bad" href="#connected" title="Tools">
      <span class="health__top lbl"><span>Tools</span><span class="strip" aria-hidden="true">${D.connections.map((c) => `<i${c.state === 'error' ? ' class="bad"' : ''}></i>`).join('')}</span></span>
      <span class="health__dot" aria-hidden="true"><span data-n="bad">${bad.length}</span></span>
      <span class="health__t lbl">${bad[0].label} needs reconnecting</span>
    </a>
    <button type="button" class="acct" popovertarget="acct-menu" aria-expanded="false" title="${A.me.name}">
      <span class="av" aria-hidden="true">${initials}</span>
      <span class="acct__id lbl"><b>${A.me.name}</b><span>${A.workspace.name}</span></span>
      <span class="lbl acct__chev">${ico('updown')}</span>
    </button>
    <div class="menu" id="acct-menu" popover>
      <p class="menu__head">${A.me.email}</p>
      <a href="#" data-undrawn="Settings">Profile and settings</a>
      <a href="#" data-undrawn="Team">Invite people</a>
      <a href="#" data-undrawn="Sign-in">Sign out</a>
    </div>
  </div>
</aside>
<div class="veil"></div>

<main class="sheet" id="main">
<div class="scroll">
  <header class="head">
    <button type="button" class="ib head__menu" data-side aria-expanded="false" aria-controls="side" aria-label="Menu">${ico('side')}</button>
    <span class="head__mark">${mark}</span>
    <h1>Connections</h1>
    <p class="head__meta"><span data-n="on">${D.connections.length}</span> connected<span data-if-bad> · <span data-n="bad">${bad.length}</span> needs attention</span></p>
    <a class="btn btn--line" href="#add">${ico('plus')}Add a tool</a>
  </header>

  <div class="body">
    <p class="lead">Leon reads the connected tools every 15 minutes. An item is shown only to <span class="hl hl-3">the people who can already open it</span>.</p>

    <section id="connected" aria-labelledby="connected-t">
      <h2 class="vh" id="connected-t">Connected tools</h2>
      <div class="group" data-if-bad>
        <h3 class="group__head group__head--bad"><span class="fl fl--left fl--out" aria-hidden="true"><span data-n="bad">${bad.length}</span></span>Needs attention</h3>
        <ul class="rows" data-rows="bad">
          ${bad.map((c) => row(c, A.reads[c.tool])).join('\n          ')}
        </ul>
      </div>
      <div class="group">
        <h3 class="group__head">In sync <span class="n" data-n="ok">${good.length}</span></h3>
        <ul class="rows" data-rows="ok">
          ${good.map((c) => row(c, A.reads[c.tool])).join('\n          ')}
        </ul>
      </div>
    </section>

    <section class="add" id="add" aria-labelledby="add-t">
      <div class="add__head">
        <h2 id="add-t">Add a tool</h2>
        <p class="add__n">${all.length} tools · <span data-n="on">${D.connections.length}</span> connected</p>
        <label class="find"><span class="vh">Search the ${all.length} tools</span><input class="inp" id="tool-search" type="search" placeholder="Search ${all.length} tools" autocomplete="off" spellcheck="false"><kbd aria-hidden="true">/</kbd></label>
      </div>
      <div class="fams" role="group" aria-label="Families">
        <button type="button" class="fam" data-fam-pick="all" aria-pressed="true">All<span class="n">${all.length}</span></button>
${D.catalogue.map((f, i) => `        <button type="button" class="fam" data-fam-pick="${i}" aria-pressed="false">${f.family}<span class="n">${f.tools.length}</span></button>`).join('\n')}
      </div>
      <ul class="tiles">
        ${all.map((t) => tile(t, conn(t.tool), A.reads[t.tool])).join('\n        ')}
      </ul>
      <div class="none" hidden>
        <svg class="none__flag" viewBox="0 0 34 24" aria-hidden="true"><polygon points="1,1 33,1 26,12 33,23 1,23"/></svg>
        <p><b>No tool matches “<span data-none-q></span>”.</b> Leon reads ${all.length} tools today. Try another name.</p>
        <button type="button" class="btn btn--line btn--xs" data-clear>Clear the search</button>
      </div>
    </section>
  </div>
</div>
<div class="toasts" role="status" aria-live="polite"></div>
</main>

<dialog class="panel" id="panel" aria-labelledby="panel-t"></dialog>

<dialog class="cmd" id="cmd" aria-label="Ask or search">
  <div class="cmd__top">${strokes}<input id="cmd-in" type="text" role="combobox" aria-expanded="true" aria-controls="cmd-list" aria-autocomplete="list" aria-label="Ask or search everything Leon has saved" placeholder="Ask or search everything Leon has saved…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
  <ul class="cmd__list" id="cmd-list" role="listbox" aria-label="Results"></ul>
  <p class="cmd__foot" aria-hidden="true"><span><kbd>↑</kbd><kbd>↓</kbd> Move</span><span><kbd>↵</kbd> Open</span><span><kbd>Esc</kbd> Close</span></p>
</dialog>

<script src="../../../shared/demo-data.js" defer></script>
<script src="../../js/app-data.js" defer></script>
<script src="app.js" defer></script>
</body>
</html>
`;
writeFileSync(new URL('connections.html', here), html);
console.log(`connections.html: ${D.connections.length} connected, ${all.length} tools, ${html.length} bytes`);
