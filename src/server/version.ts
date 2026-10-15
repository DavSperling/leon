import { execFileSync } from 'node:child_process';

// Le worker du pipeline ne recharge pas le code à chaud : le commit au démarrage du serveur dit quel
// code traite les runs. Le jeu d'essai refuse de lancer un passage payant s'il diffère de HEAD.
const globalForVersion = globalThis as typeof globalThis & { leonStartCommit?: string | null };

export function readGitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

// Idempotent : le rechargement à chaud de Next réexécute register(), le premier commit reste.
// En production, rien : la route ne doit pas exposer de détail du déploiement.
export function recordStartCommit(): void {
  globalForVersion.leonStartCommit ??=
    process.env.NODE_ENV === 'production' ? null : readGitCommit();
}

export function startCommit(): string | null {
  return globalForVersion.leonStartCommit ?? null;
}
