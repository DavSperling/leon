#!/usr/bin/env node
// Filme une page : des images à des instants donnés après le chargement, puis à des positions de défilement.
// Sert à vérifier des animations sans les voir bouger : on lit les planches (une seule image par série).
//
//   node film.mjs --out DIR --url /abs/page.html|https://… [--width 1440] [--height 900]
//                 [--times 0,150,400,800,1400,2200,3200] [--scroll 0,300,600,…] [--reduced] [--nojs] [--cols 4]
//
// Écrit DIR/load-XXXX.jpg, DIR/scroll-XXXXX.jpg, et deux planches : DIR/sheet-load.jpg, DIR/sheet-scroll.jpg.
// --reduced : émule prefers-reduced-motion. --nojs : coupe JavaScript (le contenu doit rester visible).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Browser, sleep } from '/Users/david/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const args = process.argv.slice(2);
const opt = { out: '.', url: '', width: 1440, height: 900, times: '0,150,400,800,1400,2200,3200', scroll: '', cols: 4, reduced: false, nojs: false };
for (let i = 0; i < args.length; i++) {
  const a = args[i].replace(/^--/, '');
  if (a === 'reduced' || a === 'nojs') opt[a] = true;
  else opt[a] = args[++i];
}
if (!opt.url) throw new Error('--url manquant');
const url = /^https?:\/\//.test(opt.url) ? opt.url : pathToFileURL(resolve(opt.url)).href;
const W = Number(opt.width);
const H = Number(opt.height);
const times = String(opt.times).split(',').filter(Boolean).map(Number);
const scrolls = String(opt.scroll).split(',').filter(Boolean).map(Number);
mkdirSync(opt.out, { recursive: true });
process.env.TASTE_SKILL_TMP = mkdtempSync(resolve(tmpdir(), 'film-'));

const browser = await Browser.launch({ width: W, height: H });
const tiles = { load: [], scroll: [] };
try {
  const page = await browser.newPage({ width: W, height: H, dsf: 1, mobile: W < 600 });
  if (opt.reduced) await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  if (opt.nojs) await page.send('Emulation.setScriptExecutionDisabled', { value: true });
  // Départ du chrono à l'événement « load » : les instants sont comptés depuis là.
  let off;
  const loaded = new Promise((r) => { off = browser.on(page.sessionId, 'Page.loadEventFired', () => r(Date.now())); });
  await page.send('Page.navigate', { url });
  const t0 = await Promise.race([loaded, sleep(15000).then(() => Date.now())]);
  off();
  for (const t of times) {
    const wait = t0 + t - Date.now();
    if (wait > 0) await sleep(wait);
    const name = `load-${String(t).padStart(4, '0')}.jpg`;
    await page.screenshot({ path: resolve(opt.out, name), quality: 70 });
    tiles.load.push([name, `${t} ms`]);
  }
  if (scrolls.length) {
    await sleep(600);
    let y = 0;
    for (const target of scrolls) {
      // Vraie molette : les animations liées au défilement réagissent comme pour un visiteur.
      await page.wheel(target - y, { step: 120, pauseMs: 16 });
      y = target;
      await sleep(450);
      // La position vient du protocole, pas d'un script : ça marche aussi quand JavaScript est coupé (--nojs).
      const lm = await page.send('Page.getLayoutMetrics');
      const real = Math.round((lm.cssVisualViewport || lm.visualViewport || {}).pageY || 0);
      const name = `scroll-${String(target).padStart(5, '0')}.jpg`;
      await page.screenshot({ path: resolve(opt.out, name), quality: 70 });
      tiles.scroll.push([name, `y ${real}`]);
    }
  }
  const errors = page.consoleErrors.splice(0);
  writeFileSync(resolve(opt.out, 'film.json'), JSON.stringify({ url, viewport: `${W}x${H}`, reduced: opt.reduced, nojs: opt.nojs, times, scrolls, consoleErrors: errors }, null, 2));
  // Les planches : toutes les images d'une série sur une seule, pour les regarder d'un coup.
  const cols = Number(opt.cols);
  for (const kind of ['load', 'scroll']) {
    if (!tiles[kind].length) continue;
    const tileW = Math.floor(1840 / cols);
    const rows = Math.ceil(tiles[kind].length / cols);
    const tileH = Math.round((tileW - 6) * (H / W)) + 24;
    const html = `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#666;font:600 13px Helvetica;color:#fff}.g{display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px}figure{margin:0;background:#222}img{width:100%;display:block}figcaption{padding:3px 8px}</style><div class=g>${tiles[kind].map(([n, c]) => `<figure><img src="${pathToFileURL(resolve(opt.out, n)).href}"><figcaption>${c}</figcaption></figure>`).join('')}</div>`;
    const sheetHtml = resolve(opt.out, `sheet-${kind}.html`);
    writeFileSync(sheetHtml, html);
    const sheet = await browser.newPage({ width: 1840, height: rows * tileH + 12, dsf: 1 });
    await sheet.goto(pathToFileURL(sheetHtml).href, { settleMs: 700 });
    await sheet.screenshot({ path: resolve(opt.out, `sheet-${kind}.jpg`), quality: 72 });
    await sheet.close();
  }
  console.log(`film : ${tiles.load.length} image(s) au chargement, ${tiles.scroll.length} au défilement, ${errors.length} erreur(s) console → ${opt.out}`);
} finally {
  await browser.close();
}
