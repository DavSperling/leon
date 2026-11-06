// Les adaptateurs des outils hors Claude Code (T16 du plan mémoire des sessions) : ce que chaque outil attend de nos
// crochets. Chacun lit l'entrée du crochet, enveloppe le bloc injecté, lit une session de l'outil, en relève les faits, et
// trouve ses fichiers de session (le rattrapage, T19).
//
// Codex (essai réel du 06/11, docs/etudes/memoire-sessions-2026-11/annexes/03-essai-codex.md) : la sortie JSON de C5
// arrive au modèle au premier message, rôle developer, sans autre champ (Codex refuse un champ inconnu). Jamais
// `continue: false`, qui arrêterait la session. Ses rollouts se lisent par capture/codex.ts (T18).
//
// Cursor (T27, T28) : shortcut: écrit avant l'essai réel T26, d'après la doc et les relevés publics (annexe 02 de
// l'étude, forum de Cursor) ; à recaler sur l'annexe 04. Le bloc arrive au premier message d'une conversation, par
// beforeSubmitPrompt (`crochet cursor prompt`), une seule fois (témoin, temoins.ts) : sessionStart n'est pas attendu par
// Cursor, et sa validation l'a refusé dans des versions récentes. La sortie de beforeSubmitPrompt garde toujours
// `continue: true` : sans lui, le message de la personne pourrait être bloqué. stop ne rend que `{}`, jamais
// `followup_message` (il serait envoyé comme message suivant et ferait boucler).
import { stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { SessionFacts } from '../capture/api-contract';
import { extractCodexFacts, parseCodexSession } from '../capture/codex';
import { extractCursorFacts, parseCursorSession } from '../capture/cursor';
import type { CodeSessionKind, Turn } from '../capture/turn';
import { findCodexSessionFiles, findCursorSessionFiles, type SessionFile } from './find-sessions';
import type { Evenement, Outil } from './hook-commands';

// Ce que la capture lit d'une session de l'outil.
export type SessionOutil = {
  sessionId: string;
  cwd: string | null;
  title: string | null;
  turns: Turn[];
  // La branche que porte le fichier de session ; null : la capture la lit par git (« lue à la capture »).
  branche: string | null;
};

// Le fichier de session lu, avec son heure : Cursor date ses tours à l'heure du fichier.
export type FichierSession = { path: string; mtime: Date };

// Ce que la commande retient de l'entrée d'un crochet.
export type EntreeCrochet = {
  // La conversation : exclue du bloc de démarrage, et clé du témoin.
  session: string | null;
  // Le dossier de travail, absolu.
  dossier: string | null;
  // Les fichiers de session possibles, dans l'ordre, tous sous les dossiers de sessions de l'outil : le premier qui
  // existe se lit.
  fichiers: string[];
  // Faux tant que l'outil travaille encore (Antigravity : `fullyIdle`) : rien n'est capté.
  inactif: boolean;
};

type Env = Record<string, string | undefined>;

export type Adaptateur = {
  label: string;
  // Le `kind` de ses sessions, pour l'envoi des tours et des faits.
  kind: CodeSessionKind;
  // Le bloc injecté (C5), au démarrage ou au premier message.
  injection: (texte: string, evenement: 'demarrage' | 'prompt') => string;
  // Ce que le crochet écrit quand il n'a rien à dire ; null : rien sur la sortie standard.
  vide: (evenement: Evenement) => string | null;
  // Le bloc n'arrive qu'une fois par conversation (témoin) : celui des outils qui l'injectent au premier message.
  uneFois: boolean;
  // Les dossiers où l'outil écrit ses sessions : seul un fichier qui y est se lit.
  racines: (home: string, env: Env) => string[];
  entree: (input: unknown, home: string, env: Env) => EntreeCrochet;
  lire: (contenu: string, fichier: FichierSession) => SessionOutil | null;
  faits: (
    contenu: string,
    fichier: FichierSession,
    racine: string | null,
    brancheLue: string | null,
  ) => SessionFacts;
  trouver: (home: string, env: Env) => Promise<SessionFile[]>;
  // Le dossier de travail d'un fichier de session que son contenu ne dit pas (le rattrapage, sans crochet).
  dossierDe?: (fichier: string) => Promise<string | null>;
};

// Le dossier de Codex : CODEX_HOME, sinon ~/.codex.
export const codexHome = (home: string, env: Env): string => env.CODEX_HOME || join(home, '.codex');
// Le dossier de Cursor : ~/.cursor.
export const cursorHome = (home: string): string => join(home, '.cursor');

const field = (input: unknown, key: string): unknown =>
  typeof input === 'object' && input !== null && key in input
    ? (input as Record<string, unknown>)[key]
    : undefined;
const text = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;
const absolute = (value: unknown): string | null => {
  const path = text(value);
  return path !== null && isAbsolute(path) ? path : null;
};
const first = (value: unknown): unknown => (Array.isArray(value) ? value[0] : undefined);

// Les chemins absolus sous l'une des racines, résolus ; les autres sont écartés.
function under(paths: (string | null)[], roots: string[]): string[] {
  const prefixes = roots.map((root) => resolve(root) + sep);
  return paths.flatMap((path) => {
    if (path === null || !isAbsolute(path)) return [];
    const resolved = resolve(path);
    return prefixes.some((prefix) => resolved.startsWith(prefix)) ? [resolved] : [];
  });
}

// Le slug de projet de Cursor : le dossier, ses séparateurs en tirets, sans tiret au début.
export const cursorSlug = (directory: string): string =>
  resolve(directory).split(/[\\/]/).filter(Boolean).join('-');

// Le dossier d'un slug de Cursor, retrouvé sur le disque : un tiret est un séparateur ou une partie d'un nom, et seul un
// chemin qui existe compte. null si aucun ne correspond (un slug `empty-window`, un dossier effacé).
// shortcut: Cursor peut remplacer d'autres caractères que le séparateur ; le crochet donne le vrai dossier, ce repli ne
// sert qu'au rattrapage d'une conversation qu'aucun crochet n'a vue.
export async function cursorDirectoryOf(slug: string): Promise<string | null> {
  const parts = slug.split('-').filter(Boolean);
  let budget = 500;
  const isDirectory = (path: string) =>
    stat(path).then(
      (info) => info.isDirectory(),
      () => false,
    );
  async function walk(base: string, index: number): Promise<string | null> {
    if (index === parts.length) return base;
    for (let end = index; end < parts.length && budget > 0; end++) {
      budget -= 1;
      const next = join(base, parts.slice(index, end + 1).join('-'));
      if (await isDirectory(next)) {
        const found = await walk(next, end + 1);
        if (found !== null) return found;
      }
    }
    return null;
  }
  return parts.length === 0 ? null : walk(sep, 0);
}

export const ADAPTATEURS: Record<Outil, Adaptateur> = {
  codex: {
    label: 'Codex',
    kind: 'codex',
    injection: (texte, evenement) =>
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: evenement === 'prompt' ? 'UserPromptSubmit' : 'SessionStart',
          additionalContext: texte,
        },
      }),
    vide: () => null,
    uneFois: false,
    racines: (home, env) => [join(codexHome(home, env), 'sessions')],
    entree: (input, home, env) => ({
      session: text(field(input, 'session_id')),
      dossier: absolute(field(input, 'cwd')),
      fichiers: under(
        [absolute(field(input, 'transcript_path'))],
        [join(codexHome(home, env), 'sessions')],
      ),
      inactif: true,
    }),
    lire: (contenu) => parseCodexSession(contenu),
    faits: (contenu, _fichier, racine, brancheLue) =>
      extractCodexFacts(contenu, racine, brancheLue),
    trouver: (home, env) => findCodexSessionFiles(codexHome(home, env)),
  },
  cursor: {
    label: 'Cursor',
    kind: 'cursor',
    injection: (texte, evenement) =>
      JSON.stringify(
        evenement === 'prompt'
          ? { continue: true, additional_context: texte }
          : { additional_context: texte },
      ),
    vide: (evenement) => (evenement === 'prompt' ? '{"continue":true}' : '{}'),
    uneFois: true,
    racines: (home) => [join(cursorHome(home), 'projects')],
    entree: (input, home, env) => {
      const conversation = text(field(input, 'conversation_id'));
      const dossier = absolute(first(field(input, 'workspace_roots')));
      const projects = join(cursorHome(home), 'projects');
      // Le transcript : celui du crochet, sinon CURSOR_TRANSCRIPT_PATH, sinon le chemin déduit du dossier (T28).
      const deduits =
        conversation !== null && dossier !== null && !/[\\/]/.test(conversation)
          ? [
              join(
                projects,
                cursorSlug(dossier),
                'agent-transcripts',
                conversation,
                `${conversation}.jsonl`,
              ),
              join(projects, cursorSlug(dossier), 'agent-transcripts', `${conversation}.jsonl`),
            ]
          : [];
      return {
        session: conversation,
        dossier,
        fichiers: under(
          [
            absolute(field(input, 'transcript_path')),
            absolute(env.CURSOR_TRANSCRIPT_PATH),
            ...deduits,
          ],
          [projects],
        ),
        inactif: true,
      };
    },
    lire: (contenu, fichier) => parseCursorSession(contenu, fichier),
    faits: (contenu, fichier, racine, brancheLue) =>
      extractCursorFacts(contenu, fichier, racine, brancheLue),
    trouver: (home) => findCursorSessionFiles(cursorHome(home)),
    // `projects/<slug>/agent-transcripts/[<conversation>/]<conversation>.jsonl`
    dossierDe: async (fichier) => {
      let directory = dirname(fichier);
      if (basename(directory) !== 'agent-transcripts') directory = dirname(directory);
      return cursorDirectoryOf(basename(dirname(directory)));
    },
  },
};

// Le fichier de session que nomme l'entrée d'un crochet : le premier des fichiers possibles qui existe, ou null.
export async function sessionFileFrom(entree: EntreeCrochet): Promise<string | null> {
  for (const path of entree.fichiers) {
    if ((await stat(path).catch(() => null))?.isFile()) return path;
  }
  return null;
}
