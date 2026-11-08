import { execFile } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { launcherPath } from './hook-commands';
import {
  LauncherNotReplacedError,
  launcherScript,
  previousLauncherScripts,
  removeLauncher,
  writeLauncher,
} from './launcher';
import runtime from './runtime.json';

// Le lanceur ~/.leon/bin/leon (K8 du plan « CLI sans clone »), toujours dans un HOME temporaire : jamais le vrai
// ~/.leon. Le vrai lanceur avec le vrai Node et la vraie CLI est dans hook-commands.contrat.test.ts.

const run = promisify(execFile);
const NODE_DIR = `node-v${runtime.version}`;
const CLONE = { kind: 'clone', repoDir: '/Users/a/leon' } as const;
const INSTALLED = { kind: 'installee' } as const;

// K8, mot pour mot, pour un dossier personnel /Users/a, avec la fin détachée avant node (T19, D11).
const INSTALLED_EXEC = `'/Users/a/.leon/runtime/actuel/node' '/Users/a/.leon/cli/actuelle/leon.mjs'`;
const CLONE_EXEC = `pnpm -s --config.verify-deps-before-run=false --dir '/Users/a/leon' leon`;
const script = (origin: string, exec: string) => `#!/bin/sh
# Written by Leon (${origin}
if [ "$#" -eq 3 ] && [ "$1" = crochet ] && [ "$3" = fin ]; then
  entrees='/Users/a/.leon/entrees'
  if (umask 077 && mkdir -p "$entrees") && entree=$(mktemp "$entrees/fin.XXXXXX") && cat > "$entree"; then
    nohup ${exec} crochet "$2" fin --entree "$entree" </dev/null >/dev/null 2>&1 &
  fi
  exit 0
fi
exec ${exec} "$@"
`;
const INSTALLED_SCRIPT = script('leon setup). Installed form.', INSTALLED_EXEC);
const CLONE_SCRIPT = script('leon setup --depot). Clone form.', CLONE_EXEC);
// La version du lot 4, sans la fin détachée : `leon setup --yes` la remplace sans demander (setup.ts).
const INSTALLED_SCRIPT_V1 = `#!/bin/sh
# Written by Leon (leon setup). Installed form.
exec ${INSTALLED_EXEC} "$@"
`;

let dir: string;
let home: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'leon-launcher-'));
  home = join(dir, 'home');
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const modeOf = async (path: string) => (await stat(path)).mode & 0o777;
const binFiles = () => readdir(join(home, '.leon', 'bin'));

