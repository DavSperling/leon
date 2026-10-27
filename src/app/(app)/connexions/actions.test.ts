import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requireUserContext } from '@/server/auth/session';
import type { CatalogField, CatalogItem } from '@/server/connectors/catalog';
import { listCatalog } from '@/server/connectors/catalog';
import {
  createConnection,
  deleteConnection,
  listConnections,
  replaceConnectionSecret,
  requestSyncNow,
  setConnectionPaused,
} from '@/server/connectors/connections';
import { connectorsKey } from '@/server/connectors/crypto';
import { githubCatalog } from '@/server/connectors/github/catalog';
import { githubConnector } from '@/server/connectors/github/connector';
import { gongCatalog } from '@/server/connectors/gong/catalog';
import { gongConnector } from '@/server/connectors/gong/connector';
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
import { leexiCatalog } from '@/server/connectors/leexi/catalog';
import { leexiConnector } from '@/server/connectors/leexi/connector';
import { getConnector } from '@/server/connectors/registry';
import type { AnyConnector } from '@/server/connectors/types';
import {
  connectAction,
  deleteConnectionAction,
  replaceKeyAction,
  setPausedAction,
  syncNowAction,
} from './actions';

vi.mock('@/server/auth/session', () => ({ requireUserContext: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/server/connectors/connections', () => ({
  createConnection: vi.fn(),
  deleteConnection: vi.fn(),
  listConnections: vi.fn(),
  replaceConnectionSecret: vi.fn(),
  requestSyncNow: vi.fn(),
  setConnectionPaused: vi.fn(),
}));
vi.mock('@/server/connectors/registry', () => ({ getConnector: vi.fn() }));
vi.mock('@/server/connectors/catalog', () => ({ listCatalog: vi.fn() }));
vi.mock('@/server/connectors/crypto', () => ({ connectorsKey: vi.fn() }));

