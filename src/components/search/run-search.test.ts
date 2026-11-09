import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@/server/auth/tenant-context';
import type { Embedder } from '@/server/embeddings/embedder';
import { getEmbedder } from '@/server/embeddings/registry';
import { searchPassages } from '@/server/search/search';
import type { SearchPage } from '@/server/search/types';
import { runSearch } from './run-search';

vi.mock('@/server/embeddings/registry', () => ({ getEmbedder: vi.fn() }));
vi.mock('@/server/search/search', () => ({ searchPassages: vi.fn() }));

const CTX: TenantContext = { tenantId: 't1', userId: 'u1', principals: ['u1', 't1'] };
const PAGE: SearchPage = { hits: [], totalSources: 0, mode: 'plein-texte', unknownPeople: [] };

let logged: string[];
beforeEach(() => {
  vi.clearAllMocks();
  logged = [];
  vi.spyOn(console, 'error').mockImplementation((...args) => {
    logged.push(args.map(String).join(' '));
  });
});
afterEach(() => vi.restoreAllMocks());

describe('runSearch', () => {
  it('cherche sous les droits de l’utilisateur, plus le privé des gens sous lui, avec le fournisseur de vecteurs réglé', async () => {
    const embedder: Embedder = { model: 'factice-1024', embed: vi.fn() };
    vi.mocked(getEmbedder).mockReturnValue(embedder);
    vi.mocked(searchPassages).mockResolvedValue(PAGE);

    expect(await runSearch(CTX, 'contrat', 2)).toBe(PAGE);

    expect(searchPassages).toHaveBeenCalledWith(
      { ...CTX, equipe: true },
      { query: 'contrat', page: 2, embedder },
    );
  });

  it('cherche aussi sans fournisseur de vecteurs', async () => {
    vi.mocked(getEmbedder).mockReturnValue(null);
    vi.mocked(searchPassages).mockResolvedValue(PAGE);

    expect(await runSearch(CTX, 'contrat', 1)).toBe(PAGE);

    expect(searchPassages).toHaveBeenCalledWith(
      { ...CTX, equipe: true },
      { query: 'contrat', page: 1, embedder: null },
    );
  });

  it('rend null quand la recherche échoue, et ne journalise ni la requête ni le vecteur', async () => {
    vi.mocked(getEmbedder).mockReturnValue(null);
    // Une erreur de la base, comme celles de `pg` : son message cite la requête et le vecteur.
    vi.mocked(searchPassages).mockRejectedValue(
      Object.assign(new Error('mot secret de la requête, vecteur [0.12,0.34]'), {
        code: '42703',
        severity: 'ERROR',
      }),
    );

    expect(await runSearch(CTX, 'mot secret de la requête', 1)).toBeNull();

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('search.page_failed');
    expect(logged[0]).not.toContain('secret');
    expect(logged[0]).not.toContain('0.12');
  });

  it('rend null quand le fournisseur réglé n’existe pas encore, sans faire planter la page', async () => {
    vi.mocked(getEmbedder).mockImplementation(() => {
      throw new Error('LEON_EMBEDDINGS=voyage : fournisseur non livré');
    });

    expect(await runSearch(CTX, 'contrat', 1)).toBeNull();

    expect(searchPassages).not.toHaveBeenCalled();
    expect(logged[0]).toContain('search.page_failed');
  });
});
