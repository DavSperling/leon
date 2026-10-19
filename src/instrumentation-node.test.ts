import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {} as {
    LEON_CONNECTORS_KEY?: string;
    ANTHROPIC_API_KEY?: string;
    LEON_EMBEDDINGS?: string;
    VOYAGE_API_KEY?: string;
  },
  order: [] as string[],
}));

vi.mock('@/server/env', () => ({ env: mocks.env }));
vi.mock('@/server/search/worker', () => ({
  startSearchWorker: vi.fn(async () => {
    mocks.order.push('recherche');
  }),
}));
vi.mock('@/server/connectors/worker', () => ({
  startConnectorWorker: vi.fn(async () => {
    mocks.order.push('connecteurs');
  }),
}));
vi.mock('@/server/connectors/oauth-env', () => ({ warnIncompleteOAuthPairs: vi.fn() }));

const { startNodeInstrumentation } = await import('./instrumentation-node');
const { startConnectorWorker } = await import('@/server/connectors/worker');
const { startSearchWorker } = await import('@/server/search/worker');
const { warnIncompleteOAuthPairs } = await import('@/server/connectors/oauth-env');

const NO_KEY = 'LEON_CONNECTORS_KEY absente';

beforeEach(() => {
  mocks.order.length = 0;
  delete mocks.env.LEON_CONNECTORS_KEY;
  delete mocks.env.ANTHROPIC_API_KEY;
  delete mocks.env.LEON_EMBEDDINGS;
  delete mocks.env.VOYAGE_API_KEY;
  // Le message « LEON_EMBEDDINGS absente » n'a rien à faire dans la sortie des tests qui ne le lisent pas.
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.mocked(startSearchWorker).mockClear();
  vi.mocked(startConnectorWorker).mockClear();
  vi.mocked(warnIncompleteOAuthPairs).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('démarrage des tâches de fond', () => {
  it('lance l’indexation puis la relève des connecteurs, même sans clé Anthropic', async () => {
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';

    await startNodeInstrumentation();

    // L'indexation d'abord : la relève met des jobs dans sa file dès son premier passage.
    expect(mocks.order).toEqual(['recherche', 'connecteurs']);
  });

  // Le tri par modèle n'existe plus : la clé Anthropic ne démarre rien et son absence ne dit rien.
  it('démarre la même chose, avec ou sans clé Anthropic', async () => {
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';
    const without = await (async () => {
      await startNodeInstrumentation();
      return [...mocks.order];
    })();
    mocks.order.length = 0;
    mocks.env.ANTHROPIC_API_KEY = 'cle-anthropic-de-test';

    await startNodeInstrumentation();

    expect(mocks.order).toEqual(without);
    expect(mocks.order).toEqual(['recherche', 'connecteurs']);
  });

  it('lance l’indexation sans clé des connecteurs ni clé Anthropic', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await startNodeInstrumentation();

    expect(mocks.order).toEqual(['recherche']);
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
    expect(mocks.order).toEqual(['recherche']);
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

// Le fournisseur de vecteurs se règle par LEON_EMBEDDINGS ; aucun n'est choisi par défaut.
describe('fournisseur de vecteurs', () => {
  it('démarre le worker de la recherche sans fournisseur quand LEON_EMBEDDINGS est absente, et le dit', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await startNodeInstrumentation();

    expect(startSearchWorker).toHaveBeenCalledExactlyOnceWith({ embedder: null });
    // Sans ce message, la recherche resterait en plein texte seul sans que personne le voie.
    expect(info).toHaveBeenCalledWith(expect.stringContaining('LEON_EMBEDDINGS'));
  });

  it('démarre le worker avec le fournisseur factice quand LEON_EMBEDDINGS=factice', async () => {
    mocks.env.LEON_EMBEDDINGS = 'factice';

    await startNodeInstrumentation();

    const [deps] = vi.mocked(startSearchWorker).mock.calls[0] ?? [];
    expect(deps?.embedder?.model).toBe('factice-1024');
  });

  // Voyage, Mistral et bge-m3 arrivent en T30 : d'ici là l'environnement est valide mais le fournisseur n'existe
  // pas. Un fournisseur nul après un simple avertissement laisserait la recherche en plein texte sans que
  // personne le voie : le démarrage échoue franchement, comme pour une variable d'environnement invalide, et
  // ne lance rien à moitié.
  it.each([
    ['voyage', { VOYAGE_API_KEY: 'cle-de-test' }],
    ['mistral', { MISTRAL_API_KEY: 'cle-de-test' }],
    ['bge-m3', { LEON_BGE_URL: 'http://bge-service:8080' }],
  ] as const)(
    'échoue franchement au démarrage avec LEON_EMBEDDINGS=%s tant que son adaptateur n’est pas livré',
    async (id, setting) => {
      Object.assign(mocks.env, {
        LEON_EMBEDDINGS: id,
        LEON_CONNECTORS_KEY: 'cle-de-test',
        ...setting,
      });

      await expect(startNodeInstrumentation()).rejects.toThrow(`LEON_EMBEDDINGS=${id}`);
      await expect(startNodeInstrumentation()).rejects.toThrow('fournisseur non livré');

      expect(startSearchWorker).not.toHaveBeenCalled();
      expect(startConnectorWorker).not.toHaveBeenCalled();
      expect(mocks.order).toEqual([]);
      for (const key of Object.keys(setting)) delete (mocks.env as Record<string, unknown>)[key];
    },
  );

  it('échoue franchement quand le worker de la recherche ne démarre pas, sans lancer la relève', async () => {
    mocks.env.LEON_CONNECTORS_KEY = 'cle-de-test';
    vi.mocked(startSearchWorker).mockRejectedValueOnce(new Error('pg-boss indisponible'));

    await expect(startNodeInstrumentation()).rejects.toThrow('pg-boss indisponible');

    expect(startConnectorWorker).not.toHaveBeenCalled();
  });

  it('ne lance pas le worker de la recherche pendant `next build`', async () => {
    vi.stubEnv('NEXT_PHASE', 'phase-production-build');
    mocks.env.LEON_EMBEDDINGS = 'voyage';

    await startNodeInstrumentation();

    expect(startSearchWorker).not.toHaveBeenCalled();
  });
});
