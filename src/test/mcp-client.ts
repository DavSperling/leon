import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { API_PATHS } from '@/capture/api-contract';
import { app } from '@/server/api/app';
import { createApiToken } from '@/server/auth/api-tokens';
import type { TenantContext } from '@/server/auth/tenant-context';

// Client MCP de test : parle à l'app Hono en mémoire, sous les droits de `ctx`, comme claude-code.
const clients: Client[] = [];

// À appeler dans un afterEach du fichier de test.
export async function closeClients(): Promise<void> {
  await Promise.all(clients.splice(0).map((client) => client.close()));
}

export async function connect(ctx: TenantContext): Promise<Client> {
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

// `text` réunit les blocs de texte du résultat.
export async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content.map((block) => block.text ?? '').join('\n');
  return { ...result, text };
}
