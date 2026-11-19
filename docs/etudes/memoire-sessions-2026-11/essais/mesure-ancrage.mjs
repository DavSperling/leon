#!/usr/bin/env node
// Mesure de l'ancrage (T38 du plan mère, lot 11) : chaque tâche de mesure-ancrage-taches.json tourne trois fois, avec
// Claude Code en mode non interactif (`claude -p`), le même modèle et le même effort :
//   A : sans mémoire (ni bloc de démarrage, ni rappel, ni commandes de lecture de Leon) ;
//   B : avec le bloc de démarrage de Leon (le crochet SessionStart posé par l'installation) ;
//   C : avec le bloc et le rappel à chaque message (SessionStart et UserPromptSubmit).
// Chaque passage tourne dans un clone jetable du dépôt, au même commit, sous ~/leon-mesure/clones, avec une liste
// fermée d'outils et de commandes (permis) : pas de shell libre, ni push, ni gh, ni web, ni lecture des secrets du
// poste. Aucune de ces sessions n'est captée par Leon : le crochet de fin
// n'est jamais posé, les réglages de l'utilisateur ne sont pas lus (`--setting-sources project,local`), et
// `leon note` est refusé dans les trois cas, pour qu'un passage n'écrive rien dans la mémoire que lirait le suivant.
// Ce qui est gardé, sous ~/leon-mesure/sorties/<tâche>/<cas> : la sortie JSON de `claude -p` (tokens, durée, nombre de
// tours, coût), la réponse en texte, et le patch du clone. Aucune conversation de l'utilisateur n'est lue.
//
//   node mesure-ancrage.mjs lancer [--taches t01,t06] [--cas A,B,C] [--parallele 3] [--commit <sha>]
//   node mesure-ancrage.mjs sonde        vérifie, à bas coût, que le bloc et le rappel arrivent bien en mode -p
//   node mesure-ancrage.mjs bilan        tokens, durée et tours, par tâche et par cas
//   node mesure-ancrage.mjs aveugle      la page de notation, réponses mélangées, sans dire leur cas
import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const REPO = join(HOME, 'leon');
const BASE = process.env.MESURE_DIR ?? join(HOME, 'leon-mesure');
const LEON = join(HOME, '.leon', 'bin', 'leon');
const ORIGIN = 'https://github.com/DavSperling/leon.git';
const ICI = dirname(fileURLToPath(import.meta.url));
const TACHES = join(ICI, 'mesure-ancrage-taches.json');
const DELAI_MS = 40 * 60 * 1000;
const CAS = ['A', 'B', 'C'];

// Un processus, sa sortie et son code ; jamais d'interpréteur de shell entre nous et lui.
function run(cmd, args, { cwd, input, env, timeout } = {}) {
  return new Promise((done) => {
    const child = spawn(cmd, args, { cwd, env: env ?? process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = timeout ? setTimeout(() => child.kill('SIGTERM'), timeout) : null;
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      done({ code, stdout, stderr });
    });
    child.stdin.end(input ?? '');
  });
}

// L'environnement des passages : sans LEON_URL ni LEON_TOKEN, qui feraient passer la CLI par un autre compte que la
// connexion de l'ordinateur (~/.leon/connexion.json), et sans CLAUDE_CONFIG_DIR.
function envPassage() {
  const env = { ...process.env };
  for (const name of ['LEON_URL', 'LEON_TOKEN', 'CLAUDE_CONFIG_DIR']) delete env[name];
  return env;
}

const crochet = (command, timeout) => [{ hooks: [{ type: 'command', command, timeout }] }];

// Le bac à sable de Claude Code, le même dans les trois cas : les commandes permises (tests, contrôle des types)
// exécutent du code du dépôt, que l'agent peut écrire. Elles tournent donc sans réseau, et n'écrivent que dans le
// clone ; les ports locaux restent permis pour les tests. Seules les commandes de lecture de Leon en sortent (elles
// joignent son serveur ; `leon note` reste refusé), et l'agent ne peut pas demander à en sortir.
const bacASable = () => ({
  enabled: true,
  failIfUnavailable: true,
  allowUnsandboxedCommands: false,
  excludedCommands: LECTURES_LEON_COMMANDES(),
  network: { allowLocalBinding: true },
});

