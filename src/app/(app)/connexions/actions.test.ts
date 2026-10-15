import { revalidatePath } from 'next/cache';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { requireUserContext } from '@/server/auth/session';
import type { CatalogItem } from '@/server/connectors/catalog';
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
import { ConnectorAuthError, ConnectorHttpError } from '@/server/connectors/http';
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

  it('dit que l’outil ne répond pas pour toute autre panne, sans journaliser la clé', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    verify.mockRejectedValue(new ConnectorHttpError(503, 'Linear a répondu 503'));

    await expect(connect()).resolves.toEqual({
      error: 'Linear ne répond pas, réessayez dans un moment.',
    });

    expect(createConnection).not.toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain(KEY);
    spy.mockRestore();
  });

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

describe('replaceKeyAction', () => {
  const stored = {
    id: ID,
    provider: 'linear',
    config: { teams: ['ENG'] },
    createdBy: { id: 'user', name: 'Amos' },
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

  it('garde l’ancienne clé quand l’outil refuse la nouvelle', async () => {
    verify.mockRejectedValue(new ConnectorAuthError('Linear', 401));

    await expect(replace()).resolves.toEqual({ error: 'Clé refusée par Linear.' });

    expect(replaceConnectionSecret).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

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
