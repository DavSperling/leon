// Les mises à jour automatiques de la CLI installée (S12 du plan « CLI sans clone », E8). `leon briefing` lance, une
// fois sa sortie écrite, `leon update --background` détaché si le dernier contrôle (`~/.leon/maj.json`) a 24 h ou plus,
// et jamais sous la forme clone : la mise à jour n'est donc jamais sur le chemin d'un crochet. `leon update` lit le
// manifeste K7 à l'adresse du serveur (K2) et, si une autre version est servie :
// 1. si le Node a changé : l'archive officielle de nodejs.org est téléchargée, vérifiée (empreinte du manifeste),
//    dépaquetée (seul bin/node), lancée (`--version`), posée dans runtime/node-v<version>/, puis `runtime/actuel`
//    est remplacé d'un coup ;
// 2. si la CLI a changé : le fichier est téléchargé, vérifié (taille, puis empreinte), lancé par le Node qui sera celui du
//    lanceur (`leon.mjs --version` doit rendre la version du manifeste), posé dans cli/<version>/, puis `cli/actuelle`
//    est remplacé d'un coup ;
// 3. il ne reste qu'un Node (celui de runtime/actuel) et deux versions de la CLI (cli/actuelle et la précédente).
// Tout se prépare dans un dossier de travail de ~/.leon, effacé quoi qu'il arrive : un échec ne laisse rien, et les liens
// ne bougent qu'après les vérifications. Les liens se remplacent comme dans le script d'installation (un lien neuf, puis un
// `rename`). Rien ici ne touche à accord.json, à connexion.json, au lanceur ni aux crochets : ils ne dépendent d'aucune
// version. `leon update --previous` revient à la version précédente de la CLI, sans réseau.
//
// Les messages sont fixes : ils ne citent ni le jeton ni l'adresse du serveur.
import { execFile, spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  readlink,
  rename,
  rm,
  stat,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { promisify } from 'node:util';
import { z } from 'zod';
import { resolveServerEnv } from './env';
import { errorCode } from './install-hooks';

const run = promisify(execFile);

// Ce que `leon.ts` appelle sa version quand il tourne depuis un clone (le TypeScript, sans la construction).
export const CLONE_VERSION = 'dev';
export const UPDATE_INTERVAL_MS = 24 * 60 * 60 * 1000;
export const NODE_DIST = 'https://nodejs.org/dist';

// Un verrou plus vieux est celui d'une mise à jour morte : le plus long (Node, 5 minutes) y tient largement.
const LOCK_STALE_MS = 15 * 60 * 1000;
const MANIFEST_TIMEOUT_MS = 15_000;
const CLI_TIMEOUT_MS = 60_000;
const NODE_TIMEOUT_MS = 5 * 60_000;
const START_TIMEOUT_MS = 10_000; // `--version`
const UNPACK_TIMEOUT_MS = 120_000;
const CLI_MAX_BYTES = 1024 * 1024; // le plafond du fichier de la CLI (contraintes globales du plan)
// shortcut: 200 Mo au plus pour l'archive de Node (30 Mo aujourd'hui), à relever si nodejs.org en publie de plus grosses.
const NODE_MAX_BYTES = 200 * 1024 * 1024;

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const CLI_VERSION = /^[0-9a-f]{12}$/;
const NODE_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
const NODE_DIR = /^node-v\d{1,3}\.\d{1,3}\.\d{1,3}$/;

// K7 (/cli/version.json), tel que l'écrit vite.cli.config.ts. Les empreintes des archives de Node sont lues par
// plateforme : une plateforme absente est signalée à qui en a besoin, pas à qui n'a pas de Node à poser.
const ManifestSchema = z.object({
  version: z.string().regex(CLI_VERSION),
  sha256,
  taille: z.number().int().positive().max(CLI_MAX_BYTES),
  node: z.object({
    version: z.string().regex(NODE_VERSION),
    plateformes: z.record(z.string(), sha256),
  }),
});
export type CliManifest = z.infer<typeof ManifestSchema>;

// Une erreur de la mise à jour : son message est fixe et peut être dit tel quel.
class UpdateError extends Error {}

export type UpdateOptions = { previous: boolean };
export type UpdateDeps = {
  home: string;
  env: Record<string, string | undefined>;
  // La version de cette CLI (`CLI_VERSION` de leon.ts) : CLONE_VERSION sous la forme clone, qui ne se met pas à jour.
  cliVersion: string;
  fetch: typeof fetch;
  // La plateforme de l'archive de Node (nodePlatform), null si Leon n'a pas de Node officiel pour celle-ci.
  platform: string | null;
  nodeDist: string;
  now: () => Date;
  out: (text: string) => void;
  err: (text: string) => void;
};

// La plateforme des archives de nodejs.org (K7) pour `process.platform` et `process.arch` ; null si elle n'est pas prise
// en charge (le script d'installation refuse déjà ce qu'il ne sait pas poser).
export function nodePlatform(platform: string, arch: string): string | null {
  const key = `${platform}-${arch}`;
  return ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64'].includes(key) ? key : null;
}

const paths = (home: string) => {
  const leon = join(home, '.leon');
  const runtime = join(leon, 'runtime');
  const cli = join(leon, 'cli');
  return {
    leon,
    runtime,
    cli,
    nodeLink: join(runtime, 'actuel'),
    cliLink: join(cli, 'actuelle'),
    maj: join(leon, 'maj.json'),
    lock: join(leon, 'maj.lock'),
  };
};
type Paths = ReturnType<typeof paths>;

// ~/.leon/maj.json : { "verifie_le": "<ISO 8601>", "precedente": "<version de la CLI>" } (K1). `precedente` est la CLI
// d'avant la dernière mise à jour, celle que `leon update --previous` remet. Chaque champ se lit à part ; un fichier
// absent ou illisible ne dit rien.
export type Maj = { verifie_le: Date | null; precedente: string | null };

export async function readMaj(home: string): Promise<Maj> {
  try {
    const raw = JSON.parse(await readFile(paths(home).maj, 'utf8'));
    const date = z.iso.datetime({ offset: true }).safeParse(raw?.verifie_le);
    const previous = z.string().regex(CLI_VERSION).safeParse(raw?.precedente);
    return {
      verifie_le: date.success ? new Date(date.data) : null,
      precedente: previous.success ? previous.data : null,
    };
  } catch {
    return { verifie_le: null, precedente: null };
  }
}

const isSymlink = (path: string) =>
  lstat(path).then(
    (info) => info.isSymbolicLink(),
    () => false,
  );

// Écrit dans un fichier voisin en 0600 puis le renomme (comme connection.ts), et refuse un lien symbolique.
async function writeMaj(home: string, state: { verifie_le: Date; precedente: string | null }) {
  const { leon, maj } = paths(home);
  await mkdir(leon, { recursive: true, mode: 0o700 });
  if (await isSymlink(maj)) {
    throw new UpdateError('~/.leon/maj.json is a symbolic link: Leon does not write through it.');
  }
  const content = {
    verifie_le: state.verifie_le.toISOString(),
    ...(state.precedente === null ? {} : { precedente: state.precedente }),
  };
  const temp = `${maj}.leon-tmp-${randomBytes(6).toString('hex')}`;
  try {
    await writeFile(temp, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    await chmod(temp, 0o600); // `mode` ne vaut qu'à la création, et le masque (umask) peut en retirer
    await rename(temp, maj);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

// Remplace le lien `link` par un lien vers `target` d'un coup : un lien neuf, puis un `rename` par-dessus l'ancien (le
// `rename` remplace le lien lui-même, il ne le suit pas).
async function switchLink(target: string, link: string): Promise<void> {
  const temp = `${link}.leon-tmp-${randomBytes(6).toString('hex')}`;
  try {
    await symlink(target, temp);
    await rename(temp, link);
  } catch (error) {
    await unlink(temp).catch(() => {});
    throw error;
  }
}

const linkTarget = (link: string) => readlink(link).catch(() => null);
const asVersion = (target: string | null) =>
  target !== null && CLI_VERSION.test(target) ? target : null;

// Le dossier vers lequel `link` mène s'il a la forme `shape` et existe, sinon null.
async function linkedDirectory(link: string, shape: RegExp): Promise<string | null> {
  const target = await linkTarget(link);
  if (target === null || !shape.test(target)) return null;
  return (await stat(join(dirname(link), target)).then(
    (info) => info.isDirectory(),
    () => false,
  ))
    ? target
    : null;
}

// `<exécutable> <arguments> --version`, tel que le lanceur le lancerait : null si la commande échoue.
async function versionOf(executable: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await run(executable, [...args, '--version'], { timeout: START_TIMEOUT_MS });
    return stdout.trim();
  } catch {
    return null;
  }
}

// Télécharge `url` dans `file` sans rien garder en mémoire, en comptant les octets et en calculant l'empreinte. Un
// corps plus long que `maxBytes` coupe le téléchargement.
async function download(
  fetchImpl: typeof fetch,
  url: URL | string,
  file: string,
  what: string,
  limits: { maxBytes: number; timeoutMs: number },
): Promise<{ size: number; sha256: string }> {
  const hash = createHash('sha256');
  let size = 0;
  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(limits.timeoutMs) });
    if (!response.ok || !response.body) throw new Error('refused');
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        size += chunk.length;
        if (size > limits.maxBytes)
          return done(new UpdateError(`${what} is larger than expected.`));
        hash.update(chunk);
        done(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body as WebReadableStream),
      count,
      createWriteStream(file, { mode: 0o600, flags: 'wx' }),
    );
  } catch (error) {
    if (error instanceof UpdateError) throw error;
    throw new UpdateError(`could not download ${what}.`);
  }
  return { size, sha256: hash.digest('hex') };
}

