// Les commandes que lancent les crochets de Claude Code (`SessionStart` : `leon briefing` ; `SessionEnd` :
// `leon capter-session`), écrites une seule fois : le README les cite, l'installateur des crochets (T14) les écrit
// dans les réglages de Claude Code. Un test garde le README et le script `leon` de package.json alignés sur elles.
//
// Les options de pnpm, vérifiées avec pnpm 11.0.8 le 2026-10-20 (hook-commands.contrat.test.ts) :
// - `-s` : pnpm n'écrit rien d'autre que la sortie de la commande. Pour SessionStart, Claude Code ajoute la sortie
//   standard au contexte de la session : seul le point doit y passer.
// - `--config.verify-deps-before-run=false` : sans elle, pnpm 11 installe tout seul les dépendances avant de lancer
//   le script quand node_modules ne correspond plus à package.json ou au verrou, ce qui arrive au clone principal
//   après un `git pull` qui change le verrou. Cette installation écrit sa progression sur la sortie standard malgré
//   `-s` (elle irait dans le contexte de la session) et n'a pas de délai propre : Claude Code la tuerait au bout du
//   délai du crochet, en laissant node_modules à moitié écrit, y compris pour `pnpm dev`.
// - `--dir <dépôt>` : pnpm lance le script dans le dépôt de Leon et pose INIT_CWD au dossier d'où il a été lancé ;
//   il transmet l'entrée standard (le JSON du crochet) au script.
//
// Ces options sont aussi celles de la forme clone du lanceur ~/.leon/bin/leon (launcher.ts) : les crochets de la CLI
// sans clone n'appellent que lui (`launcherHookCommand`), et c'est lui qui lance pnpm ou le Node posé par Leon.

import { join } from 'node:path';

export const HOOK_PNPM_OPTIONS = ['-s', '--config.verify-deps-before-run=false'] as const;

export type HookSubcommand = 'briefing' | 'capter-session';

// Toujours entre apostrophes, une apostrophe de la valeur devenant '\'' (les chemins du lanceur, K8).
export const singleQuote = (value: string): string => `'${value.replaceAll("'", `'\\''`)}'`;

// Claude Code lance une commande de crochet par un shell : un chemin qui n'est pas fait que de caractères sûrs est
// mis entre apostrophes.
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : singleQuote(value);
}

// La commande d'un crochet, pour le dépôt de Leon installé dans `repoDir` (chemin absolu).
export function hookCommand(repoDir: string, subcommand: HookSubcommand): string {
  return ['pnpm', ...HOOK_PNPM_OPTIONS, '--dir', shellQuote(repoDir), 'leon', subcommand].join(' ');
}

// Le lanceur que tous les crochets appellent (K8 du plan « CLI sans clone », écrit par launcher.ts) : ~/.leon/bin/leon.
export const launcherPath = (home: string): string => join(home, '.leon', 'bin', 'leon');

// La commande d'un crochet sous la forme du lanceur (K9) : son chemin absolu, mis entre apostrophes s'il le faut, puis
// la sous-commande. `home` : le dossier qui porte `.leon`.
export function launcherHookCommand(home: string, subcommand: HookSubcommand): string {
  return `${shellQuote(launcherPath(home))} ${subcommand}`;
}

// Les outils hors Claude Code dont Leon pose les crochets (C6 du plan mémoire des sessions) : Codex (lots 4 et 5), Cursor
// (lot 8), Antigravity (lot 9). Leurs crochets passent tous par `leon crochet <outil> <evenement>`.
export const OUTILS = ['codex', 'cursor', 'antigravity'] as const;
export type Outil = (typeof OUTILS)[number];
export const EVENEMENTS = ['demarrage', 'prompt', 'tour', 'fin'] as const;
export type Evenement = (typeof EVENEMENTS)[number];

// Quand part le rattrapage, dit à l'identique dans le texte d'accord de chaque outil : le crochet de démarrage de
// n'importe quel outil lance `leon rattraper` (scheduleCatchUp, briefing.ts), qui rattrape tous les outils dont la
// capture est acceptée (catch-up.ts). Un outil de plus se dit ici, une seule fois.
export const CATCH_UP_WHEN =
  "is sent in the background the next time Leon's start hook runs on this computer, in any of your tools: at the start of a Claude Code or Codex session, or at the first message of a Cursor or Antigravity conversation";

// La commande d'un crochet hors Claude Code (C6) : le lanceur, mis entre apostrophes s'il le faut, puis la sous-commande.
export function launcherCommand(home: string, outil: Outil, evenement: Evenement): string {
  return `${shellQuote(launcherPath(home))} crochet ${outil} ${evenement}`;
}

// Une commande écrite par launcherCommand, sous n'importe quel dossier personnel (C6, vérifiée le 02/11, plus
// l'apostrophe d'un dossier personnel, écrite '\'' par singleQuote) : les installateurs s'en servent pour rester
// idempotents et le retrait pour ne retirer que les crochets de Leon. Rend l'outil et l'évènement, ou null.
const LEON_LAUNCHER_COMMAND =
  /^(?:'(?:[^']|'\\'')*\/\.leon\/bin\/leon'|\/\S*\/\.leon\/bin\/leon) crochet (codex|cursor|antigravity) (demarrage|prompt|tour|fin)$/;
export function isLeonLauncherCommand(
  command: string,
): { outil: string; evenement: Evenement } | null {
  const match = LEON_LAUNCHER_COMMAND.exec(command.trim());
  return match ? { outil: match[1] as string, evenement: match[2] as Evenement } : null;
}
