import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PROJECT_KEY_PATTERN } from '../capture/turn';
import { gitInDirectory, projectKeyFor } from './project-key';

const run = promisify(execFile);

// Un « git » factice qui répond la même adresse à tout.
const gitReplying = (remote: string | null) => async () => remote;
const dossierKey = (path: string) =>
  `dossier:${createHash('sha256').update(path).digest('hex').slice(0, 16)}`;

describe('projectKeyFor : adresse du dépôt GitHub', () => {
  const GITHUB_REMOTES: Array<[string, string]> = [
    ['git@github.com:Acme/Leon.git', 'github.com/acme/leon'],
    ['git@github.com:Acme/Leon', 'github.com/acme/leon'],
    ['https://github.com/acme/leon', 'github.com/acme/leon'],
    ['https://github.com/acme/leon.git', 'github.com/acme/leon'],
    ['https://github.com/acme/leon/', 'github.com/acme/leon'],
    ['HTTPS://GitHub.com/Acme/Leon.git/', 'github.com/acme/leon'],
    ['https://github.com:443/acme/leon.git', 'github.com/acme/leon'],
    ['ssh://git@github.com/acme/leon.git', 'github.com/acme/leon'],
    ['ssh://git@ssh.github.com:443/acme/leon.git', 'github.com/acme/leon'],
    ['git://github.com/acme/leon.git', 'github.com/acme/leon'],
    ['https://github.com/acme/leon.git?ref=main', 'github.com/acme/leon'],
    ['https://github.com/acme/mon.depot_v2-bis.git', 'github.com/acme/mon.depot_v2-bis'],
  ];

  it.each(GITHUB_REMOTES)('%s -> %s', async (remote, expected) => {
    expect(await projectKeyFor('/r', gitReplying(remote))).toBe(expected);
  });

  it('interroge git sur le remote origin, dans le dossier donné', async () => {
    const calls: Array<{ args: string[]; cwd: string }> = [];

    await projectKeyFor('/Users/demo/leon', async (args, cwd) => {
      calls.push({ args, cwd });
      return 'git@github.com:acme/leon.git';
    });

    expect(calls).toEqual([{ args: ['remote', 'get-url', 'origin'], cwd: '/Users/demo/leon' }]);
  });

  it("ne garde ni l'identifiant ni le jeton d'une adresse qui en porte", async () => {
    const withCredentials = [
      'https://utilisateur:jeton@github.com/acme/leon.git',
      'https://x-access-token:ghp_abcdefghijklmnopqrstuvwxyz0123456789@github.com/Acme/Leon',
      'https://jeton@github.com/acme/leon.git',
      'ssh://utilisateur:jeton@github.com/acme/leon.git',
    ];
    for (const remote of withCredentials) {
      const key = await projectKeyFor('/r', gitReplying(remote));
      expect(key, remote).toBe('github.com/acme/leon');
      expect(key).not.toContain('jeton');
      expect(key).not.toContain('utilisateur');
      expect(key).not.toContain('ghp_');
    }
  });

  it("ne garde aucune partie de l'adresse quand elle n'est pas sur GitHub et porte un jeton", async () => {
    const key = await projectKeyFor(
      '/r',
      gitReplying('https://utilisateur:jeton@gitlab.com/acme/leon.git'),
    );

    expect(key).toBe(dossierKey('/r'));
    expect(key).not.toContain('jeton');
    expect(key).not.toContain('gitlab');
  });
});

