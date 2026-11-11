// `leon setup` (S10 du plan « CLI sans clone ») : la commande que le script d'installation lance à la fin, et qu'on
// relance à volonté. Elle fait tout dans cet ordre, et ne demande rien de plus que ce qui suit :
// 1. écrit le lanceur ~/.leon/bin/leon (launcher.ts, K8) : sous la forme installée, ou, avec `--depot <clone>`, sous la
//    forme clone. Un autre lanceur est montré à côté du nouveau et ne change que sur confirmation ;
// 2. relance `leon login` quand l'ordinateur n'est pas (ou plus) connecté : ni connexion ni variables, jeton de la
//    connexion révoqué (GET /api/v1/me répond 401), `--url` d'un autre serveur que celui de la connexion, ou seulement
//    LEON_URL et LEON_TOKEN (un Claude Code lancé depuis le Dock ne voit pas ces variables) ; sinon dit à quel serveur
//    (son origine). Un serveur qui ne répond pas, ou une autre erreur, ne bloque pas : l'ordinateur compte pour connecté.
//    La page « Autoriser » montre en cases les usages cochés par défaut qui manquent sans refus aux outils trouvés (T64,
//    C16 du plan de la mémoire à disposition) : lus avant la connexion. Avec --yes, un ordinateur déjà connecté rouvre
//    la page pour eux (moins de 2 minutes d'attente), sauf après `leon login --with-token` ;
// 3. cherche les outils de code (leur dossier de réglages existe) : ceux dont l'installateur existe sont proposés, les
//    autres sont dits « not supported yet » et rien n'est écrit chez eux ;
// 4. pour chaque outil proposé, montre son texte d'accord et pose ses crochets (`installHooks`, commandes K9) : ceux
//    d'une installation d'avant (`pnpm … leon …`) sont remplacés sur place, l'accord déjà donné est gardé (S11) ;
// 5. finit par une ligne par outil, le chemin du lanceur et, sous la forme installée, les mises à jour automatiques.
// Dans un terminal, sans --yes, les usages (`lecture`, `resume`) se demandent une fois pour tous les outils du passage :
// au premier installateur auquel l'un manque sans refus ; la réponse passe aux suivants (UsageDecisions, T47), qui
// l'écrivent chacun après son accord de base. Les cases tranchées sur la page passent par les mêmes décisions : elles ne
// sont pas redemandées. --yes n'ajoute jamais un usage de lui-même : seules les cases de la page en donnent.
// `--yes` accepte tout, sauf le remplacement d'un lanceur qui n'est pas celui de la forme installée (un clone, ou un
// fichier que Leon n'a pas écrit). Relancée, la commande n'écrit rien de ce qui est déjà en place.
//
// Rien ici ne touche à `~/.leon/accord.json` hors des installateurs, sinon la date d'un retrait que le serveur apprend
// (tellBeforeConsent, T43) : l'accord reste écrit après la confirmation de l'outil (C7 du plan mémoire). Les
// dépendances (dossier personnel, environnement, questions, `leon login`) viennent de leon.ts : les tests donnent les
// leurs.
import { access, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import {
  AUTHORIZE_USAGES,
  type AuthorizeUsage,
  ViewerProfileSchema,
} from '../capture/api-contract';
import { type Connection, readConnection } from './connection';
import { type ConsentTool, factsConsent } from './consent';
import { resolveServerEnv, type ServerEnv } from './env';
import { ANTIGRAVITY_VARIANTS } from './find-sessions';
import { launcherPath } from './hook-commands';
import {
  ANTIGRAVITY_ENTRY,
  addAntigravityHooks,
  antigravityHooksPath,
  installAntigravityHooks,
} from './install-antigravity';
import { addCodexHooks, CODEX_HOOKS_FILE, codexHome, installCodexHook } from './install-codex';
import { addCursorHooks, cursorHooksPath, installCursorHooks } from './install-cursor';
import {
  addLeonHooks,
  errorCode,
  installHooks,
  isYes,
  type Json,
  load,
  parseSettings,
  SETTINGS_FILE,
  type UsageDecisions,
} from './install-hooks';
import type { ToolHookPlan } from './install-outil';
import {
  type LauncherForm,
  launcherScript,
  previousLauncherScripts,
  writeLauncher,
} from './launcher';
import { type LoginResult, requestMe } from './login';
import { cursorHome, geminiHome } from './outils';
import { isAllowedServerUrl } from './server-url';
import { connectionWithdrawal, tellBeforeConsent } from './uninstall-hooks';

export type SetupOptions = { url?: string; depot?: string; yes: boolean };
// Une connexion par `leon login` : `url`, l'option --url de `leon setup`, ou la connexion enregistrée pour une relance ;
// `usages`, les cases à demander sur la page ; `relance`, l'ordinateur est déjà connecté (l'attente est plus courte) ;
// `attendu`, le compte et l'espace de la connexion, que la relance doit retrouver (sinon rien ne change).
export type SetupLogin = {
  url: string | undefined;
  usages: AuthorizeUsage[];
  relance: boolean;
  attendu?: { userId: string; tenantId: string };
};
export type SetupDeps = {
  home: string;
  env: Record<string, string | undefined>;
  out: (text: string) => void;
  err: (text: string) => void;
  // Pose la question et rend la ligne tapée ; null si l'entrée est fermée (Ctrl+D), qui n'est pas une réponse.
  ask: (question: string) => Promise<string | null>;
  // L'entrée standard est un terminal : seul il fait demander un usage (les installateurs).
  interactive?: boolean;
  // `leon login` (leon.ts) : rend son code de sortie et les cases tranchées sur la page.
  login: (request: SetupLogin) => Promise<LoginResult>;
  // Pour demander à GET /api/v1/me si le jeton de la connexion vaut encore.
  fetch: typeof fetch;
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

async function firstDirectory(paths: string[]): Promise<string | null> {
  for (const path of paths) if (await isDirectory(path)) return path;
  return null;
}

// L'origine d'une adresse de serveur (sans chemin, compte ni jeton), seulement si c'est une adresse simple : https, ou
// http sur la machine seule, et rien d'autre que des caractères d'hôte (la commande d'installation se copie dans un shell).
function plainOrigin(address: string | undefined): string | null {
  if (address === undefined || !isAllowedServerUrl(address)) return null;
  const { origin } = new URL(address);
  return /^https?:\/\/[a-z0-9.:[\]-]+$/.test(origin) ? origin : null;
}

// La commande d'installation de Leon (S09), avec l'adresse connue de l'ordinateur : --url, sinon la connexion ou
// LEON_URL (resolveServerEnv), sinon LEON_URL seule. Sans adresse simple, la forme générique.
async function installCommand(options: SetupOptions, deps: SetupDeps): Promise<string> {
  const server = await resolveServerEnv(deps.env, deps.home).catch(() => null);
  const origin =
    plainOrigin(options.url) ?? plainOrigin(server?.url) ?? plainOrigin(deps.env.LEON_URL);
  return `curl -fsSL ${origin ?? '<address of Leon>'}/install | sh`;
}

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
  const installed = [
    launcherScript(io.home, { kind: 'installee' }),
    ...previousLauncherScripts(io.home, { kind: 'installee' }),
  ];
  const confirm = async (old: string): Promise<boolean> => {
    // --yes ne vaut que pour le lanceur de la forme installée, que Leon a écrit (aujourd'hui ou dans une version
    // précédente) : celui d'un clone (qu'on perdrait de vue) ou d'un autre auteur se montre et se demande toujours.
    if (!(io.yes && installed.includes(old))) {
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
  decisions: UsageDecisions; // les usages tranchés dans ce passage, pour tous ses outils
} & Pick<SetupDeps, 'out' | 'err' | 'ask' | 'interactive'>;

async function installClaudeCode(configDir: string, ctx: InstallContext): Promise<Installed> {
  const code = await installHooks(
    {
      repoDir: ctx.repoDir,
      configDir,
      home: ctx.home,
      assumeYes: ctx.yes,
      interactive: ctx.interactive,
      decisions: ctx.decisions,
    },
    { out: ctx.out, err: ctx.err, ask: ctx.ask },
  );
  if (code !== 0) return { failed: true, status: 'hooks NOT installed (see above)' };
  const inPlace = await claudeCodeHooksInPlace(configDir, ctx.home);
  return { failed: false, status: inPlace ? 'hooks installed' : 'skipped (not confirmed)' };
}

const usageOptions = (ctx: InstallContext) => ({
  home: ctx.home,
  assumeYes: ctx.yes,
  interactive: ctx.interactive,
  decisions: ctx.decisions,
});

// Le crochet de Codex (T17), comme celui de Claude Code : la ligne finale distingue un « non » d'une installation.
async function installCodex(codexDir: string, ctx: InstallContext): Promise<Installed> {
  const code = await installCodexHook({ codexDir, ...usageOptions(ctx) }, ctx);
  if (code !== 0) return { failed: true, status: 'hooks NOT installed (see above)' };
  const settings = parseSettings(await load(join(codexDir, CODEX_HOOKS_FILE)));
  const inPlace =
    settings !== null &&
    (addCodexHooks(settings, ctx.home)?.changes ?? []).every(
      (change) => change.action === 'inchange',
    ) &&
    (await factsConsent(ctx.home, 'codex'))?.capture_le !== undefined;
  return {
    failed: false,
    status: inPlace
      ? 'hooks installed (approve them with /hooks in Codex)'
      : 'skipped (not confirmed)',
  };
}

// Les crochets d'un outil installé par install-outil.ts : en place quand le plan ne change plus rien et que l'accord de
// capture est écrit.
async function toolInstalled(
  code: number,
  outil: 'cursor' | 'antigravity',
  path: string,
  plan: (settings: Json) => ToolHookPlan | null,
  ctx: InstallContext,
): Promise<Installed> {
  if (code !== 0) return { failed: true, status: 'hooks NOT installed (see above)' };
  const settings = parseSettings(await load(path));
  const inPlace =
    settings !== null &&
    (plan(settings)?.changes ?? []).every((change) => change.action === 'inchange') &&
    (await factsConsent(ctx.home, outil))?.capture_le !== undefined;
  return { failed: false, status: inPlace ? 'hooks installed' : 'skipped (not confirmed)' };
}

async function installCursor(_dir: string, ctx: InstallContext): Promise<Installed> {
  const code = await installCursorHooks(usageOptions(ctx), ctx);
  return toolInstalled(
    code,
    'cursor',
    cursorHooksPath(ctx.home),
    (settings) => addCursorHooks(settings, ctx.home),
    ctx,
  );
}

async function installAntigravity(_dir: string, ctx: InstallContext): Promise<Installed> {
  const code = await installAntigravityHooks(usageOptions(ctx), ctx);
  return toolInstalled(
    code,
    'antigravity',
    antigravityHooksPath(ctx.home),
    (settings) => addAntigravityHooks(settings, ctx.home),
    ctx,
  );
}

// L'entrée d'accord.json de chaque installateur (consent.ts) : lue avant la connexion, pour savoir quelles cases demander
// sur la page (T64).
type Installer = (configDir: string, ctx: InstallContext) => Promise<Installed>;
const CONSENT_TOOLS = new Map<Installer, ConsentTool>([
  [installClaudeCode, 'claude_code'],
  [installCodex, 'codex'],
  [installCursor, 'cursor'],
  [installAntigravity, 'antigravity'],
]);

// Le dossier de réglages de Claude Code (CLAUDE_CONFIG_DIR, sinon ~/.claude), comme claudeConfigDir (env.ts), mais sous
// le dossier personnel reçu : les tests n'ont pas le vrai.
const claudeDir = (home: string, env: SetupDeps['env']) =>
  env.CLAUDE_CONFIG_DIR || join(home, '.claude');

// Les outils de code que Leon sait capter, et les dossiers qui prouvent qu'ils sont là : le premier qui existe. `install`
// n'existe que pour ceux dont l'installateur est écrit (Claude Code au lot 1 du plan mémoire, Codex aux lots 4 et 5,
// Cursor au lot 8, Antigravity au lot 9) : un outil sans installateur serait détecté mais dit « not supported yet ».
const TOOLS: {
  label: string;
  dirs: (home: string, env: SetupDeps['env']) => string[];
  install?: (configDir: string, ctx: InstallContext) => Promise<Installed>;
}[] = [
  {
    label: 'Claude Code',
    dirs: (home, env) => [claudeDir(home, env)],
    install: installClaudeCode,
  },
  { label: 'Codex', dirs: (home, env) => [codexHome(home, env)], install: installCodex },
  { label: 'Cursor', dirs: (home) => [cursorHome(home)], install: installCursor },
  // ~/.gemini est aussi le dossier de Gemini CLI : seuls ceux de l'appli, de l'IDE et d'`agy` prouvent Antigravity.
  {
    label: 'Antigravity',
    dirs: (home) => ANTIGRAVITY_VARIANTS.map((variant) => join(geminiHome(home), variant)),
    install: installAntigravity,
  },
];

// Un Antigravity introuvable dont Leon a pourtant posé l'entrée ou daté la capture : un poste qui n'a que Gemini CLI,
// pris pour Antigravity avant #162 (le seul `~/.gemini` suffisait). Rien ne part sans dossier d'Antigravity, mais tout
// reprendrait à son premier lancement, et le setup suivant ne dirait rien : la ligne le dit, avec la commande qui retire.
async function antigravityLeftover(home: string): Promise<boolean> {
  const hooks = parseSettings(await load(antigravityHooksPath(home)));
  if (hooks?.[ANTIGRAVITY_ENTRY] !== undefined) return true;
  return (await factsConsent(home, 'antigravity'))?.capture_le !== undefined;
}

const ANTIGRAVITY_LEFTOVER =
  'Antigravity was not found, but an earlier `leon setup` left its hooks or its capture consent in place (Gemini CLI alone used to be taken for Antigravity). Nothing is sent while Antigravity is not installed; if it is installed later, they apply from its first launch. To remove them: ~/.leon/bin/leon retirer-crochets --outil antigravity';

// Les cases à demander sur la page « Autoriser » (T64, C16) : les usages cochés par défaut qu'elle sait montrer, qui
// manquent sans refus à l'un des outils trouvés dont l'installateur existe (les mêmes dossiers que la boucle de
// runSetup). Un outil sans accord de base, ou retiré, n'a ni usage ni refus.
async function usagesForPage(home: string, env: SetupDeps['env']): Promise<AuthorizeUsage[]> {
  const missing = new Set<AuthorizeUsage>();
  for (const tool of TOOLS) {
    const outil = tool.install && CONSENT_TOOLS.get(tool.install);
    if (!outil || (await firstDirectory(tool.dirs(home, env))) === null) continue;
    const consent = await factsConsent(home, outil);
    for (const usage of AUTHORIZE_USAGES) {
      if (!consent?.usages.includes(usage) && !consent?.refus.includes(usage)) missing.add(usage);
    }
  }
  return AUTHORIZE_USAGES.filter((usage) => missing.has(usage));
}

// Pourquoi l'ordinateur est à reconnecter (`reason`), ou null s'il est connecté ; `attendu` : le compte et l'espace du
// jeton de la connexion, quand le serveur le reconnaît (GET /api/v1/me à 200, avec un profil), sinon null. Seules les
// adresses de serveur se disent, par leur origine : ni chemin ni, jamais, le jeton.
async function reconnectReason(
  options: SetupOptions,
  deps: Pick<SetupDeps, 'fetch'>,
  saved: Connection | null,
  server: ServerEnv | null,
): Promise<{ reason: string | null; attendu: { userId: string; tenantId: string } | null }> {
  if (saved === null) {
    return {
      reason:
        server === null
          ? 'This computer is not connected to Leon yet: running `~/.leon/bin/leon login`.'
          : 'This computer is connected only by LEON_URL and LEON_TOKEN, which a Claude Code started from the Dock or an editor does not see: running `~/.leon/bin/leon login`.',
      attendu: null,
    };
  }
  const current = new URL(saved.url).origin;
  if (options.url !== undefined) {
    const wanted = isAllowedServerUrl(options.url) ? new URL(options.url).origin : null;
    if (wanted !== current) {
      return {
        reason: `This computer is connected to ${current}, not to the server of --url${wanted === null ? '' : ` (${wanted})`}: connecting it again.`,
        attendu: null,
      };
    }
  }
  // C'est le jeton de la connexion qu'on contrôle, même si des variables passent avant lui : les crochets lancés hors
  // d'un terminal n'ont que lui. Un serveur muet ou une autre erreur ne prouvent rien : on ne bloque pas hors ligne.
  const me = await requestMe(current, saved.jeton, deps.fetch);
  const profile =
    me?.status === 200 ? ViewerProfileSchema.safeParse(await me.json().catch(() => null)) : null;
  if (me?.status !== 200) await me?.body?.cancel().catch(() => {});
  return {
    reason:
      me?.status === 401
        ? 'This computer was disconnected from Leon (its token was revoked): connecting it again.'
        : null,
    attendu: profile?.success
      ? { userId: profile.data.userId, tenantId: profile.data.tenantId }
      : null,
  };
}

const RELAUNCH =
  'Usages of your coding tools are not chosen yet (such as reading Leon): opening the authorization page of Leon again, so that you choose them in your browser. This computer stays connected meanwhile.';
const RELAUNCH_FAILED =
  'Nothing was chosen on the authorization page: this computer stays connected as before, and no usage was added. To choose them, run `~/.leon/bin/leon setup` again, or in a terminal. If this computer was connected with `leon login --with-token`, run that once more: `leon setup --yes` then stops opening the page.';
const WITH_TOKEN =
  'This computer was connected with `leon login --with-token`: `leon setup --yes` does not open the authorization page. To choose the usages of your coding tools (such as reading Leon), run `~/.leon/bin/leon setup` in a terminal.';

// Connecte l'ordinateur s'il ne l'est pas ou plus, en demandant les cases `asked` sur la page (rend ce que rend `leon
// login`), sinon dit à quel serveur. Avec --yes, un ordinateur connecté rouvre la page pour ces cases (T64) : vers sa
// connexion enregistrée, jamais LEON_URL, et seulement si le serveur a reconnu son jeton (hors ligne, la relance
// attendrait pour rien) ; pas après `--with-token`, que rien ne rouvre. La relance doit retrouver le compte et l'espace
// de la connexion (`attendu`, login.ts). Si elle échoue (annulée, refusée, délai passé, autre compte ou autre espace,
// page qui ne s'ouvre pas), la connexion d'avant reste et l'installation continue.
async function ensureConnected(
  options: SetupOptions,
  deps: SetupDeps,
  asked: AuthorizeUsage[],
): Promise<LoginResult> {
  const server = await resolveServerEnv(deps.env, deps.home).catch(() => null);
  const saved = await readConnection(deps.home);
  const { reason, attendu } = await reconnectReason(options, deps, saved, server);
  if (reason !== null) {
    deps.out(reason);
    return deps.login({ url: options.url, usages: asked, relance: false });
  }
  // Pas de raison, donc une connexion enregistrée, donc un serveur.
  if (server)
    deps.out(`This computer is already connected to Leon (${new URL(server.url).origin}).`);
  const unchanged: LoginResult = { code: 0, usages: [], refus: [] };
  if (!options.yes || asked.length === 0 || attendu === null || saved === null) return unchanged;
  if (saved.par === 'jeton') {
    deps.out(WITH_TOKEN);
    return unchanged;
  }
  deps.out(RELAUNCH);
  // La page ne s'ouvre pas toujours (écoute sur 127.0.0.1 refusée dans un bac à sable) : l'ancienne connexion reste. Le
  // message de l'erreur n'est pas recopié : il renvoie vers `--with-token`, qu'un agent ne doit pas demander.
  const again = await deps
    .login({ url: saved.url, usages: asked, relance: true, attendu })
    .catch(() => null);
  if (again?.code === 0) return again;
  deps.out(RELAUNCH_FAILED);
  return unchanged;
}

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
      `Leon is not installed in ~/.leon (there is no Node or no CLI there), so its launcher would not run. Install it with \`${await installCommand(options, deps)}\`, or pass --depot <path> to run Leon from a clone.`,
    );
  }

  const form: LauncherForm =
    repoDir === undefined ? { kind: 'installee' } : { kind: 'clone', repoDir };
  if (!(await ensureLauncher(form, { home, yes: options.yes, out, err, ask }))) return 1;

  const asked = await usagesForPage(home, env);
  const connection = await ensureConnected(options, deps, asked);
  if (connection.code !== 0) {
    err(
      'Leon: setup stopped: this computer is not connected, so no hook was installed. Run `~/.leon/bin/leon setup` again once it is.',
    );
    return connection.code;
  }

  // Un retrait que le serveur n'a pas appris (fait avant la route, ou hors ligne) se dit avant tout nouvel accord, qui
  // effacerait son attente : après le retrait du dernier outil, plus aucun crochet ne lance le rattrapage.
  await tellBeforeConsent(home, { err, withdraw: connectionWithdrawal(deps.fetch, env, home) });

  const decisions: UsageDecisions = new Map();
  // Ce que l'humain a tranché sur la page, pour les seules cases demandées : chaque installateur l'écrit après son accord
  // de base, là où l'usage manque sans refus, et ne le redemande pas.
  for (const usage of asked) {
    if (connection.usages.includes(usage)) decisions.set(usage, true);
    else if (connection.refus.includes(usage)) decisions.set(usage, false);
  }
  const summary: string[] = [];
  let failed = false;
  for (const tool of TOOLS) {
    const dir = await firstDirectory(tool.dirs(home, env));
    if (dir === null && tool.install === installAntigravity && (await antigravityLeftover(home))) {
      out(ANTIGRAVITY_LEFTOVER);
      summary.push(`${tool.label}: not found (hooks of an earlier setup left in place, see above)`);
    } else if (dir === null) {
      summary.push(`${tool.label}: not found`);
    } else if (!tool.install) {
      out(`${tool.label} found in ${dir}: not supported yet, nothing is written there.`);
      summary.push(`${tool.label}: not supported yet`);
    } else {
      out(`${tool.label} found in ${dir}.`);
      const result = await tool.install(dir, {
        home,
        repoDir,
        yes: options.yes,
        out,
        err,
        ask,
        interactive: deps.interactive,
        decisions,
      });
      failed ||= result.failed;
      summary.push(`${tool.label}: ${result.status}`);
    }
  }

  out('Summary');
  for (const line of summary) out(`  ${line}`);
  out('');
  out('To run Leon later: ~/.leon/bin/leon <command>');
  // Un clone se met à jour avec git : le lanceur de la forme clone n'est pas concerné par les mises à jour de S12.
  if (repoDir === undefined) {
    out(
      'Leon updates itself, at most once a day, from the server this computer is connected to. To go back to the previous version: ~/.leon/bin/leon update --previous',
    );
  }
  return failed ? 1 : 0;
}