const ctx = { tenantId: 'tenant', userId: 'user', principals: ['user', 'tenant'] };
const ID = '0b9f2c7e-2d4c-4f6a-9a51-6a1e2f3b4c5d';
const NOW = new Date('2026-10-15T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const KEY = 'lin_api_cle-de-test-qui-ne-doit-jamais-etre-journalisee';

const verify = vi.fn();
const connector = {
  id: 'linear',
  configSchema: z.object({
    apiKey: z.string().min(12),
    teams: z.array(z.string()).optional(),
  }),
  secretFields: ['apiKey'],
  hosts: () => ['api.linear.app'],
  verify,
  sync: vi.fn(),
} as unknown as AnyConnector;

const catalogItem = {
  id: 'linear',
  label: 'Linear',
  family: 'dev',
  available: true,
  keyHelp: 'Dans Linear.',
  docsUrl: 'https://linear.app/docs',
  triedForReal: false,
  fields: [
    { name: 'apiKey', label: "Clé d'API", kind: 'secret' },
    { name: 'teams', label: 'Équipes', kind: 'list' },
  ],
} as CatalogItem;

// Les messages que les connecteurs écrivent exprès pour la personne qui saisit (jamais ceux de
// l'outil, jamais une clé ni une adresse) : l'écran doit les montrer tels quels.
const CONNECTOR_MESSAGES: Array<[number | null, string]> = [
  [404, 'Repository not accessible: acme/leon'],
  [404, 'Jira site not found: check the site name'],
  [null, 'Invalid header: check your GitHub key'],
];

// Un outil dont la clé est une paire, et ce que le remplacement doit chiffrer (le secret en premier).
type KeyPairCase = {
  provider: string;
  entry: { fields: CatalogField[] };
  real: AnyConnector;
  stored: Record<string, unknown>;
  fields: Record<string, string>;
  secretFields: string[];
};

const connect = (override: Partial<Parameters<typeof connectAction>[0]> = {}) =>
  connectAction({
    provider: 'linear',
    fields: { apiKey: KEY, teams: 'ENG\n\nOPS\n' },
    since: '30',
    ...override,
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireUserContext).mockResolvedValue(ctx);
  vi.mocked(connectorsKey).mockReturnValue(Buffer.alloc(32, 7));
  vi.mocked(getConnector).mockReturnValue(connector);
  vi.mocked(listCatalog).mockReturnValue([catalogItem]);
  vi.mocked(createConnection).mockResolvedValue(ID);
  verify.mockResolvedValue({ account: 'David (acme)' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connectAction', () => {
  it('refuse un outil inconnu, sans rien tester ni créer', async () => {
    await expect(connect({ provider: 'inconnu' })).resolves.toEqual({
      error: expect.stringContaining('inconnu'),
    });

    expect(verify).not.toHaveBeenCalled();
    expect(createConnection).not.toHaveBeenCalled();
  });

  it("refuse un outil dont le connecteur n'existe pas encore", async () => {
    vi.mocked(getConnector).mockReturnValue(null);

    await expect(connect()).resolves.toEqual({ error: expect.stringContaining('pas encore') });

    expect(createConnection).not.toHaveBeenCalled();
  });

  it('explique que le serveur n’est pas configuré sans LEON_CONNECTORS_KEY', async () => {
    vi.mocked(connectorsKey).mockReturnValue(null);

    await expect(connect()).resolves.toEqual({
      error: 'Les connecteurs ne sont pas configurés sur ce serveur (LEON_CONNECTORS_KEY).',
    });

    expect(verify).not.toHaveBeenCalled();
    expect(createConnection).not.toHaveBeenCalled();
  });

  it('nomme les champs invalides sans jamais répéter ce qui a été saisi', async () => {
    const result = await connect({ fields: { apiKey: 'secret-9' } });

    expect(result).toEqual({ error: "Vérifiez les champs : Clé d'API" });
    expect(JSON.stringify(result)).not.toContain('secret-9');
    expect(verify).not.toHaveBeenCalled();
    expect(createConnection).not.toHaveBeenCalled();
  });

  it('refuse une durée qui n’est pas proposée', async () => {
    // @ts-expect-error valeur hors liste, comme en enverrait un appel forgé
    await expect(connect({ since: '15' })).resolves.toHaveProperty('error');

    expect(createConnection).not.toHaveBeenCalled();
  });

  it('dit « Clé refusée » quand l’outil refuse la clé, sans créer de connexion', async () => {
    verify.mockRejectedValue(new ConnectorAuthError('Linear', 401));

    await expect(connect()).resolves.toEqual({ error: 'Clé refusée par Linear.' });

    expect(createConnection).not.toHaveBeenCalled();
  });

  it('dit que l’outil ne répond pas pour une panne inconnue, sans journaliser la clé', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    verify.mockRejectedValue(new TypeError('fetch failed'));

    await expect(connect()).resolves.toEqual({
      error: 'Linear ne répond pas, réessayez dans un moment.',
    });

    expect(createConnection).not.toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
    spy.mockRestore();
  });

  it.each(CONNECTOR_MESSAGES)(
    'montre tel quel le message écrit par le connecteur (%s) : %s',
    async (status, message) => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      verify.mockRejectedValue(new ConnectorHttpError(status, message));

      const result = await connect();

      expect(result).toEqual({ error: message });
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(createConnection).not.toHaveBeenCalled();
      spy.mockRestore();
    },
  );

  it('teste avec un client HTTP réel et la configuration validée, puis enregistre', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);

    await expect(connect()).resolves.toEqual({ ok: true, account: 'David (acme)' });

    expect(verify).toHaveBeenCalledWith({ apiKey: KEY, teams: ['ENG', 'OPS'] }, expect.anything());
    expect(verify.mock.calls[0]?.[1]).toHaveProperty('json');
    expect(createConnection).toHaveBeenCalledWith(ctx, {
      provider: 'linear',
      label: 'David (acme)',
      config: { apiKey: KEY, teams: ['ENG', 'OPS'] },
      secretFields: ['apiKey'],
      since: new Date(NOW.getTime() - 30 * DAY),
    });
    expect(revalidatePath).toHaveBeenCalledWith('/connexions');
  });

  it.each(['7', '90', '365'] as const)(
    'lit les %s derniers jours quand on le demande',
    async (days) => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);

      await connect({ since: days });

      expect(createConnection).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({ since: new Date(NOW.getTime() - Number(days) * DAY) }),
      );
    },
  );

  it("n'enregistre que les champs du catalogue", async () => {
    await connect({ fields: { apiKey: KEY, status: 'paused', cursor: 'x' } });

    expect(createConnection).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ config: { apiKey: KEY, teams: [] } }),
    );
  });

  it('rend une erreur, pas une exception, quand l’enregistrement échoue', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(createConnection).mockRejectedValue(new Error(`insert ${KEY}`));

    await expect(connect()).resolves.toEqual({ error: expect.stringContaining('Réessayez') });

    expect(revalidatePath).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('ne teste ni ne crée rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(connect()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(verify).not.toHaveBeenCalled();
    expect(createConnection).not.toHaveBeenCalled();
  });
});

