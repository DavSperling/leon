import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { HOOK_PNPM_OPTIONS, hookCommand, shellQuote } from './hook-commands';

// Les commandes des crochets, écrites une fois (hook-commands.ts) : le README les cite telles quelles, et le script
// `leon` qu'elles lancent existe. Le comportement réel de pnpm avec ces options est dans hook-commands.contrat.test.ts.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const readRepoFile = (path: string) => readFileSync(`${REPO_ROOT}${path}`, 'utf8');
// Le chemin d'exemple du README.
const README_REPO = '/chemin/vers/leon';

describe('hookCommand', () => {
  it('lance la sous-commande par pnpm, sans installation automatique ni bavardage', () => {
    expect(HOOK_PNPM_OPTIONS).toEqual(['-s', '--config.verify-deps-before-run=false']);
    expect(hookCommand('/Users/amos/leon', 'briefing')).toBe(
      'pnpm -s --config.verify-deps-before-run=false --dir /Users/amos/leon leon briefing',
    );
    expect(hookCommand('/Users/amos/leon', 'capter-session')).toBe(
      'pnpm -s --config.verify-deps-before-run=false --dir /Users/amos/leon leon capter-session',
    );
  });

  it('met entre apostrophes un chemin qu’un shell couperait ou interpréterait', () => {
    expect(shellQuote('/Users/amos/Mes projets/leon')).toBe("'/Users/amos/Mes projets/leon'");
    expect(shellQuote("/tmp/l'équipe")).toBe("'/tmp/l'\\''équipe'");
    expect(shellQuote('/tmp/$(rm -rf ~)')).toBe("'/tmp/$(rm -rf ~)'");
    expect(hookCommand('/Users/amos/Mes projets/leon', 'briefing')).toBe(
      "pnpm -s --config.verify-deps-before-run=false --dir '/Users/amos/Mes projets/leon' leon briefing",
    );
  });
});

describe('le README et package.json', () => {
  it('le README cite exactement la commande du crochet de démarrage', () => {
    expect(readRepoFile('README.md')).toContain(
      `"command": "${hookCommand(README_REPO, 'briefing')}"`,
    );
  });

  // Le serveur prépare le point depuis T13 : le README ne doit plus dire le contraire.
  it('le README ne dit plus que le serveur ne prépare pas le point', () => {
    expect(readRepoFile('README.md')).not.toMatch(/ne prépare pas encore/);
  });

  it('le script `leon` de package.json lance la CLI de Leon', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as { scripts: Record<string, string> };
    expect(pkg.scripts.leon).toMatch(/ src\/cli\/leon\.ts$/);
  });
});
