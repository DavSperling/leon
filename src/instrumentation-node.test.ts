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
vi.mock('@/server/connectors/oauth-env', () => ({ warnIncompleteOAuthPairs: vi.fn() }));

const { startNodeInstrumentation } = await import('./instrumentation-node');
const { startConnectorWorker } = await import('@/server/connectors/worker');
const { warnIncompleteOAuthPairs } = await import('@/server/connectors/oauth-env');

const NO_KEY = 'LEON_CONNECTORS_KEY absente';

beforeEach(() => {
  mocks.order.length = 0;
  delete mocks.env.LEON_CONNECTORS_KEY;
  delete mocks.env.ANTHROPIC_API_KEY;
  vi.mocked(startConnectorWorker).mockClear();
  vi.mocked(warnIncompleteOAuthPairs).mockClear();
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

  // Le tri par modèle n'existe plus : la clé Anthropic ne démarre rien et son absence ne dit rien.
  it('ne lance que la relève des connecteurs quand la clé Anthropic est là', async () => {
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';
    mocks.env.ANTHROPIC_API_KEY = 'cle-anthropic-de-test';

    await startNodeInstrumentation();

    expect(mocks.order).toEqual(['connecteurs']);
  });

  it("ne prévient pas de l'absence de clé Anthropic", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';

    await startNodeInstrumentation();

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('ANTHROPIC_API_KEY'));
  });

  it('prévient sans lancer la relève quand LEON_CONNECTORS_KEY manque', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mocks.env.ANTHROPIC_API_KEY = 'cle-anthropic-de-test';

    await startNodeInstrumentation();

    expect(startConnectorWorker).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(NO_KEY));
    expect(mocks.order).toEqual([]);
  });

  it('signale les paires OAuth incomplètes au démarrage', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await startNodeInstrumentation();

    expect(warnIncompleteOAuthPairs).toHaveBeenCalledOnce();
  });

  it('ne lance rien pendant `next build`', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';
    mocks.env.ANTHROPIC_API_KEY = 'cle-anthropic-de-test';

    await startNodeInstrumentation();

    expect(mocks.order).toEqual([]);
    expect(warnIncompleteOAuthPairs).not.toHaveBeenCalled();
  });
});