// Sans simulation du connecteur : le vrai connecteur GitHub, le vrai client HTTP, et seulement
// `fetch` remplacé. Prouve que le message écrit dans le connecteur arrive jusqu'à l'action.
describe('connectAction avec le vrai connecteur GitHub', () => {
  const TOKEN = 'github_pat_cle-de-test-qui-ne-doit-jamais-etre-affichee';
  const github = { ...catalogItem, id: 'github', label: 'GitHub', fields: githubCatalog.fields };
  const fetchStub = vi.fn();
  const connectGithub = (token: string) =>
    connect({ provider: 'github', fields: { token, repos: 'acme/leon' } });

  beforeEach(() => {
    vi.mocked(getConnector).mockReturnValue(githubConnector as AnyConnector);
    vi.mocked(listCatalog).mockReturnValue([github as CatalogItem]);
    fetchStub.mockImplementation(async (url: string) =>
      new URL(url).pathname === '/user'
        ? Response.json({ login: 'david', id: 4102 })
        : Response.json({ message: 'Not Found' }, { status: 404 }),
    );
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchStub.mockReset();
  });

  it('dit quel dépôt est inaccessible quand GitHub répond 404', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await connectGithub(TOKEN);

    expect(result).toEqual({ error: 'Repository not accessible: acme/leon' });
    expect(fetchStub.mock.calls.map(([url]) => url)).toEqual([
      'https://api.github.com/user',
      'https://api.github.com/repos/acme/leon',
    ]);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
    expect(createConnection).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('dit de vérifier la clé quand un retour à la ligne s’est glissé au milieu, sans appeler GitHub', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pasted = `${TOKEN.slice(0, 20)}\n${TOKEN.slice(20)}`;

    const result = await connectGithub(pasted);

    expect(result).toEqual({ error: 'Invalid header: check your GitHub key' });
    expect(fetchStub).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain(TOKEN.slice(0, 20));
    expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN.slice(0, 20));
    expect(createConnection).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('replaceKeyAction', () => {
  const stored = {
    id: ID,
    provider: 'linear',
    config: { teams: ['ENG'] },
    createdBy: { id: 'user', name: 'Amos' },
    canManage: true,
    isCreator: true,
  };
  const replace = (fields: Record<string, string> = { apiKey: KEY }) =>
    replaceKeyAction({ id: ID, fields });

  beforeEach(() => {
    vi.mocked(listConnections).mockResolvedValue([stored] as never);
    vi.mocked(replaceConnectionSecret).mockResolvedValue(true);
  });

  it('vérifie la nouvelle clé avant de la stocker, avec la configuration déjà enregistrée', async () => {
    await expect(replace()).resolves.toEqual({ ok: true, account: 'David (acme)' });

    expect(verify).toHaveBeenCalledWith({ apiKey: KEY, teams: ['ENG'] }, expect.anything());
    expect(replaceConnectionSecret).toHaveBeenCalledWith(ctx, ID, { apiKey: KEY, teams: ['ENG'] }, [
      'apiKey',
    ]);
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(replaceConnectionSecret).mock.invocationCallOrder[0] ?? 0,
    );
    expect(revalidatePath).toHaveBeenCalledWith('/connexions');
  });

  it('ne change que les champs secrets', async () => {
    await replace({ apiKey: KEY, teams: 'OPS' });

    expect(replaceConnectionSecret).toHaveBeenCalledWith(ctx, ID, { apiKey: KEY, teams: ['ENG'] }, [
      'apiKey',
    ]);
  });

  // Leexi et Gong donnent une paire à la création de la clé (identifiant + secret, clé d'accès + secret).
  // Une fois la clé révoquée, la paire entière change : l'identifiant se saisit avec le secret,
  // sinon « Remplacer la clé » échoue toujours et il ne reste qu'à supprimer puis rebrancher.
  it.each<KeyPairCase>([
    {
      provider: 'leexi',
      entry: leexiCatalog,
      real: leexiConnector,
      stored: { keyId: 'ancien_id' },
      fields: { keyId: 'nouvel_id', keySecret: 'nouveau_secret_9' },
      secretFields: ['keySecret', 'keyId'],
    },
    {
      provider: 'gong',
      entry: gongCatalog,
      real: gongConnector,
      stored: { baseUrlHost: 'us-12345', accessKey: 'ancienne-cle' },
      fields: { accessKey: 'nouvelle-cle', accessKeySecret: 'nouveau-secret-9' },
      secretFields: ['accessKeySecret', 'accessKey'],
    },
  ])(
    'remplace aussi l’identifiant d’une clé en deux parties ($provider)',
    async ({ provider, entry, real, stored: config, fields, secretFields }) => {
      vi.mocked(getConnector).mockReturnValue({ ...real, verify } as unknown as AnyConnector);
      vi.mocked(listCatalog).mockReturnValue([
        { ...catalogItem, id: provider, label: provider, fields: entry.fields } as CatalogItem,
      ]);
      vi.mocked(listConnections).mockResolvedValue([{ ...stored, provider, config }] as never);

      await expect(replace(fields)).resolves.toEqual({ ok: true, account: 'David (acme)' });

      const sent = { ...config, ...fields };
      expect(verify).toHaveBeenCalledWith(sent, expect.anything());
      // La paire entière est chiffrée, le secret d'abord : l'empreinte affichée en est tirée.
      expect(replaceConnectionSecret).toHaveBeenCalledWith(ctx, ID, sent, secretFields);
      expect(real.secretFields).toEqual(secretFields);
    },
  );

  it('garde l’ancienne clé quand l’outil refuse la nouvelle', async () => {
    verify.mockRejectedValue(new ConnectorAuthError('Linear', 401));

    await expect(replace()).resolves.toEqual({ error: 'Clé refusée par Linear.' });

    expect(replaceConnectionSecret).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each(CONNECTOR_MESSAGES)(
    'montre tel quel le message écrit par le connecteur (%s) : %s',
    async (status, message) => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      verify.mockRejectedValue(new ConnectorHttpError(status, message));

      const result = await replace();

      expect(result).toEqual({ error: message });
      expect(JSON.stringify(result)).not.toContain(KEY);
      expect(replaceConnectionSecret).not.toHaveBeenCalled();
      spy.mockRestore();
    },
  );

  it('nomme les champs invalides sans répéter la saisie', async () => {
    await expect(replace({ apiKey: 'court' })).resolves.toEqual({
      error: "Vérifiez les champs : Clé d'API",
    });

    expect(replaceConnectionSecret).not.toHaveBeenCalled();
  });

  it("dit que la connexion n'existe plus quand elle est introuvable ou supprimée entre-temps", async () => {
    vi.mocked(listConnections).mockResolvedValue([]);
    await expect(replace()).resolves.toEqual({ error: "Cette connexion n'existe plus." });

    vi.mocked(listConnections).mockResolvedValue([stored] as never);
    vi.mocked(replaceConnectionSecret).mockResolvedValue(false);
    await expect(replace()).resolves.toEqual({ error: "Cette connexion n'existe plus." });
  });

  // Audit n° 3 : la clé d'un autre ne se remplace pas, et l'outil n'est même pas appelé.
  it("refuse la connexion d'un autre membre quand on n'est pas administrateur", async () => {
    const other = { ...stored, canManage: false, isCreator: false };
    vi.mocked(listConnections).mockResolvedValue([other] as never);

    await expect(replace()).resolves.toEqual({
      error: 'Seule la personne qui a branché cet outil peut remplacer sa clé.',
    });

    expect(verify).not.toHaveBeenCalled();
    expect(replaceConnectionSecret).not.toHaveBeenCalled();
  });

  // Audit 2 n° 2 : un administrateur mettrait sa propre clé à la place de celle du créateur.
  it("refuse la connexion d'un autre membre même à un administrateur", async () => {
    vi.mocked(listConnections).mockResolvedValue([{ ...stored, isCreator: false }] as never);

    await expect(replace()).resolves.toEqual({
      error: 'Seule la personne qui a branché cet outil peut remplacer sa clé.',
    });

    expect(verify).not.toHaveBeenCalled();
    expect(replaceConnectionSecret).not.toHaveBeenCalled();
  });

  it("refuse un identifiant qui n'est pas un UUID et un serveur sans clé", async () => {
    await expect(replaceKeyAction({ id: 'pas-un-uuid', fields: { apiKey: KEY } })).resolves.toEqual(
      { error: expect.any(String) },
    );
    expect(listConnections).not.toHaveBeenCalled();

    vi.mocked(connectorsKey).mockReturnValue(null);
    await expect(replace()).resolves.toEqual({
      error: 'Les connecteurs ne sont pas configurés sur ce serveur (LEON_CONNECTORS_KEY).',
    });
    expect(replaceConnectionSecret).not.toHaveBeenCalled();
  });

  it('ne remplace rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(replace()).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(replaceConnectionSecret).not.toHaveBeenCalled();
  });
});

describe.each([
  ['syncNowAction', (id: string) => syncNowAction(id), requestSyncNow, [ctx, ID]],
  [
    'setPausedAction(true)',
    (id: string) => setPausedAction(id, true),
    setConnectionPaused,
    [ctx, ID, true],
  ],
  [
    'setPausedAction(false)',
    (id: string) => setPausedAction(id, false),
    setConnectionPaused,
    [ctx, ID, false],
  ],
  [
    'deleteConnectionAction',
    (id: string) => deleteConnectionAction(id),
    deleteConnection,
    [ctx, ID],
  ],
] as const)('%s', (_name, run, write, args) => {
  it('agit pour le lecteur connecté puis rafraîchit la page', async () => {
    vi.mocked(write).mockResolvedValue(true);

    await expect(run(ID)).resolves.toEqual({ ok: true });

    expect(write).toHaveBeenCalledWith(...(args as unknown as Parameters<typeof write>));
    expect(revalidatePath).toHaveBeenCalledWith('/connexions');
  });

  it('rend { ok: false } quand la connexion a disparu', async () => {
    vi.mocked(write).mockResolvedValue(false);

    await expect(run(ID)).resolves.toEqual({ ok: false });
  });

  it("rend { ok: false } pour un identifiant qui n'est pas un UUID, sans rien écrire", async () => {
    await expect(run('pas-un-uuid')).resolves.toEqual({ ok: false });

    expect(write).not.toHaveBeenCalled();
  });

  it('rend { ok: false } plutôt que de lever quand la base échoue', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(write).mockRejectedValue(new Error('base indisponible'));

    await expect(run(ID)).resolves.toEqual({ ok: false });

    spy.mockRestore();
  });

  it('ne fait rien sans session valide', async () => {
    vi.mocked(requireUserContext).mockRejectedValue(new Error('NEXT_REDIRECT /connexion'));

    await expect(run(ID)).rejects.toThrow('NEXT_REDIRECT /connexion');

    expect(write).not.toHaveBeenCalled();
  });
});
