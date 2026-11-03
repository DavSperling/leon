// Les mises à jour automatiques (S12 du plan « CLI sans clone »). Tout se passe dans un HOME temporaire, avec un faux
// serveur (un `fetch` qui sert le manifeste K7, la CLI et l'archive de Node) et une fausse archive Node : un script
// `sh` dont `--version` donne la version voulue et qui laisse le vrai Node jouer le reste, empaqueté en `.tar.xz`
// comme celle de nodejs.org. Jamais le vrai ~/.leon, jamais le réseau. Le vrai processus, détaché, est dans
// self-update.contrat.test.ts.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeConnection } from './connection';
import { writeConsent } from './consent';
import { singleQuote } from './hook-commands';
import { launcherScript } from './launcher';
import {
  nodePlatform,
  readMaj,
  runUpdate,
  scheduleUpdate,
  startBackgroundUpdate,
  UPDATE_INTERVAL_MS,
  type UpdateDeps,
} from './self-update';

const run = promisify(execFile);
const TOKEN = `leon_${'a'.repeat(43)}`;
const SERVER = 'https://leon.example';
const NOW = new Date('2026-11-04T09:00:00.000Z');
const V_OLD = 'a'.repeat(12); // la CLI posée par l'installation
const V_NEW = 'c'.repeat(12);
const V_NEWER = 'e'.repeat(12);
const NODE_OLD = '24.22.2';
const NODE_NEW = '24.99.0';
const PLATFORM = 'linux-x64';
const sha256 = (content: string | Buffer) => createHash('sha256').update(content).digest('hex');

// Un `node` posé : `--version` donne sa version ; le reste (`node leon.mjs …`) est joué par le vrai Node de la
// machine, et note son passage dans `marker` s'il y en a un.
const nodeScript = (version: string, marker?: string) =>
  `#!/bin/sh\nif [ "$1" = --version ]; then echo v${version}; else ${marker ? `echo ran >> ${singleQuote(marker)}; ` : ''}exec ${singleQuote(process.execPath)} "$@"; fi\n`;
// Une CLI : `--version` donne sa version.
const cliScript = (version: string) =>
  `if (process.argv[2] === '--version') console.log('${version}');\n`;

let base: string;
let home: string;
let leon: string;

beforeAll(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'leon-self-update-')));
});
afterAll(() => rm(base, { recursive: true, force: true }));
afterEach(() => {
  vi.unstubAllEnvs();
});
beforeEach(async () => {
  home = await mkdtemp(join(base, 'home-'));
  leon = join(home, '.leon');
});

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
const names = (dir: string) => readdir(dir).then((list) => list.sort());

// L'archive d'un Node, comme celle de nodejs.org : node-v<version>-<plateforme>/bin/node, avec d'autres fichiers
// autour (seul bin/node doit être pris).
const archives = new Map<string, Buffer>();
async function nodeArchive(version: string, script: string): Promise<Buffer> {
  const key = `${version}\0${script}`;
  const known = archives.get(key);
  if (known) return known;
  const root = await mkdtemp(join(base, 'archive-'));
  const name = `node-v${version}-${PLATFORM}`;
  await mkdir(join(root, name, 'bin'), { recursive: true });
  await writeFile(join(root, name, 'bin', 'node'), script, { mode: 0o755 });
  await writeFile(join(root, name, 'bin', 'npm'), '#!/bin/sh\n', { mode: 0o755 });
  await writeFile(join(root, name, 'README.md'), 'Node.js\n');
  await run('tar', ['-cJf', join(root, 'node.tar.xz'), '-C', root, name]);
  const archive = await readFile(join(root, 'node.tar.xz'));
  archives.set(key, archive);
  return archive;
}

type Release = {
  version?: string; // la CLI servie
  body?: string; // le fichier servi (celui du manifeste par défaut)
  manifestSha?: string;
  manifestSize?: number;
  manifestStatus?: number;
  // Un autre Node que celui qui est posé : sa version, son archive et son empreinte (par défaut ceux de l'archive).
  node?: { version: string; script?: string; archive?: Buffer; sha?: string };
};