async function fetchManifest(deps: UpdateDeps, serverUrl: string): Promise<CliManifest> {
  try {
    const response = await deps.fetch(new URL('/cli/version.json', serverUrl), {
      signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error('refused');
    return ManifestSchema.parse(await response.json());
  } catch {
    throw new UpdateError('could not read the latest version of Leon from the server.');
  }
}

// Pose le Node du manifeste. `staging` : le dossier de travail, effacé par l'appelant.
async function installNode(deps: UpdateDeps, p: Paths, staging: string, manifest: CliManifest) {
  const platform = deps.platform;
  const expected = platform === null ? undefined : manifest.node.plateformes[platform];
  if (platform === null || expected === undefined) {
    throw new UpdateError(
      'this computer is not supported (Leon supports macOS and Linux, on x64 and arm64).',
    );
  }
  const name = `node-v${manifest.node.version}`;
  const archiveName = `${name}-${platform}.tar.xz`;
  const archive = join(staging, archiveName);
  const got = await download(
    deps.fetch,
    `${deps.nodeDist}/v${manifest.node.version}/${archiveName}`,
    archive,
    `Node v${manifest.node.version}`,
    { maxBytes: NODE_MAX_BYTES, timeoutMs: NODE_TIMEOUT_MS },
  );
  if (got.sha256 !== expected) {
    throw new UpdateError('the Node download does not match its SHA-256.');
  }
  // Seul bin/node est pris de l'archive, comme le fait le script d'installation.
  const dir = join(staging, name);
  await mkdir(dir, { mode: 0o700 });
  try {
    await run(
      'tar',
      ['-xJf', archive, '-C', dir, '--strip-components=2', `${name}-${platform}/bin/node`],
      { timeout: UNPACK_TIMEOUT_MS },
    );
  } catch {
    throw new UpdateError('could not unpack Node (is `xz` installed?).');
  }
  await chmod(join(dir, 'node'), 0o755);
  if ((await versionOf(join(dir, 'node'), [])) !== `v${manifest.node.version}`) {
    throw new UpdateError('the new Node does not start on this computer.');
  }
  await mkdir(p.runtime, { recursive: true, mode: 0o700 });
  await rm(join(p.runtime, name), { recursive: true, force: true });
  await rename(dir, join(p.runtime, name));
  await switchLink(name, p.nodeLink);
}

// Pose la CLI du manifeste, vérifiée avec le Node de runtime/actuel : celui que le lanceur va lancer.
async function installCli(
  deps: UpdateDeps,
  p: Paths,
  staging: string,
  manifest: CliManifest,
  serverUrl: string,
) {
  const dir = join(staging, 'cli');
  await mkdir(dir, { mode: 0o700 });
  const file = join(dir, 'leon.mjs');
  const got = await download(
    deps.fetch,
    new URL(`/cli/leon-${manifest.version}.mjs`, serverUrl),
    file,
    'the Leon command line',
    { maxBytes: manifest.taille, timeoutMs: CLI_TIMEOUT_MS },
  );
  if (got.size !== manifest.taille) {
    throw new UpdateError('the new Leon command line has the wrong size.');
  }
  if (got.sha256 !== manifest.sha256) {
    throw new UpdateError('the new Leon command line does not match its SHA-256.');
  }
  await chmod(file, 0o644);
  if ((await versionOf(join(p.nodeLink, 'node'), [file])) !== manifest.version) {
    throw new UpdateError('the new Leon command line does not start.');
  }
  await mkdir(p.cli, { recursive: true, mode: 0o700 });
  const final = join(p.cli, manifest.version);
  await rm(final, { recursive: true, force: true });
  await rename(dir, final);
  await switchLink(manifest.version, p.cliLink);
}

// Un seul Node et deux versions de la CLI sur le disque, y compris ce qu'une réinstallation par `curl | sh` a laissé.
// Seuls les dossiers qui ont la forme de Leon sont effacés, et seulement si le lien vers celui qu'on garde tient.
async function prune(p: Paths, previous: string | null) {
  const others = async (dir: string, shape: RegExp, keep: (string | null)[]) => {
    for (const entry of await readdir(dir).catch(() => [])) {
      if (shape.test(entry) && !keep.includes(entry)) {
        await rm(join(dir, entry), { recursive: true, force: true }).catch(() => {});
      }
    }
  };
  const node = await linkedDirectory(p.nodeLink, NODE_DIR);
  if (node !== null) await others(p.runtime, NODE_DIR, [node]);
  const cli = await linkedDirectory(p.cliLink, CLI_VERSION);
  if (cli !== null) await others(p.cli, CLI_VERSION, [cli, previous]);
}

async function update(deps: UpdateDeps) {
  const p = paths(deps.home);
  const server = await resolveServerEnv(deps.env, deps.home).catch((error) => {
    // Les messages de resolveServerEnv sont fixes : ils ne recopient jamais la valeur reçue.
    throw new UpdateError(error instanceof Error ? error.message : 'invalid configuration.');
  });
  const manifest = await fetchManifest(deps, server.url);
  const maj = await readMaj(deps.home);
  // Le contrôle est fait : un échec plus loin (téléchargement, empreinte) attend les 24 h au lieu de recommencer à
  // chaque session. Un serveur injoignable, lui, n'a rien contrôlé : il est retenté à la session suivante.
  await writeMaj(deps.home, { verifie_le: deps.now(), precedente: maj.precedente });

  const nodeBefore = (await linkTarget(p.nodeLink)) ?? '';
  const cliBefore = await linkTarget(p.cliLink);
  const nodeChanged = nodeBefore !== `node-v${manifest.node.version}`;
  const cliChanged = cliBefore !== manifest.version;
  if (!nodeChanged && !cliChanged) {
    deps.out(`Leon is up to date (version ${manifest.version}).`);
    return;
  }

  const staging = await mkdtemp(join(p.leon, '.update.'));
  try {
    if (nodeChanged) await installNode(deps, p, staging, manifest);
    if (cliChanged) await installCli(deps, p, staging, manifest, server.url);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }

  // La CLI d'avant devient la précédente (sans CLI valide avant, celle que maj.json connaissait reste).
  const previous = cliChanged ? (asVersion(cliBefore) ?? maj.precedente) : maj.precedente;
  if (cliChanged) await writeMaj(deps.home, { verifie_le: deps.now(), precedente: previous });
  await prune(p, previous);
  if (nodeChanged) deps.out(`Updated Node to v${manifest.node.version}.`);
  if (cliChanged) {
    deps.out(`Updated Leon to version ${manifest.version}. To go back: leon update --previous`);
  }
}

// `leon update --previous` : remet la CLI d'avant la dernière mise à jour, sans réseau. La version quittée devient la
// précédente (deux retours de suite reviennent à la version de départ), et le délai de 24 h repart : sans cela, le
// prochain crochet remettrait la version qu'on vient de quitter.
async function goBack(deps: UpdateDeps) {
  const p = paths(deps.home);
  const maj = await readMaj(deps.home);
  const before = await linkTarget(p.cliLink);
  const previous = maj.precedente;
  const file = previous === null ? '' : join(p.cli, previous, 'leon.mjs');
  if (previous === null || previous === before || !(await stat(file).catch(() => null))) {
    throw new UpdateError('there is no previous version to go back to.');
  }
  if ((await versionOf(join(p.nodeLink, 'node'), [file])) !== previous) {
    throw new UpdateError('the previous version does not start.');
  }
  await switchLink(previous, p.cliLink);
  await writeMaj(deps.home, { verifie_le: deps.now(), precedente: asVersion(before) });
  await prune(p, asVersion(before));
  deps.out(`Went back to the previous version of Leon (${previous}).`);
}

// Un seul `leon update` à la fois : deux sessions qui démarrent ensemble lanceraient deux mises à jour. Le verrou est un
// dossier (`mkdir` est atomique). false : une autre mise à jour est en cours.
async function takeLock(p: Paths): Promise<boolean> {
  await mkdir(p.leon, { recursive: true, mode: 0o700 });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await mkdir(p.lock, { mode: 0o700 });
      return true;
    } catch (error) {
      if (errorCode(error) !== 'EEXIST') throw error;
      const age =
        Date.now() -
        (await stat(p.lock).then(
          (info) => info.mtimeMs,
          () => 0,
        ));
      if (age < LOCK_STALE_MS) return false;
      await rm(p.lock, { recursive: true, force: true });
    }
  }
  return false;
}

