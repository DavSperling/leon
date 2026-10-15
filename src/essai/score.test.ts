import { describe, expect, it } from 'vitest';
import type { FaitProduit } from './collect';
import type { ConversationEssai } from './dataset';
import { calculerNotes, faitsDeConversation } from './score';

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
  supersededBy: null,
  ...overrides,
});

describe('calculerNotes', () => {
  const produits = [
    p('a', {}), // F001, bon tour, fiche par alias
    p('b', { turnExternalId: 't-003', status: 'superseded', supersededBy: 'c' }), // F002 remplacé par F003 (c)
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

  it('tour, fiche, type et fiches dispersées', () => {
    expect(notes.tourCorrect).toEqual({ ok: 4, sur: 4 });
    expect(notes.ficheCorrecte).toEqual({ ok: 3, sur: 4 });
    expect(notes.typeCorrect).toEqual({ ok: 4, sur: 4 });
    expect(notes.fichesDispersees).toBe(1);
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

describe('remplacements (chaîne de supersededBy)', () => {
  const chaine = {
    ...conv,
    attendu: {
      ...conv.attendu,
      faits: conv.attendu.faits.slice(0, 1),
      remplace: [
        { ancien: 'F001', nouveau: 'F002' },
        { ancien: 'F002', nouveau: 'F003' },
      ],
    },
  } as unknown as ConversationEssai;

  it('une chaîne F1→F2→F3 compte les deux remplacements', () => {
    const produits = [
      p('p1', { status: 'superseded', supersededBy: 'p2' }),
      p('p2', { status: 'superseded', supersededBy: 'p3' }),
      p('p3', { status: 'active' }),
    ];
    const paires = new Map([
      ['p1', 'F001'],
      ['p2', 'F002'],
      ['p3', 'F003'],
    ]);
    const notes = calculerNotes({ conversations: [chaine], produits, paires, secrets: [] });
    expect(notes.remplacements).toEqual({ trouves: 2, attendus: 2 });
  });

  it('une supersession qui vise un autre fait ne compte pas', () => {
    const produits = [
      p('p1', { status: 'superseded', supersededBy: 'ailleurs' }), // ne pointe vers aucun fait apparié à F002
      p('p2', { status: 'active' }),
      p('p3', { status: 'active' }),
    ];
    const paires = new Map([
      ['p1', 'F001'],
      ['p2', 'F002'],
      ['p3', 'F003'],
    ]);
    const notes = calculerNotes({ conversations: [chaine], produits, paires, secrets: [] });
    expect(notes.remplacements.trouves).toBe(0);
  });

  it('un second exemplaire de l ancien resté actif empêche de compter le remplacement', () => {
    const produits = [
      p('p1', { status: 'superseded', supersededBy: 'p2' }),
      p('p1b', { status: 'active' }), // doublon de F001, jamais remplacé
      p('p2', { status: 'active' }),
      p('p3', { status: 'active' }),
    ];
    const paires = new Map([
      ['p1', 'F001'],
      ['p1b', 'F001'],
      ['p2', 'F002'],
      ['p3', 'F003'],
    ]);
    const notes = calculerNotes({ conversations: [chaine], produits, paires, secrets: [] });
    expect(notes.remplacements.trouves).toBe(0);
  });
});

describe('conflits : des deux côtés seulement', () => {
  const avecConflit = {
    ...conv,
    attendu: { ...conv.attendu, remplace: [], conflits: [{ a: 'F001', b: 'F002' }] },
  } as unknown as ConversationEssai;

  it('un seul côté en conflit ne compte pas', () => {
    const produits = [p('p1', { status: 'conflict' }), p('p2', { status: 'active' })];
    const paires = new Map([
      ['p1', 'F001'],
      ['p2', 'F002'],
    ]);
    const notes = calculerNotes({ conversations: [avecConflit], produits, paires, secrets: [] });
    expect(notes.conflits).toEqual({ trouves: 0, attendus: 1 });
  });

  it('les deux côtés en conflit comptent', () => {
    const produits = [p('p1', { status: 'conflict' }), p('p2', { status: 'conflict' })];
    const paires = new Map([
      ['p1', 'F001'],
      ['p2', 'F002'],
    ]);
    const notes = calculerNotes({ conversations: [avecConflit], produits, paires, secrets: [] });
    expect(notes.conflits).toEqual({ trouves: 1, attendus: 1 });
  });
});

describe('sensibles : fuites et sur-signalés', () => {
  it('un F sensible dont le fait produit est partagé est une fuite', () => {
    const produits = [
      p('p4', { turnExternalId: 't-007', sensitivity: 'sensitive', partage: true }),
    ];
    const paires = new Map([['p4', 'F004']]);
    const notes = calculerNotes({ conversations: [conv], produits, paires, secrets: [] });
    expect(notes.fuitesSensibles).toBe(1);
  });

  it('un F non sensible marqué sensible par Leon est un sur-signalement', () => {
    const produits = [p('p1', { sensitivity: 'sensitive' })];
    const paires = new Map([['p1', 'F001']]);
    const notes = calculerNotes({ conversations: [conv], produits, paires, secrets: [] });
    expect(notes.surSignales).toBe(1);
  });
});

describe('fichesDispersees : les faits en attente de revue ne comptent pas', () => {
  it('une seconde fiche en attente de revue n est pas une dispersion', () => {
    const produits = [
      p('p1', { ficheId: 'card-1' }),
      p('p2', { ficheId: 'card-2', status: 'pending_review' }),
    ];
    const paires = new Map([
      ['p1', 'F001'],
      ['p2', 'F001'],
    ]);
    const notes = calculerNotes({ conversations: [conv], produits, paires, secrets: [] });
    expect(notes.fichesDispersees).toBe(0);
  });
});

describe('faits hors du jeu d essai', () => {
  it('un fait d une autre source est exclu de la précision et compté dans horsJeu', () => {
    const produits = [p('p1', {}), p('etranger', { sourceExternalId: 'essai-autre/2026-01-01-x' })];
    const paires = new Map([
      ['p1', 'F001'],
      ['etranger', null],
    ]);
    const notes = calculerNotes({ conversations: [conv], produits, paires, secrets: [] });
    expect(notes.horsJeu).toBe(1);
    expect(notes.produits).toBe(1);
    expect(notes.precision).toBeCloseTo(1);
  });
});

describe('faitsDeConversation', () => {
  it('ne garde que les faits dont la source correspond à la conversation', () => {
    const produits = [p('p1', {}), p('etranger', { sourceExternalId: 'essai-autre/2026-01-01-x' })];
    expect(faitsDeConversation(conv, produits).map((f) => f.id)).toEqual(['p1']);
  });
});

describe('secretsFuites vérifie aussi le titre de fiche', () => {
  it('un secret recopié dans le titre de la fiche est une fuite', () => {
    const produits = [p('p1', { ficheTitre: 'clé sk-essai-XXXXXXXXXXXXXXXXXXXXXXXX' })];
    const paires = new Map([['p1', null]]);
    const notes = calculerNotes({
      conversations: [conv],
      produits,
      paires,
      secrets: ['sk-essai-XXXXXXXXXXXXXXXXXXXXXXXX'],
    });
    expect(notes.secretsFuites).toBe(1);
  });
});

describe('redits (doublonDe)', () => {
  const premiere = {
    cle: 'karim/2026-09-22-devis',
    personnage: 'karim',
    payload: {
      source: { kind: 'chatgpt', external_id: 'essai-karim/2026-09-22-devis' },
      turns: [],
    },
    attendu: {
      faits: [
        {
          id: 'F001',
          enonce: 'Dupont paie à 45 jours.',
          fiche: 'Dupont',
          alias: [],
          typeFiche: 'client',
          tour: 't-001',
          extrait: '',
          sensible: false,
        },
      ],
      pasRetenir: [],
      remplace: [],
      conflits: [],
    },
  } as unknown as ConversationEssai;
  const seconde = {
    cle: 'karim/2026-09-25-rappel',
    personnage: 'karim',
    payload: {
      source: { kind: 'chatgpt', external_id: 'essai-karim/2026-09-25-rappel' },
      turns: [],
    },
    attendu: {
      faits: [
        {
          id: 'F010',
          enonce: 'Dupont paie à 45 jours.',
          fiche: 'Dupont',
          alias: [],
          typeFiche: 'client',
          tour: 't-001',
          extrait: '',
          sensible: false,
          doublonDe: 'F001',
        },
      ],
      pasRetenir: [],
      remplace: [],
      conflits: [],
    },
  } as unknown as ConversationEssai;

  it('le canonique retrouvé suffit : le redit n est jamais manquant ni ne baisse le rappel', () => {
    const produits = [p('p1', { sourceExternalId: 'essai-karim/2026-09-22-devis' })];
    const paires = new Map([['p1', 'F001']]);
    const notes = calculerNotes({
      conversations: [premiere, seconde],
      produits,
      paires,
      secrets: [],
    });
    expect(notes.attendus).toBe(1);
    expect(notes.rappel).toBe(1);
    expect(notes.redits).toBe(1);
    expect(notes.reditsRecrees).toBe(0);
    const secondeNotes = notes.parConversation.find((n) => n.cle === seconde.cle);
    expect(secondeNotes?.manques).toEqual([]);
  });

  it('un fait produit apparié directement au redit compte comme doublon recréé', () => {
    const produits = [
      p('p1', { sourceExternalId: 'essai-karim/2026-09-22-devis' }),
      p('p2', { sourceExternalId: 'essai-karim/2026-09-25-rappel' }),
    ];
    const paires = new Map([
      ['p1', 'F001'],
      ['p2', 'F010'],
    ]);
    const notes = calculerNotes({
      conversations: [premiere, seconde],
      produits,
      paires,
      secrets: [],
    });
    expect(notes.reditsRecrees).toBe(1);
    expect(notes.doublonsFaits).toBe(1); // deux faits produits pour le même F canonique
  });
});
