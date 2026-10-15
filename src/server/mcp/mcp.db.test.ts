import { and, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import { readLog, sources } from '@/server/db/schema/memory';
import { cardUrl } from '@/server/memory/card-url';
import { CARD_MAX_CHARS, DATA_GUARD_LINE } from '@/server/memory/render-card';
import * as searchModule from '@/server/memory/search';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { call, closeClients, connect } from '@/test/mcp-client';
import { seedRightsScenario } from '@/test/rights-scenario';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());
afterEach(() => vi.restoreAllMocks());

afterEach(closeClients);

const resultIds = (structured: Record<string, unknown> | undefined) =>
  ((structured?.results ?? []) as Array<{ id: string }>).map((r) => r.id);

describe('serveur MCP', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.mcp, { method: 'POST', body: {} });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('annonce exactement les outils de la mémoire et des tâches, avec leurs annotations', async () => {
    const { paul } = await seedRightsScenario();
    const client = await connect(paul);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'briefing',
      'fetch',
      'remember',
      'search',
      'task_comment',
      'task_create',
      'task_get',
      'task_list',
      'task_start',
      'task_update',
    ]);
    const annotations = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
    for (const name of ['search', 'fetch', 'briefing', 'task_list', 'task_get']) {
      expect(annotations[name]).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
    for (const name of ['remember', 'task_create', 'task_comment', 'task_start']) {
      expect(annotations[name]).toMatchObject({
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: false,
      });
    }
    // task_update remplace la description sans la garder : il se déclare destructeur.
    expect(annotations.task_update).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(client.getInstructions()).toContain('appelle search puis fetch');
    expect(client.getInstructions()).toContain('task_list et task_get');
    expect(client.getInstructions()).toContain('task_start');
  });

  it('search : « zanzibar » trouve une fiche pour Paul et aucune pour Marie', async () => {
    const { paul, marie, ids } = await seedRightsScenario();

    const forPaul = await call(await connect(paul), 'search', { query: 'zanzibar' });
    const forMarie = await call(await connect(marie), 'search', { query: 'zanzibar' });

    expect(resultIds(forPaul.structuredContent)).toEqual([ids.acmeCard]);
    expect(forPaul.text).toContain(DATA_GUARD_LINE);
    expect(forPaul.text).toContain(`id ${ids.acmeCard}`);
    expect(resultIds(forMarie.structuredContent)).toEqual([]);
    expect(forMarie.text).toBe('Aucune fiche ne correspond à « zanzibar ».');
  });

  it('search : « Orion » est invisible pour Marie', async () => {
    const { paul, marie, ids } = await seedRightsScenario();

    const forPaul = await call(await connect(paul), 'search', { query: 'Orion' });
    const forMarie = await call(await connect(marie), 'search', { query: 'Orion' });

    expect(resultIds(forPaul.structuredContent)).toEqual([ids.orionCard]);
    expect(forMarie.structuredContent).toEqual({ results: [] });
    expect(forMarie.text).toBe('Aucune fiche ne correspond à « Orion ».');
  });

  it('search : le filtre since est une date (minuit UTC)', async () => {
    const { paul, ids } = await seedRightsScenario();
    const client = await connect(paul);

    const recent = await call(client, 'search', { query: 'ACME', since: '2000-01-01' });
    const future = await call(client, 'search', { query: 'ACME', since: '2999-01-01' });

    expect(resultIds(recent.structuredContent)).toContain(ids.acmeCard);
    expect(resultIds(future.structuredContent)).toEqual([]);
  });

  it('fetch : Marie ne peut pas lire Orion', async () => {
    const { marie, ids } = await seedRightsScenario();

    const result = await call(await connect(marie), 'fetch', { id: ids.orionCard });

    expect(result.isError).toBe(true);
    expect(result.text).toBe('Fiche introuvable ou non visible.');
  });

  it("fetch : ACME pour Marie, sans « zanzibar », avec l'url et une ligne de lecture", async () => {
    const { marie, ids } = await seedRightsScenario();

    const result = await call(await connect(marie), 'fetch', { id: ids.acmeCard });

    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('ACME');
    expect(result.text).toContain(DATA_GUARD_LINE);
    expect(result.text).not.toContain('zanzibar');
    expect(result.text.length).toBeLessThanOrEqual(CARD_MAX_CHARS);
    expect(result.structuredContent).toMatchObject({
      id: ids.acmeCard,
      title: 'ACME',
      url: cardUrl(ids.acmeCard),
      metadata: { type: 'client', status: 'confirmed' },
    });
    const reads = await adminDb
      .select({ client: readLog.client })
      .from(readLog)
      .where(and(eq(readLog.cardId, ids.acmeCard), eq(readLog.userId, marie.userId)));
    expect(reads.map((read) => read.client)).toContain('claude-code');
  });

  it('fetch : un as_of antérieur ne montre aucun fait', async () => {
    const { paul, ids } = await seedRightsScenario();

    const result = await call(await connect(paul), 'fetch', {
      id: ids.acmeCard,
      as_of: '2000-01-01',
    });

    expect(result.text).not.toMatch(/^- /m);
    expect(result.text).toContain('état au 2000-01-01');
  });

  it('briefing : Marie ne voit pas Orion, la ligne de garde est présente', async () => {
    const { marie, ids } = await seedRightsScenario();

    const result = await call(await connect(marie), 'briefing');

    expect(result.text).toContain(DATA_GUARD_LINE);
    expect(result.text).toContain('ACME (Client)');
    expect(result.text).not.toContain('Orion');
    expect(result.structuredContent).toMatchObject({ reviewCount: 1 });
    const entries = result.structuredContent?.entries as Array<{ id: string }>;
    expect(entries.map((entry) => entry.id)).toEqual([ids.acmeCard]);
  });

  it("remember : dépose une source mcp_remember privée à l'auteur et met le triage en file", async () => {
    const { paul } = await seedRightsScenario();

    const result = await call(await connect(paul), 'remember', {
      text: 'Le délai de livraison passe à trois semaines.',
      about: 'ACME',
    });

    const { sourceId, ingestRunId } = result.structuredContent as {
      sourceId: string;
      ingestRunId: string;
    };
    expect(result.text).toBe(`Noté : Leon va trier cette information (source ${sourceId}).`);
    const [source] = await adminDb.select().from(sources).where(eq(sources.id, sourceId));
    expect(source).toMatchObject({
      kind: 'mcp_remember',
      acl: [paul.userId],
      ownerUserId: paul.userId,
    });
    expect(enqueuePipelineStep).toHaveBeenCalledWith('triage', {
      ingestRunId,
      tenantId: paul.tenantId,
      userId: paul.userId,
    });
  });

  it("une erreur inattendue d'un outil devient « Erreur interne de Leon. » sans son message", async () => {
    const { paul } = await seedRightsScenario();
    const client = await connect(paul);
    vi.spyOn(searchModule, 'searchMemory').mockRejectedValue(new Error('zanzibar'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await call(client, 'search', { query: 'ACME' });

    expect(result.isError).toBe(true);
    expect(result.text).toBe('Erreur interne de Leon.');
    expect(JSON.stringify(result)).not.toContain('zanzibar');
  });
});
