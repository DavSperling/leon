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

export const HOOK_PNPM_OPTIONS = ['-s', '--config.verify-deps-before-run=false'] as const;

export type HookSubcommand = 'briefing' | 'capter-session';

// Claude Code lance une commande de crochet par un shell : un chemin qui n'est pas fait que de caractères sûrs est
// mis entre apostrophes (une apostrophe du chemin devient '\'').
export function shellQuote(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/.test(value) ? value : `'${value.replaceAll("'", `'\\''`)}'`;
}

// La commande d'un crochet, pour le dépôt de Leon installé dans `repoDir` (chemin absolu).
export function hookCommand(repoDir: string, subcommand: HookSubcommand): string {
  return ['pnpm', ...HOOK_PNPM_OPTIONS, '--dir', shellQuote(repoDir), 'leon', subcommand].join(' ');
}
