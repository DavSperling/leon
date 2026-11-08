#!/usr/bin/env node
// Le crochet témoin de l'essai réel d'Antigravity (T31 du plan mémoire des sessions), sur le modèle de celui de Codex
// (annexe 03). Node seul, sans dépendance. Il ne note que la forme de ce qu'Antigravity envoie (les clés, les types, les
// booléens et les nombres, les chemins et les identifiants), jamais un texte de conversation : d'un texte, seulement sa
// longueur.
//
//   node antigravity-temoin.mjs installer   ajoute l'entrée `leon-temoin` à ~/.gemini/config/hooks.json (copie avant)
//   node antigravity-temoin.mjs rapport     ce que le témoin a noté, et la forme des transcripts récents
//   node antigravity-temoin.mjs retirer     retire l'entrée `leon-temoin`
//   node antigravity-temoin.mjs crochet <Évènement>   ce qu'Antigravity lance (ne pas l'appeler à la main)
//
// Les deux mots témoins : SessionStart injecte CORMORAN-7 par `systemMessage` (la première forme de C5),
// PreInvocation injecte PELICAN-3 par `ephemeralMessage` (la seconde), au premier appel de chaque conversation. Demander
// au modèle quels mots témoins il connaît dit quelle forme l'atteint, et par quel crochet.
import { copyFile, mkdir, readdir, readFile, stat, writeFile, appendFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME = homedir();
const HOOKS = join(HOME, '.gemini', 'config', 'hooks.json');
const LOG_DIR = join(HOME, '.leon-essai');
const LOG = join(LOG_DIR, 'antigravity.jsonl');
const SEEN = join(LOG_DIR, 'antigravity-conversations.json');
const ENTRY = 'leon-temoin';
const SCRIPT = resolve(fileURLToPath(import.meta.url));
const EVENTS = ['SessionStart', 'PreInvocation', 'PostInvocation', 'PreToolUse', 'PostToolUse', 'Stop'];
const WORDS = { SessionStart: 'CORMORAN-7', PreInvocation: 'PELICAN-3' };
const VARIANTS = ['antigravity', 'antigravity-ide', 'antigravity-cli'];

// La forme d'une valeur : les clés et les types ; la valeur pour un booléen, un nombre, un chemin ou un identifiant ;
// la longueur seule pour tout autre texte.
function shape(value, key = '') {
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => shape(item, key));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, k)]));
  }
  if (typeof value === 'string') {
    const kept = /(path|paths|id|uri|name|event|type|source|status|version)$/i.test(key) && value.length < 400;
    return kept ? value : `<texte de ${value.length} caractères>`;
  }
  return value;
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function hook(event) {
  const started = Date.now();
  const raw = await readStdin().catch(() => '');
  let input = null;
  try {
    input = JSON.parse(raw);
  } catch {}
  await mkdir(LOG_DIR, { recursive: true, mode: 0o700 });
  let output = {};
  const word = WORDS[event];
  if (word) {
    const conversation = String(input?.conversationId ?? input?.conversation_id ?? 'inconnue');
    const seen = JSON.parse(await readFile(SEEN, 'utf8').catch(() => '{}'));
    const key = `${event}:${conversation}`;
    if (!seen[key]) {
      seen[key] = new Date().toISOString();
      await writeFile(SEEN, JSON.stringify(seen), { mode: 0o600 });
      const text = `Consigne d'essai de Leon : si on te demande les mots témoins, cite ${word}.`;
      output =
        event === 'SessionStart'
          ? { injectSteps: [{ systemMessage: { systemMessage: text } }] }
          : { injectSteps: [{ ephemeralMessage: text }] };
    }
  }
  const line = {
    heure: new Date().toISOString(),
    evenement: event,
    entree: input === null ? `<illisible, ${raw.length} caractères>` : shape(input),
    env: Object.keys(process.env).filter((name) => /ANTIGRAVITY|GEMINI|AGY/i.test(name)),
    cwd: process.cwd(),
    PATH_a_node: Boolean(process.env.PATH?.includes('node')),
    sortie: output,
    duree_ms: Date.now() - started,
  };
  await appendFile(LOG, `${JSON.stringify(line)}\n`, { mode: 0o600 });
  // `agy` 1.4 lit un `{}` de PreToolUse comme un refus de l'outil (relevé par alexherrero/crickets) : rien n'est écrit.
  if (event !== 'PreToolUse') process.stdout.write(JSON.stringify(output));
}

async function readHooks() {
  try {
    return { text: await readFile(HOOKS, 'utf8') };
  } catch (error) {
    if (error.code === 'ENOENT') return { text: null };
    throw error;
  }
}

