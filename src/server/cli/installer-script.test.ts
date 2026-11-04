import { execFile, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installerScript } from './installer-script';

vi.mock('@/server/env', () => ({ env: { BETTER_AUTH_URL: 'http://localhost:3000' } }));

const run = promisify(execFile);

// Le script d'installation (S09 du plan « CLI sans clone ») : le texte lui-même, la route qui le sert, et le script
// lancé pour de bon par `sh`, comme `curl -fsSL <leon>/install | sh`, dans un HOME temporaire, contre un faux serveur
// local et une fausse archive de Node. Le serveur local ouvre un port : ces tests se lancent hors de la sandbox.
const NODE_VERSION = '24.22.2';
const PLATFORMS = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'] as const;
type Platform = (typeof PLATFORMS)[number];
const sha256 = (content: string | Uint8Array) => createHash('sha256').update(content).digest('hex');
const hex = (seed: string) => sha256(seed);

// Le manifeste de K7, avec des empreintes qui n'ont de sens que dans ce fichier.
const manifest = {
  version: '0123456789ab',
  sha256: hex('cli'),
  taille: 134981,
  node: {
    version: NODE_VERSION,
    plateformes: Object.fromEntries(PLATFORMS.map((p) => [p, hex(p)])) as Record<Platform, string>,
  },
};

