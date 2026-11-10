// Le serveur MCP de Leon, reconnu dans la configuration d'un outil de code (T44 ; D27, D36 du plan de la mémoire à
// disposition) : ses outils locaux (`threads`, `thread`, `versions`, `remember`) ne rendent pas la session externe
// (session-facts.ts) seulement si chaque déclaration du serveur `leon` que l'outil peut lire pointe vers le serveur MCP
// de la connexion (`new URL(API_PATHS.mcp, <serveur>)`). La CLI la lit au moment des faits.
// - Échec fermé : une configuration absente partout, illisible, d'une forme inconnue, un serveur `leon` sans URL ou vers
//   une autre, et la session reste externe. Un fichier absent ne compte pas ; les autres sont tous lus.
// - Seule l'URL de la déclaration `leon` est lue, jamais ses en-têtes ni un jeton, et rien n'est écrit ni journalisé.
// - Claude Code : `.claude.json` (dans CLAUDE_CONFIG_DIR quand elle est posée, sinon le dossier personnel), son
//   `mcpServers` et celui de chacun de ses projets (portées utilisateur et locale), puis le `.mcp.json` du projet.
//   Codex : `config.toml` de CODEX_HOME (sinon ~/.codex) et du projet (`.codex/`), sa table `mcp_servers.leon`, lue
//   par un analyseur TOML (smol-toml).
//   Cursor : `mcp.json` de ~/.cursor et du projet (`.cursor/`). Formats publics de ces outils.
// shortcut: la configuration MCP d'Antigravity n'est pas relevée : son serveur `leon` n'est jamais reconnu. La relever
// au prochain essai, avec la forme de ses appels MCP (antigravity.ts).
// shortcut: un `managed-mcp.json` de Claude Code (posé par une entreprise) n'est pas lu : le lire si une organisation y
// déclare un serveur `leon`.
// shortcut: un serveur `leon` déclaré au lancement (`claude --mcp-config …`, surtout avec `--strict-mcp-config`, ou
// `codex -c mcp_servers.leon.url=…`) n'est pas vu, et c'est lui que la session utilise : s'il pointe ailleurs, ses
// outils locaux ne rendent pas la session externe (échec ouvert). Le lire si un orchestrateur lance un outil ainsi.
import { join } from 'node:path';
import { parse } from 'smol-toml';
import { LEON_MCP_SERVER } from '../capture/session-facts';
import type { CodeSessionKind } from '../capture/turn';
import { codexHome, cursorHome } from './outils';

export type LeonMcpInput = {
  home: string;
  env: Record<string, string | undefined>;
  // Les dossiers du projet de la session, absolus : son dossier de départ et la racine de son dépôt.
  dirs: string[];
  // Le serveur MCP de la connexion ; absent (aucune connexion), rien n'est reconnu.
  url: string | undefined;
  readFile: (path: string) => Promise<string>;
};

// Les URL déclarées pour `leon` dans un fichier (null : une déclaration sans URL lisible), ou null si le fichier n'a pas
// une forme connue.
type Urls = Array<string | null> | null;

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

// `{ mcpServers: { leon: { url } } }` : la forme de Claude Code (`.mcp.json`) et de Cursor (`mcp.json`), et celle de
// `mcp_servers` chez Codex.
function serversUrls(servers: unknown): Urls {
  if (servers === undefined) return [];
  const all = record(servers);
  if (all === null) return null;
  if (!Object.hasOwn(all, LEON_MCP_SERVER)) return [];
  const url = record(all[LEON_MCP_SERVER])?.url;
  return [typeof url === 'string' ? url : null];
}

function jsonUrls(text: string, withProjects: boolean): Urls {
  let parsed: Record<string, unknown> | null;
  try {
    parsed = record(JSON.parse(text));
  } catch {
    return null;
  }
  if (parsed === null) return null;
  const found: Urls[] = [serversUrls(parsed.mcpServers)];
  if (withProjects && parsed.projects !== undefined) {
    const projects = record(parsed.projects);
    if (projects === null) return null;
    for (const project of Object.values(projects))
      found.push(serversUrls(record(project)?.mcpServers));
  }
  const urls: Array<string | null> = [];
  for (const one of found) {
    if (one === null) return null;
    urls.push(...one);
  }
  return urls;
}

// `config.toml` de Codex, lu par un analyseur TOML : la même table `mcp_servers.leon` que Codex, quelle que soit sa
// forme (table, clé pointée, table en ligne, nom échappé). Un TOML que l'analyseur refuse est une forme inconnue.
function tomlUrls(text: string): Urls {
  let parsed: Record<string, unknown>;
  try {
    parsed = parse(text);
  } catch {
    return null;
  }
  return serversUrls(parsed.mcp_servers);
}

type ConfigFile = { path: string; urls: (text: string) => Urls };

function configFiles(kind: CodeSessionKind, input: LeonMcpInput): ConfigFile[] | null {
  const { home, env, dirs } = input;
  const project = (...parts: string[]) => [...new Set(dirs)].map((dir) => join(dir, ...parts));
  if (kind === 'claude_code') {
    return [
      { path: join(env.CLAUDE_CONFIG_DIR || home, '.claude.json'), urls: (t) => jsonUrls(t, true) },
      ...project('.mcp.json').map((path) => ({ path, urls: (t: string) => jsonUrls(t, false) })),
    ];
  }
  if (kind === 'codex') {
    return [join(codexHome(home, env), 'config.toml'), ...project('.codex', 'config.toml')].map(
      (path) => ({ path, urls: tomlUrls }),
    );
  }
  if (kind === 'cursor') {
    return [join(cursorHome(home), 'mcp.json'), ...project('.cursor', 'mcp.json')].map((path) => ({
      path,
      urls: (t: string) => jsonUrls(t, false),
    }));
  }
  return null;
}

const normalized = (url: string): string | null => (URL.canParse(url) ? new URL(url).href : null);

export async function leonMcpRecognized(
  kind: CodeSessionKind,
  input: LeonMcpInput,
): Promise<boolean> {
  const expected = input.url === undefined ? null : normalized(input.url);
  const files = configFiles(kind, input);
  if (expected === null || files === null) return false;
  const declared: Array<string | null> = [];
  for (const file of files) {
    let text: string;
    try {
      text = await input.readFile(file.path);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (code === 'ENOENT' || code === 'ENOTDIR') continue;
      return false;
    }
    const urls = file.urls(text);
    if (urls === null) return false;
    declared.push(...urls);
  }
  return (
    declared.length > 0 && declared.every((url) => url !== null && normalized(url) === expected)
  );
}
