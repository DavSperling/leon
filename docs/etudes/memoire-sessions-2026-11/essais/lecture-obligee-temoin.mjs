#!/usr/bin/env node
// Crochet témoin de T66 (annexe 12, « Ce qui reste à essayer ») : il note la forme de ce que Claude Code donne à un
// crochet PreToolUse, et sait refuser une fois par session, comme le fera `leon read-first`.
//
// Il ne note que des formes, jamais un texte : les noms des champs de l'entrée et de `tool_input`, la présence de
// `agent_id`, la valeur d'`agent_type` et de `CLAUDE_CODE_ENTRYPOINT` (des mots courts), les noms des variables
// `CLAUDE_*`, si le fichier visé est dans le dossier du projet, des tailles et des durées. L'identifiant de session
// n'est gardé que par son empreinte.
//
// Usage, dans la commande d'un crochet :
//   node lecture-obligee-temoin.mjs <dossier de sortie> [--refuser <fichier de la raison>]
// Chaque appel ajoute une ligne à <dossier>/temoin.jsonl. Avec --refuser, le premier appel d'une session sur Edit,
// Write, MultiEdit ou NotebookEdit crée <dossier>/temoins/<empreinte> en exclusif et refuse ; les suivants passent.
// Il sort avec le code 0 : une erreur laisse passer. Seule exception, dans Cursor (qui reprend les crochets de Claude
// Code) : le premier appel d'une session sort avec le code 1, comme une CLI ancienne, pour voir si Cursor bloque.
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

const debut = performance.now();
const [dossier, option, fichierRaison] = process.argv.slice(2);
const ECRITURES = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const MOT = /^[\w.:-]{1,40}$/;
const mot = (v) => (typeof v === 'string' && MOT.test(v) ? v : v === undefined ? null : typeof v);
const empreinte = (v) => createHash('sha256').update(String(v)).digest('hex').slice(0, 12);

function lireEntree() {
  return new Promise((ok) => {
    let texte = '';
    const fin = setTimeout(() => ok(texte), 1000);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (morceau) => (texte += morceau));
    process.stdin.on('end', () => (clearTimeout(fin), ok(texte)));
    process.stdin.on('error', () => (clearTimeout(fin), ok(texte)));
  });
}

// Le dossier réel, même pour un fichier qui n'existe pas encore (/tmp est /private/tmp sur macOS).
function reel(chemin) {
  try {
    return realpathSync(chemin);
  } catch {
    const parent = dirname(chemin);
    return parent === chemin ? chemin : join(reel(parent), basename(chemin));
  }
}

function dans(fichier, racine) {
  if (typeof fichier !== 'string' || typeof racine !== 'string') return null;
  const rel = relative(reel(racine), reel(isAbsolute(fichier) ? fichier : resolve(racine, fichier)));
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

const ligne = { evenement: null };
let sortie = '';
try {
  const brut = await lireEntree();
  ligne.taille_entree = brut.length;
  const entree = JSON.parse(brut);
  const outil = entree.tool_input ?? {};
  const fichier = outil.file_path ?? outil.notebook_path;
  const projet = process.env.CLAUDE_PROJECT_DIR;
  Object.assign(ligne, {
    evenement: mot(entree.hook_event_name),
    cles: Object.keys(entree).sort(),
    tool_name: mot(entree.tool_name),
    cles_tool_input: Object.keys(outil).sort(),
    permission_mode: mot(entree.permission_mode),
    agent_id: 'agent_id' in entree,
    agent_type: mot(entree.agent_type),
    session: entree.session_id ? empreinte(entree.session_id) : null,
    transcript_existe: typeof entree.transcript_path === 'string' ? existsSync(entree.transcript_path) : null,
    transcript_octets:
      typeof entree.transcript_path === 'string' && existsSync(entree.transcript_path)
        ? statSync(entree.transcript_path).size
        : null,
    variables_claude: Object.keys(process.env).filter((n) => n.startsWith('CLAUDE')).sort(),
    entrypoint: mot(process.env.CLAUDE_CODE_ENTRYPOINT),
    projet_present: typeof projet === 'string',
    projet_egal_cwd: typeof projet === 'string' && typeof entree.cwd === 'string' ? reel(projet) === reel(entree.cwd) : null,
    fichier_dans_projet: dans(fichier, projet ?? entree.cwd),
  });
  ligne.decision = 'passe';
  ligne.cursor = Boolean(process.env.CURSOR_VERSION) || 'cursor_version' in entree;
  if (ligne.cursor && option === '--refuser' && entree.session_id) {
    const marque = join(dossier, 'temoins', `cursor-${empreinte(entree.session_id ?? entree.conversation_id)}`);
    mkdirSync(dirname(marque), { recursive: true, mode: 0o700 });
    try {
      writeFileSync(marque, '', { flag: 'wx', mode: 0o600 });
      ligne.decision = 'cursor:code1';
    } catch {
      ligne.decision = 'cursor:code0';
    }
  } else if (option === '--refuser' && ECRITURES.has(entree.tool_name) && entree.session_id) {
    const raison = readFileSync(fichierRaison, 'utf8').trim();
    const temoins = join(dossier, 'temoins');
    mkdirSync(temoins, { recursive: true, mode: 0o700 });
    try {
      writeFileSync(join(temoins, empreinte(entree.session_id)), '', { flag: 'wx', mode: 0o600 });
      ligne.decision = 'refus';
      sortie = JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: raison,
        },
      });
    } catch (erreur) {
      ligne.decision = erreur?.code === 'EEXIST' ? 'passe' : `passe:${mot(erreur?.code)}`;
    }
  }
} catch (erreur) {
  ligne.erreur = mot(erreur?.name);
}
ligne.duree_ms = Math.round(performance.now() - debut);
try {
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  appendFileSync(join(dossier, 'temoin.jsonl'), `${JSON.stringify(ligne)}\n`, { mode: 0o600 });
} catch {
  // Rien à faire : le témoin ne bloque jamais.
}
if (sortie) process.stdout.write(sortie);
process.exit(ligne.decision === 'cursor:code1' ? 1 : 0);
