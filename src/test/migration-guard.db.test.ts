import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { pendingDestructiveMigrations } from './migration-guard';
import { TEST_ENV } from './test-env';

async function dirWith(...files: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'leon-garde-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  for (const file of files) await writeFile(join(dir, file), 'select 1;');
  return dir;
}

describe('pendingDestructiveMigrations', () => {
  it('rend les migrations destructives du dossier que la base n’a pas encore appliquées', async () => {
    const dir = await dirWith('0099-fictive-destructive.sql', '0098-banale.sql');

    const pending = await pendingDestructiveMigrations(TEST_ENV.DATABASE_URL_ADMIN, {
      dir,
      destructives: ['0099-fictive-destructive.sql'],
    });

    expect(pending).toEqual(['0099-fictive-destructive.sql']);
  });

  it('ne rend rien pour une migration destructive déjà appliquée', async () => {
    // 0001-base.sql est appliquée sur toute base de test (global-setup passe avant ce fichier).
    const dir = await dirWith('0001-base.sql');

    const pending = await pendingDestructiveMigrations(TEST_ENV.DATABASE_URL_ADMIN, {
      dir,
      destructives: ['0001-base.sql'],
    });

    expect(pending).toEqual([]);
  });

  it('ignore une migration destructive absente du dossier', async () => {
    const dir = await dirWith('0098-banale.sql');

    const pending = await pendingDestructiveMigrations(TEST_ENV.DATABASE_URL_ADMIN, {
      dir,
      destructives: ['0099-fictive-destructive.sql'],
    });

    expect(pending).toEqual([]);
  });
});
