// `leon setup` (S10 du plan « CLI sans clone ») : la commande que le script d'installation lance à la fin, et qu'on
// relance à volonté. Elle fait tout dans cet ordre, et ne demande rien de plus que ce qui suit :
// 1. écrit le lanceur ~/.leon/bin/leon (launcher.ts, K8) : sous la forme installée, ou, avec `--depot <clone>`, sous la
//    forme clone. Un autre lanceur est montré à côté du nouveau et ne change que sur confirmation ;
// 2. si l'ordinateur n'est pas connecté (`resolveServerEnv`), lance `leon login` ;
// 3. cherche les outils de code (leur dossier de réglages existe) : ceux dont l'installateur existe sont proposés, les
//    autres sont dits « not supported yet » et rien n'est écrit chez eux ;
// 4. pour chaque outil proposé, montre son texte d'accord et pose ses crochets (`installHooks`, commandes K9) ;
// 5. finit par une ligne par outil et le chemin du lanceur.
// `--yes` accepte tout, sauf le remplacement d'un lanceur qui n'est pas celui de la forme installée (un clone, ou un
// fichier que Leon n'a pas écrit). Relancée, la commande n'écrit rien de ce qui est déjà en place.
//
// Rien ici ne touche à `~/.leon/accord.json` hors de `installHooks` : l'accord reste écrit après la confirmation de
// l'outil (C7 du plan mémoire). Les dépendances (dossier personnel, environnement, questions, `leon login`) viennent de
// leon.ts : les tests donnent les leurs.
import { access, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { factsConsent } from './consent';
import { resolveServerEnv } from './env';
import { launcherPath } from './hook-commands';
import {
  addLeonHooks,
  errorCode,
  installHooks,
  isYes,
  load,
  parseSettings,
  SETTINGS_FILE,
} from './install-hooks';
import { type LauncherForm, launcherScript, writeLauncher } from './launcher';

export type SetupOptions = { url?: string; depot?: string; yes: boolean };
export type SetupDeps = {
  home: string;
  env: Record<string, string | undefined>;
  out: (text: string) => void;
  err: (text: string) => void;
  // Pose la question et rend la ligne tapée ; une chaîne vide si l'entrée est fermée.
  ask: (question: string) => Promise<string>;
  // `leon login` (leon.ts) : rend son code de sortie. `url` : l'option --url de `leon setup`.
  login: (url: string | undefined) => Promise<number>;
};

const present = (path: string) =>
  access(path).then(
    () => true,
    () => false,
  );

// Un dépôt de Leon : le dossier qui contient src/cli/leon.ts (`--depot`).
export const isLeonRepo = (repoDir: string) => present(join(repoDir, 'src', 'cli', 'leon.ts'));

const isDirectory = (path: string) =>
  stat(path).then(
    (info) => info.isDirectory(),
    () => false,
  );

const indent = (text: string) =>
  text
    .trimEnd()
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');

// Écrit le lanceur de `home` pour cette forme (S08). Un lanceur différent déjà là est montré avec le nouveau, et ne
// change que sur un « oui ». Rend false (le message est donné) quand il n'a pas pu ou pas voulu être écrit.
export async function ensureLauncher(
  form: LauncherForm,
  io: { home: string; yes: boolean } & Pick<SetupDeps, 'out' | 'err' | 'ask'>,
): Promise<boolean> {
  const path = launcherPath(io.home);
  const installed = launcherScript(io.home, { kind: 'installee' });
  const confirm = async (old: string): Promise<boolean> => {
    // --yes ne vaut que pour le lanceur de la forme installée, que Leon a écrit : celui d'un clone (qu'on perdrait de
    // vue) ou d'un autre auteur se montre et se demande toujours.
    if (!(io.yes && old === installed)) {
      io.out(
        `${path} already exists and is different.\n  Now:\n${indent(old)}\n  Replaced by:\n${indent(launcherScript(io.home, form))}`,
      );
      if (!isYes(await io.ask('Replace it? [y/N] '))) return false;
    }
    // La réponse a pu prendre du temps : un lanceur qui a changé entre-temps n'est plus celui qu'on a montré.
    if ((await readFile(path, 'utf8').catch(() => null)) !== old) {
      throw new Error(
        `${path} changed while you were answering. Nothing was written: run the command again.`,
      );
    }
    return true;
  };
  try {
    const written = await writeLauncher(io.home, form, confirm);
    const done = { neuf: 'written', identique: 'already in place', remplace: 'replaced' }[
      written.etat
    ];
    io.out(
      `Launcher ${done}: ${path}${written.etat === 'identique' ? '' : form.kind === 'clone' ? ` (clone form: ${form.repoDir})` : ' (installed form)'}`,
    );
    return true;
  } catch (error) {
    // Les erreurs de Leon ont un message fixe ; celles du système ne sont citées que par leur code.
    const code = errorCode(error);
    io.err(
      `Leon: ${error instanceof Error && !code ? error.message : `could not write ${path}${code ? ` (${code})` : ''}.`}`,
    );
    return false;
  }
}

// Les crochets de Claude Code sont-ils posés tels que `leon setup` les veut (commandes du lanceur, délais) avec
// l'accord enregistré ? `installHooks` rend 0 aussi quand on lui a répondu « non » : la ligne finale doit le distinguer.
async function claudeCodeHooksInPlace(configDir: string, home: string): Promise<boolean> {
  const settings = parseSettings(await load(join(configDir, SETTINGS_FILE)));
  if (settings === null || (await factsConsent(home, 'claude_code')) === null) return false;
  try {
    return addLeonHooks(settings, home).changes.every((change) => change.action === 'inchange');
  } catch {
    return false;
  }
}

type Installed = { failed: boolean; status: string };
type InstallContext = {
  home: string;
  repoDir: string | undefined;
  yes: boolean;
} & Pick<SetupDeps, 'out' | 'err' | 'ask'>;

async function installClaudeCode(configDir: string, ctx: InstallContext): Promise<Installed> {
  const code = await installHooks(
    { repoDir: ctx.repoDir, configDir, home: ctx.home, assumeYes: ctx.yes },
    { out: ctx.out, err: ctx.err, ask: ctx.ask },
  );
  if (code !== 0) return { failed: true, status: 'hooks NOT installed (see above)' };
  const inPlace = await claudeCodeHooksInPlace(configDir, ctx.home);
  return { failed: false, status: inPlace ? 'hooks installed' : 'skipped (not confirmed)' };
}

// Le dossier de réglages de Claude Code (CLAUDE_CONFIG_DIR, sinon ~/.claude), comme claudeConfigDir (env.ts), mais sous
// le dossier personnel reçu : les tests n'ont pas le vrai.
const claudeDir = (home: string, env: SetupDeps['env']) =>
  env.CLAUDE_CONFIG_DIR || join(home, '.claude');

// Les outils de code que Leon sait capter, et le dossier de réglages qui prouve qu'ils sont là. `install` n'existe que
// pour ceux dont l'installateur est écrit (Claude Code au lot 1 du plan mémoire ; Codex, Cursor et Gemini à leurs lots) :
// les autres sont détectés mais dits « not supported yet ».
const TOOLS: {
  label: string;
  dir: (home: string, env: SetupDeps['env']) => string;
  install?: (configDir: string, ctx: InstallContext) => Promise<Installed>;
}[] = [
  {
    label: 'Claude Code',
    dir: claudeDir,
    install: installClaudeCode,
  },
  { label: 'Codex', dir: (home, env) => env.CODEX_HOME || join(home, '.codex') },
  { label: 'Cursor', dir: (home) => join(home, '.cursor') },
  { label: 'Gemini / Antigravity', dir: (home) => join(home, '.gemini') },
];

export async function runSetup(options: SetupOptions, deps: SetupDeps): Promise<number> {
  const { home, env, out, err, ask } = deps;
  const fail = (message: string) => {
    err(`Leon: ${message}`);
    return 1;
  };

  // Tout ce qui peut refuser la commande passe avant la première écriture.
  const repoDir = options.depot === undefined ? undefined : resolve(options.depot);
  if (repoDir !== undefined && !(await isLeonRepo(repoDir))) {
    return fail('--depot: this folder is not a Leon repository.');
  }
  if (!isAbsolute(claudeDir(home, env))) return fail('CLAUDE_CONFIG_DIR must be an absolute path.');
  // Le lanceur de la forme installée appelle le Node et la CLI posés par le script d'installation : sans eux, il
  // ne mènerait nulle part et tous les crochets échoueraient sans bruit.
  if (
    repoDir === undefined &&
    !(
      (await present(join(home, '.leon', 'runtime', 'actuel', 'node'))) &&
      (await present(join(home, '.leon', 'cli', 'actuelle', 'leon.mjs')))
    )
  ) {
    return fail(
      'Leon is not installed in ~/.leon (there is no Node or no CLI there), so its launcher would not run. Install it with the command shown in Leon, or pass --depot <path> to run Leon from a clone.',
    );
  }

  const form: LauncherForm =
    repoDir === undefined ? { kind: 'installee' } : { kind: 'clone', repoDir };
  if (!(await ensureLauncher(form, { home, yes: options.yes, out, err, ask }))) return 1;

  const connected = await resolveServerEnv(env, home).then(
    () => true,
    () => false,
  );
  if (connected) {
    out('This computer is already connected to Leon.');
  } else {
    out('This computer is not connected to Leon yet: running `leon login`.');
    const code = await deps.login(options.url);
    if (code !== 0) {
      err(
        'Leon: setup stopped: this computer is not connected, so no hook was installed. Run `leon setup` again once it is.',
      );
      return code;
    }
  }

  const summary: string[] = [];
  let failed = false;
  for (const tool of TOOLS) {
    const dir = tool.dir(home, env);
    if (!(await isDirectory(dir))) {
      summary.push(`${tool.label}: not found`);
    } else if (!tool.install) {
      out(`${tool.label} found in ${dir}: not supported yet, nothing is written there.`);
      summary.push(`${tool.label}: not supported yet`);
    } else {
      out(`${tool.label} found in ${dir}.`);
      const result = await tool.install(dir, { home, repoDir, yes: options.yes, out, err, ask });
      failed ||= result.failed;
      summary.push(`${tool.label}: ${result.status}`);
    }
  }

  out('Summary');
  for (const line of summary) out(`  ${line}`);
  out('');
  out('To run Leon later: ~/.leon/bin/leon <command>');
  return failed ? 1 : 0;
}
