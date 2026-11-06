// Les adaptateurs des outils hors Claude Code (T16 du plan mémoire des sessions) : ce que chaque outil attend de nos
// crochets. Chacun enveloppe la sortie du démarrage, lit une session de l'outil, en relève les faits, et trouve ses
// fichiers de session (le rattrapage, T19).
//
// Codex (essai réel du 06/11, docs/etudes/memoire-sessions-2026-11/annexes/03-essai-codex.md) : la sortie JSON de C5
// arrive au modèle au premier message, rôle developer, sans autre champ (Codex refuse un champ inconnu). Jamais
// `continue: false`, qui arrêterait la session. Ses rollouts se lisent par capture/codex.ts (T18).
import { isAbsolute, join, resolve, sep } from 'node:path';
import type { SessionFacts } from '../capture/api-contract';
import { extractCodexFacts, parseCodexSession } from '../capture/codex';
import type { CodeSessionKind, Turn } from '../capture/turn';
import { findCodexSessionFiles, type SessionFile } from './find-sessions';
import type { Outil } from './hook-commands';

// Ce que la capture lit d'une session de l'outil.
export type SessionOutil = {
  sessionId: string;
  cwd: string | null;
  title: string | null;
  turns: Turn[];
  // La branche que porte le fichier de session ; null : la capture la lit par git (« lue à la capture »).
  branche: string | null;
};

type Env = Record<string, string | undefined>;

export type Adaptateur = {
  label: string;
  // Le `kind` de ses sessions, pour l'envoi des tours et des faits.
  kind: CodeSessionKind;
  // La sortie du crochet de démarrage, autour du bloc (C5).
  demarrage: (texte: string) => string;
  // Le dossier où l'outil écrit ses sessions : seul un fichier qui y est se lit (sessionPathFrom).
  dossierSessions: (home: string, env: Env) => string;
  lire: (contenu: string) => SessionOutil | null;
  faits: (contenu: string, racine: string | null, brancheLue: string | null) => SessionFacts;
  trouver: (home: string, env: Env) => Promise<SessionFile[]>;
};

// Le dossier de Codex : CODEX_HOME, sinon ~/.codex.
export const codexHome = (home: string, env: Env): string => env.CODEX_HOME || join(home, '.codex');

export const ADAPTATEURS: Record<Outil, Adaptateur> = {
  codex: {
    label: 'Codex',
    kind: 'codex',
    demarrage: (texte) =>
      JSON.stringify({
        hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: texte },
      }),
    dossierSessions: (home, env) => join(codexHome(home, env), 'sessions'),
    lire: parseCodexSession,
    faits: extractCodexFacts,
    trouver: (home, env) => findCodexSessionFiles(codexHome(home, env)),
  },
};

// Le fichier de session que nomme l'entrée d'un crochet (`transcript_path`), seulement s'il est un chemin absolu sous
// le dossier des sessions de l'outil : la commande ne lit jamais un autre fichier, quoi qu'on lui passe. null sinon.
export function sessionPathFrom(
  outil: Outil,
  input: unknown,
  home: string,
  env: Env,
): string | null {
  const path =
    typeof input === 'object' && input !== null && 'transcript_path' in input
      ? input.transcript_path
      : null;
  if (typeof path !== 'string' || !isAbsolute(path)) return null;
  const resolved = resolve(path);
  return resolved.startsWith(resolve(ADAPTATEURS[outil].dossierSessions(home, env)) + sep)
    ? resolved
    : null;
}
