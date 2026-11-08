// Lancer une commande de cette CLI en tâche détachée (T19 du plan mémoire des sessions) : le rattrapage au démarrage
// de tout outil. La fin de session de Codex, elle, se détache dans le lanceur, avant node (launcher.ts) : son crochet
// n'a que 3 s.
//
// Le processus détaché reprend le Node, ses options et le fichier de la CLI en cours : sous la forme clone, `node
// --import tsx src/cli/leon.ts` (le script `leon` de package.json, lancé dans le dépôt) ; sous la forme installée, le
// Node posé par Leon et `cli/actuelle/leon.mjs`. Sans entrée ni sortie, dans son propre groupe : le crochet qui l'a
// lancé peut finir sans l'attendre.
import { spawn } from 'node:child_process';

export type CurrentProcess = {
  execPath: string;
  execArgv: string[];
  script: string | undefined; // process.argv[1]
  cwd: string;
};

export const currentProcess = (): CurrentProcess => ({
  execPath: process.execPath,
  execArgv: process.execArgv,
  script: process.argv[1],
  cwd: process.cwd(),
});

// Rend false si rien n'a pu être lancé (pas de fichier de CLI connu). Une erreur au lancement est ignorée : la tâche
// détachée n'est jamais attendue.
export function startDetached(
  args: string[],
  proc: CurrentProcess = currentProcess(),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!proc.script) return false;
  spawn(proc.execPath, [...proc.execArgv, proc.script, ...args], {
    detached: true,
    stdio: 'ignore',
    cwd: proc.cwd,
    env,
  })
    .on('error', () => {})
    .unref();
  return true;
}