// Les réglages d'un cas, passés par --settings : le bac à sable, et seuls les crochets de Leon du cas.
function reglages(cas) {
  if (cas === 'A') return { disableAllHooks: true, sandbox: bacASable() };
  const hooks = { SessionStart: crochet(`${LEON} briefing`, 10) };
  if (cas === 'C') hooks.UserPromptSubmit = crochet(`${LEON} reminder`, 5);
  return { hooks, sandbox: bacASable() };
}

// Ce que l'agent d'un passage peut faire, et rien d'autre : en mode `acceptEdits`, il modifie les fichiers du clone ;
// une commande hors de cette liste est refusée sans question (mode -p). Pas de shell libre : un `node -e`, un
// `python` ou un `find -delete` pourraient aller sur le réseau, lire un jeton ou effacer. En B et C s'ajoutent les
// commandes de lecture de Leon (jamais `leon note`).
const LECTURES_LEON = ['threads', 'thread', 'search', 'versions', 'lessons'];
function LECTURES_LEON_COMMANDES() {
  // Avec et sans arguments : `leon threads` seul ne correspond pas à `leon threads *`.
  return LECTURES_LEON.flatMap((c) =>
    [LEON, '~/.leon/bin/leon'].flatMap((bin) => [`${bin} ${c}`, `${bin} ${c} *`]),
  );
}
function permis(cas) {
  const outils = ['Read', 'Edit', 'Write', 'MultiEdit', 'Glob', 'Grep', 'TodoWrite', 'Task', 'Agent'];
  const commandes = [
    'pnpm typecheck',
    'pnpm lint',
    'pnpm exec vitest run:*',
    'pnpm exec biome:*',
    'pnpm exec tsc:*',
    'git status:*',
    'git diff:*',
    'git log:*',
    'git show:*',
    'git grep:*',
    'git blame:*',
    'ls:*',
    'wc:*',
  ];
  const leon =
    cas === 'A'
      ? []
      : LECTURES_LEON.flatMap((c) => [`${LEON} ${c}:*`, `~/.leon/bin/leon ${c}:*`]);
  return [...outils, ...[...commandes, ...leon].map((c) => `Bash(${c})`)];
}

// Refusé dans tous les cas, en plus de tout ce qui n'est pas permis : le web, l'écriture d'une note, et la lecture des
// secrets du poste (connexion de Leon, clés SSH, réglages de Claude Code, .env.local).
function refuses() {
  return [
    'WebFetch',
    'WebSearch',
    `Bash(${LEON} note:*)`,
    'Bash(~/.leon/bin/leon note:*)',
    ...['Read', 'Grep', 'Glob'].flatMap((outil) =>
      ['~/.leon/**', '~/.ssh/**', '~/.claude.json', '~/.claude/**', '~/.aws/**', '**/.env.local'].map(
        (chemin) => `${outil}(${chemin})`,
      ),
    ),
  ];
}

async function chargerTaches() {
  return JSON.parse(await readFile(TACHES, 'utf8'));
}

function options(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) out[argv[i].replace(/^--/, '')] = argv[i + 1];
  return out;
}

async function commitDeMain() {
  await run('git', ['-C', REPO, 'fetch', '--quiet', 'origin']);
  const { stdout } = await run('git', ['-C', REPO, 'rev-parse', 'origin/main']);
  return stdout.trim();
}

