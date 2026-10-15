import { describe, expect, it } from 'vitest';
import { createFakeLlm } from '@/server/llm/fake-llm';
import type { FaitProduit } from './collect';
import type { ConversationEssai } from './dataset';
import { juger, validerPaires } from './judge';

const produit = (id: string, statement: string): FaitProduit => ({
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
  ficheTitre: 'Dupont',
  typeFiche: 'client',
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
  });

  it('n appelle pas le juge sans fait produit', async () => {
    const llm = createFakeLlm(() => ({ paires: [] }));
    expect(await juger(llm, conv, [])).toEqual(new Map());
    expect(llm.calls).toHaveLength(0);
  });
});
