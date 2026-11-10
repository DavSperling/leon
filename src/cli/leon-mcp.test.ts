import { describe, expect, it } from 'vitest';
import { type LeonMcpInput, leonMcpRecognized } from './leon-mcp';

// Le serveur MCP de Leon reconnu à l'URL de sa configuration (T44 ; D27, D36), sur des configurations inventées.

const HOME = '/Users/demo';
const PROJET = '/Users/demo/projets/leon';
const LEON = 'https://leon.example/api/mcp';
const AUTRE = 'https://autre.example/api/mcp';

const absent = () => Object.assign(new Error('absent'), { code: 'ENOENT' });

function input(files: Record<string, string>, extra: Partial<LeonMcpInput> = {}): LeonMcpInput {
  return {
    home: HOME,
    env: {},
    dirs: [PROJET],
    url: LEON,
    readFile: async (path) => {
      const text = files[path];
      if (text === undefined) throw absent();
      return text;
    },
    ...extra,
  };
}

const servers = (entries: Record<string, unknown>) => JSON.stringify({ mcpServers: entries });
const http = (url: string) => ({ type: 'http', url });

describe('leonMcpRecognized', () => {
  describe('Claude Code', () => {
    const recognized = (files: Record<string, string>, extra?: Partial<LeonMcpInput>) =>
      leonMcpRecognized('claude_code', input(files, extra));

    it.each([
      ['la portée utilisateur', { [`${HOME}/.claude.json`]: servers({ leon: http(LEON) }) }],
      [
        'la portée locale (sous le projet)',
        {
          [`${HOME}/.claude.json`]: JSON.stringify({
            projects: { [PROJET]: { mcpServers: { leon: http(LEON) } } },
          }),
        },
      ],
      ['le .mcp.json du projet', { [`${PROJET}/.mcp.json`]: servers({ leon: http(LEON) }) }],
      [
        'avec des en-têtes, jamais lus',
        {
          [`${HOME}/.claude.json`]: servers({
            leon: { ...http(LEON), headers: { Authorization: 'Bearer secret' } },
          }),
        },
      ],
    ])('reconnaît le serveur `leon` de %s, à l’URL de la connexion', async (_label, files) => {
      expect(await recognized(files)).toBe(true);
    });

    it('lit .claude.json dans CLAUDE_CONFIG_DIR quand elle est posée', async () => {
      const files = { '/config/claude/.claude.json': servers({ leon: http(LEON) }) };

      expect(await recognized(files, { env: { CLAUDE_CONFIG_DIR: '/config/claude' } })).toBe(true);
      expect(await recognized(files)).toBe(false);
    });

    it.each([
      ['aucune configuration', {}],
      ['aucun serveur `leon`', { [`${HOME}/.claude.json`]: servers({ autre: http(LEON) }) }],
      [
        'le serveur `leon` vers une autre URL',
        { [`${HOME}/.claude.json`]: servers({ leon: http(AUTRE) }) },
      ],
      [
        'le même nom déclaré par le projet vers une autre URL',
        {
          [`${HOME}/.claude.json`]: servers({ leon: http(LEON) }),
          [`${PROJET}/.mcp.json`]: servers({ leon: http(AUTRE) }),
        },
      ],
      [
        'le même nom vers une autre URL sous un autre projet',
        {
          [`${HOME}/.claude.json`]: JSON.stringify({
            mcpServers: { leon: http(LEON) },
            projects: { '/ailleurs': { mcpServers: { leon: http(AUTRE) } } },
          }),
        },
      ],
      [
        'un serveur `leon` lancé par une commande',
        { [`${HOME}/.claude.json`]: servers({ leon: { command: 'npx', args: ['leon-mcp'] } }) },
      ],
      ['une configuration illisible', { [`${HOME}/.claude.json`]: '{ pas du json' }],
      [
        'un .mcp.json illisible à côté d’une bonne configuration',
        {
          [`${HOME}/.claude.json`]: servers({ leon: http(LEON) }),
          [`${PROJET}/.mcp.json`]: '[]',
        },
      ],
      [
        'mcpServers d’une forme inconnue',
        { [`${HOME}/.claude.json`]: JSON.stringify({ mcpServers: [] }) },
      ],
    ])('ne reconnaît rien : %s', async (_label, files) => {
      expect(await recognized(files)).toBe(false);
    });

    it('ne reconnaît rien sans connexion (pas d’URL attendue)', async () => {
      const files = { [`${HOME}/.claude.json`]: servers({ leon: http(LEON) }) };

      expect(await recognized(files, { url: undefined })).toBe(false);
    });

    it('une configuration qu’on ne peut pas lire (droits) : rien n’est reconnu', async () => {
      const denied = async () => {
        throw Object.assign(new Error('refusé'), { code: 'EACCES' });
      };

      expect(await recognized({}, { readFile: denied })).toBe(false);
    });

    it('compare les URL normalisées, jamais un préfixe', async () => {
      const at = (url: string) =>
        recognized({ [`${HOME}/.claude.json`]: servers({ leon: http(url) }) });

      expect(await at('https://LEON.example/api/mcp')).toBe(true);
      expect(await at('https://leon.example/api/mcp/')).toBe(false);
      expect(await at('https://leon.example/api/mcp?x=1')).toBe(false);
      expect(await at('https://leon.example.autre.example/api/mcp')).toBe(false);
      expect(await at('pas une adresse')).toBe(false);
    });
  });

  describe('Codex', () => {
    const recognized = (files: Record<string, string>, extra?: Partial<LeonMcpInput>) =>
      leonMcpRecognized('codex', input(files, extra));
    const CONFIG = `${HOME}/.codex/config.toml`;

    it('reconnaît la table [mcp_servers.leon] et son url, celle que pose `codex mcp add leon --url`', async () => {
      const toml = [
        'model = "gpt-5"',
        '',
        '[mcp_servers.leon]',
        `url = "${LEON}" # posé par codex mcp add`,
        '',
        '[mcp_servers.leon.http_headers]',
        'X-Autre = "x"',
        '',
        '[mcp_servers.autre]',
        `url = "${AUTRE}"`,
      ].join('\n');

      expect(await recognized({ [CONFIG]: toml })).toBe(true);
      expect(
        await recognized({ '/codex/config.toml': toml }, { env: { CODEX_HOME: '/codex' } }),
      ).toBe(true);
    });

    // Un vrai analyseur TOML : toute forme valide de la table `mcp_servers.leon` se lit comme Codex la lit.
    it.each([
      ['une clé pointée', `mcp_servers.leon.url = "${LEON}"`],
      ['une table en ligne', `[mcp_servers]\nleon = { url = "${LEON}" }`],
      ['une chaîne littérale', `[mcp_servers.leon]\nurl = '${LEON}'`],
      ['une chaîne à échappement', `[mcp_servers.leon]\nurl = "${LEON}\\u0020"`],
    ])('reconnaît %s vers le serveur de la connexion', async (_label, toml) => {
      expect(await recognized({ [CONFIG]: toml })).toBe(true);
    });

    const PROJET_TOML = `${PROJET}/.codex/config.toml`;
    // Le même nom vers une autre URL, dans le projet, quelle que soit la forme : la configuration de l'utilisateur
    // déclare, elle, le bon serveur.
    const projectDeclares = (toml: string) => ({
      [CONFIG]: `[mcp_servers.leon]\nurl = "${LEON}"`,
      [PROJET_TOML]: toml,
    });

    it.each([
      ['aucun fichier', {}],
      ['une autre URL', { [CONFIG]: `[mcp_servers.leon]\nurl = "${AUTRE}"` }],
      ['une table sans url', { [CONFIG]: '[mcp_servers.leon]\ncommand = "npx"' }],
      ['une sous-table sans url', { [CONFIG]: '[mcp_servers.leon.http_headers]\nX = "x"' }],
      ['un TOML invalide', { [CONFIG]: '[mcp_servers.leon' }],
      ['le projet vers une autre URL', projectDeclares(`[mcp_servers."leon"]\nurl = "${AUTRE}"`)],
      [
        'une table en ligne à la racine',
        projectDeclares(`mcp_servers = { leon = { url = "${AUTRE}" } }`),
      ],
      [
        'une table au nom entre guillemets',
        projectDeclares(`["mcp_servers".leon]\nurl = "${AUTRE}"`),
      ],
      ['une clé pointée entre guillemets', projectDeclares(`"mcp_servers".leon.url = "${AUTRE}"`)],
      ['un nom échappé', projectDeclares(`[mcp_servers."le\\u006fn"]\nurl = "${AUTRE}"`)],
      [
        'un nom échappé en ligne',
        projectDeclares(`[mcp_servers]\n"le\\u006fn" = { url = "${AUTRE}" }`),
      ],
      ['une table échappée', projectDeclares(`["mcp\\u005fservers".leon]\nurl = "${AUTRE}"`)],
      [
        'une clé `url` entre guillemets, et un leurre dans une chaîne multiligne',
        projectDeclares(
          `[mcp_servers.leon]\n"url" = "${AUTRE}"\ndisabled_tools = ["""\nurl = "${LEON}"\n"""]`,
        ),
      ],
    ])('ne reconnaît rien : %s', async (_label, files) => {
      expect(await recognized(files)).toBe(false);
    });
  });

  describe('Cursor', () => {
    const recognized = (files: Record<string, string>) => leonMcpRecognized('cursor', input(files));

    it('reconnaît le serveur `leon` de ~/.cursor/mcp.json, ou du projet', async () => {
      expect(
        await recognized({ [`${HOME}/.cursor/mcp.json`]: servers({ leon: { url: LEON } }) }),
      ).toBe(true);
      expect(
        await recognized({ [`${PROJET}/.cursor/mcp.json`]: servers({ leon: { url: LEON } }) }),
      ).toBe(true);
    });

    it('le même nom vers une autre URL dans le projet : rien', async () => {
      expect(
        await recognized({
          [`${HOME}/.cursor/mcp.json`]: servers({ leon: { url: LEON } }),
          [`${PROJET}/.cursor/mcp.json`]: servers({ leon: { url: AUTRE } }),
        }),
      ).toBe(false);
    });
  });

  it('Antigravity : jamais, faute d’en connaître la configuration', async () => {
    const files = {
      [`${HOME}/.gemini/antigravity/mcp_config.json`]: servers({ leon: { serverUrl: LEON } }),
    };

    expect(await leonMcpRecognized('antigravity', input(files))).toBe(false);
  });
});