async function install() {
  const { text } = await readHooks();
  let settings = {};
  if (text !== null) {
    try {
      settings = JSON.parse(text);
    } catch {
      console.error(`${HOOKS} ne se lit pas comme du JSON (des commentaires ?) : rien n'est écrit.`);
      process.exit(1);
    }
    await copyFile(HOOKS, `${HOOKS}.avant-temoin`);
    console.log(`Copie de l'ancien fichier : ${HOOKS}.avant-temoin`);
  }
  const command = (event) => `"${process.execPath}" "${SCRIPT}" crochet ${event}`;
  settings[ENTRY] = {
    ...Object.fromEntries(
      EVENTS.map((event) => [event, [{ type: 'command', command: command(event), timeout: 10 }]]),
    ),
    enabled: true,
  };
  await mkdir(join(HOME, '.gemini', 'config'), { recursive: true });
  await writeFile(HOOKS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Entrée « ${ENTRY} » ajoutée à ${HOOKS}. Relancez Antigravity (l'app, l'IDE ou agy).`);
}

async function uninstall() {
  const { text } = await readHooks();
  if (text === null) return console.log('Aucun fichier de crochets : rien à retirer.');
  const settings = JSON.parse(text);
  delete settings[ENTRY];
  await writeFile(HOOKS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Entrée « ${ENTRY} » retirée de ${HOOKS}. Le journal reste dans ${LOG} (à effacer à la main).`);
}

// Les transcripts récents : leur chemin, leur taille, les types d'étapes et les noms d'outils, et où apparaissent les mots
// témoins. Jamais leur contenu.
async function transcripts() {
  const found = [];
  for (const variant of VARIANTS) {
    const brain = join(HOME, '.gemini', variant, 'brain');
    for (const conversation of await readdir(brain).catch(() => [])) {
      const logs = join(brain, conversation, '.system_generated', 'logs');
      for (const name of await readdir(logs).catch(() => [])) {
        if (!name.endsWith('.jsonl')) continue;
        const path = join(logs, name);
        const info = await stat(path);
        found.push({ path, mtime: info.mtimeMs, size: info.size });
      }
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
      `Aucun appel : Antigravity n'a lancé aucun crochet de ${HOOKS}. Le fichier n'est pas celui qu'il lit, ou il n'a pas été relancé.`,
    );
  }
  const byEvent = new Map();
  for (const line of lines) byEvent.set(line.evenement, [...(byEvent.get(line.evenement) ?? []), line]);
  for (const [event, calls] of byEvent) {
    console.log(`## ${event} : ${calls.length} appel(s), ${Math.max(...calls.map((c) => c.duree_ms))} ms au plus`);
    console.log(JSON.stringify(calls[0].entree, null, 2));
    if (calls.length > 1) {
      const keys = new Set(calls.flatMap((c) => Object.keys(c.entree ?? {})));
      console.log(`clés vues sur tous les appels : ${[...keys].join(', ')}`);
    }
    console.log(`variables d'environnement : ${calls[0].env.join(', ') || 'aucune'} · dossier : ${calls[0].cwd}\n`);
  }
  console.log('# Les transcripts les plus récents\n');
  const recent = await transcripts();
  if (recent.length === 0) console.log('Aucun transcript sous ~/.gemini/*/brain/*/.system_generated/logs/.');
  for (const file of recent) {
    const steps = (await readFile(file.path, 'utf8')).split('\n').filter(Boolean);
    const types = new Map();
    const tools = new Map();
    const keys = new Set();
    const witnesses = [];
    for (const raw of steps) {
      let step;
      try {
        step = JSON.parse(raw);
      } catch {
        continue;
      }
      for (const key of Object.keys(step)) keys.add(key);
      types.set(step.type, (types.get(step.type) ?? 0) + 1);
      for (const call of step.tool_calls ?? []) tools.set(call.name, (tools.get(call.name) ?? 0) + 1);
      for (const word of Object.values(WORDS)) {
        if (raw.includes(word)) witnesses.push(`${word} dans une étape ${step.type} (source ${step.source})`);
      }
    }
    console.log(`## ${file.path} (${file.size} octets, ${steps.length} lignes)`);
    console.log(`clés des étapes : ${[...keys].join(', ')}`);
    console.log(`types d'étapes : ${[...types].map(([t, n]) => `${t} ×${n}`).join(', ')}`);
    console.log(`outils appelés : ${[...tools].map(([t, n]) => `${t} ×${n}`).join(', ') || 'aucun'}`);
    console.log(`mots témoins dans le transcript : ${witnesses.join(' ; ') || 'aucun'}\n`);
  }
}

const [command, event] = process.argv.slice(2);
if (command === 'crochet') await hook(event);
else if (command === 'installer') await install();
else if (command === 'retirer') await uninstall();
else if (command === 'rapport') await report();
else console.log('Usage : node antigravity-temoin.mjs installer | rapport | retirer');
