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

// Lance git dans un dossier ; null si git manque, si le dossier n'existe pas ou si la commande échoue.
// Ni la sortie d'erreur ni le message de l'échec ne sortent d'ici : une adresse de remote peut porter un jeton.
export const gitInDirectory: GitRunner = (args, cwd) =>
  new Promise((done) => {
    execFile(
      'git',
      args,
      {
        cwd,
        timeout: GIT_TIMEOUT_MS,
        maxBuffer: 64 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout) => done(error ? null : stdout.trim() || null),
    );
  });

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
  const segments = path
    .replace(/^\//, '')
    .replace(/\/+$/, '')
    .replace(/\.git$/, '')
    .toLowerCase()
    .split('/');
  const [owner, repo] = segments;
  if (segments.length !== 2 || !owner || !repo) return null;
  if ([owner, repo].some((part) => part === '.' || part === '..')) return null;
  return `${owner}/${repo}`;
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
