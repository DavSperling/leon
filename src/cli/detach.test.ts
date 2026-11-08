import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { currentProcess, startDetached } from './detach';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-detache-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('startDetached', () => {
  it('lance le Node, ses options et la CLI en cours avec les arguments, dans son dossier, sans attendre', async () => {
    // Une fausse CLI qui écrit ses arguments, son option de Node et son dossier, une seconde plus tard.
    const script = join(dir, 'cli.mjs');
    await writeFile(
      script,
      `import { writeFileSync } from 'node:fs';
setTimeout(() => writeFileSync('sortie.json', JSON.stringify({
  args: process.argv.slice(2), option: process.env.LEON_OPTION ?? null, dossier: process.cwd(),
})), 300);
`,
    );
    const started = Date.now();

    const launched = startDetached(
      ['rattraper', 'avec espace'],
      { execPath: process.execPath, execArgv: ['--no-warnings'], script, cwd: dir },
      { ...process.env, LEON_OPTION: 'gardée' },
    );

    expect(launched).toBe(true);
    expect(Date.now() - started).toBeLessThan(250);
    await expect
      .poll(() => readFile(join(dir, 'sortie.json'), 'utf8').catch(() => null), { timeout: 5000 })
      .not.toBeNull();
    expect(JSON.parse(await readFile(join(dir, 'sortie.json'), 'utf8'))).toEqual({
      args: ['rattraper', 'avec espace'],
      option: 'gardée',
      dossier: await import('node:fs/promises').then(({ realpath }) => realpath(dir)),
    });
  });

  it('sans fichier de CLI connu, ne lance rien', () => {
    expect(
      startDetached(['rattraper'], {
        execPath: process.execPath,
        execArgv: [],
        script: undefined,
        cwd: dir,
      }),
    ).toBe(false);
  });

  it('un Node introuvable ne lève rien : la tâche détachée n’est jamais attendue', () => {
    expect(
      startDetached(['rattraper'], {
        execPath: join(dir, 'absent'),
        execArgv: [],
        script: join(dir, 'cli.mjs'),
        cwd: dir,
      }),
    ).toBe(true);
  });

  it('currentProcess reprend le Node, ses options, le fichier de la CLI et le dossier en cours', () => {
    expect(currentProcess()).toEqual({
      execPath: process.execPath,
      execArgv: process.execArgv,
      script: process.argv[1],
      cwd: process.cwd(),
    });
  });
});