// Le faux serveur : le manifeste K7, la CLI et, si le Node change, son archive. `calls` : les chemins demandés.
async function serve(release: Release = {}) {
  const version = release.version ?? V_NEW;
  const body = Buffer.from(release.body ?? cliScript(version));
  const nodeVersion = release.node?.version ?? NODE_OLD;
  const archive = release.node
    ? (release.node.archive ??
      (await nodeArchive(nodeVersion, release.node.script ?? nodeScript(nodeVersion))))
    : null;
  const other = 'f'.repeat(64);
  const manifest = {
    version,
    sha256: release.manifestSha ?? sha256(body),
    taille: release.manifestSize ?? body.length,
    node: {
      version: nodeVersion,
      plateformes: {
        'darwin-arm64': other,
        'darwin-x64': other,
        'linux-x64': release.node?.sha ?? (archive ? sha256(archive) : other),
        'linux-arm64': other,
      },
    },
  };
  const calls: string[] = [];
  const impl = vi.fn(async (input: URL | string) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname === '/cli/version.json') {
      return release.manifestStatus
        ? new Response('{}', { status: release.manifestStatus })
        : Response.json(manifest);
    }
    if (url.pathname === `/cli/leon-${version}.mjs`) return new Response(body);
    if (archive && url.pathname === `/dist/v${nodeVersion}/node-v${nodeVersion}-${PLATFORM}.tar.xz`)
      return new Response(new Uint8Array(archive));
    return new Response('not found', { status: 404 });
  });
  return { fetch: impl as unknown as typeof fetch, calls, manifest, body };
}

// Le serveur injoignable : un test qui ne doit pas toucher au réseau le vérifie avec `expect(offline)`.
const offline = vi.fn(async () => {
  throw new Error('no network');
});
const noNetwork = offline as unknown as typeof fetch;
beforeEach(() => {
  offline.mockClear();
});

function setup(over: Partial<UpdateDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: UpdateDeps = {
    home,
    cliVersion: V_OLD,
    fetch: noNetwork,
    platform: PLATFORM,
    nodeDist: `${SERVER}/dist`,
    now: () => NOW,
    out: (text) => out.push(text),
    err: (text) => err.push(text),
    ...over,
  };
  return { deps, out, err };
}

const addCli = async (version: string) => {
  await mkdir(join(leon, 'cli', version), { recursive: true });
  await writeFile(join(leon, 'cli', version, 'leon.mjs'), cliScript(version), { mode: 0o644 });
};

// Une installation de `curl | sh` : le Node et la CLI posés, les liens, la connexion, l'accord et le lanceur.
async function install() {
  await writeConnection(home, {
    url: SERVER,
    jeton: TOKEN,
    ordinateur: 'MacBook-Pro',
    espace: 'Acme',
    cree_le: '2026-11-03T10:00:00.000Z',
  });
  await mkdir(join(leon, 'runtime', `node-v${NODE_OLD}`), { recursive: true });
  await writeFile(join(leon, 'runtime', `node-v${NODE_OLD}`, 'node'), nodeScript(NODE_OLD), {
    mode: 0o755,
  });
  await symlink(`node-v${NODE_OLD}`, join(leon, 'runtime', 'actuel'));
  await addCli(V_OLD);
  await symlink(V_OLD, join(leon, 'cli', 'actuelle'));
  await mkdir(join(leon, 'bin'));
  await writeFile(join(leon, 'bin', 'leon'), launcherScript(home, { kind: 'installee' }), {
    mode: 0o700,
  });
  await writeConsent(home, 'claude_code', 2);
}

