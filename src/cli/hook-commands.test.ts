import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CATCH_UP_WHEN,
  HOOK_PNPM_OPTIONS,
  hookCommand,
  isLeonLauncherCommand,
  launcherCommand,
  launcherHookCommand,
  launcherPath,
  shellQuote,
  singleQuote,
} from './hook-commands';

// Les commandes des crochets, écrites une fois (hook-commands.ts) : le README les cite telles quelles, et le script
// `leon` qu'elles lancent existe. Le comportement réel de pnpm avec ces options est dans hook-commands.contrat.test.ts.

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const readRepoFile = (path: string) => readFileSync(`${REPO_ROOT}${path}`, 'utf8');
// Le dossier personnel d'exemple du README (install-hooks.test.ts compare tout le JSON à ce que l'installateur écrit).
const README_HOME = '/Users/vous';

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

describe('le lanceur des crochets (K8, K9)', () => {
  it('vit dans ~/.leon/bin/leon', () => {
    expect(launcherPath('/Users/amos')).toBe('/Users/amos/.leon/bin/leon');
  });

  it('singleQuote met toujours entre apostrophes, même un chemin sans danger', () => {
    expect(singleQuote('/Users/a/.leon/bin/leon')).toBe("'/Users/a/.leon/bin/leon'");
    expect(singleQuote("/tmp/l'équipe")).toBe("'/tmp/l'\\''équipe'");
  });

  it('launcherHookCommand : le chemin du lanceur, puis la sous-commande', () => {
    expect(launcherHookCommand('/Users/amos', 'briefing')).toBe(
      '/Users/amos/.leon/bin/leon briefing',
    );
    expect(launcherHookCommand('/Users/amos', 'capter-session')).toBe(
      '/Users/amos/.leon/bin/leon capter-session',
    );
  });

  it('met le chemin entre apostrophes quand le dossier personnel a une espace ou une apostrophe', () => {
    expect(launcherHookCommand('/Users/Léa O Neil', 'briefing')).toBe(
      "'/Users/Léa O Neil/.leon/bin/leon' briefing",
    );
    expect(launcherHookCommand("/Users/Léa O'Neil", 'capter-session')).toBe(
      "'/Users/Léa O'\\''Neil/.leon/bin/leon' capter-session",
    );
  });
});

describe('launcherCommand et isLeonLauncherCommand (C6)', () => {
  it('écrit la commande du lanceur pour un outil et un évènement, et la reconnaît', () => {
    const command = launcherCommand('/Users/amos', 'codex', 'demarrage');
    expect(command).toBe('/Users/amos/.leon/bin/leon crochet codex demarrage');
    expect(isLeonLauncherCommand(command)).toEqual({ outil: 'codex', evenement: 'demarrage' });
  });

  it('un dossier personnel avec une espace ou une apostrophe : la commande écrite est reconnue', () => {
    for (const home of ['/Users/Léa Martin', "/Users/Léa O'Neil"]) {
      const command = launcherCommand(home, 'codex', 'demarrage');
      expect(command.startsWith("'")).toBe(true);
      expect(isLeonLauncherCommand(command)).toEqual({ outil: 'codex', evenement: 'demarrage' });
    }
  });

  it('ne reconnaît pas les autres commandes', () => {
    for (const command of [
      '/Users/amos/.leon/bin/leon briefing',
      '/Users/amos/.leon/bin/leon crochet codex demarrage; rm -rf ~',
      '/Users/amos/.leon/bin/leon crochet vim demarrage',
      '/usr/local/bin/leon crochet codex demarrage',
      'python3 ~/.codex/hooks/session_start.py',
    ]) {
      expect(isLeonLauncherCommand(command)).toBeNull();
    }
  });
});

// Mot pour mot : c'est le texte qu'accepte l'utilisateur de Codex, de Cursor et d'Antigravity (leurs tests vérifient
// qu'il est dans leur accord). Les quatre outils y sont, et le moment exact de chacun (scheduleCatchUp, briefing.ts).
it('CATCH_UP_WHEN : quand part le rattrapage, pour les quatre outils', () => {
  expect(CATCH_UP_WHEN).toBe(
    "is sent in the background the next time Leon's start hook runs on this computer, in any of your tools: at the start of a Claude Code or Codex session, or at the first message of a Cursor or Antigravity conversation",
  );
});

describe('le README et package.json', () => {
  it('le README cite exactement les commandes des crochets : celles du lanceur', () => {
    const readme = readRepoFile('README.md');

    expect(readme).toContain(`"command": "${launcherHookCommand(README_HOME, 'briefing')}"`);
    expect(readme).toContain(`"command": "${launcherHookCommand(README_HOME, 'capter-session')}"`);
  });

  // La forme clone du lanceur garde la ligne pnpm : le README la cite pour les développeurs de Leon.
  it('le README cite la ligne pnpm de la forme clone du lanceur', () => {
    expect(readRepoFile('README.md')).toContain(
      'pnpm -s --config.verify-deps-before-run=false --dir <clone> leon',
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
