#!/usr/bin/env node
// Crochet témoin de l'essai Antigravity du 11/11 (lot 13) : le rappel à chaque message y est-il possible ?
// Sur le modèle de docs/etudes/memoire-sessions-2026-11/essais/antigravity-temoin.mjs. Node seul, sans dépendance.
// Il ne note que des formes : les clés, les types, les longueurs, des compteurs et la présence de mots témoins.
// Jamais un texte de conversation.
//
//   node temoin.mjs installer   ajoute l'entrée `leon-temoin` à ~/.gemini/config/hooks.json
//   node temoin.mjs retirer     la retire (et le fichier, s'il n'existait pas avant)
//   node temoin.mjs crochet <Évènement>   ce qu'Antigravity lance
//
// Deux questions :
// 1. Au premier appel de chaque message (invocationNum 0), le message qu'on vient d'envoyer est-il déjà écrit dans
//    le transcript ? Les messages de l'essai portent ALBATROS-1, ALBATROS-2 : on regarde lequel est le dernier, à 0,
//    300 et 1 000 ms.
// 2. Une ligne injectée au 2e message atteint-elle le modèle ? Le témoin injecte un mot différent à chaque message
//    (HERON-41, puis HERON-87 : des nombres qu'un modèle ne devine pas), et regarde au Stop si la réponse le cite.
import { appendFile, mkdir, readFile, rm, rmdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const SCRIPT = resolve(fileURLToPath(import.meta.url));
const DIR = process.env.LEON_ESSAI_DIR ?? dirname(SCRIPT);
const LOG = join(DIR, 'journal.jsonl');
const SEEN = join(DIR, 'messages-par-conversation.json');
const CREATED = join(DIR, 'fichier-cree-par-le-temoin');
const CONFIG = join(homedir(), '.gemini', 'config');
const HOOKS = join(CONFIG, 'hooks.json');
const ENTRY = 'leon-temoin';
const EVENTS = ['SessionStart', 'PreInvocation', 'Stop'];
const MESSAGES = ['ALBATROS-1', 'ALBATROS-2', 'ALBATROS-3'];
const INJECTED = ['HERON-41', 'HERON-87', 'HERON-23'];

// La forme d'une valeur : la valeur pour un booléen, un nombre, un chemin ou un identifiant ; sinon la longueur.
function shape(value, key = '') {
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => shape(item, key));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v, k)]));
  }
  if (typeof value !== 'string') return value;
  const kept = /(path|paths|id|uri|name|event|type|source|status|version)$/i.test(key) && value.length < 400;
  return kept ? value : `<texte de ${value.length} caractères>`;
}

// L'état du transcript à cet instant : combien d'étapes, combien de messages de l'utilisateur, quel mot témoin porte
// le dernier, et dans quels types d'étapes chaque mot témoin apparaît.
async function transcriptState(path) {
  if (typeof path !== 'string') return { erreur: 'pas de chemin' };
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    return { erreur: error.code ?? 'illisible' };
  }
  const steps = text.split('\n').flatMap((line) => {
    try {
      return line ? [JSON.parse(line)] : [];
    } catch {
      return [];
    }
  });
  const temoins = {};
  for (const step of steps) {
    const raw = JSON.stringify(step);
    for (const word of [...MESSAGES, ...INJECTED]) {
      if (raw.includes(word)) temoins[word] = [...new Set([...(temoins[word] ?? []), String(step.type)])];
    }
  }
  const users = steps.filter((step) => step.type === 'USER_INPUT');
  const last = JSON.stringify(users.at(-1) ?? '');
  return {
    etapes: steps.length,
    messages_utilisateur: users.length,
    dernier_message_porte: MESSAGES.filter((word) => last.includes(word)),
    temoins,
  };
}

