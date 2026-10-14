import { copyFile, mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PATHS } from '../capture/api-contract';
import { SECRET_MASK } from '../capture/mask-secrets';
import { IngestResultSchema } from '../capture/turn';
import { createApiToken } from '../server/auth/api-tokens';
import { turns } from '../server/db/schema/memory';
import { withTenant } from '../server/db/with-tenant';
import { enqueuePipelineStep } from '../server/pipeline/queue';
import { apiRequest } from '../test/api-request';
import { createTestTenant } from '../test/fixtures';
import { importClaudeCode } from './import-claude-code';

vi.mock('../server/pipeline/queue');

const FIXTURES = new URL('../capture/fixtures/claude-code/', import.meta.url);
let baseDir: string;

beforeEach(async () => {
  vi.mocked(enqueuePipelineStep).mockReset();
  baseDir = await mkdtemp(join(tmpdir(), 'leon-cc-db-'));
  await mkdir(join(baseDir, 'projects', 'demo'), { recursive: true });
  for (const name of await readdir(FIXTURES)) {
    await copyFile(new URL(name, FIXTURES), join(baseDir, 'projects', 'demo', name));
  }
});
afterEach(() => rm(baseDir, { recursive: true, force: true }));

describe('importClaudeCode contre l’API', () => {
  it('range les tours masqués en base, et un second import complet n’insère rien', async () => {
    const { members } = await createTestTenant(['Paul']);
    const [paul] = members;
    if (!paul) throw new Error('membre de test manquant');
    const { token } = await createApiToken(paul, 'test');
    const deps = {
      out: () => {},
      send: async (payload: unknown) => {
        const response = await apiRequest(API_PATHS.ingest, { token, body: payload });
        expect(response.status).toBe(202);
        return IngestResultSchema.parse(await response.json());
      },
    };

    const first = await importClaudeCode({ baseDir, dryRun: false }, deps);
    const second = await importClaudeCode({ baseDir, dryRun: false }, deps);

    expect(first).toMatchObject({
      sessions: 3,
      turnsSent: 12,
      inserted: 12,
      skipped: 0,
      failures: 0,
    });
    expect(second).toMatchObject({
      sessions: 3,
      turnsSent: 12,
      inserted: 0,
      skipped: 12,
      failures: 0,
    });
    const stored = await withTenant(paul, (tx) =>
      tx.select({ text: turns.text }).from(turns).where(eq(turns.tenantId, paul.tenantId)),
    );
    expect(stored).toHaveLength(12);
    expect(stored.map((t) => t.text)).toContain(`Voici la clé de test : ${SECRET_MASK}`);
    expect(stored.some((t) => t.text.includes('sk-ant'))).toBe(false);
  });
});
