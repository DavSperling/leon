import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '@/capture/api-contract';
import { app } from '@/server/api/app';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';
import { sources } from '@/server/db/schema/memory';
import * as ingestModule from '@/server/ingest/ingest-turns';
import { enqueuePipelineStep } from '@/server/pipeline/queue';
import { apiRequest } from '@/test/api-request';
import { adminDb } from '@/test/db';
import { createTestTenant } from '@/test/fixtures';

vi.mock('@/server/pipeline/queue');

beforeEach(() => vi.mocked(enqueuePipelineStep).mockReset());
afterEach(() => vi.restoreAllMocks());

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

async function connect(ctx: TenantContext): Promise<Client> {
  const { token } = await createApiToken(ctx, 'test');
  const transport = new StreamableHTTPClientTransport(
    new URL(`http://localhost:3000${API_PATHS.mcp}`),
    {
      fetch: async (url, init) => app.request(url.toString(), init),
      requestInit: {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'claude-code/2.1.296' },
      },
    },
  );
  const client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}

type ToolResult = {
  isError?: boolean;
  content: Array<{ type: string; text?: string }>;
  structuredContent?: Record<string, unknown>;
};

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content.map((block) => block.text ?? '').join('\n');
  return { ...result, text };
}

async function setupPaul(): Promise<TenantContext> {
  const { members } = await createTestTenant(['Paul']);
  const [paul] = members;
  if (!paul) throw new Error('membre de test manquant');
  return paul;
}

// `search` et `fetch` reviennent sur les passages en T07, `briefing` en T13 : en attendant, `remember` seul.
describe('serveur MCP', () => {
  it('répond 401 sans jeton', async () => {
    const response = await apiRequest(API_PATHS.mcp, { method: 'POST', body: {} });
    expect(response.status).toBe(401);
    expect(response.headers.get('WWW-Authenticate')).toBe('Bearer');
  });

  it('annonce exactement remember, avec ses annotations', async () => {
    const client = await connect(await setupPaul());

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name)).toEqual(['remember']);
    expect(tools[0]?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    });
    expect(client.getInstructions()).toContain('remember');
  });

  it("remember : dépose une source mcp_remember privée à l'auteur et met l'indexation en file", async () => {
    const paul = await setupPaul();

    const result = await call(await connect(paul), 'remember', {
      text: 'Le délai de livraison passe à trois semaines.',
      about: 'ACME',
    });

    const { sourceId, ingestRunId } = result.structuredContent as {
      sourceId: string;
      ingestRunId: string;
    };
    expect(result.text).toBe(`Noté : Leon va indexer cette information (source ${sourceId}).`);
    const [source] = await adminDb.select().from(sources).where(eq(sources.id, sourceId));
    expect(source).toMatchObject({
      kind: 'mcp_remember',
      acl: [paul.userId],
      ownerUserId: paul.userId,
    });
    expect(enqueuePipelineStep).toHaveBeenCalledWith('index', {
      ingestRunId,
      tenantId: paul.tenantId,
      userId: paul.userId,
    });
  });

  it("une erreur inattendue d'un outil devient « Erreur interne de Leon. » sans son message", async () => {
    const client = await connect(await setupPaul());
    vi.spyOn(ingestModule, 'ingestTurns').mockRejectedValue(new Error('zanzibar'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await call(client, 'remember', { text: 'Une note.' });

    expect(result.isError).toBe(true);
    expect(result.text).toBe('Erreur interne de Leon.');
    expect(JSON.stringify(result)).not.toContain('zanzibar');
  });
});
