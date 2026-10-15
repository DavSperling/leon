import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as { LEON_CONNECTORS_KEY?: string; ANTHROPIC_API_KEY?: string },
  order: [] as string[],
}));

vi.mock('@/server/env', () => ({ env: mocks.env }));
vi.mock('@/server/connectors/worker', () => ({
  startConnectorWorker: vi.fn(async () => {
    mocks.order.push('connecteurs');
  }),
}));
vi.mock('@/server/pipeline/worker', () => ({
  startPipelineWorker: vi.fn(async () => {
    mocks.order.push('pipeline');
  }),
}));
vi.mock('@/server/llm/anthropic-llm', () => ({ createAnthropicLlm: vi.fn(() => ({})) }));

const { startNodeInstrumentation } = await import('./instrumentation-node');
const { startConnectorWorker } = await import('@/server/connectors/worker');

const NO_KEY = 'LEON_CONNECTORS_KEY absente';

beforeEach(() => {
  mocks.order.length = 0;
  delete mocks.env.LEON_CONNECTORS_KEY;
  delete mocks.env.ANTHROPIC_API_KEY;
  vi.mocked(startConnectorWorker).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('démarrage des tâches de fond', () => {
  it('lance la relève des connecteurs même sans clé Anthropic', async () => {
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';

    await startNodeInstrumentation();

    expect(mocks.order).toEqual(['connecteurs']);
  });

  it('lance la relève avant le pipeline quand les deux clés sont là', async () => {
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';
    mocks.env.ANTHROPIC_API_KEY = 'cle-anthropic-de-test';

    await startNodeInstrumentation();

    expect(mocks.order).toEqual(['connecteurs', 'pipeline']);
  });

  it('prévient sans lancer la relève quand LEON_CONNECTORS_KEY manque', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.env.ANTHROPIC_API_KEY = 'cle-anthropic-de-test';

    await startNodeInstrumentation();

    expect(startConnectorWorker).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(NO_KEY));
    expect(mocks.order).toEqual(['pipeline']);
  });

  it('ne lance rien pendant `next build`', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';
    mocks.env.ANTHROPIC_API_KEY = 'cle-anthropic-de-test';

    await startNodeInstrumentation();

    expect(mocks.order).toEqual([]);
  });
});