// Un clone jetable, au commit voulu, avec l'adresse GitHub du dépôt (la clé du projet de Leon) et le push coupé.
async function preparer(tache, cas, commit) {
  const dir = join(BASE, 'clones', `${tache.id}-${cas}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dirname(dir), { recursive: true });
  for (const [cmd, args, cwd] of [
    ['git', ['clone', '--quiet', REPO, dir]],
    ['git', ['checkout', '--quiet', commit], dir],
    ['git', ['switch', '--quiet', '-c', `mesure/${tache.id}`], dir],
    ['git', ['remote', 'set-url', 'origin', ORIGIN], dir],
    ['git', ['remote', 'set-url', '--push', 'origin', 'PUSH_COUPE'], dir],
  ]) {
    const r = await run(cmd, args, { cwd });
    if (r.code !== 0) throw new Error(`${cmd} ${args.join(' ')} : ${r.stderr.trim()}`);
  }
  const installe = await run('pnpm', ['install', '--frozen-lockfile', '--offline', '--silent'], { cwd: dir });
  if (installe.code !== 0) {
    const r = await run('pnpm', ['install', '--frozen-lockfile', '--silent'], { cwd: dir });
    if (r.code !== 0) throw new Error(`pnpm install : ${r.stderr.trim().slice(0, 300)}`);
  }
  return dir;
}

function argsClaude(cas, reglage) {
  return [
    '-p',
    '--model',
    reglage.modele,
    '--effort',
    reglage.effort,
    '--output-format',
    'json',
    '--setting-sources',
    'project,local',
    '--settings',
    JSON.stringify(reglages(cas)),
    '--strict-mcp-config',
    '--permission-mode',
    'acceptEdits',
    '--no-session-persistence',
    '--max-turns',
    '80',
    '--allowedTools',
    ...permis(cas),
    '--disallowedTools',
    ...refuses(),
  ];
}

async function passage(tache, cas, commit, plan) {
  const sortie = join(BASE, 'sorties', tache.id);
  await mkdir(sortie, { recursive: true });
  const dir = await preparer(tache, cas, commit);
  const consigne = `${tache.consigne}\n\n${plan.suffixes[tache.nature]}`;
  const version = (await run('claude', ['--version'])).stdout.trim();
  const debut = new Date();
  // La consigne passe par l'entrée standard : --disallowedTools prend tous les mots qui le suivent.
  const r = await run('claude', argsClaude(cas, plan.reglage), {
    cwd: dir,
    input: consigne,
    env: envPassage(),
    timeout: DELAI_MS,
  });
  const fin = new Date();
  let resultat = null;
  try {
    resultat = JSON.parse(r.stdout);
  } catch {
    // Une sortie qui n'est pas du JSON (délai dépassé, erreur) : gardée telle quelle dans le méta.
  }
  await run('git', ['add', '-A'], { cwd: dir });
  const patch = (await run('git', ['diff', '--cached'], { cwd: dir })).stdout;
  const meta = {
    tache: tache.id,
    cas,
    commit,
    outil: version,
    modele: plan.reglage.modele,
    effort: plan.reglage.effort,
    debut: debut.toISOString(),
    fin: fin.toISOString(),
    code: r.code,
    erreur: resultat ? null : (r.stderr || r.stdout).slice(-2000),
    resultat,
  };
  await writeFile(join(sortie, `${cas}.json`), `${JSON.stringify(meta, null, 2)}\n`);
  await writeFile(join(sortie, `${cas}.txt`), `${resultat?.result ?? ''}\n`);
  await writeFile(join(sortie, `${cas}.patch`), patch);
  console.log(
    `${tache.id} ${cas} : ${resultat ? `${Math.round((resultat.duration_ms ?? 0) / 1000)} s, ${resultat.num_turns ?? '?'} tours` : `échec (code ${r.code})`}`,
  );
}

async function lancer(argv) {
  const opt = options(argv);
  const plan = await chargerTaches();
  const ids = opt.taches ? opt.taches.split(',') : plan.taches.map((t) => t.id);
  const cas = opt.cas ? opt.cas.split(',') : CAS;
  const parallele = Number(opt.parallele ?? 3);
  const commit = opt.commit ?? (await commitDeMain());
  console.log(`commit ${commit}, ${ids.length} tâches × ${cas.length} cas, ${parallele} à la fois`);
  const file = ids.flatMap((id) => cas.map((c) => [plan.taches.find((t) => t.id === id), c]));
  if (file.some(([t]) => !t)) throw new Error('tâche inconnue');
  const ouvriers = Array.from({ length: parallele }, async () => {
    for (let job = file.shift(); job; job = file.shift()) {
      try {
        await passage(job[0], job[1], commit, plan);
      } catch (error) {
        console.log(`${job[0].id} ${job[1]} : préparation en échec, ${error.message}`);
      }
    }
  });
  await Promise.all(ouvriers);
}

// Une consigne courte et bon marché, qui demande seulement si le contexte porte un bloc de Leon : de quoi vérifier
// que les crochets jouent bien en mode -p, avant les 30 passages.
async function sonde() {
  const plan = await chargerTaches();
  const commit = await commitDeMain();
  const tache = { id: 'sonde', nature: 'question' };
  for (const cas of CAS) {
    const dir = join(BASE, 'clones', `sonde-${cas}`);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dirname(dir), { recursive: true });
    await run('git', ['clone', '--quiet', REPO, dir]);
    await run('git', ['checkout', '--quiet', commit], { cwd: dir });
    await run('git', ['switch', '--quiet', '-c', `mesure/${tache.id}`], { cwd: dir });
    await run('git', ['remote', 'set-url', 'origin', ORIGIN], { cwd: dir });
    await run('git', ['remote', 'set-url', '--push', 'origin', 'PUSH_COUPE'], { cwd: dir });
    const reglage = { modele: 'claude-sonnet-5-5', effort: 'low' };
    const r = await run('claude', [...argsClaude(cas, reglage), '--max-turns', '1'], {
      cwd: dir,
      input:
        'Sans lancer aucun outil, réponds sur trois lignes : 1) oui ou non, ton contexte contient-il un bloc <contexte-leon> ? 2) oui ou non, un bloc <rappel-leon> ? 3) combien de fils ce bloc liste-t-il (un nombre, ou 0) ? Je parle de la mémoire de Leon, de la base de code, de la migration vers AWS et du lot 11.',
      env: envPassage(),
      timeout: 5 * 60 * 1000,
    });
    let texte = r.stdout;
    try {
      texte = JSON.parse(r.stdout).result;
    } catch {}
    console.log(`--- ${cas}\n${texte.trim()}`);
    await rm(dir, { recursive: true, force: true });
  }
  void plan;
}

async function lire(id, cas) {
  const fichier = join(BASE, 'sorties', id, `${cas}.json`);
  return existsSync(fichier) ? JSON.parse(await readFile(fichier, 'utf8')) : null;
}

async function bilan() {
  const plan = await chargerTaches();
  const lignes = ['tâche cas  durée_s  tours  entrée  cache_lu  cache_écrit  sortie  coût_usd'];
  for (const tache of plan.taches) {
    for (const cas of CAS) {
      const m = await lire(tache.id, cas);
      const r = m?.resultat;
      if (!r) {
        lignes.push(`${tache.id}  ${cas}   —`);
        continue;
      }
      const u = r.usage ?? {};
      lignes.push(
        [
          tache.id,
          ` ${cas}`,
          Math.round((r.duration_ms ?? 0) / 1000),
          r.num_turns,
          u.input_tokens,
          u.cache_read_input_tokens,
          u.cache_creation_input_tokens,
          u.output_tokens,
          r.total_cost_usd?.toFixed(2),
        ].join('  '),
      );
    }
  }
  console.log(lignes.join('\n'));
}

const echapper = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

// La page de notation : pour chaque tâche, ses trois réponses dans un ordre tiré au hasard, nommées X, Y, Z. La
// correspondance va dans un fichier à part, que la page ne lit pas. Les notes restent dans le navigateur
// (localStorage), et un bouton les copie.
async function aveugle() {
  const plan = await chargerTaches();
  const correspondance = {};
  const blocs = [];
  for (const tache of plan.taches) {
    const ordre = [...CAS];
    for (let i = ordre.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
    }
    correspondance[tache.id] = Object.fromEntries(ordre.map((cas, i) => ['XYZ'[i], cas]));
    const reponses = [];
    for (const [i, cas] of ordre.entries()) {
      const nom = 'XYZ'[i];
      const texte = existsSync(join(BASE, 'sorties', tache.id, `${cas}.txt`))
        ? await readFile(join(BASE, 'sorties', tache.id, `${cas}.txt`), 'utf8')
        : '(pas de réponse)';
      const patch = existsSync(join(BASE, 'sorties', tache.id, `${cas}.patch`))
        ? await readFile(join(BASE, 'sorties', tache.id, `${cas}.patch`), 'utf8')
        : '';
      reponses.push(`<section class="reponse"><h3>Réponse ${nom}</h3><pre class="texte">${echapper(texte)}</pre>
${patch ? `<details><summary>Le patch (${patch.split('\n').length} lignes)</summary><pre class="patch">${echapper(patch)}</pre></details>` : ''}
<div class="note" data-cle="${tache.id}-${nom}">${['juste', 'faux', 'ancré sur un résumé périmé'].map((n) => `<label><input type="radio" name="${tache.id}-${nom}" value="${n}"> ${n}</label>`).join(' ')}
<input type="text" placeholder="remarque (facultatif)" data-remarque="${tache.id}-${nom}"></div></section>`);
    }
    blocs.push(`<article><h2>${tache.id} · ${echapper(tache.titre)}</h2><p class="consigne">${echapper(tache.consigne)}</p>
<details><summary>Ce qui fait une bonne réponse</summary><p>${echapper(tache.bonne_reponse)}</p></details>${reponses.join('\n')}</article>`);
  }
  await writeFile(join(BASE, 'correspondance.json'), `${JSON.stringify(correspondance, null, 2)}\n`);
  const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Notation à l'aveugle</title><style>
:root{--fond:#fff;--texte:#1a1a1a;--doux:#666;--cadre:#ddd;--zone:#f6f6f6}
@media (prefers-color-scheme:dark){:root{--fond:#161616;--texte:#eee;--doux:#aaa;--cadre:#333;--zone:#202020}}
body{background:var(--fond);color:var(--texte);font:15px/1.5 system-ui,sans-serif;max-width:960px;margin:0 auto;padding:16px}
article{border-top:2px solid var(--cadre);padding:16px 0}.consigne{color:var(--doux)}
.reponse{border:1px solid var(--cadre);border-radius:8px;padding:8px 12px;margin:12px 0}
pre{white-space:pre-wrap;background:var(--zone);padding:8px;border-radius:6px;overflow:auto}
.patch{max-height:420px;font-size:12px}.note label{margin-right:12px}.note input[type=text]{width:100%;margin-top:6px}
#copier{position:sticky;top:8px;float:right}
</style></head><body><button id="copier">Copier mes notes</button><h1>Notation à l'aveugle</h1>
<p>Pour chaque tâche, trois réponses dans un ordre tiré au hasard. Note chacune : juste, faux, ou ancrée sur un résumé périmé. Tes choix restent dans ce navigateur.</p>
${blocs.join('\n')}
<script>
const CLE='notation-lot11';let notes={};try{notes=JSON.parse(localStorage.getItem(CLE)||'{}')}catch{}
const garder=()=>{try{localStorage.setItem(CLE,JSON.stringify(notes))}catch{}};
for(const r of document.querySelectorAll('input[type=radio]')){if(notes[r.name]?.note===r.value)r.checked=true;r.addEventListener('change',()=>{notes[r.name]={...notes[r.name],note:r.value};garder()})}
for(const t of document.querySelectorAll('[data-remarque]')){const k=t.dataset.remarque;t.value=notes[k]?.remarque||'';t.addEventListener('input',()=>{notes[k]={...notes[k],remarque:t.value};garder()})}
window.notesLot11=()=>notes;
document.getElementById('copier').onclick=()=>navigator.clipboard.writeText(JSON.stringify(notes,null,2));
</script></body></html>`;
  await writeFile(join(BASE, 'notation.html'), page);
  console.log(`${join(BASE, 'notation.html')} (correspondance dans ${join(BASE, 'correspondance.json')})`);
}

// Les vérifications objectives d'une tâche à coder, par cas : le contrôle des types, et les fichiers de test que le
// patch touche. Elles exécutent du code écrit par l'agent : sous sandbox-exec (macOS), sans réseau sauf l'adresse
// locale, et n'écrivant que dans le clone et les dossiers temporaires.
const profil = (dir) =>
  [
    '(version 1)',
    '(allow default)',
    '(deny network*)',
    '(allow network* (local ip "localhost:*") (remote ip "localhost:*") (remote unix-socket))',
    '(deny file-write*)',
    `(allow file-write* (subpath "${dir}") (subpath "/private/tmp") (subpath "/private/var/folders") (literal "/dev/null") (literal "/dev/tty"))`,
  ].join('');

async function verifier() {
  const plan = await chargerTaches();
  for (const tache of plan.taches.filter((t) => t.nature === 'code')) {
    for (const cas of CAS) {
      const dir = join(BASE, 'clones', `${tache.id}-${cas}`);
      if (!existsSync(dir)) continue;
      const fichiers = (await run('git', ['diff', '--cached', '--name-only'], { cwd: dir })).stdout
        .split('\n')
        .filter((f) => /\.test\.tsx?$/.test(f) && !/\.db\.test\./.test(f) && existsSync(join(dir, f)));
      const sous = (args) =>
        run('sandbox-exec', ['-p', profil(dir), 'pnpm', ...args], { cwd: dir, timeout: 10 * 60 * 1000 });
      const types = await sous(['typecheck']);
      const tests = fichiers.length
        ? await sous(['exec', 'vitest', 'run', '--project', 'unit', ...fichiers])
        : { code: null, stdout: '', stderr: '' };
      const resume = (r) => `${r.stdout}\n${r.stderr}`.split('\n').filter((l) => /Test Files|Tests |error TS|FAIL|×/.test(l)).slice(0, 15).join('\n');
      const texte = [
        `Contrôle des types (pnpm typecheck) : ${types.code === 0 ? 'passe' : `échoue (code ${types.code})`}`,
        resume(types),
        fichiers.length
          ? `Tests touchés par le patch (${fichiers.join(', ')}) : ${tests.code === 0 ? 'passent' : `échouent (code ${tests.code})`}`
          : 'Aucun fichier de test touché par le patch.',
        resume(tests),
      ].filter(Boolean).join('\n');
      await writeFile(join(BASE, 'sorties', tache.id, `${cas}.verif.txt`), `${texte}\n`);
      console.log(`${tache.id} ${cas} : types ${types.code === 0 ? 'ok' : 'KO'}, tests ${tests.code === null ? '—' : tests.code === 0 ? 'ok' : 'KO'}`);
    }
  }
}

// Le dossier des correcteurs : pour chaque tâche, la consigne, ce qui fait une bonne réponse, et les trois réponses
// sous les noms X, Y et Z de la correspondance (aveugle), avec leur patch et leurs vérifications. Rien n'y dit le cas.
async function dossier() {
  const plan = await chargerTaches();
  const correspondance = JSON.parse(await readFile(join(BASE, 'correspondance.json'), 'utf8'));
  const sortie = process.env.DOSSIER_AVEUGLE ?? join(REPO, '.claude', 'worktrees', 'notation-aveugle');
  await rm(sortie, { recursive: true, force: true });
  for (const tache of plan.taches) {
    const dir = join(sortie, tache.id);
    await mkdir(dir, { recursive: true });
    await writeFile(
      join(dir, 'consigne.md'),
      `# ${tache.id} · ${tache.titre}\n\nNature : ${tache.nature}\n\n## Consigne donnée à l'agent\n\n${tache.consigne}\n\n${plan.suffixes[tache.nature]}\n\n## Ce qui fait une bonne réponse\n\n${tache.bonne_reponse}\n`,
    );
    for (const [nom, cas] of Object.entries(correspondance[tache.id])) {
      for (const ext of ['txt', 'patch', 'verif.txt']) {
        const source = join(BASE, 'sorties', tache.id, `${cas}.${ext}`);
        if (existsSync(source)) await writeFile(join(dir, `${nom}.${ext}`), await readFile(source));
      }
    }
  }
  console.log(sortie);
}

const [commande, ...argv] = process.argv.slice(2);
const commandes = { lancer, sonde, bilan, aveugle, verifier, dossier };
if (!commandes[commande]) {
  console.log('node mesure-ancrage.mjs lancer | sonde | bilan | aveugle');
} else {
  await commandes[commande](argv);
}
