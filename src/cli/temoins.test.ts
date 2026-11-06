import { mkdtemp, readdir, readFile, rm, stat, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasTemoin, purgeOldTemoins, TEMOIN_MAX_AGE_MS, temoinPath, writeTemoin } from './temoins';

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'leon-temoins-'));
});
afterEach(() => rm(home, { recursive: true, force: true }));

describe('les témoins de conversation', () => {
  it('posé une fois, il se lit ; vide, en 0600, sans l’identifiant de la conversation', async () => {
    expect(await hasTemoin(home, 'cursor', 'conv-secrète')).toBe(false);

    await writeTemoin(home, 'cursor', 'conv-secrète');

    expect(await hasTemoin(home, 'cursor', 'conv-secrète')).toBe(true);
    expect(await hasTemoin(home, 'cursor', 'autre')).toBe(false);
    const path = temoinPath(home, 'cursor', 'conv-secrète');
    expect(path).not.toContain('secrète');
    expect(await readFile(path, 'utf8')).toBe('');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it('le rattrapage efface ceux de plus de 7 jours', async () => {
    await writeTemoin(home, 'cursor', 'vieille');
    await writeTemoin(home, 'cursor', 'récente');
    const now = new Date();
    const old = new Date(now.getTime() - TEMOIN_MAX_AGE_MS - 60_000);
    await utimes(temoinPath(home, 'cursor', 'vieille'), old, old);

    await purgeOldTemoins(home, now);

    expect(await readdir(join(home, '.leon', 'temoins', 'cursor'))).toHaveLength(1);
    expect(await hasTemoin(home, 'cursor', 'récente')).toBe(true);
  });
});
