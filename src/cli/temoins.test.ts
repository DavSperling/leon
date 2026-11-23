import { mkdir, mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OUTILS } from './hook-commands';
import {
  claimTemoin,
  hasTemoin,
  purgeOldTemoins,
  TEMOIN_MAX_AGE_MS,
  TEMOIN_OUTILS,
  temoinPath,
  writeTemoin,
} from './temoins';

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

  it('la purge couvre aussi les témoins de Claude Code', async () => {
    await writeTemoin(home, 'claude_code', 'vieille');
    const now = new Date();
    const old = new Date(now.getTime() - TEMOIN_MAX_AGE_MS - 60_000);
    await utimes(temoinPath(home, 'claude_code', 'vieille'), old, old);

    await purgeOldTemoins(home, now);

    expect(await hasTemoin(home, 'claude_code', 'vieille')).toBe(false);
  });
});

// La lecture obligée (D40, T67) : le témoin de Claude Code se crée en exclusif, et seul le passage qui l'a créé refuse.
describe('claimTemoin', () => {
  it('crée le témoin une fois, puis plus ; vide, en 0600', async () => {
    expect(await claimTemoin(home, 'claude_code', 'session-1')).toBe(true);
    expect(await claimTemoin(home, 'claude_code', 'session-1')).toBe(false);

    const path = temoinPath(home, 'claude_code', 'session-1');
    expect(dirname(path)).toBe(join(home, '.leon', 'temoins', 'claude_code'));
    expect(await readFile(path, 'utf8')).toBe('');
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    expect(await claimTemoin(home, 'claude_code', 'session-2')).toBe(true);
  });

  it('deux appels en même temps : un seul le crée', async () => {
    const results = await Promise.all([
      claimTemoin(home, 'claude_code', 'même'),
      claimTemoin(home, 'claude_code', 'même'),
    ]);

    expect(results.sort()).toEqual([false, true]);
  });

  it('un témoin qui ne s’écrit pas rend false, sans lever', async () => {
    await mkdir(join(home, '.leon'), { recursive: true });
    await writeFile(join(home, '.leon', 'temoins'), 'pas un dossier');

    expect(await claimTemoin(home, 'claude_code', 'session-1')).toBe(false);
  });

  it('les témoins ont leur liste : OUTILS ne change pas', () => {
    expect(OUTILS).toEqual(['codex', 'cursor', 'antigravity']);
    expect(TEMOIN_OUTILS).toEqual(['claude_code', ...OUTILS]);
  });
});
