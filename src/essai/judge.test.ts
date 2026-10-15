import { describe, expect, it } from 'vitest';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { FaitProduit } from './collect';
import type { ConversationEssai } from './dataset';
import { juger, validerPaires } from './judge';

const produit = (
  id: string,
  statement: string,
  overrides: Partial<FaitProduit> = {},
): FaitProduit => ({
  id,
  statement,
  sourceExternalId: 's',
  turnExternalId: 't-001',
  value: null,
  quote: statement,
  status: 'active',
  sensitivity: 'shareable',
  partage: true,
  ficheId: 'c',
  ficheTitre: 'Fiche produite X',
  typeFiche: 'client',
  supersededBy: null,
  ...overrides,
});

const conv = {
  cle: 'karim/2026-09-22-devis',
  attendu: {
    faits: [
      {
        id: 'F001',
        enonce: 'Dupont paie à 45 jours.',
        fiche: 'Dupont',
        alias: [],
        typeFiche: 'client',
        tour: 't-001',
        extrait: '45 jours',
        sensible: false,
      },
    ],
    pasRetenir: [{ id: 'N001', enonce: 'Le RGPD.', tour: 't-002', pourquoi: 'question générale' }],
    remplace: [],
    conflits: [],
  },
} as unknown as ConversationEssai;

describe('validerPaires', () => {
  it('garde les paires connues, met null sur un identifiant inventé ou un produit oublié', () => {
    const paires = validerPaires(
      {
        paires: [
          { produit: 'P1', correspond: 'F001' },
          { produit: 'P2', correspond: 'F999' },
          { produit: 'P9', correspond: 'F001' },
        ],
      },
      ['P1', 'P2', 'P3'],
      ['F001', 'N001'],
    );
    expect(paires).toEqual(
      new Map([
        ['P1', 'F001'],
        ['P2', null],
        ['P3', null],
      ]),
    );
  });

  it('rejette un identifiant N d une autre conversation', () => {
    const paires = validerPaires(
      { paires: [{ produit: 'P1', correspond: 'N999' }] },
      ['P1'],
      ['F001', 'N001'], // N999 appartient à une autre conversation, absent de cette liste
    );
    expect(paires).toEqual(new Map([['P1', null]]));
  });
});

describe('juger', () => {
  it('envoie les deux listes au juge et renvoie les paires par identifiant de fait', async () => {
    const llm = createFakeLlm(() => ({
      paires: [
        { produit: 'P1', correspond: 'F001' },
        { produit: 'P2', correspond: 'N001' },
      ],
    }));
    const result = await juger(llm, conv, [
      produit('fact-a', 'Dupont règle à 45 jours.'),
      produit('fact-b', 'Le RGPD protège les données.'),
    ]);
    expect(result).toEqual(
      new Map([
        ['fact-a', 'F001'],
        ['fact-b', 'N001'],
      ]),
    );
    expect(llm.calls[0]?.step).toBe('juge');
    expect(llm.calls[0]?.prompt).toContain('F001');
    expect(llm.calls[0]?.prompt).toContain('Dupont règle à 45 jours.');
    // Le tour départage les versions ; le titre de la fiche produite ne doit jamais paraître (seul celui attendu compte).
    expect(llm.calls[0]?.prompt).toContain('t-001');
    expect(llm.calls[0]?.prompt).not.toContain('Fiche produite X');
  });

  it('n appelle pas le juge sans fait produit', async () => {
    const llm = createFakeLlm(() => ({ paires: [] }));
    expect(await juger(llm, conv, [])).toEqual(new Map());
    expect(llm.calls).toHaveLength(0);
  });

  it('dimensionne maxTokens avec le nombre de faits produits du lot', async () => {
    const llm = createFakeLlm(() => ({ paires: [] }));
    await juger(llm, conv, [produit('fact-a', 'x'), produit('fact-b', 'y')]);
    expect(llm.calls[0]?.maxTokens).toBe(1_000 + 40 * 2);
  });

  it('juge par lots de 80 au-delà, en fusionnant les paires de chaque lot', async () => {
    const llm = createFakeLlm((request) => {
      const prompt = request.prompt as string;
      const ids = [...prompt.matchAll(/"id":\s*"(P\d+)"/g)].map((m) => m[1]);
      return { paires: ids.map((produit) => ({ produit, correspond: null })) };
    });
    const produits = Array.from({ length: 170 }, (_, i) => produit(`fact-${i}`, `énoncé ${i}`));
    const result = await juger(llm, conv, produits);
    expect(llm.calls).toHaveLength(3);
    expect(result.size).toBe(170);
    expect(produits.every((p) => result.has(p.id))).toBe(true);
  });
});