// L'arbre de ~/.leon : chaque fichier avec l'empreinte de son contenu, chaque lien avec sa cible.
async function snapshot(dir = leon): Promise<string[]> {
  const lines: string[] = [];
  const walk = async (current: string, prefix: string) => {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(current, entry.name);
      const name = `${prefix}${entry.name}`;
      if (entry.isSymbolicLink()) lines.push(`${name} -> ${await readlink(path)}`);
      else if (entry.isDirectory()) {
        lines.push(`${name}/`);
        await walk(path, `${name}/`);
      } else lines.push(`${name} ${sha256(await readFile(path))}`);
    }
  };
  await walk(dir, '');
  return lines;
}
// Hors maj.json, que le contrôle d'une version écrit même quand la mise à jour échoue après.
const apartFromMaj = (lines: string[]) => lines.filter((line) => !line.startsWith('maj.json'));

const current = (link: string) => readlink(join(leon, link));
// Aucune requête de mise à jour ne porte le jeton : ni en-tête, ni dans l'adresse (le manifeste et la CLI sont publics).
const expectNoToken = (fetchImpl: typeof fetch) => {
  const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  for (const [url, init] of calls) {
    expect(String(url)).not.toContain(TOKEN);
    expect((init as RequestInit | undefined)?.headers).toBeUndefined();
  }
};
const expectNothingLeaked = (err: string[]) => {
  const said = err.join('\n');
  expect(said).not.toContain(TOKEN);
  expect(said).not.toContain('leon.example');
};

describe('nodePlatform', () => {
  it.each([
    ['darwin', 'arm64', 'darwin-arm64'],
    ['darwin', 'x64', 'darwin-x64'],
    ['linux', 'x64', 'linux-x64'],
    ['linux', 'arm64', 'linux-arm64'],
    ['win32', 'x64', null],
    ['linux', 'ia32', null],
    ['freebsd', 'x64', null],
  ])('%s %s : %s', (os, arch, expected) => {
    expect(nodePlatform(os, arch)).toBe(expected);
  });
});

describe('readMaj', () => {
  const write = async (text: string) => {
    await mkdir(leon, { recursive: true });
    await writeFile(join(leon, 'maj.json'), text);
  };

  it('lit la date du dernier contrôle et la version précédente', async () => {
    await write(JSON.stringify({ verifie_le: NOW.toISOString(), precedente: V_OLD }));

    expect(await readMaj(home)).toEqual({ verifie_le: NOW, precedente: V_OLD });
  });

  it.each([
    ['absent', null],
    ['illisible', '{'],
    ['pas un objet', '"2026-11-04"'],
    ['une date qui n’en est pas une', JSON.stringify({ verifie_le: 'hier', precedente: 'zz' })],
  ])('un fichier %s ne dit rien', async (_name, text) => {
    if (text !== null) await write(text);

    expect(await readMaj(home)).toEqual({ verifie_le: null, precedente: null });
  });

  it('ne retient pas une version précédente qui n’a pas la forme d’une version', async () => {
    await write(JSON.stringify({ verifie_le: NOW.toISOString(), precedente: '../etc' }));

    expect(await readMaj(home)).toEqual({ verifie_le: NOW, precedente: null });
  });
});

