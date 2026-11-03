import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { PROJECT_KEY_PATTERN } from '../capture/turn';

const KEY_MAX_CHARS = 200; // la limite de source.project dans le contrat d'ingestion (C8)
const GIT_TIMEOUT_MS = 3000;
// github.com, et son adresse SSH sur le port 443 (ssh.github.com), documentée par GitHub.
const GITHUB_HOSTS = new Set(['github.com', 'ssh.github.com']);
const URL_PROTOCOLS = new Set(['https:', 'http:', 'ssh:', 'git:']);

export type GitRunner = (args: string[], cwd: string) => Promise<string | null>;

// L'environnement de git : de quoi se trouver et lire sa configuration, rien de plus. Ni LEON_TOKEN ni les clés
// des autres outils (git n'en a pas besoin) ; pas non plus de GIT_DIR ou GIT_CONFIG_* hérités, qui lui feraient
// regarder ailleurs. Il ne pose jamais de question au terminal.
export function gitEnvironment(source: Record<string, string | undefined>): Record<string, string> {
  const kept = ['PATH', 'HOME'] as const;
  const env: Record<string, string> = { GIT_TERMINAL_PROMPT: '0' };
  for (const name of kept) {
    const value = source[name];
    if (value !== undefined) env[name] = value;
  }
  return env;
}

// Lance git dans un dossier ; null si git manque, si le dossier n'existe pas, si la commande échoue ou dépasse
// `timeoutMs`. Ni la sortie d'erreur ni le message de l'échec ne sortent d'ici : une adresse de remote peut porter un
// jeton.
export function gitRunner(timeoutMs: number): GitRunner {
  return (args, cwd) =>
    new Promise((done) => {
      execFile(
        'git',
        args,
        {
          cwd,
          timeout: timeoutMs,
          maxBuffer: 64 * 1024,
          env: gitEnvironment(process.env) as NodeJS.ProcessEnv,
        },
        (error, stdout) => done(error ? null : stdout.trim() || null),
      );
    });
}

// Le git des commandes : il ne retient jamais un crochet de Claude Code plus de GIT_TIMEOUT_MS.
export const gitInDirectory: GitRunner = gitRunner(GIT_TIMEOUT_MS);

// « propriétaire/dépôt » d'une adresse GitHub (https, ssh, git, ou la forme courte git@github.com:p/d), sinon null.
// Les identifiants éventuels de l'adresse ne sont jamais lus : seuls l'hôte et le chemin comptent.
function githubOwnerAndRepo(remote: string): string | null {
  const address = remote.trim();
  let host: string;
  let path: string;
  if (address.includes('://')) {
    if (!URL.canParse(address)) return null;
    const url = new URL(address);
    if (!URL_PROTOCOLS.has(url.protocol)) return null;
    host = url.hostname;
    path = url.pathname;
  } else {
    const short = /^(?:[^@/\s]+@)?([^:/\s]+):(.*)$/.exec(address);
    if (!short) return null;
    host = short[1] ?? '';
    path = short[2] ?? '';
  }
  if (!GITHUB_HOSTS.has(host.toLowerCase())) return null;
  // En minuscules d'abord : « Leon.GIT » perd aussi son suffixe.
  const segments = path
    .toLowerCase()
    .replace(/^\//, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .split('/');
  const [owner, repo] = segments;
  if (segments.length !== 2 || !owner || !repo) return null;
  if ([owner, repo].some((part) => part === '.' || part === '..')) return null;
  return `${owner}/${repo}`;
}

// La racine du dépôt git d'un dossier, ou null hors de tout dépôt (ou si git manque, échoue). `--show-cdup` est
// relatif au dossier : la racine garde la forme du chemin reçu, celle des chemins du transcript, là où
// `--show-toplevel` rendrait le chemin réel (/private/var… sous macOS) et ne correspondrait à aucun d'eux.
export async function repoRootFor(cwd: string, git: GitRunner): Promise<string | null> {
  const output = await git(['rev-parse', '--is-inside-work-tree', '--show-cdup'], cwd).catch(
    () => null,
  );
  const [inside, cdup = ''] = output?.split('\n') ?? [];
  return inside === 'true' ? resolve(cwd, cdup) : null;
}

// La clé du projet d'un dossier (D9) : le dépôt GitHub de son remote origin (`github.com/<propriétaire>/<dépôt>`,
// en minuscules), sinon le dossier lui-même (`dossier:` et 16 hexadécimaux du sha256 de son chemin absolu).
// Ni l'adresse brute du remote ni ce qu'elle contient d'autre que le propriétaire et le dépôt n'en sortent.
export async function projectKeyFor(cwd: string, git: GitRunner): Promise<string> {
  let remote: string | null = null;
  try {
    remote = await git(['remote', 'get-url', 'origin'], cwd);
  } catch {
    // git absent ou en échec : on passe à la clé du dossier. Le message de l'erreur peut citer l'adresse, on l'ignore.
  }
  const ownerAndRepo = remote === null ? null : githubOwnerAndRepo(remote);
  const github = ownerAndRepo === null ? null : `github.com/${ownerAndRepo}`;
  if (github !== null && github.length <= KEY_MAX_CHARS && PROJECT_KEY_PATTERN.test(github)) {
    return github;
  }
  return `dossier:${createHash('sha256').update(resolve(cwd)).digest('hex').slice(0, 16)}`;
}