// La commande `leon update [--previous]`. Rend le code de sortie ; `deps.out` et `deps.err` portent tout ce qui se dit
// (`--background` leur donne des fonctions vides). Sous la forme clone, rien n'est fait : un clone se met à jour avec git.
export async function runUpdate(options: UpdateOptions, deps: UpdateDeps): Promise<number> {
  if (deps.cliVersion === CLONE_VERSION) {
    deps.err('Leon: this Leon runs from a clone: update it with git. Nothing was changed.');
    return 1;
  }
  try {
    const p = paths(deps.home);
    if (!(await takeLock(p))) return 0; // l'autre mise à jour fait le travail
    try {
      await (options.previous ? goBack(deps) : update(deps));
    } finally {
      await rm(p.lock, { recursive: true, force: true });
    }
    return 0;
  } catch (error) {
    // Les erreurs de Leon ont un message fixe ; celles du système ne sont citées que par leur code.
    const code = errorCode(error);
    deps.err(
      `Leon: ${error instanceof UpdateError ? error.message : `the update failed (unexpected error${code ? `, ${code}` : ''}).`}`,
    );
    return 1;
  }
}

export type ScheduleDeps = {
  home: string;
  cliVersion: string;
  now: () => Date;
  // Lance `leon update --background` (startBackgroundUpdate), ou son faux.
  start: () => void;
};

// Lance la mise à jour de fond si elle est due : jamais sous la forme clone ; due quand maj.json manque, est illisible,
// a 24 h ou plus, ou date du futur (horloge remise en arrière). N'écrit rien. true : elle a été lancée.
export async function scheduleUpdate(deps: ScheduleDeps): Promise<boolean> {
  if (deps.cliVersion === CLONE_VERSION) return false;
  const { verifie_le: checked } = await readMaj(deps.home);
  const age =
    checked === null ? Number.POSITIVE_INFINITY : deps.now().getTime() - checked.getTime();
  if (age >= 0 && age < UPDATE_INTERVAL_MS) return false;
  deps.start();
  return true;
}

// Lance cette même CLI avec `update --background`, détachée : sans entrée ni sortie, dans son propre groupe, et le
// processus qui l'a lancée peut finir sans l'attendre. `script` : le fichier de la CLI en cours (process.argv[1]).
export function startBackgroundUpdate(command: {
  node: string;
  script: string | undefined;
  home: string;
}): void {
  if (!command.script) return;
  spawn(command.node, [command.script, 'update', '--background'], {
    detached: true,
    stdio: 'ignore',
    cwd: command.home,
  })
    .on('error', () => {})
    .unref();
}
