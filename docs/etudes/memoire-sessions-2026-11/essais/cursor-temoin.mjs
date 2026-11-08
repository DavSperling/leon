#!/usr/bin/env node
// Le crochet témoin de l'essai réel de Cursor (T26 du plan mémoire des sessions), sur le modèle de celui
// d'Antigravity (annexe 05). Node seul, sans dépendance. Il ne note que la forme de ce que Cursor envoie (les clés, les
// types, les booléens et les nombres, les chemins, les identifiants et les versions), jamais un texte de conversation :
// d'un texte, seulement sa longueur.
//
//   node cursor-temoin.mjs installer [--sans-session] [--delai <s>]
//        ajoute les entrées du témoin à ~/.cursor/hooks.json (copie avant). --sans-session n'y met pas sessionStart ni
//        sessionEnd (si Cursor refuse le fichier à cause d'eux) ; --delai fait attendre le témoin avant de répondre
//   node cursor-temoin.mjs rapport     ce que le témoin a noté, et la forme des transcripts récents
//   node cursor-temoin.mjs retirer     retire les entrées du témoin
//   node cursor-temoin.mjs crochet <évènement>   ce que Cursor lance (ne pas l'appeler à la main)
//
// Les deux mots témoins : sessionStart injecte CORMORAN-7 par `additional_context`, beforeSubmitPrompt injecte
// PELICAN-3 par `additional_context` (avec `continue: true`), au premier message de chaque conversation. Demander au
// modèle quels mots témoins il connaît dit quel crochet atteint le modèle.
import { appendFile, copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const HOOKS = join(HOME, '.cursor', 'hooks.json');
const LOG_DIR = join(HOME, '.leon-essai');
const LOG = join(LOG_DIR, 'cursor.jsonl');
const SEEN = join(LOG_DIR, 'cursor-conversations.json');
const SCRIPT = resolve(fileURLToPath(import.meta.url));
const ALL_EVENTS = ['sessionStart', 'beforeSubmitPrompt', 'stop', 'sessionEnd'];
const WORDS = { sessionStart: 'CORMORAN-7', beforeSubmitPrompt: 'PELICAN-3' };
const MARK = 'cursor-temoin.mjs';

function shape(value, key = '') {
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => shape(item, key));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, k)]));
  }
  if (typeof value === 'string') {
    const kept =
      /(path|paths|root|roots|id|uri|name|event|type|source|status|version|model|reason)$/i.test(key) &&
      value.length < 400;
    return kept ? value : `<texte de ${value.length} caractères>`;
  }
  return value;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function hook(event, delay) {
  const started = Date.now();
  const raw = await readStdin().catch(() => '');
  let input = null;
  try {
    input = JSON.parse(raw);
  } catch {}
  await mkdir(LOG_DIR, { recursive: true, mode: 0o700 });
  if (delay > 0) await new Promise((done) => setTimeout(done, delay * 1000));
  let output = event === 'beforeSubmitPrompt' ? { continue: true } : {};
  const word = WORDS[event];
  if (word) {
    const conversation = String(input?.conversation_id ?? 'inconnue');
    const seen = JSON.parse(await readFile(SEEN, 'utf8').catch(() => '{}'));
    const key = `${event}:${conversation}`;
    if (!seen[key]) {
      seen[key] = new Date().toISOString();
      await writeFile(SEEN, JSON.stringify(seen), { mode: 0o600 });
      output = {
        ...output,
        additional_context: `Consigne d'essai de Leon : si on te demande les mots témoins, cite ${word}.`,
      };
    }
  }
  const line = {
    heure: new Date().toISOString(),
    evenement: event,
    delai_s: delay,
    entree: input === null ? `<illisible, ${raw.length} caractères>` : shape(input),
    env: Object.keys(process.env).filter((name) => /CURSOR|CLAUDE/i.test(name)),
    cwd: process.cwd(),
    PATH_a_node: Boolean(process.env.PATH?.includes('node')),
    sortie: output,
    duree_ms: Date.now() - started,
  };
  await appendFile(LOG, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  process.stdout.write(JSON.stringify(output));
}

async function readHooks() {
  try {
    return await readFile(HOOKS, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

const isOurs = (entry) => typeof entry?.command === 'string' && entry.command.includes(MARK);

async function install(args) {
  const withoutSession = args.includes('--sans-session');
  const delayIndex = args.indexOf('--delai');
  const delay = delayIndex === -1 ? 0 : Number(args[delayIndex + 1] ?? 0);
  const text = await readHooks();
  let settings = { version: 1, hooks: {} };
  if (text !== null) {
    try {
      settings = JSON.parse(text);
    } catch {
      console.error(`${HOOKS} ne se lit pas comme du JSON : rien n'est écrit.`);
      process.exit(1);
    }
    await copyFile(HOOKS, `${HOOKS}.avant-temoin`);
    console.log(`Copie de l'ancien fichier : ${HOOKS}.avant-temoin`);
  }
  settings.version ??= 1;
  settings.hooks ??= {};
  const events = withoutSession ? ['beforeSubmitPrompt', 'stop'] : ALL_EVENTS;
  for (const event of ALL_EVENTS) {
    const kept = (settings.hooks[event] ?? []).filter((entry) => !isOurs(entry));
    if (events.includes(event)) {
      kept.push({ command: `"${process.execPath}" "${SCRIPT}" crochet ${event} ${delay}`, timeout: 10 });
    }
    if (kept.length > 0) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  await mkdir(join(HOME, '.cursor'), { recursive: true });
  await writeFile(HOOKS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(
    `Témoin ajouté à ${HOOKS} (${events.join(', ')}, délai ${delay} s). Relancez Cursor si les crochets ne tournent pas.`,
  );
}

async function uninstall() {
  const text = await readHooks();
  if (text === null) return console.log('Aucun fichier de crochets : rien à retirer.');
  const settings = JSON.parse(text);
  for (const [event, entries] of Object.entries(settings.hooks ?? {})) {
    const kept = Array.isArray(entries) ? entries.filter((entry) => !isOurs(entry)) : entries;
    if (Array.isArray(kept) && kept.length === 0) delete settings.hooks[event];
    else settings.hooks[event] = kept;
  }
  await writeFile(HOOKS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Témoin retiré de ${HOOKS}. Le journal reste dans ${LOG} (à effacer à la main).`);
}

// Les transcripts récents de ~/.cursor/projects/*/agent-transcripts : leur chemin, leur taille, la forme de leurs lignes
// (clés, rôles, types de blocs, outils et noms de leurs arguments), et où apparaissent les mots témoins. Jamais leur
// contenu.
async function transcripts() {
  const found = [];
  const projects = join(HOME, '.cursor', 'projects');
  for (const project of await readdir(projects).catch(() => [])) {
    const base = join(projects, project, 'agent-transcripts');
    for (const entry of await readdir(base, { recursive: true }).catch(() => [])) {
      if (!String(entry).endsWith('.jsonl')) continue;
      const path = join(base, String(entry));
      const info = await stat(path).catch(() => null);
      if (info?.isFile()) found.push({ path, mtime: info.mtimeMs, size: info.size });
    }
  }
  return found.sort((a, b) => b.mtime - a.mtime).slice(0, 4);
}

async function report() {
  const lines = (await readFile(LOG, 'utf8').catch(() => ''))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  console.log(`# Ce que le témoin a noté (${lines.length} appels)\n`);
  if (lines.length === 0) {
    console.log(
      `Aucun appel : Cursor n'a lancé aucun crochet de ${HOOKS}. Il ne lit pas ce fichier, ne l'a pas relu, ou l'a refusé (essayer \`installer --sans-session\`).`,
    );
  }
  const byEvent = new Map();
  for (const line of lines) byEvent.set(line.evenement, [...(byEvent.get(line.evenement) ?? []), line]);
  for (const [event, calls] of byEvent) {
    console.log(
      `## ${event} : ${calls.length} appel(s), ${Math.max(...calls.map((c) => c.duree_ms))} ms au plus, délai ${calls[0].delai_s} s`,
    );
    console.log(JSON.stringify(calls[0].entree, null, 2));
    const keys = new Set(calls.flatMap((c) => Object.keys(c.entree ?? {})));
    console.log(`clés vues sur tous les appels : ${[...keys].join(', ')}`);
    console.log(
      `variables d'environnement : ${calls[0].env.join(', ') || 'aucune'} · dossier : ${calls[0].cwd} · node dans le PATH : ${calls[0].PATH_a_node}\n`,
    );
  }
  console.log('# Les transcripts les plus récents\n');
  const recent = await transcripts();
  if (recent.length === 0) console.log('Aucun transcript sous ~/.cursor/projects/*/agent-transcripts/.');
  for (const file of recent) {
    const raws = (await readFile(file.path, 'utf8')).split('\n').filter(Boolean);
    const keys = new Set();
    const roles = new Map();
    const blocks = new Map();
    const tools = new Map();
    const argKeys = new Map();
    const others = new Map();
    const wrapped = { query: 0, sans: 0 };
    const witnesses = [];
    for (const raw of raws) {
      let line;
      try {
        line = JSON.parse(raw);
      } catch {
        continue;
      }
      for (const key of Object.keys(line)) keys.add(key);
      if (line.role) roles.set(line.role, (roles.get(line.role) ?? 0) + 1);
      else if (line.type) {
        const kind = `${line.type}${line.status ? `:${line.status}` : ''}`;
        others.set(kind, (others.get(kind) ?? 0) + 1);
      }
      const content = line.message?.content;
      for (const block of Array.isArray(content) ? content : []) {
        blocks.set(block.type, (blocks.get(block.type) ?? 0) + 1);
        if (block.type === 'tool_use') {
          tools.set(block.name, (tools.get(block.name) ?? 0) + 1);
          const names = argKeys.get(block.name) ?? new Set();
          if (typeof block.input === 'string') names.add('<texte>');
          else for (const name of Object.keys(block.input ?? {})) names.add(name);
          argKeys.set(block.name, names);
        }
        if (line.role === 'user' && block.type === 'text') {
          if (block.text.includes('<user_query>')) wrapped.query += 1;
          else wrapped.sans += 1;
        }
      }
      for (const word of Object.values(WORDS)) {
        if (raw.includes(word)) witnesses.push(`${word} dans une ligne ${line.role ?? line.type}`);
      }
    }
    console.log(`## ${file.path} (${file.size} octets, ${raws.length} lignes)`);
    console.log(`clés des lignes : ${[...keys].join(', ')}`);
    console.log(`rôles : ${[...roles].map(([r, n]) => `${r} ×${n}`).join(', ') || 'aucun'}`);
    console.log(`autres lignes : ${[...others].map(([t, n]) => `${t} ×${n}`).join(', ') || 'aucune'}`);
    console.log(`types de blocs : ${[...blocks].map(([t, n]) => `${t} ×${n}`).join(', ') || 'aucun'}`);
    console.log(`messages user : ${wrapped.query} dans <user_query>, ${wrapped.sans} sans`);
    console.log(`outils appelés : ${[...tools].map(([t, n]) => `${t} ×${n}`).join(', ') || 'aucun'}`);
    for (const [tool, names] of argKeys) console.log(`  arguments de ${tool} : ${[...names].join(', ') || 'aucun'}`);
    console.log(`mots témoins dans le transcript : ${witnesses.join(' ; ') || 'aucun'}\n`);
  }
}

const [command, ...rest] = process.argv.slice(2);
if (command === 'crochet') await hook(rest[0], Number(rest[1] ?? 0));
else if (command === 'installer') await install(rest);
else if (command === 'retirer') await uninstall();
else if (command === 'rapport') await report();
else console.log('Usage : node cursor-temoin.mjs installer [--sans-session] [--delai <s>] | rapport | retirer');
