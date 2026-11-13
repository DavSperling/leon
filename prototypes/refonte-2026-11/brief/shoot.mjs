#!/usr/bin/env node
// Captures d'écran sans tête (Chrome installé, aucun paquet). S'appuie sur le client CDP du skill Taste.
//
//   node shoot.mjs --out DIR [--base URL] [--width 1440] [--height 900] [--theme light|dark]
//                  [--login EMAIL] [--slices 12] [--full] [--settle 1800] [--dsf 1] name=/chemin name2=https://... name3=/abs/fichier.html
//
// - name=cible : cible = chemin relatif à --base, URL absolue, ou fichier .html local (servi en file://).
// - --login : se connecte d'abord sur --base (mot de passe dans la variable SHOOT_PASSWORD).
// - Par cible : NAME-01.jpg, NAME-02.jpg… (une capture par hauteur d'écran, jusqu'à --slices), et NAME-full.jpg avec --full.
// - Écrit aussi DIR/NAME.json (titre, hauteur de page, tailles et polices des titres, couleurs les plus présentes).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Browser, sleep } from '/Users/david/.claude/skills/design-taste-frontend/scripts/lib/cdp.mjs';

const args = process.argv.slice(2);
const opt = { out: '.', base: '', width: 1440, height: 900, theme: '', login: '', slices: 12, full: false, settle: 1800, dsf: 1 };
const targets = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--full') opt.full = true;
  else if (a.startsWith('--')) opt[a.slice(2)] = args[++i];
  else {
    const eq = a.indexOf('=');
    if (eq < 1) throw new Error(`cible attendue sous la forme nom=chemin : ${a}`);
    targets.push([a.slice(0, eq), a.slice(eq + 1)]);
  }
}
for (const k of ['width', 'height', 'slices', 'settle', 'dsf']) opt[k] = Number(opt[k]);
if (!targets.length) throw new Error('aucune cible');
mkdirSync(opt.out, { recursive: true });

const urlOf = (t) => {
  if (/^https?:\/\//.test(t)) return t;
  if (t.endsWith('.html') && (isAbsolute(t) || !opt.base)) return pathToFileURL(resolve(t)).href;
  return opt.base.replace(/\/$/, '') + (t.startsWith('/') ? t : `/${t}`);
};

// Un dossier de profils par lancement : le ménage du client CDP ne touche pas aux Chrome des autres lancements.
process.env.TASTE_SKILL_TMP = mkdtempSync(resolve(tmpdir(), 'shoot-'));
const browser = await Browser.launch({ width: opt.width, height: opt.height });
const page = await browser.newPage({ width: opt.width, height: opt.height, dsf: opt.dsf, mobile: opt.width < 600 });
try {
  if (opt.theme) {
    await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: opt.theme }] });
    await page.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try{localStorage.setItem('leon-theme',${JSON.stringify(opt.theme)})}catch(e){}`,
    });
  }
  if (opt.login) {
    const password = process.env.SHOOT_PASSWORD;
    if (!password) throw new Error('SHOOT_PASSWORD manquant');
    // Le formulaire de connexion est une action serveur : on remplit les champs et on l'envoie.
    await page.goto(urlOf('/connexion'), { settleMs: 2500 });
    await page.eval(
      ({ email, password }) => {
        const set = (name, value) => {
          const el = document.querySelector(`input[name="${name}"]`);
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
        };
        set('email', email);
        set('password', password);
        document.querySelector('input[name="password"]').form.requestSubmit();
      },
      { email: opt.login, password },
    );
    let where = '';
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      where = await page.eval(() => location.pathname).catch(() => '');
      if (where && where !== '/connexion') break;
    }
    if (!where || where === '/connexion') throw new Error('connexion refusée (toujours sur /connexion)');
    await sleep(1200);
  }
  for (const [name, target] of targets) {
    const url = urlOf(target);
    const how = await page.goto(url, { settleMs: opt.settle });
    // Faire défiler toute la page une fois : les sections qui s'animent à l'entrée prennent leur état final.
    const total = await page.eval(() => Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));
    await page.wheel(total, { step: 400, pauseMs: 30 });
    await sleep(400);
    // Revenir en haut, y compris dans les zones qui défilent à l'intérieur de la page (coque de l'appli).
    await page.eval(() => {
      window.scrollTo(0, 0);
      for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0;
    });
    await sleep(500);
    const info = await page.eval(() => {
      const px = (v) => Math.round(parseFloat(v) * 10) / 10;
      const heads = [...document.querySelectorAll('h1,h2,h3')].slice(0, 40).map((h) => {
        const s = getComputedStyle(h);
        return { tag: h.tagName, text: h.textContent.trim().slice(0, 90), size: px(s.fontSize), weight: s.fontWeight, font: s.fontFamily.split(',')[0].replace(/["']/g, '') };
      });
      const count = {};
      for (const el of document.querySelectorAll('body *')) {
        const s = getComputedStyle(el);
        for (const c of [s.backgroundColor, s.color]) if (c && c !== 'rgba(0, 0, 0, 0)') count[c] = (count[c] || 0) + 1;
      }
      const colours = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 12);
      const words = (document.body.innerText || '').trim().split(/\s+/).length;
      return {
        title: document.title,
        height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        words,
        sections: document.querySelectorAll('main section, main > div > section').length,
        bodyFont: getComputedStyle(document.body).fontFamily.split(',')[0].replace(/["']/g, ''),
        bodySize: px(getComputedStyle(document.body).fontSize),
        heads,
        colours,
      };
    });
    info.url = url;
    info.loaded = how;
    info.viewport = `${opt.width}x${opt.height}`;
    info.consoleErrors = page.consoleErrors.splice(0);
    writeFileSync(resolve(opt.out, `${name}.json`), JSON.stringify(info, null, 2));
    const n = Math.min(opt.slices, Math.max(1, Math.ceil(info.height / opt.height)));
    for (let i = 0; i < n; i++) {
      const y = Math.min(i * opt.height, Math.max(0, info.height - opt.height));
      await page.eval((yy) => window.scrollTo(0, yy), y);
      await sleep(350);
      await page.screenshot({ path: resolve(opt.out, `${name}-${String(i + 1).padStart(2, '0')}.jpg`), quality: 78 });
    }
    if (opt.full) {
      await page.eval(() => window.scrollTo(0, 0));
      await sleep(200);
      await page.screenshot({ path: resolve(opt.out, `${name}-full.jpg`), quality: 70, fullPage: true });
    }
    console.log(`${name}: ${n} capture(s), page de ${info.height}px, ${info.words} mots, h1 ${info.heads.find((h) => h.tag === 'H1')?.size ?? '?'}px — ${url}`);
  }
} finally {
  await browser.close();
}