describe('launcherScript : K8, mot pour mot', () => {
  it('forme installée : le Node posé par Leon et la version en cours de la CLI, par les liens runtime/actuel et cli/actuelle', () => {
    expect(launcherScript('/Users/a', INSTALLED)).toBe(INSTALLED_SCRIPT);
  });

  it('la forme installée ne dépend d’aucune version : ni celle de Node, ni celle de la CLI', () => {
    expect(launcherScript('/Users/a', INSTALLED)).not.toMatch(/node-v|\d+\.\d+\.\d+/);
    expect(launcherScript('/Users/a', INSTALLED)).not.toContain(runtime.version);
  });

  it('forme clone : pnpm dans le clone, avec les options des crochets', () => {
    expect(launcherScript('/Users/a', CLONE)).toBe(CLONE_SCRIPT);
  });

  it('les versions précédentes : celle du lot 4, sans la fin détachée', () => {
    expect(previousLauncherScripts('/Users/a', INSTALLED)).toEqual([INSTALLED_SCRIPT_V1]);
    expect(previousLauncherScripts('/Users/a', INSTALLED)).not.toContain(INSTALLED_SCRIPT);
  });

  it('refuse un clone indiqué par un chemin relatif, sans rien écrire', async () => {
    expect(() => launcherScript('/Users/a', { kind: 'clone', repoDir: 'leon' })).toThrow(
      /absolute path/,
    );
    await expect(writeLauncher(home, { kind: 'clone', repoDir: '../leon' })).rejects.toThrow(
      /absolute path/,
    );
    await expect(lstat(launcherPath(home))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('un chemin avec une espace et une apostrophe reste un seul mot de shell', () => {
    const script = launcherScript("/Users/Léa O'Neil", {
      kind: 'clone',
      repoDir: "/Users/Léa O'Neil/mon leon",
    });

    expect(script).toContain("--dir '/Users/Léa O'\\''Neil/mon leon' leon");
  });
});

describe('writeLauncher : écrire ~/.leon/bin/leon', () => {
  it.each([
    ['installée', INSTALLED],
    ['clone', CLONE],
  ] as const)(
    'forme %s : neuf, en 0700 (dossiers en 0700), sans fichier voisin laissé',
    async (_name, form) => {
      const result = await writeLauncher(home, form);

      expect(result).toEqual({ etat: 'neuf', ancienne: null });
      expect(launcherPath(home)).toBe(join(home, '.leon', 'bin', 'leon'));
      expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, form));
      expect(await modeOf(launcherPath(home))).toBe(0o700);
      expect(await modeOf(join(home, '.leon', 'bin'))).toBe(0o700);
      expect(await modeOf(join(home, '.leon'))).toBe(0o700);
      expect(await binFiles()).toEqual(['leon']);
    },
  );

  it('un second passage identique ne réécrit rien, et remet en 0700 un lanceur dont les droits ont changé', async () => {
    await writeLauncher(home, CLONE);
    const before = await lstat(launcherPath(home));
    await chmod(launcherPath(home), 0o600);

    const result = await writeLauncher(home, CLONE);

    expect(result.etat).toBe('identique');
    expect(result.ancienne).toBe(launcherScript(home, CLONE));
    expect((await lstat(launcherPath(home))).ino).toBe(before.ino); // le même fichier : rien n'a été remplacé
    expect(await modeOf(launcherPath(home))).toBe(0o700);
    expect(await binFiles()).toEqual(['leon']);
  });

  describe('un lanceur différent est déjà là', () => {
    beforeEach(async () => {
      await writeLauncher(home, CLONE);
    });
    const old = () => launcherScript(home, CLONE);

    it('sans confirmation de l’appelant : refusé, le lanceur est gardé tel quel', async () => {
      await expect(writeLauncher(home, INSTALLED)).rejects.toBeInstanceOf(LauncherNotReplacedError);

      expect(await readFile(launcherPath(home), 'utf8')).toBe(old());
      expect(await binFiles()).toEqual(['leon']);
    });

    it('confirmation refusée : refusé aussi, et la confirmation a reçu le texte de l’ancien lanceur', async () => {
      const seen: string[] = [];

      await expect(
        writeLauncher(home, INSTALLED, async (ancienne) => {
          seen.push(ancienne);
          return false;
        }),
      ).rejects.toBeInstanceOf(LauncherNotReplacedError);

      expect(seen).toEqual([old()]);
      expect(await readFile(launcherPath(home), 'utf8')).toBe(old());
    });

    it('confirmation accordée : remplacé, et l’ancien texte est rendu', async () => {
      const result = await writeLauncher(home, INSTALLED, () => true);

      expect(result).toEqual({ etat: 'remplace', ancienne: old() });
      expect(await readFile(launcherPath(home), 'utf8')).toBe(launcherScript(home, INSTALLED));
      expect(await modeOf(launcherPath(home))).toBe(0o700);
      expect(await binFiles()).toEqual(['leon']);
    });

    it('un lanceur identique ne demande aucune confirmation', async () => {
      const result = await writeLauncher(home, CLONE, () => {
        throw new Error('confirmation inattendue');
      });

      expect(result.etat).toBe('identique');
    });
  });

  it('refuse un lien symbolique à la place de bin/leon, même avec une confirmation, et ne touche pas à sa cible', async () => {
    const target = join(dir, 'ailleurs');
    await writeFile(target, 'à moi\n');
    await mkdir(join(home, '.leon', 'bin'), { recursive: true });
    await symlink(target, launcherPath(home));

    await expect(writeLauncher(home, CLONE, () => true)).rejects.toThrow(/symbolic link/);

    expect((await lstat(launcherPath(home))).isSymbolicLink()).toBe(true);
    expect(await readFile(target, 'utf8')).toBe('à moi\n');
    expect(await binFiles()).toEqual(['leon']);
  });

  it('refuse un dossier à la place de bin/leon', async () => {
    await mkdir(launcherPath(home), { recursive: true });

    await expect(writeLauncher(home, CLONE, () => true)).rejects.toThrow(/not a regular file/);

    expect((await lstat(launcherPath(home))).isDirectory()).toBe(true);
  });

  it('un ~/.leon qui n’est pas un dossier : l’erreur du système, rien d’écrit', async () => {
    await mkdir(home, { recursive: true });
    await writeFile(join(home, '.leon'), '');

    await expect(writeLauncher(home, CLONE)).rejects.toMatchObject({ code: 'ENOTDIR' });
  });
});

// Le lanceur lancé pour de bon par sh, avec un faux Node et un faux pnpm qui écrivent leurs arguments, un par ligne :
// dans un dossier personnel qui a une espace et une apostrophe, chaque argument reste un seul mot.
describe('le lanceur écrit, lancé par sh', () => {
  const FAKE = '#!/bin/sh\nfor arg in "$@"; do echo "$arg"; done\n';
  let weirdHome: string;
  let env: NodeJS.ProcessEnv;

  beforeEach(async () => {
    weirdHome = join(dir, "Léa O'Neil");
    const bin = join(dir, 'faux-bin');
    await mkdir(bin);
    await writeFile(join(bin, 'pnpm'), FAKE, { mode: 0o755 });
    env = {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      HOME: weirdHome,
    } as unknown as NodeJS.ProcessEnv;
  });

  const launch = async (args: string[]) =>
    (
      await run(
        '/bin/sh',
        ['-c', `'${launcherPath(weirdHome).replaceAll("'", `'\\''`)}' "$@"`, 'sh', ...args],
        { env },
      )
    ).stdout;

  it('forme installée : le Node posé, la CLI en cours, puis les arguments du crochet', async () => {
    // Comme le script d'installation (S09) : le Node dans runtime/node-v<version>, et le lien runtime/actuel.
    const runtimeDir = join(weirdHome, '.leon', 'runtime');
    await mkdir(join(runtimeDir, NODE_DIR), { recursive: true });
    await writeFile(join(runtimeDir, NODE_DIR, 'node'), FAKE, { mode: 0o755 });
    await symlink(NODE_DIR, join(runtimeDir, 'actuel'));
    await writeLauncher(weirdHome, INSTALLED);

    expect(await launch(['briefing', 'avec espace'])).toBe(
      `${join(weirdHome, '.leon', 'cli', 'actuelle', 'leon.mjs')}\nbriefing\navec espace\n`,
    );
  });

  // T19 : Codex coupe SessionEnd à 3 s. Le faux Node attend 2 s puis écrit ses arguments et l'entrée qu'il lit.
  it('la fin rend la main en moins d’une seconde, l’entrée copiée en 0600 dans ~/.leon/entrees', async () => {
    const SLOW = `#!/bin/sh\nsleep 2\n{ for arg in "$@"; do echo "$arg"; done; cat "$4"; } > "$HOME/fini"\n`;
    const runtimeDir = join(weirdHome, '.leon', 'runtime');
    await mkdir(join(runtimeDir, NODE_DIR), { recursive: true });
    await writeFile(join(runtimeDir, NODE_DIR, 'node'), SLOW.replace('"$4"', '"$6"'), {
      mode: 0o755,
    });
    await symlink(NODE_DIR, join(runtimeDir, 'actuel'));
    await writeLauncher(weirdHome, INSTALLED);

    const started = Date.now();
    const child = execFile(
      '/bin/sh',
      [
        '-c',
        `printf '%s' '{"transcript_path":"/x"}' | '${launcherPath(weirdHome).replaceAll("'", `'\\''`)}' crochet codex fin`,
      ],
      { env },
    );
    const code = await new Promise<number | null>((done) => child.on('close', done));
    expect(code).toBe(0);
    expect(Date.now() - started).toBeLessThan(1000);

    const entrees = join(weirdHome, '.leon', 'entrees');
    const [entry] = await readdir(entrees);
    expect(entry).toMatch(/^fin\./);
    expect(await modeOf(join(entrees, entry ?? ''))).toBe(0o600);
    expect(await modeOf(entrees)).toBe(0o700);
    expect(await readFile(join(entrees, entry ?? ''), 'utf8')).toBe('{"transcript_path":"/x"}');

    await expect
      .poll(() => readFile(join(weirdHome, 'fini'), 'utf8').catch(() => ''), { timeout: 5000 })
      .toBe(
        `${join(weirdHome, '.leon', 'cli', 'actuelle', 'leon.mjs')}\ncrochet\ncodex\nfin\n--entree\n${join(entrees, entry ?? '')}\n{"transcript_path":"/x"}`,
      );
  }, 10_000);

  it('les autres commandes, même `crochet codex fin` avec une option, passent par exec comme avant', async () => {
    const runtimeDir = join(weirdHome, '.leon', 'runtime');
    await mkdir(join(runtimeDir, NODE_DIR), { recursive: true });
    await writeFile(join(runtimeDir, NODE_DIR, 'node'), FAKE, { mode: 0o755 });
    await symlink(NODE_DIR, join(runtimeDir, 'actuel'));
    await writeLauncher(weirdHome, INSTALLED);

    expect(await launch(['crochet', 'codex', 'fin', '--entree', '/f'])).toBe(
      `${join(weirdHome, '.leon', 'cli', 'actuelle', 'leon.mjs')}\ncrochet\ncodex\nfin\n--entree\n/f\n`,
    );
    expect(await launch(['crochet', 'codex', 'tour'])).toContain('tour');
    // Deux lancements de sh à la suite : sous la charge de toute la suite, 5 s ne suffisent pas toujours.
  }, 10_000);

  it('forme clone : pnpm, ses options, le clone, puis les arguments du crochet', async () => {
    await writeLauncher(weirdHome, { kind: 'clone', repoDir: join(weirdHome, 'mon leon') });

    expect(await launch(['capter-session'])).toBe(
      `-s\n--config.verify-deps-before-run=false\n--dir\n${join(weirdHome, 'mon leon')}\nleon\ncapter-session\n`,
    );
  });
});

describe('removeLauncher : le retirer avec le dernier outil', () => {
  it('efface le lanceur de Leon, puis le dossier bin qu’il laisse vide', async () => {
    await writeLauncher(home, CLONE);

    expect(await removeLauncher(home)).toBe('retire');

    await expect(lstat(join(home, '.leon', 'bin'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lstat(join(home, '.leon'))).isDirectory()).toBe(true);
  });

  it('garde le dossier bin quand il porte autre chose', async () => {
    await writeLauncher(home, CLONE);
    await writeFile(join(home, '.leon', 'bin', 'autre'), 'x');

    expect(await removeLauncher(home)).toBe('retire');

    expect(await binFiles()).toEqual(['autre']);
  });

  it('absent : rien à faire', async () => {
    expect(await removeLauncher(home)).toBe('absent');
    await mkdir(join(home, '.leon', 'bin'), { recursive: true });
    expect(await removeLauncher(home)).toBe('absent');
  });

  it('un fichier qui n’est pas de Leon n’est pas effacé', async () => {
    await mkdir(join(home, '.leon', 'bin'), { recursive: true });
    await writeFile(launcherPath(home), '#!/bin/sh\necho à moi\n', { mode: 0o755 });

    expect(await removeLauncher(home)).toBe('conserve');

    expect(await readFile(launcherPath(home), 'utf8')).toBe('#!/bin/sh\necho à moi\n');
  });

  it('un lien symbolique, même vers un lanceur de Leon, n’est pas touché', async () => {
    const real = join(dir, 'vrai-lanceur');
    await writeFile(real, launcherScript(home, CLONE));
    await mkdir(join(home, '.leon', 'bin'), { recursive: true });
    await symlink(real, launcherPath(home));

    expect(await removeLauncher(home)).toBe('conserve');

    expect((await lstat(launcherPath(home))).isSymbolicLink()).toBe(true);
    expect(await readFile(real, 'utf8')).toBe(launcherScript(home, CLONE));
  });
});