const hasCommand = (name: string) => {
  try {
    execFileSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

describe('installerScript : le texte', () => {
  const script = installerScript('https://leon.example', manifest);

  it('est un script sh qui s’arrête à la première erreur', () => {
    expect(script.startsWith('#!/bin/sh\n')).toBe(true);
    expect(script).toMatch(/^set -eu$/m);
  });

  it('porte l’adresse, la CLI et les empreintes de Node, entre apostrophes', () => {
    expect(script).toContain("LEON_SERVER='https://leon.example'");
    expect(script).toContain("CLI_VERSION='0123456789ab'");
    expect(script).toContain(`CLI_SHA256='${manifest.sha256}'`);
    expect(script).toContain("CLI_SIZE='134981'");
    expect(script).toContain(`NODE_VERSION='${NODE_VERSION}'`);
    for (const platform of PLATFORMS) {
      const name = `NODE_SHA256_${platform.toUpperCase().replace('-', '_')}`;
      expect(script).toContain(`${name}='${manifest.node.plateformes[platform]}'`);
    }
  });

  it('prend l’origine de l’adresse : sans barre finale, sur un port local en http', () => {
    expect(installerScript('https://leon.example/', manifest)).toContain(
      "LEON_SERVER='https://leon.example'",
    );
    expect(installerScript('http://localhost:3000', manifest)).toContain(
      "LEON_SERVER='http://localhost:3000'",
    );
    expect(installerScript('http://127.0.0.1:3011', manifest)).toContain(
      "LEON_SERVER='http://127.0.0.1:3011'",
    );
  });

  // m11 : `LEON_URL` est le nom que `leon setup` lit dans son environnement. Une variable du script qui s'appelle ainsi
  // remplacerait celle que la personne a déjà exportée dans son terminal (la valeur change, et setup en hérite).
  it('n’appelle aucune de ses variables LEON_URL ni LEON_TOKEN (setup les lit dans l’environnement)', () => {
    expect(script).not.toMatch(/\bLEON_URL\b|\bLEON_TOKEN\b/);
  });

  // I3 et M2 : l'en-tête, que la personne lit avant de lancer le script, dit les deux choses qu'elle ne devinerait pas.
  describe('l’en-tête', () => {
    // Les lignes de commentaire mises bout à bout : les phrases passent d'une ligne à l'autre.
    const header = script.slice(0, script.indexOf('set -eu')).replaceAll('\n# ', ' ');

    it('annonce les mises à jour automatiques et le retour en arrière', () => {
      expect(header).toMatch(
        /updates itself, at most once a day, from the server it is connected to/,
      );
      expect(header).toContain('~/.leon/bin/leon update --previous');
    });

    it('dit tout ce que le script écrit : ~/.leon et, après accord, les réglages des outils de code', () => {
      expect(header).toMatch(
        /writes only in ~\/\.leon, plus the settings of your coding tools after you agree/,
      );
      expect(header).toMatch(/nothing in your PATH or your shell profile/);
      expect(header).not.toContain('writes nothing outside');
    });
  });

  it('tient dans une fonction appelée à la dernière ligne : un téléchargement coupé ne lance rien', () => {
    expect(script.trimEnd().split('\n').at(-1)).toBe('main "$@"');
  });

  it('passe sh -n', async () => {
    const child = spawn('sh', ['-n']);
    child.stdin.end(script);
    const [code] = (await once(child, 'close')) as [number];
    expect(code).toBe(0);
  });

  it.skipIf(!hasCommand('dash'))('passe dash -n', async () => {
    const child = spawn('dash', ['-n']);
    child.stdin.end(script);
    const [code] = (await once(child, 'close')) as [number];
    expect(code).toBe(0);
  });

  it.skipIf(!hasCommand('shellcheck'))('passe shellcheck', async () => {
    const child = spawn('shellcheck', ['-s', 'sh', '-']);
    child.stdin.end(script);
    const [code] = (await once(child, 'close')) as [number];
    expect(code).toBe(0);
  });

  it('ne dit pas bash : aucun bashisme courant', () => {
    expect(script).not.toMatch(
      /\[\[|\bfunction\s+\w+|<<<|\$\{[^}]*[,^]{1,2}[^}]*\}|\blocal\b|\bsource\b/,
    );
  });

  // Une valeur qui n'a pas la forme attendue arrête la fabrication du script : rien ne part vers `sh`.
  describe('refuse une valeur qui pourrait injecter du shell', () => {
    const HOSTILE = "x'; touch /tmp/leon-injection; '";
    const bad = (name: string, call: () => unknown) =>
      it(name, () => {
        let message = '';
        try {
          call();
        } catch (error) {
          message = (error as Error).message;
        }
        expect(message).not.toBe('');
        expect(message).not.toContain('leon-injection');
      });

    bad('une adresse avec une apostrophe', () =>
      installerScript(`https://leon.example/${HOSTILE}`, manifest),
    );
    bad('une adresse avec un chemin', () => installerScript('https://leon.example/app', manifest));
    bad('une adresse avec une requête', () =>
      installerScript('https://leon.example/?a=1', manifest),
    );
    bad('une adresse avec un compte', () =>
      installerScript('https://user:pass@leon.example', manifest),
    );
    bad('une adresse en http hors de la machine', () =>
      installerScript('http://leon.example', manifest),
    );
    bad('une adresse qui n’est pas http', () => installerScript('file:///etc/passwd', manifest));
    bad('une adresse vide', () => installerScript('', manifest));
    bad('un hôte à substitution', () => installerScript('https://$(touch x).example', manifest));
    bad('une version de CLI hostile', () =>
      installerScript('https://leon.example', { ...manifest, version: HOSTILE }),
    );
    bad('une empreinte de CLI en majuscules', () =>
      installerScript('https://leon.example', { ...manifest, sha256: hex('cli').toUpperCase() }),
    );
    bad('une empreinte de CLI hostile', () =>
      installerScript('https://leon.example', { ...manifest, sha256: HOSTILE }),
    );
    bad('une taille qui n’est pas un entier', () =>
      installerScript('https://leon.example', { ...manifest, taille: 1.5 }),
    );
    bad('une taille négative', () =>
      installerScript('https://leon.example', { ...manifest, taille: -1 }),
    );
    bad('une version de Node hostile', () =>
      installerScript('https://leon.example', {
        ...manifest,
        node: { ...manifest.node, version: `24.0.0${HOSTILE}` },
      }),
    );
    bad('une empreinte de Node hostile', () =>
      installerScript('https://leon.example', {
        ...manifest,
        node: {
          ...manifest.node,
          plateformes: { ...manifest.node.plateformes, 'linux-x64': HOSTILE },
        },
      }),
    );
    bad('une plateforme de Node manquante', () =>
      installerScript('https://leon.example', {
        ...manifest,
        node: { version: NODE_VERSION, plateformes: { 'darwin-arm64': hex('a') } },
      }),
    );
    bad('un manifeste qui n’est pas un objet', () => installerScript('https://leon.example', null));
  });
});

describe('GET /install', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'leon-install-route-'));
    vi.spyOn(process, 'cwd').mockReturnValue(dir);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
    const { env } = await import('@/server/env');
    env.BETTER_AUTH_URL = 'http://localhost:3000';
  });

  const publish = async (content: string) => {
    await mkdir(join(dir, 'public', 'cli'), { recursive: true });
    await writeFile(join(dir, 'public', 'cli', 'version.json'), content);
  };

  it('répond le script en text/plain, sans cache', async () => {
    await publish(JSON.stringify(manifest));
    const { GET } = await import('@/app/install/route');

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe(installerScript('http://localhost:3000', manifest));
  });

  it('répond 503, en text/plain et sans script, quand la CLI n’est pas construite', async () => {
    const { GET } = await import('@/app/install/route');

    const response = await GET();

    expect(response.status).toBe(503);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    expect(await response.text()).not.toMatch(/^#!/);
  });

  it('répond 503 quand le manifeste est illisible ou n’a pas la bonne forme', async () => {
    const { GET } = await import('@/app/install/route');
    for (const content of ['{ pas du json', '{}', JSON.stringify({ ...manifest, sha256: 'x' })]) {
      await publish(content);
      const response = await GET();
      expect(response.status).toBe(503);
      expect(await response.text()).not.toMatch(/^#!/);
    }
  });

  it('répond 500, sans script, quand BETTER_AUTH_URL n’est pas une simple adresse', async () => {
    await publish(JSON.stringify(manifest));
    const { env } = await import('@/server/env');
    env.BETTER_AUTH_URL = "https://leon.example/'; touch /tmp/leon-injection; '";
    const { GET } = await import('@/app/install/route');

    const response = await GET();

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toMatch(/^text\/plain/);
    const body = await response.text();
    expect(body).not.toMatch(/^#!/);
    expect(body).not.toContain('leon-injection');
  });
});

// --- Le script lancé pour de bon -------------------------------------------------------------------------------

type Outcome = { code: number | null; stdout: string; stderr: string };

const HOST_PLATFORM: Platform | undefined = (
  {
    'darwin-arm64': 'darwin-arm64',
    'darwin-x64': 'darwin-x64',
    'linux-x64': 'linux-x64',
    'linux-arm64': 'linux-arm64',
  } as Record<string, Platform>
)[`${process.platform}-${process.arch}`];

const fakeNode = (version: string) =>
  [
    '#!/bin/sh',
    `if [ "$1" = "--version" ]; then echo v${version}; exit 0; fi`,
    '{ echo "args: $*"; echo "umask: $(umask)"; echo "LEON_URL: [$LEON_URL]"; if [ -t 0 ]; then echo "stdin: tty"; else echo "stdin: not a tty"; fi; } >> "$FAKE_NODE_LOG"',
    '',
  ].join('\n');

describe.skipIf(HOST_PLATFORM === undefined)('le script lancé par sh', () => {
  let root: string;
  let server: Server;
  let port: number;
  let routes: Map<string, Buffer>;
  const hanging = new Set<string>();
  let requested: string[];
  let cliBody: string;
  let archives: Record<Platform, Buffer>;
  let current: typeof manifest;
  let home: string;
  let shim: string;

  async function archive(platform: Platform, nodeScript: string): Promise<Buffer> {
    const staging = join(root, `staging-${platform}-${sha256(nodeScript).slice(0, 6)}`);
    const top = `node-v${NODE_VERSION}-${platform}`;
    await mkdir(join(staging, top, 'bin'), { recursive: true });
    await writeFile(join(staging, top, 'bin', 'node'), nodeScript, { mode: 0o755 });
    await writeFile(join(staging, top, 'README.md'), 'not extracted\n');
    const file = join(staging, 'node.tar.xz');
    await run('tar', ['-cJf', file, '-C', staging, top]);
    return readFile(file);
  }

  // Sert le faux Leon (la CLI) et le faux nodejs.org (derrière le curl de remplacement ci-dessous).
  async function publishWorld(
    nodeScript = fakeNode(NODE_VERSION),
    cli = 'console.log("fake cli");\n',
  ) {
    cliBody = cli;
    routes = new Map();
    archives = {} as Record<Platform, Buffer>;
    for (const platform of PLATFORMS) {
      archives[platform] = await archive(platform, nodeScript);
      routes.set(
        `/nodejs/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-${platform}.tar.xz`,
        archives[platform],
      );
    }
    const version = sha256(cli).slice(1, 13);
    routes.set(`/cli/leon-${version}.mjs`, Buffer.from(cli));
    current = {
      version,
      sha256: sha256(cli),
      taille: Buffer.byteLength(cli),
      node: {
        version: NODE_VERSION,
        plateformes: Object.fromEntries(PLATFORMS.map((p) => [p, sha256(archives[p])])) as Record<
          Platform,
          string
        >,
      },
    };
  }

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'leon-install-e2e-'));
    server = createServer((request, response) => {
      requested.push(request.url ?? '');
      if (hanging.has(request.url ?? '')) return; // la réponse n'arrive jamais : un téléchargement qu'on interrompt
      const body = routes.get(request.url ?? '');
      response.writeHead(body ? 200 : 404).end(body);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    port = (server.address() as AddressInfo).port;

    // Un `curl` de remplacement : le vrai curl, mais https://nodejs.org/ mène au faux serveur local. Le script
    // garde ainsi son adresse de Node en dur, et on n'ajoute aucun réglage de test à un script de production.
    shim = join(root, 'shim');
    await mkdir(shim);
    await writeFile(
      join(shim, 'curl'),
      [
        '#!/bin/sh',
        'n=$#',
        'while [ "$n" -gt 0 ]; do',
        '  a=$1; shift',
        `  case "$a" in https://nodejs.org/*) a="http://127.0.0.1:$FAKE_PORT/nodejs/\${a#https://nodejs.org/}" ;; esac`,
        '  set -- "$@" "$a"',
        '  n=$((n - 1))',
        'done',
        'exec "$REAL_CURL" "$@"',
        '',
      ].join('\n'),
      { mode: 0o755 },
    );
  });

  afterAll(async () => {
    server.closeAllConnections();
    server.close();
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    requested = [];
    hanging.clear();
    home = await mkdtemp(join(tmpdir(), 'leon-install-home-'));
    await publishWorld();
  });

  afterEach(async () => {
    await rm(home, { recursive: true, force: true });
  });

  // `curl -fsSL <leon>/install | sh` : le script arrive sur l'entrée standard. `detached` (setsid) retire le terminal
  // de contrôle : /dev/tty ne s'ouvre pas, comme dans un `curl | sh` lancé sans terminal.
  function startScript(
    script: string,
    options: { env?: Record<string, string>; extraPath?: string; shell?: string } = {},
  ) {
    const realCurl = execFileSync('sh', ['-c', 'command -v curl']).toString().trim();
    const child = spawn(options.shell ?? 'sh', ['-s'], {
      detached: true,
      env: {
        NODE_ENV: 'test', // exigé par le type de l'environnement ; ni le script ni le faux Node n'y touchent
        HOME: home,
        PATH: `${options.extraPath ?? shim}:${process.env.PATH}`,
        REAL_CURL: realCurl,
        FAKE_PORT: String(port),
        FAKE_NODE_LOG: join(root, 'fake-node.log'),
        ...options.env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.stdin.end(script);
    const done: Promise<Outcome> = once(child, 'close').then(([code]) => ({
      code: code as number | null,
      stdout,
      stderr,
    }));
    return { child, done };
  }

  const runScript = (...args: Parameters<typeof startScript>) => startScript(...args).done;

  const install = (overrides: Partial<typeof manifest> = {}) =>
    runScript(installerScript(`http://127.0.0.1:${port}`, { ...current, ...overrides }));

  const modeOf = async (path: string) => (await stat(path)).mode & 0o777;
  const leon = () => join(home, '.leon');

  it('pose Node et la CLI dans ~/.leon, en bons modes, et rien ailleurs', async () => {
    const outcome = await install();

    expect(outcome.code, outcome.stderr).toBe(0);
    expect(outcome.stderr).toBe(''); // pas même l'erreur d'un /dev/tty qui ne s'ouvre pas
    expect(await readdir(home)).toEqual(['.leon']);
    expect((await readdir(leon())).sort()).toEqual(['cli', 'runtime']);
    expect(await modeOf(leon())).toBe(0o700);

    const nodeDir = join(leon(), 'runtime', `node-v${NODE_VERSION}`);
    expect(await readdir(nodeDir)).toEqual(['node']); // bin/node seulement, pas le reste de l'archive
    expect(await modeOf(join(nodeDir, 'node'))).toBe(0o755);
    expect(await readlink(join(leon(), 'runtime', 'actuel'))).toBe(`node-v${NODE_VERSION}`);
    expect((await readdir(join(leon(), 'runtime'))).sort()).toEqual([
      'actuel',
      `node-v${NODE_VERSION}`,
    ]);

    const cliFile = join(leon(), 'cli', current.version, 'leon.mjs');
    expect(await readFile(cliFile, 'utf8')).toBe(cliBody);
    expect(await modeOf(cliFile)).toBe(0o644);
    expect(await readlink(join(leon(), 'cli', 'actuelle'))).toBe(current.version);
    expect((await readdir(join(leon(), 'cli'))).sort()).toEqual([current.version, 'actuelle']);

    // Le lanceur appelle ces chemins (K8) : le Node posé démarre, et le lien mène à la CLI.
    const version = await run(join(leon(), 'runtime', 'actuel', 'node'), ['--version']);
    expect(version.stdout.trim()).toBe(`v${NODE_VERSION}`);
    expect(await readFile(join(leon(), 'cli', 'actuelle', 'leon.mjs'), 'utf8')).toBe(cliBody);
  });

  // /bin/sh est bash sur macOS et dash sur Debian ou Ubuntu : le même script doit poser la même chose sous les deux.
  it.each(['dash', 'bash'].filter(hasCommand))('pose la même chose sous %s', async (shell) => {
    const outcome = await runScript(installerScript(`http://127.0.0.1:${port}`, current), {
      shell,
    });

    expect(outcome.code, outcome.stderr).toBe(0);
    expect(outcome.stderr).toBe('');
    expect((await readdir(join(leon(), 'cli'))).sort()).toEqual([current.version, 'actuelle']);
    expect(await readlink(join(leon(), 'runtime', 'actuel'))).toBe(`node-v${NODE_VERSION}`);
  });

  it('sans terminal, installe tout puis dit comment lancer setup', async () => {
    const outcome = await install();

    expect(outcome.code, outcome.stderr).toBe(0);
    expect(outcome.stdout).toContain('setup');
    expect(outcome.stdout).toContain(join(leon(), 'runtime', 'actuel', 'node'));
    expect(outcome.stdout).toContain(`--url 'http://127.0.0.1:${port}'`);
  });

  it('relancé, ne retélécharge pas Node et ne change rien', async () => {
    await install();
    const before = await readdir(leon());
    requested = [];

    const again = await install();

    expect(again.code, again.stderr).toBe(0);
    expect(await readdir(leon())).toEqual(before);
    expect(requested.filter((url) => url.startsWith('/nodejs/'))).toEqual([]);
    expect(requested).toEqual([`/cli/leon-${current.version}.mjs`]);
  });

  it('pour une nouvelle version, remplace cli/actuelle d’un coup et garde la précédente', async () => {
    await install();
    const previous = current.version;
    await publishWorld(fakeNode(NODE_VERSION), 'console.log("fake cli, version 2");\n');

    const outcome = await install();

    expect(outcome.code, outcome.stderr).toBe(0);
    expect(await readlink(join(leon(), 'cli', 'actuelle'))).toBe(current.version);
    expect((await readdir(join(leon(), 'cli'))).sort()).toEqual(
      [current.version, previous, 'actuelle'].sort(),
    );
    // Aucune version n'a été posée dans le dossier vers lequel pointait le lien.
    expect(await readdir(join(leon(), 'cli', previous))).toEqual(['leon.mjs']);
    expect(await readdir(join(leon(), 'cli', current.version))).toEqual(['leon.mjs']);
  });

  it('refait un Node abîmé (un dossier sans exécutable) au lieu de le croire posé', async () => {
    const nodeDir = join(leon(), 'runtime', `node-v${NODE_VERSION}`);
    await mkdir(nodeDir, { recursive: true });
    await writeFile(join(nodeDir, 'node'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

    const outcome = await install();

    expect(outcome.code, outcome.stderr).toBe(0);
    expect((await run(join(nodeDir, 'node'), ['--version'])).stdout.trim()).toBe(
      `v${NODE_VERSION}`,
    );
    expect(await readdir(nodeDir)).toEqual(['node']);
  });

  describe('une vérification qui échoue arrête tout, efface le téléchargement et ne pose rien', () => {
    const expectNothing = async () => {
      expect(await readdir(home)).toEqual([]); // ~/.leon n'existe pas, ni son dossier de travail
    };

    it('une empreinte fausse pour la CLI', async () => {
      const outcome = await install({ sha256: hex('autre') });

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/SHA-256/);
      await expectNothing();
    });

    it('une taille fausse pour la CLI', async () => {
      const outcome = await install({ taille: current.taille + 1 });

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/size/i);
      await expectNothing();
    });

    it('une empreinte fausse pour Node', async () => {
      const plateformes = Object.fromEntries(PLATFORMS.map((p) => [p, hex(`faux-${p}`)])) as Record<
        Platform,
        string
      >;
      const outcome = await install({ node: { version: NODE_VERSION, plateformes } });

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/SHA-256/);
      await expectNothing();
    });

    it('un Node qui ne démarre pas', async () => {
      await publishWorld(fakeNode('1.2.3'));

      const outcome = await install();

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/Node/);
      await expectNothing();
    });

    it('un téléchargement qui échoue', async () => {
      routes.delete(`/cli/leon-${current.version}.mjs`);

      const outcome = await install();

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/download/i);
      await expectNothing();
    });

    it('une installation existante reste telle quelle', async () => {
      await install();
      const before = current.version;
      await publishWorld(fakeNode(NODE_VERSION), 'console.log("version 2");\n');

      const outcome = await install({ sha256: hex('autre') });

      expect(outcome.code).not.toBe(0);
      expect(await readlink(join(leon(), 'cli', 'actuelle'))).toBe(before);
      expect((await readdir(join(leon(), 'cli'))).sort()).toEqual([before, 'actuelle'].sort());
      expect((await readdir(leon())).sort()).toEqual(['cli', 'runtime']);
    });
  });

  // Ctrl-C (ou un arrêt) pendant un téléchargement : le terminal envoie le signal au script et à curl.
  it.each(
    ['sh', 'dash'].filter(hasCommand).flatMap(
      (shell) =>
        [
          [shell, 'SIGINT'],
          [shell, 'SIGTERM'],
        ] as const,
    ),
  )(
    'sous %s, interrompu par %s pendant un téléchargement, ne laisse rien',
    async (shell, signal) => {
      hanging.add(`/cli/leon-${current.version}.mjs`);
      const { child, done } = startScript(installerScript(`http://127.0.0.1:${port}`, current), {
        shell,
      });
      await vi.waitFor(() => expect(requested).toContain(`/cli/leon-${current.version}.mjs`));

      process.kill(-(child.pid as number), signal);
      const outcome = await done;

      expect(outcome.code).not.toBe(0);
      expect(await readdir(home)).toEqual([]);
    },
  );

  it('un script coupé en route ne lance rien', async () => {
    const script = installerScript(`http://127.0.0.1:${port}`, current);

    const outcome = await runScript(script.slice(0, Math.floor(script.length * 0.8)));

    expect(outcome.code).not.toBe(0);
    expect(await readdir(home)).toEqual([]);
    expect(requested).toEqual([]);
  });

  describe('une plateforme qui n’est pas prise en charge ne fait rien écrire', () => {
    let fakes: string;

    // Des uname, ldd, sysctl et xz de remplacement, devant le PATH : le script lit ce que lui répond la machine.
    // (Le xz n'y est qu'un nom : le tar du Mac sait lire le .tar.xz sans lui, et un Mac n'a pas toujours xz.)
    async function machine(
      os: string,
      arch: string,
      options: { ldd?: { text: string; exit: number }; rosetta?: boolean } = {},
    ) {
      const { ldd, rosetta = false } = options;
      fakes = join(root, `machine-${os}-${arch}-${ldd ? 'ldd' : 'noldd'}-${rosetta ? 'r' : 'n'}`);
      await mkdir(fakes, { recursive: true });
      const fake = (name: string, body: string) =>
        writeFile(join(fakes, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      await fake(
        'uname',
        `case "$1" in -s) echo '${os}' ;; -m) echo '${arch}' ;; *) echo '${os}' ;; esac`,
      );
      await fake('sysctl', `echo ${rosetta ? 1 : 0}`);
      await fake('xz', 'exit 0');
      if (ldd) await fake('ldd', `cat >&2 <<'EOF'\n${ldd.text}\nEOF\nexit ${ldd.exit}`);
      return `${fakes}:${shim}`;
    }

    const attempt = async (extraPath: string) =>
      runScript(installerScript(`http://127.0.0.1:${port}`, current), { extraPath });

    it('Windows (ou toute autre plateforme)', async () => {
      const outcome = await attempt(await machine('MINGW64_NT-10.0', 'x86_64'));

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/not supported/i);
      expect(outcome.stderr).toContain('MINGW64_NT-10.0');
      expect(await readdir(home)).toEqual([]);
      expect(requested).toEqual([]);
    });

    it('une architecture inconnue', async () => {
      const outcome = await attempt(await machine('Linux', 'riscv64'));

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/not supported/i);
      expect(await readdir(home)).toEqual([]);
    });

    it('Linux avec musl, que ldd nomme (comme sur Alpine)', async () => {
      const outcome = await attempt(
        await machine('Linux', 'x86_64', {
          ldd: { text: 'musl libc (x86_64)\nVersion 1.2.5\nDynamic Program Loader', exit: 1 },
        }),
      );

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/musl/);
      expect(await readdir(home)).toEqual([]);
      expect(requested).toEqual([]);
    });

    it('Linux avec la glibc : installe', async () => {
      const outcome = await attempt(
        await machine('Linux', 'aarch64', {
          ldd: { text: 'ldd (Debian GLIBC 2.36-9+deb12u7) 2.36', exit: 0 },
        }),
      );

      expect(outcome.code, outcome.stderr).toBe(0);
      expect(
        requested.some((url) => url.endsWith(`node-v${NODE_VERSION}-linux-arm64.tar.xz`)),
      ).toBe(true);
      expect(await readdir(leon())).toContain('runtime');
    });

    it('Mac Intel : choisit l’archive darwin-x64', async () => {
      const outcome = await attempt(await machine('Darwin', 'x86_64'));

      expect(outcome.code, outcome.stderr).toBe(0);
      expect(requested.some((url) => url.endsWith(`node-v${NODE_VERSION}-darwin-x64.tar.xz`))).toBe(
        true,
      );
    });

    it('Mac Apple silicon sous Rosetta (uname dit x86_64) : choisit quand même darwin-arm64', async () => {
      const outcome = await attempt(await machine('Darwin', 'x86_64', { rosetta: true }));

      expect(outcome.code, outcome.stderr).toBe(0);
      expect(
        requested.some((url) => url.endsWith(`node-v${NODE_VERSION}-darwin-arm64.tar.xz`)),
      ).toBe(true);
    });

    it('Linux sans xz : le dit avant de télécharger quoi que ce soit', async () => {
      // Un PATH réduit à des liens vers l'essentiel, sans xz : le script ne trouve pas la commande.
      const path = join(root, 'path-without-xz');
      await mkdir(path, { recursive: true });
      for (const tool of ['sh', 'curl', 'tar', 'mktemp']) {
        const found = execFileSync('sh', ['-c', `command -v ${tool}`])
          .toString()
          .trim();
        await symlink(found, join(path, tool)).catch(() => undefined);
      }
      const fake = (name: string, body: string) =>
        writeFile(join(path, name), `#!/bin/sh\n${body}\n`, { mode: 0o755 });
      await fake('uname', 'case "$1" in -m) echo x86_64 ;; *) echo Linux ;; esac');
      await fake('ldd', 'echo "ldd (GNU libc) 2.39"');

      const outcome = await runScript(installerScript(`http://127.0.0.1:${port}`, current), {
        env: { PATH: path },
      });

      expect(outcome.code).not.toBe(0);
      expect(outcome.stderr).toMatch(/'xz' is required/);
      expect(await readdir(home)).toEqual([]);
      expect(requested).toEqual([]);
    });
  });

  it('ne trouve pas de dossier personnel : s’arrête sans rien écrire', async () => {
    const outcome = await runScript(installerScript(`http://127.0.0.1:${port}`, current), {
      env: { HOME: join(home, 'absent') },
    });

    expect(outcome.code).not.toBe(0);
    expect(outcome.stderr).toMatch(/HOME/);
    expect(await readdir(home)).toEqual([]);
  });

  it('avec un terminal, lance setup avec l’adresse, l’entrée sur le terminal et l’umask de l’appelant', async () => {
    // Un terminal de contrôle : python ouvre un pty (`script` diffère entre macOS et Linux).
    if (!hasCommand('python3')) return;
    const file = join(root, 'install-tty.sh');
    await writeFile(file, installerScript(`http://127.0.0.1:${port}`, current));
    const log = join(root, 'fake-node-tty.log');
    await rm(log, { force: true });
    const realCurl = execFileSync('sh', ['-c', 'command -v curl']).toString().trim();

    await run(
      'python3',
      [
        '-I',
        '-c',
        'import os, pty, sys; os.umask(0o022); os._exit(os.waitstatus_to_exitcode(pty.spawn(sys.argv[1:])))',
        'sh',
        file,
      ],
      {
        env: {
          NODE_ENV: 'test',
          HOME: home,
          PATH: `${shim}:${process.env.PATH}`,
          REAL_CURL: realCurl,
          FAKE_PORT: String(port),
          FAKE_NODE_LOG: log,
          // Exportée par la personne dans son terminal : setup l'hérite telle quelle, le script ne la remplace pas.
          LEON_URL: 'https://autre.example',
        },
      },
    );

    const recorded = await readFile(log, 'utf8');
    expect(recorded).toContain('LEON_URL: [https://autre.example]');
    expect(recorded).toContain(
      `args: ${join(leon(), 'cli', 'actuelle', 'leon.mjs')} setup --url http://127.0.0.1:${port}`,
    );
    expect(recorded).toContain('stdin: tty');
    // Le script resserre son umask pour ~/.leon ; setup, lancé ensuite, retrouve celui de l'appelant.
    expect(recorded).toContain('umask: 0022');
  });
});

describe('Alpine', () => {
  const hasAlpine = (() => {
    try {
      execFileSync('docker', ['image', 'inspect', 'alpine:3'], {
        stdio: 'ignore',
        timeout: 20_000,
      });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!hasAlpine)(
    'le script s’arrête sur le message musl et ~/.leon n’existe pas',
    async () => {
      const script = installerScript('https://leon.example', manifest);
      const child = spawn('docker', [
        'run',
        '--rm',
        '-i',
        'alpine:3',
        'sh',
        '-c',
        'sh -s; echo "exit=$?"; ls -d "$HOME/.leon" 2>&1 || true',
      ]);
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      child.stdin.end(script);
      await once(child, 'close');

      expect(output).toMatch(/musl/);
      expect(output).toMatch(/exit=1/);
      expect(output).toMatch(/No such file or directory/);
    },
    60_000,
  );
});
