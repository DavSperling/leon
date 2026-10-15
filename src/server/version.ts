import { execFileSync } from 'node:child_process';

// Le worker du pipeline ne recharge pas le code à chaud : le commit au démarrage du serveur dit quel
// code traite les runs. Le jeu d'essai refuse de lancer un passage payant s'il diffère de HEAD.
const globalForVersion = globalThis as typeof globalThis & { leonStartCommit?: string | null };

// stdin/stderr ignorés et délai court : jamais de blocage ni de fuite d'un message git imprévu.
const GIT_OPTIONS: { encoding: 'utf8'; stdio: ['ignore', 'pipe', 'ignore']; timeout: number } = {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
  timeout: 2000,
};

export function readGitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], GIT_OPTIONS).trim();
  } catch {
    return null;
  }
}

function srcEstModifie(): boolean {
  try {
    return execFileSync('git', ['status', '--porcelain', '--', 'src'], GIT_OPTIONS).trim() !== '';
  } catch {
    return false;
  }
}

// Fonction pure, facile à tester : combine le commit lu et l'état de src au démarrage.
export function startCommitFrom(commit: string | null, srcDirty: boolean): string | null {
  if (commit === null) return null;
  return srcDirty ? `${commit}-dirty` : commit;
}

// Idempotent : le rechargement à chaud de Next réexécute register(), le premier commit reste.
// En production, rien : la route ne doit pas exposer de détail du déploiement.
// Un serveur démarré sur du code non commité ne doit jamais sembler tourner sur HEAD : le jeu
// d'essai compare le commit renvoyé à HEAD, « -dirty » fait toujours échouer cette comparaison.
export function recordStartCommit(): void {
  if (process.env.NODE_ENV === 'production') {
    globalForVersion.leonStartCommit ??= null;
    return;
  }
  globalForVersion.leonStartCommit ??= startCommitFrom(readGitCommit(), srcEstModifie());
}

export function startCommit(): string | null {
  return globalForVersion.leonStartCommit ?? null;
}
