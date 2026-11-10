// Le serveur MCP de Leon, reconnu dans la configuration d'un outil de code (T44 ; D27, D36 du plan de la mémoire à
// disposition) : ses outils locaux (`threads`, `thread`, `versions`, `remember`) ne rendent pas la session externe
// (session-facts.ts) seulement si chaque déclaration du serveur `leon` que l'outil peut lire pointe vers le serveur MCP
// de la connexion (`new URL(API_PATHS.mcp, <serveur>)`). La CLI la lit au moment des faits.
// - Échec fermé : une configuration absente partout, illisible, d'une forme inconnue, un serveur `leon` sans URL ou vers
//   une autre, et la session reste externe. Un fichier absent ne compte pas ; les autres sont tous lus.
// - Seule l'URL de la déclaration `leon` est lue, jamais ses en-têtes ni un jeton, et rien n'est écrit ni journalisé.
// - Claude Code : `.claude.json` (dans CLAUDE_CONFIG_DIR quand elle est posée, sinon le dossier personnel), son
//   `mcpServers` et celui de chacun de ses projets (portées utilisateur et locale), puis le `.mcp.json` du projet.
//   Codex : `config.toml` de CODEX_HOME (sinon ~/.codex) et du projet (`.codex/`), sa table `[mcp_servers.leon]`.
//   Cursor : `mcp.json` de ~/.cursor et du projet (`.cursor/`). Formats publics de ces outils.
// shortcut: la configuration MCP d'Antigravity n'est pas relevée : son serveur `leon` n'est jamais reconnu. La relever
// au prochain essai, avec la forme de ses appels MCP (antigravity.ts).
// shortcut: un `managed-mcp.json` de Claude Code (posé par une entreprise) n'est pas lu : le lire si une organisation y
// déclare un serveur `leon`.
import { join } from 'node:path';
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

// `{ mcpServers: { leon: { url } } }` : la forme de Claude Code (`.mcp.json`) et de Cursor (`mcp.json`).
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

const LEON_KEY = String.raw`(?:"${LEON_MCP_SERVER}"|'${LEON_MCP_SERVER}'|${LEON_MCP_SERVER})`;
const LEON_TABLE = new RegExp(String.raw`^\[\s*mcp_servers\s*\.\s*${LEON_KEY}\s*\]\s*(?:#.*)?$`);
const LEON_SUBTABLE = new RegExp(String.raw`^\[\s*mcp_servers\s*\.\s*${LEON_KEY}\s*\.`);
const SERVERS_TABLE = /^\[\s*mcp_servers\s*\]\s*(?:#.*)?$/;
const URL_LINE = /^url\s*=\s*"([^"\\]*)"\s*(?:#.*)?$/;
// Une déclaration de `leon` hors de sa table : une clé pointée, ou une table en ligne sous [mcp_servers].
const DOTTED = new RegExp(String.raw`^mcp_servers\s*\.\s*${LEON_KEY}\s*[.=]`);
const INLINE = new RegExp(String.raw`^${LEON_KEY}\s*[.=]`);

// `config.toml` de Codex, ligne à ligne : seule la table `[mcp_servers.leon]` et une `url` en chaîne simple se lisent.
// Toute autre façon de déclarer `leon` est une forme inconnue.
function tomlUrls(text: string): Urls {
  const urls: string[] = [];
  // Une sous-table (`[mcp_servers.leon.http_headers]`) déclare aussi `leon`, sans en dire l'URL.
  let declared = false;
  let table: 'leon' | 'servers' | 'autre' = 'autre';
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    if (line.startsWith('[')) {
      table = LEON_TABLE.test(line) ? 'leon' : SERVERS_TABLE.test(line) ? 'servers' : 'autre';
      declared ||= table === 'leon' || LEON_SUBTABLE.test(line);
      continue;
    }
    if (DOTTED.test(line) || (table === 'servers' && INLINE.test(line))) return null;
    if (table !== 'leon' || !/^url\s*=/.test(line)) continue;
    const url = URL_LINE.exec(line)?.[1];
    if (url === undefined) return null;
    urls.push(url);
  }
  if (!declared) return [];
  return urls.length > 0 ? urls : [null];
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
