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

    it.each([
      ['aucun fichier', {}],
      ['une autre URL', { [CONFIG]: `[mcp_servers.leon]\nurl = "${AUTRE}"` }],
      ['une table sans url', { [CONFIG]: '[mcp_servers.leon]\ncommand = "npx"' }],
      ['une clé pointée', { [CONFIG]: `mcp_servers.leon.url = "${LEON}"` }],
      ['une table en ligne', { [CONFIG]: `[mcp_servers]\nleon = { url = "${LEON}" }` }],
      ['une chaîne littérale', { [CONFIG]: `[mcp_servers.leon]\nurl = '${LEON}'` }],
      ['une chaîne à échappement', { [CONFIG]: `[mcp_servers.leon]\nurl = "${LEON}\\u0020"` }],
      [
        'le projet vers une autre URL',
        {
          [CONFIG]: `[mcp_servers.leon]\nurl = "${LEON}"`,
          [`${PROJET}/.codex/config.toml`]: `[mcp_servers."leon"]\nurl = "${AUTRE}"`,
        },
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
