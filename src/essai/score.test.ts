import { describe, expect, it } from 'vitest';
import type { FaitProduit } from './collect';
import type { ConversationEssai } from './dataset';
import { calculerNotes } from './score';

const TENANT_SOURCE = 'essai-karim/2026-09-22-devis';

const conv = {
  cle: 'karim/2026-09-22-devis',
  personnage: 'karim',
  payload: { source: { kind: 'chatgpt', external_id: TENANT_SOURCE }, turns: [] },
  attendu: {
    faits: [
      {
        id: 'F001',
        enonce: 'Dupont paie à 45 jours.',
        fiche: 'Menuiserie Dupont',
        alias: ['Dupont'],
        typeFiche: 'client',
        tour: 't-001',
        extrait: '',
        sensible: false,
      },
      {
        id: 'F002',
        enonce: 'Le devis Dupont est à 12 000 €.',
        fiche: 'Menuiserie Dupont',
        alias: ['Dupont'],
        typeFiche: 'client',
        tour: 't-003',
        extrait: '',
        sensible: false,
      },
      {
        id: 'F003',
        enonce: 'Le devis Dupont passe à 11 000 €.',
        fiche: 'Menuiserie Dupont',
        alias: [],
        typeFiche: 'client',
        tour: 't-005',
        extrait: '',
        sensible: false,
      },
      {
        id: 'F004',
        enonce: 'Le salaire de Hugo est de 52 000 €.',
        fiche: 'Hugo Martin',
        alias: [],
        typeFiche: 'personne',
        tour: 't-007',
        extrait: '',
        sensible: true,
      },
    ],
    pasRetenir: [{ id: 'N001', enonce: 'Le RGPD.', tour: 't-002', pourquoi: 'question générale' }],
    remplace: [{ ancien: 'F002', nouveau: 'F003' }],
    conflits: [],
  },
} as unknown as ConversationEssai;

const p = (id: string, overrides: Partial<FaitProduit>): FaitProduit => ({
  id,
  sourceExternalId: TENANT_SOURCE,
  turnExternalId: 't-001',
  statement: id,
  value: null,
  quote: id,
  status: 'active',
  sensitivity: 'shareable',
  partage: true,
  ficheId: 'card-dupont',
  ficheTitre: 'Dupont',
  typeFiche: 'client',
  ...overrides,
});

describe('calculerNotes', () => {
  const produits = [
    p('a', {}), // F001, bon tour, fiche par alias
    p('b', { turnExternalId: 't-003', status: 'superseded' }), // F002 remplacé
    p('c', {
      turnExternalId: 't-005',
      ficheId: 'card-dupont-2',
      ficheTitre: 'Menuiserie Dupont SARL',
    }), // F003, fiche en double
    p('d', { turnExternalId: 't-002' }), // N001 : faux fait
    p('e', { turnExternalId: 't-001' }), // F001 en double
    p('f', { statement: 'clé sk-essai-XXXXXXXXXXXXXXXXXXXXXXXX', turnExternalId: 't-009' }), // en trop, fuite
  ];
  const paires = new Map<string, string | null>([
    ['a', 'F001'],
    ['b', 'F002'],
    ['c', 'F003'],
    ['d', 'N001'],
    ['e', 'F001'],
    ['f', null],
  ]);
  const notes = calculerNotes({
    conversations: [conv],
    produits,
    paires,
    secrets: ['sk-essai-XXXXXXXXXXXXXXXXXXXXXXXX'],
  });

  it('rappel, précision, faux faits et doublons de faits', () => {
    expect(notes).toMatchObject({
      attendus: 4,
      retrouves: 3,
      produits: 6,
      apparies: 4,
      fauxFaits: 1,
      doublonsFaits: 1,
    });
    expect(notes.rappel).toBeCloseTo(0.75);
    expect(notes.precision).toBeCloseTo(4 / 6);
  });

  it('tour, fiche, type et fiches en double', () => {
    expect(notes.tourCorrect).toEqual({ ok: 4, sur: 4 });
    expect(notes.ficheCorrecte).toEqual({ ok: 3, sur: 4 });
    expect(notes.typeCorrect).toEqual({ ok: 4, sur: 4 });
    expect(notes.doublonsFiches).toBe(1);
  });

  it('remplacements, sensibles et secrets', () => {
    expect(notes.remplacements).toEqual({ trouves: 1, attendus: 1 });
    expect(notes.sensibles).toEqual({ marques: 0, attendus: 1, retrouves: 0 });
    expect(notes.secretsFuites).toBe(1);
  });

  it('détail par conversation : manques et faits en trop', () => {
    expect(notes.parConversation).toEqual([
      expect.objectContaining({
        cle: 'karim/2026-09-22-devis',
        manques: ['F004'],
        enTrop: ['f'],
        fauxFaits: ['d'],
      }),
    ]);
  });
});