describe('projectKeyFor : repli sur le dossier', () => {
  it('sans remote, donne « dossier: » et 16 hexadécimaux, stables pour le même chemin', async () => {
    const first = await projectKeyFor('/Users/demo/mon-projet', gitReplying(null));
    const second = await projectKeyFor('/Users/demo/mon-projet', gitReplying(null));
    const other = await projectKeyFor('/Users/demo/autre-projet', gitReplying(null));

    expect(first).toMatch(/^dossier:[0-9a-f]{16}$/);
    expect(first).toBe(second);
    expect(first).toBe(dossierKey('/Users/demo/mon-projet'));
    expect(other).not.toBe(first);
  });

  it('un remote GitLab ou autre donne aussi « dossier: » (seul GitHub est relié aux sources)', async () => {
    for (const remote of [
      'git@gitlab.com:acme/leon.git',
      'https://gitlab.com/acme/leon.git',
      'https://bitbucket.org/acme/leon.git',
      'git@github.example.com:acme/leon.git',
    ]) {
      expect(await projectKeyFor('/r', gitReplying(remote)), remote).toBe(dossierKey('/r'));
    }
  });

  it("n'est pas dupé par un hôte qui ressemble à GitHub", async () => {
    for (const remote of [
      'https://github.com.evil.example/acme/leon.git',
      'https://evil.example/github.com/acme/leon.git',
      'https://github.com@evil.example/acme/leon.git',
      'https://evil.example/?u=github.com/acme/leon',
      'git@github.com.evil.example:acme/leon.git',
      'git@evil.example:github.com/acme/leon.git',
      'https://notgithub.com/acme/leon.git',
    ]) {
      expect(await projectKeyFor('/r', gitReplying(remote)), remote).toBe(dossierKey('/r'));
    }
  });

  it("n'accepte qu'un propriétaire et un dépôt, sans caractère hors de la clé", async () => {
    for (const remote of [
      'https://github.com/acme',
      'https://github.com/acme/leon/tree/main',
      'https://github.com//leon',
      'https://github.com/acme//',
      'https://github.com/ac me/leon',
      'https://github.com/acme/le%6Fn',
      'https://github.com/../leon',
      'https://github.com/acme/..',
      'git@github.com:acme',
      'git@github.com:',
      'https://github.com/',
      'ftp://github.com/acme/leon.git',
      'file:///github.com/acme/leon.git',
      '',
      '   ',
      '/Users/demo/depot-local',
      'C:\\depot\\leon',
    ]) {
      expect(await projectKeyFor('/r', gitReplying(remote)), remote).toBe(dossierKey('/r'));
    }
  });

  it("repasse sur le dossier quand git échoue ou n'existe pas", async () => {
    const key = await projectKeyFor('/r', async () => {
      throw new Error('spawn git ENOENT');
    });

    expect(key).toBe(dossierKey('/r'));
  });

  it("repasse sur le dossier quand l'adresse rendrait une clé trop longue", async () => {
    const remote = `https://github.com/acme/${'a'.repeat(300)}.git`;

    expect(await projectKeyFor('/r', gitReplying(remote))).toBe(dossierKey('/r'));
  });

  it('toute clé produite respecte le motif du contrat (C8)', async () => {
    for (const remote of ['git@github.com:Acme/Leon.git', 'git@gitlab.com:a/b.git', null, '???']) {
      const key = await projectKeyFor('/r', gitReplying(remote));
      expect(key, String(remote)).toMatch(PROJECT_KEY_PATTERN);
      expect(key.length).toBeLessThanOrEqual(200);
    }
  });
});

describe('gitInDirectory : avec le vrai git, dans un dossier temporaire', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'leon-projet-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lit le remote origin d'un dépôt et en tire la clé, sans le jeton", async () => {
    await run('git', ['init', '--quiet'], { cwd: dir });
    await run(
      'git',
      ['remote', 'add', 'origin', 'https://utilisateur:jeton@github.com/Acme/Leon.git'],
      {
        cwd: dir,
      },
    );

    const key = await projectKeyFor(dir, gitInDirectory);

    expect(key).toBe('github.com/acme/leon');
  });

  it('donne la même clé depuis un sous-dossier du dépôt', async () => {
    await run('git', ['init', '--quiet'], { cwd: dir });
    await run('git', ['remote', 'add', 'origin', 'git@github.com:acme/leon.git'], { cwd: dir });
    const sub = join(dir, 'src');
    await run('mkdir', [sub]);

    expect(await projectKeyFor(sub, gitInDirectory)).toBe('github.com/acme/leon');
  });

  it("un dossier sans dépôt, ou qui n'existe pas, donne la clé du dossier", async () => {
    expect(await projectKeyFor(dir, gitInDirectory)).toBe(dossierKey(dir));
    const absent = join(dir, 'absent');
    expect(await projectKeyFor(absent, gitInDirectory)).toBe(dossierKey(absent));
  });
});