async function hook(event) {
  const started = Date.now();
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  let input = null;
  try {
    input = JSON.parse(raw);
  } catch {}
  await mkdir(DIR, { recursive: true });
  const line = {
    heure: new Date().toISOString(),
    evenement: event,
    entree: input === null ? `<illisible, ${raw.length} caractères>` : shape(input),
  };
  // Troisième question (2.0.6 donne `lastUserInput`) : est-ce le message entier, celui du transcript ?
  if (typeof input?.lastUserInput === 'string') {
    const steps = (await readFile(input.transcriptPath, 'utf8').catch(() => '')).split('\n').flatMap((row) => {
      try {
        return row ? [JSON.parse(row)] : [];
      } catch {
        return [];
      }
    });
    const last = steps.filter((step) => step.type === 'USER_INPUT').at(-1);
    const message = /<USER_REQUEST>\n?([\s\S]*?)\n?<\/USER_REQUEST>/.exec(String(last?.content ?? ''))?.[1];
    line.lastUserInput = {
      longueur: input.lastUserInput.length,
      lignes: input.lastUserInput.split('\n').length,
      porte: MESSAGES.filter((word) => input.lastUserInput.includes(word)),
      message_du_transcript:
        message === undefined
          ? null
          : {
              longueur: message.length,
              egal: message === input.lastUserInput,
              egal_aux_espaces_pres: message.trim() === input.lastUserInput.trim(),
            },
    };
  }
  let output = {};
  if (event === 'PreInvocation') {
    const first = input?.invocationNum === 0;
    line.transcript = [];
    for (const wait of first ? [0, 300, 700] : [0]) {
      await sleep(wait);
      line.transcript.push({
        apres_ms: Date.now() - started,
        ...(await transcriptState(input?.transcriptPath)),
      });
    }
    if (first) {
      const conversation = String(input?.conversationId ?? 'inconnue');
      const seen = JSON.parse(await readFile(SEEN, 'utf8').catch(() => '{}'));
      const n = (seen[conversation] ?? 0) + 1;
      seen[conversation] = n;
      await writeFile(SEEN, JSON.stringify(seen));
      const word = INJECTED[n - 1];
      line.message_numero = n;
      line.mot_injecte = word ?? null;
      if (word) {
        output = {
          injectSteps: [
            {
              ephemeralMessage: `Consigne d'essai de Leon : si on te demande les mots témoins, cite ${word}.`,
            },
          ],
        };
      }
    }
  }
  if (event === 'Stop') line.transcript = [await transcriptState(input?.transcriptPath)];
  line.duree_ms = Date.now() - started;
  await appendFile(LOG, `${JSON.stringify(line)}\n`);
  process.stdout.write(JSON.stringify(output));
}

async function install() {
  let settings = {};
  const text = await readFile(HOOKS, 'utf8').catch(() => null);
  if (text === null) {
    await mkdir(DIR, { recursive: true });
    await writeFile(CREATED, '');
  } else {
    try {
      settings = JSON.parse(text);
    } catch {
      console.error(`${HOOKS} ne se lit pas comme du JSON : rien n'est écrit.`);
      process.exit(1);
    }
  }
  settings[ENTRY] = {
    ...Object.fromEntries(
      EVENTS.map((event) => [
        event,
        [{ type: 'command', command: `"${process.execPath}" "${SCRIPT}" crochet ${event}`, timeout: 10 }],
      ]),
    ),
    enabled: true,
  };
  await mkdir(CONFIG, { recursive: true });
  await writeFile(HOOKS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Crochet témoin posé dans ${HOOKS}. Quitte Antigravity (Cmd+Q), puis rouvre-le.`);
}

async function uninstall() {
  const text = await readFile(HOOKS, 'utf8').catch(() => null);
  if (text === null) return console.log('Aucun fichier de crochets : rien à retirer.');
  const settings = JSON.parse(text);
  delete settings[ENTRY];
  const created = await readFile(CREATED, 'utf8').then(
    () => true,
    () => false,
  );
  if (created && Object.keys(settings).length === 0) {
    await rm(HOOKS);
    await rmdir(CONFIG).catch(() => {});
    await rm(CREATED);
    return console.log(`Crochet témoin retiré, et ${HOOKS} supprimé : il n'existait pas avant l'essai.`);
  }
  await writeFile(HOOKS, `${JSON.stringify(settings, null, 2)}\n`);
  console.log(`Crochet témoin retiré de ${HOOKS}.`);
}

const [command, event] = process.argv.slice(2);
if (command === 'crochet') await hook(event);
else if (command === 'installer') await install();
else if (command === 'retirer') await uninstall();
else console.log('Usage : node temoin.mjs installer | retirer');