describe('scheduleUpdate', () => {
  const start = vi.fn();
  beforeEach(() => start.mockClear());
  const writeMaj = async (verified: Date | string) => {
    await mkdir(leon, { recursive: true });
    const date = typeof verified === 'string' ? verified : verified.toISOString();
    await writeFile(join(leon, 'maj.json'), JSON.stringify({ verifie_le: date }));
  };
  const schedule = (cliVersion = V_OLD) =>
    scheduleUpdate({ home, cliVersion, now: () => NOW, start });
  const ago = (ms: number) => new Date(NOW.getTime() - ms);

  it('lance la mise à jour quand maj.json manque', async () => {
    expect(await schedule()).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('lance la mise à jour quand le dernier contrôle a 24 h ou plus', async () => {
    await writeMaj(ago(UPDATE_INTERVAL_MS));

    expect(await schedule()).toBe(true);
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('ne lance rien quand le dernier contrôle a moins de 24 h', async () => {
    await writeMaj(ago(UPDATE_INTERVAL_MS - 1000));

    expect(await schedule()).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('lance la mise à jour quand le dernier contrôle est dans le futur (horloge remise en arrière)', async () => {
    await writeMaj(new Date(NOW.getTime() + 3_600_000));

    expect(await schedule()).toBe(true);
  });

  it('lance la mise à jour quand maj.json est illisible', async () => {
    await mkdir(leon, { recursive: true });
    await writeFile(join(leon, 'maj.json'), '{');

    expect(await schedule()).toBe(true);
  });

  it('ne lance jamais rien sous la forme clone, maj.json absent ou périmé', async () => {
    expect(await schedule('dev')).toBe(false);
    await writeMaj(ago(10 * UPDATE_INTERVAL_MS));
    expect(await schedule('dev')).toBe(false);
    expect(start).not.toHaveBeenCalled();
  });

  it('n’écrit rien sur le disque', async () => {
    await schedule();

    expect(await exists(leon)).toBe(false);
  });
});

describe('startBackgroundUpdate', () => {
  // Le vrai processus : `update --background` part détaché, sans entrée ni sortie, et survit au retour de l'appel.
  it('lance `update --background` sans attendre, et le processus continue ensuite', async () => {
    const script = join(home, 'child.mjs');
    const marker = join(home, 'marker');
    await writeFile(
      script,
      `import { writeFileSync } from 'node:fs';\nsetTimeout(() => writeFileSync(${JSON.stringify(marker)}, process.argv.slice(2).join(' ')), 800);\n`,
    );
    const started = Date.now();

    startBackgroundUpdate({ node: process.execPath, script, home });

    expect(Date.now() - started).toBeLessThan(500);
    expect(await exists(marker)).toBe(false);
    for (let i = 0; i < 100 && !(await exists(marker)); i++) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(await readFile(marker, 'utf8')).toBe('update --background');
  });

  it('sans script à lancer, ne fait rien', () => {
    expect(() =>
      startBackgroundUpdate({ node: process.execPath, script: undefined, home }),
    ).not.toThrow();
  });
});

describe('runUpdate', () => {
  describe('même version', () => {
    it('ne télécharge rien, met maj.json à jour et ne touche à rien d’autre', async () => {
      await install();
      const before = await snapshot();
      const server = await serve({ version: V_OLD });
      const { deps, out, err } = setup({ fetch: server.fetch });

      expect(await runUpdate({ previous: false }, deps)).toBe(0);

      expect(server.calls).toEqual(['/cli/version.json']);
      expect(await readMaj(home)).toEqual({ verifie_le: NOW, precedente: null });
      expect((await stat(join(leon, 'maj.json'))).mode & 0o777).toBe(0o600);
      expect(apartFromMaj(await snapshot())).toEqual(before);
      expect(out.join('\n')).toContain('up to date');
      expect(err).toEqual([]);
    });

    it('garde la version précédente que maj.json connaît', async () => {
      await install();
      await writeFile(
        join(leon, 'maj.json'),
        JSON.stringify({ verifie_le: '2026-10-01T00:00:00.000Z', precedente: V_NEW }),
      );
      const server = await serve({ version: V_OLD });

      await runUpdate({ previous: false }, setup({ fetch: server.fetch }).deps);

      expect(await readMaj(home)).toEqual({ verifie_le: NOW, precedente: V_NEW });
    });
  });

  describe('un téléchargement qui ne vaut rien', () => {
    it.each([
      ['une empreinte fausse', { manifestSha: 'd'.repeat(64) }, 'SHA-256'],
      ['un fichier plus court que la taille annoncée', { manifestSize: 5000 }, 'size'],
      ['un fichier plus long que la taille annoncée', { manifestSize: 10 }, 'larger'],
      ['un fichier qui ne démarre pas', { body: 'process.exit(3);\n' }, 'does not start'],
      ['un fichier qui donne une autre version', { body: cliScript(V_NEWER) }, 'does not start'],
    ] as const)('%s : actuelle ne bouge pas et rien n’est laissé', async (_name, release, said) => {
      await install();
      const before = await snapshot();
      const server = await serve(release);
      const { deps, err } = setup({ fetch: server.fetch });

      expect(await runUpdate({ previous: false }, deps)).toBe(1);

      expect(await current('cli/actuelle')).toBe(V_OLD);
      expect(apartFromMaj(await snapshot())).toEqual(before);
      expect(err.join('\n')).toContain(said);
      expectNothingLeaked(err);
    });
  });

  describe('succès', () => {
    it('actuelle pointe sur la nouvelle version, la précédente reste, les plus anciennes partent', async () => {
      await install();
      await addCli('d'.repeat(12)); // une version d'avant, que ce chantier n'a pas pu garder
      await mkdir(join(leon, 'cli', 'notes')); // pas à Leon : n'a pas la forme d'une version
      await mkdir(join(leon, 'runtime', 'node-v20.0.0')); // un autre Node, laissé par une réinstallation
      const protectedFiles = ['connexion.json', 'accord.json', join('bin', 'leon')];
      const kept = await Promise.all(protectedFiles.map((f) => readFile(join(leon, f), 'utf8')));
      const server = await serve();
      const { deps, out, err } = setup({ fetch: server.fetch });

      expect(await runUpdate({ previous: false }, deps)).toBe(0);

      expect(server.calls).toEqual(['/cli/version.json', `/cli/leon-${V_NEW}.mjs`]);
      expect(await current('cli/actuelle')).toBe(V_NEW);
      expect(await names(join(leon, 'cli'))).toEqual([V_NEW, V_OLD, 'actuelle', 'notes'].sort());
      expect(await names(join(leon, 'cli', V_NEW))).toEqual(['leon.mjs']);
      expect(await readFile(join(leon, 'cli', V_NEW, 'leon.mjs'))).toEqual(server.body);
      expect((await stat(join(leon, 'cli', V_NEW, 'leon.mjs'))).mode & 0o777).toBe(0o644);
      expect(await names(join(leon, 'runtime'))).toEqual(['actuel', `node-v${NODE_OLD}`]);
      expect(await current('runtime/actuel')).toBe(`node-v${NODE_OLD}`);
      expect(await readMaj(home)).toEqual({ verifie_le: NOW, precedente: V_OLD });
      // Ni la connexion, ni l'accord, ni le lanceur, ni les crochets : rien de tout cela n'est à elle.
      expect(await Promise.all(protectedFiles.map((f) => readFile(join(leon, f), 'utf8')))).toEqual(
        kept,
      );
      // Rien ne reste du dossier de travail.
      expect((await names(leon)).filter((name) => name.startsWith('.update'))).toEqual([]);
      expect(out.join('\n')).toContain(V_NEW);
      expect(err).toEqual([]);
    });

    it('à la mise à jour suivante, la précédente devient celle d’avant et la plus ancienne part', async () => {
      await install();
      const first = await serve({ version: V_NEW });
      await runUpdate({ previous: false }, setup({ fetch: first.fetch }).deps);
      const second = await serve({ version: V_NEWER });

      expect(
        await runUpdate(
          { previous: false },
          setup({ fetch: second.fetch, cliVersion: V_NEW }).deps,
        ),
      ).toBe(0);

      expect(await current('cli/actuelle')).toBe(V_NEWER);
      expect(await names(join(leon, 'cli'))).toEqual([V_NEW, V_NEWER, 'actuelle'].sort());
      expect(await readMaj(home)).toEqual({ verifie_le: NOW, precedente: V_NEW });
    });
  });

  describe('Node', () => {
    it('est posé avant la CLI, lancé, puis runtime/actuel bascule et l’ancien Node est effacé', async () => {
      await install();
      const marker = join(home, 'marker');
      const server = await serve({
        node: { version: NODE_NEW, script: nodeScript(NODE_NEW, marker) },
      });
      const { deps, err } = setup({ fetch: server.fetch });

      expect(await runUpdate({ previous: false }, deps)).toBe(0);

      const archive = `/dist/v${NODE_NEW}/node-v${NODE_NEW}-${PLATFORM}.tar.xz`;
      expect(server.calls).toEqual(['/cli/version.json', archive, `/cli/leon-${V_NEW}.mjs`]);
      expect(await current('runtime/actuel')).toBe(`node-v${NODE_NEW}`);
      expect(await names(join(leon, 'runtime'))).toEqual(['actuel', `node-v${NODE_NEW}`]);
      // Seul bin/node de l'archive est pris.
      expect(await names(join(leon, 'runtime', `node-v${NODE_NEW}`))).toEqual(['node']);
      expect((await stat(join(leon, 'runtime', `node-v${NODE_NEW}`, 'node'))).mode & 0o777).toBe(
        0o755,
      );
      // La CLI est vérifiée avec le nouveau Node, celui que le lanceur va lancer.
      expect(await exists(marker)).toBe(true);
      expect(await current('cli/actuelle')).toBe(V_NEW);
      expect(err).toEqual([]);
    });

    it('seul (la CLI est à jour) : la CLI et sa version précédente ne bougent pas', async () => {
      await install();
      const before = (await snapshot()).filter((line) => line.startsWith('cli'));
      const server = await serve({ version: V_OLD, node: { version: NODE_NEW } });

      expect(await runUpdate({ previous: false }, setup({ fetch: server.fetch }).deps)).toBe(0);

      expect(server.calls).not.toContain(`/cli/leon-${V_OLD}.mjs`);
      expect(await current('runtime/actuel')).toBe(`node-v${NODE_NEW}`);
      expect((await snapshot()).filter((line) => line.startsWith('cli'))).toEqual(before);
    });

    it.each([
      ['une archive à l’empreinte fausse', { sha: 'd'.repeat(64) }, 'SHA-256'],
      [
        'une archive qui n’en est pas une',
        { archive: Buffer.from('pas une archive'), sha: sha256('pas une archive') },
        'unpack',
      ],
      [
        'un Node qui donne une autre version',
        { script: `#!/bin/sh\necho v1.0.0\n` },
        'does not start',
      ],
    ] as const)(
      '%s : runtime/actuel ne bouge pas, la CLI n’est pas téléchargée, rien n’est laissé',
      async (_name, node, said) => {
        await install();
        const before = await snapshot();
        const server = await serve({ node: { version: NODE_NEW, ...node } });
        const { deps, err } = setup({ fetch: server.fetch });

        expect(await runUpdate({ previous: false }, deps)).toBe(1);

        expect(server.calls).not.toContain(`/cli/leon-${V_NEW}.mjs`);
        expect(await current('runtime/actuel')).toBe(`node-v${NODE_OLD}`);
        expect(apartFromMaj(await snapshot())).toEqual(before);
        expect(err.join('\n')).toContain(said);
        expectNothingLeaked(err);
      },
    );

    it('sur une plateforme sans Node officiel : rien n’est écrit, et le message le dit', async () => {
      await install();
      const before = await snapshot();
      const server = await serve({ node: { version: NODE_NEW } });
      const { deps, err } = setup({ fetch: server.fetch, platform: null });

      expect(await runUpdate({ previous: false }, deps)).toBe(1);

      expect(apartFromMaj(await snapshot())).toEqual(before);
      expect(err.join('\n')).toContain('not supported');
    });
  });

  describe('forme clone', () => {
    it.each([false, true])(
      'ne fait rien (previous : %s) : ni réseau ni écriture',
      async (previous) => {
        await install();
        const before = await snapshot();
        const { deps, err } = setup({ cliVersion: 'dev' });

        expect(await runUpdate({ previous }, deps)).toBe(1);

        expect(offline).not.toHaveBeenCalled();
        expect(await snapshot()).toEqual(before);
        expect(err.join('\n')).toContain('clone');
      },
    );
  });

  describe('serveur', () => {
    // E5 (LEON_URL et LEON_TOKEN avant connexion.json) ne vaut pas ici : l'adresse de mise à jour décide du code qui
    // tournera ensuite sur la machine, un serveur d'essai de l'environnement ne doit pas pouvoir le remplacer.
    it.each([
      ['absente', () => rm(join(leon, 'connexion.json'))],
      ['illisible', () => writeFile(join(leon, 'connexion.json'), '{')],
    ])(
      'connexion.json %s : le dit en une phrase, sans réseau et sans rien écrire, même avec LEON_URL et LEON_TOKEN',
      async (_name, spoil) => {
        await install();
        await spoil();
        vi.stubEnv('LEON_URL', 'http://localhost:3999');
        vi.stubEnv('LEON_TOKEN', TOKEN);
        const before = await snapshot();
        const server = await serve();
        const { deps, err } = setup({ fetch: server.fetch });

        expect(await runUpdate({ previous: false }, deps)).toBe(1);

        expect(server.calls).toEqual([]);
        expect(await snapshot()).toEqual(before); // ni maj.json ni verrou
        expect(err).toEqual(['Leon: this computer is not connected: run `leon login`.']);
      },
    );

    it('sans ~/.leon du tout : ne crée rien', async () => {
      const server = await serve();

      expect(await runUpdate({ previous: false }, setup({ fetch: server.fetch }).deps)).toBe(1);

      expect(server.calls).toEqual([]);
      expect(await exists(leon)).toBe(false);
    });

    it('ne suit que connexion.json : le serveur de LEON_URL et LEON_TOKEN n’est jamais interrogé', async () => {
      await install();
      vi.stubEnv('LEON_URL', 'http://localhost:3999');
      vi.stubEnv('LEON_TOKEN', TOKEN);
      const right = await serve({ version: V_OLD });
      const other = await serve({ version: V_NEW });
      const fetchImpl = vi.fn((input: URL | string, init?: RequestInit) =>
        new URL(String(input)).origin === SERVER
          ? right.fetch(input, init)
          : other.fetch(input, init),
      ) as unknown as typeof fetch;

      expect(await runUpdate({ previous: false }, setup({ fetch: fetchImpl }).deps)).toBe(0);

      expect(right.calls).toEqual(['/cli/version.json']);
      expect(other.calls).toEqual([]);
      expect(await current('cli/actuelle')).toBe(V_OLD);
      expectNoToken(fetchImpl);
    });

    it('n’envoie le jeton à aucune requête : le manifeste, la CLI et Node sont publics', async () => {
      await install();
      const server = await serve({ node: { version: NODE_NEW } });

      expect(await runUpdate({ previous: false }, setup({ fetch: server.fetch }).deps)).toBe(0);

      expect(server.calls).toHaveLength(3); // le manifeste, l'archive de Node, la CLI
      expectNoToken(server.fetch);
    });

    it.each([
      ['une erreur 500', { manifestStatus: 500 }],
      ['un manifeste qui n’en est pas un', { manifestSize: -1 }],
    ] as const)('%s : échoue sans rien écrire', async (_name, release) => {
      await install();
      const before = await snapshot();
      const server = await serve(release);
      const { deps, err } = setup({ fetch: server.fetch });

      expect(await runUpdate({ previous: false }, deps)).toBe(1);

      expect(await snapshot()).toEqual(before); // pas même maj.json : le contrôle sera refait
      expectNothingLeaked(err);
    });

    it('injoignable : échoue sans rien écrire', async () => {
      await install();
      const before = await snapshot();
      const { deps, err } = setup();

      expect(await runUpdate({ previous: false }, deps)).toBe(1);

      expect(await snapshot()).toEqual(before);
      expectNothingLeaked(err);
    });
  });

  describe('verrou', () => {
    it('une autre mise à jour est en cours : rien, sans bruit', async () => {
      await install();
      await mkdir(join(leon, 'maj.lock'));
      const before = await snapshot();
      const server = await serve();
      const { deps, out, err } = setup({ fetch: server.fetch });

      expect(await runUpdate({ previous: false }, deps)).toBe(0);

      expect(server.calls).toEqual([]);
      expect(await snapshot()).toEqual(before);
      expect([...out, ...err]).toEqual([]);
    });

    it('un verrou resté d’une mise à jour morte (plus de 15 minutes) est repris, puis rendu', async () => {
      await install();
      await mkdir(join(leon, 'maj.lock'));
      const old = new Date(Date.now() - 3_600_000);
      await utimes(join(leon, 'maj.lock'), old, old);
      const server = await serve();

      expect(await runUpdate({ previous: false }, setup({ fetch: server.fetch }).deps)).toBe(0);

      expect(await current('cli/actuelle')).toBe(V_NEW);
      expect(await exists(join(leon, 'maj.lock'))).toBe(false);
    });
  });

  it('refuse d’écrire maj.json à travers un lien symbolique', async () => {
    await install();
    const elsewhere = join(home, 'ailleurs.json');
    await writeFile(elsewhere, 'intact');
    await symlink(elsewhere, join(leon, 'maj.json'));
    const server = await serve({ version: V_OLD });
    const { deps, err } = setup({ fetch: server.fetch });

    expect(await runUpdate({ previous: false }, deps)).toBe(1);

    expect(await readFile(elsewhere, 'utf8')).toBe('intact');
    expect(err.join('\n')).toContain('symbolic link');
  });

  describe('--previous', () => {
    const updated = async () => {
      await install();
      const server = await serve();
      await runUpdate({ previous: false }, setup({ fetch: server.fetch }).deps);
    };

    it('revient à la version précédente, sans réseau, et la version quittée devient la précédente', async () => {
      await updated();
      const { deps, out, err } = setup({ cliVersion: V_NEW });

      expect(await runUpdate({ previous: true }, deps)).toBe(0);

      expect(offline).not.toHaveBeenCalled();
      expect(await current('cli/actuelle')).toBe(V_OLD);
      expect(await readMaj(home)).toEqual({ verifie_le: NOW, precedente: V_NEW });
      expect(await names(join(leon, 'cli'))).toEqual([V_NEW, V_OLD, 'actuelle'].sort());
      expect(out.join('\n')).toContain(V_OLD);
      expect(err).toEqual([]);
    });

    it('une seconde fois, revient à la version d’avant le retour', async () => {
      await updated();
      await runUpdate({ previous: true }, setup({ cliVersion: V_NEW }).deps);

      expect(await runUpdate({ previous: true }, setup({ cliVersion: V_OLD }).deps)).toBe(0);

      expect(await current('cli/actuelle')).toBe(V_NEW);
    });

    it('renouvelle le délai de 24 h : le retour n’est pas défait au prochain crochet', async () => {
      await updated();
      await writeFile(
        join(leon, 'maj.json'),
        JSON.stringify({ verifie_le: '2026-10-01T00:00:00.000Z', precedente: V_OLD }),
      );

      await runUpdate({ previous: true }, setup({ cliVersion: V_NEW }).deps);

      expect((await readMaj(home)).verifie_le).toEqual(NOW);
    });

    it.each([
      ['il n’y en a pas', false, async () => {}],
      ['son dossier a disparu', true, () => rm(join(leon, 'cli', V_OLD), { recursive: true })],
      [
        'elle ne démarre plus',
        true,
        () => writeFile(join(leon, 'cli', V_OLD, 'leon.mjs'), 'process.exit(3);\n'),
      ],
    ])('échoue sans rien changer quand %s', async (_name, afterUpdate, spoil) => {
      if (afterUpdate) await updated();
      else await install();
      await spoil();
      const before = await snapshot();
      const { deps, err } = setup({ cliVersion: V_NEW });

      expect(await runUpdate({ previous: true }, deps)).toBe(1);

      expect(await snapshot()).toEqual(before);
      expect(err.join('\n')).toContain('previous');
    });
  });
});
