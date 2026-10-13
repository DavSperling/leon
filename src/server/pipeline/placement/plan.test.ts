import { describe, expect, it } from 'vitest';
import type { Catalog } from '@/server/memory/catalog';
import type { PlacementOutput } from '../prompts/placement';
import type { PlacementCandidate, PlacementContext } from './context';
import { planPlacement } from './plan';

type Decision = PlacementOutput['decisions'][number];

const CANDIDATE = 'cand-1';
const ACME = 'card-acme';
const ORION = 'card-orion';
const ACME_FACT = 'fact-acme-paiement';

const type = (slug: string, label: string, parentSlug: string | null = null) => ({
  id: `type-${slug}`,
  slug,
  label,
  parentSlug,
  status: parentSlug ? ('proposed' as const) : ('validated' as const),
  isBase: parentSlug === null,
});

const catalog: Catalog = {
  types: [
    type('client', 'Client'),
    type('projet', 'Projet'),
    type('chantier', 'Chantier', 'projet'),
  ],
  predicates: [
    { typeSlug: 'client', slug: 'paiement', label: 'Paiement', singleValued: true },
    { typeSlug: 'client', slug: 'note', label: 'Note', singleValued: false },
    { typeSlug: 'projet', slug: 'echeance', label: 'Échéance', singleValued: true },
    { typeSlug: 'projet', slug: 'note', label: 'Note', singleValued: false },
  ],
};

const ACME_OPTION = {
  id: ACME,
  title: 'ACME',
  typeSlug: 'client',
  status: 'confirmed' as const,
  aliases: ['acme.fr'],
  activeFacts: [
    {
      id: ACME_FACT,
      predicate: 'paiement',
      statement: 'ACME paie ses factures à quarante-cinq jours.',
      validFrom: '2026-09-01T00:00:00.000Z',
    },
  ],
};
const ORION_OPTION = {
  id: ORION,
  title: 'Orion',
  typeSlug: 'projet',
  status: 'confirmed' as const,
  aliases: [],
  activeFacts: [],
};

const candidate = (override: Partial<PlacementCandidate> = {}): PlacementCandidate => ({
  candidateId: CANDIDATE,
  statement: 'ACME paie ses factures à soixante jours.',
  predicate: 'paiement',
  typeHint: 'client',
  value: 'soixante jours',
  subject: { name: 'ACME', email: null, domain: null },
  quote: 'ACME paie ses factures à soixante jours.',
  validFrom: null,
  sensitive: false,
  fixedCardId: null,
  cardOptions: [ACME_OPTION, ORION_OPTION],
  ...override,
});

const decision = (override: Partial<Decision> = {}): Decision => ({
  candidateId: CANDIDATE,
  decision: 'existing',
  cardId: ACME,
  newCardTitle: null,
  typeSlug: null,
  proposedType: null,
  relation: 'new',
  relatedFactId: null,
  reason: 'Même client.',
  ...override,
});

const newCard = (override: Partial<Decision> = {}): Decision =>
  decision({
    decision: 'new',
    cardId: null,
    newCardTitle: 'ACME',
    typeSlug: 'client',
    ...override,
  });

function planOne(decisions: Decision[], override: Partial<PlacementCandidate> = {}) {
  const context: PlacementContext = { catalog, candidates: [candidate(override)] };
  const actions = planPlacement(context, { decisions });
  expect(actions).toHaveLength(1);
  return actions[0];
}

describe('planPlacement : décision et fiche', () => {
  it('rejette un candidat sans décision', () => {
    expect(planOne([])).toEqual({
      kind: 'reject',
      candidateId: CANDIDATE,
      reason: 'pas de décision',
    });
  });

  it('rejette une fiche existante hors des options', () => {
    expect(planOne([decision({ cardId: 'card-inventee' })])).toEqual({
      kind: 'reject',
      candidateId: CANDIDATE,
      reason: 'fiche inconnue',
    });
  });

  it('range sur une fiche existante des options', () => {
    expect(planOne([decision({ cardId: ORION })])).toMatchObject({
      kind: 'place',
      target: { kind: 'existing', cardId: ORION },
    });
  });

  it('impose la fiche de la clé dure quelle que soit la décision', () => {
    const fixed = { fixedCardId: ACME };

    expect(planOne([newCard({ newCardTitle: 'Autre' })], fixed)).toMatchObject({
      target: { kind: 'existing', cardId: ACME },
    });
    expect(planOne([decision({ cardId: ORION })], fixed)).toMatchObject({
      target: { kind: 'existing', cardId: ACME },
    });
    expect(planOne([decision({ decision: 'ambiguous', cardId: ORION })], fixed)).toMatchObject({
      target: { kind: 'existing', cardId: ACME },
    });
  });

  it('crée une fiche non confirmée liée à une option valide quand la décision est ambiguë', () => {
    expect(planOne([newCard({ decision: 'ambiguous', cardId: ACME })])).toMatchObject({
      kind: 'place',
      target: {
        kind: 'new',
        title: 'ACME',
        type: { kind: 'existing', slug: 'client' },
        unconfirmedMatchCardId: ACME,
      },
    });
  });

  it('crée une fiche simple quand la décision ambiguë cite une fiche inconnue', () => {
    expect(planOne([newCard({ decision: 'ambiguous', cardId: 'card-inventee' })])).toMatchObject({
      target: { kind: 'new', title: 'ACME', unconfirmedMatchCardId: null },
    });
  });

  it('rejette une décision ambiguë sans titre', () => {
    expect(planOne([newCard({ decision: 'ambiguous', cardId: ACME, newCardTitle: null })])).toEqual(
      { kind: 'reject', candidateId: CANDIDATE, reason: 'titre invalide' },
    );
  });

  it('ignore une décision dont le candidateId est inconnu', () => {
    const actions = planPlacement(
      { catalog, candidates: [candidate()] },
      { decisions: [decision({ candidateId: 'cand-inventé' }), decision()] },
    );

    expect(actions).toEqual([expect.objectContaining({ kind: 'place', candidateId: CANDIDATE })]);
  });
});

describe('planPlacement : nouvelle fiche', () => {
  it('nettoie le titre', () => {
    expect(planOne([newCard({ newCardTitle: '  ACME\n ' })])).toMatchObject({
      target: { kind: 'new', title: 'ACME', unconfirmedMatchCardId: null },
    });
  });

  it('rejette un titre vide ou de plus de 120 caractères', () => {
    const reject = { kind: 'reject', candidateId: CANDIDATE, reason: 'titre invalide' };

    expect(planOne([newCard({ newCardTitle: '   ' })])).toEqual(reject);
    expect(planOne([newCard({ newCardTitle: null })])).toEqual(reject);
    expect(planOne([newCard({ newCardTitle: 'A'.repeat(121) })])).toEqual(reject);
    expect(planOne([newCard({ newCardTitle: 'A'.repeat(120) })])).toMatchObject({ kind: 'place' });
  });

  it('rejette un type inconnu sans type proposé valide', () => {
    expect(planOne([newCard({ typeSlug: 'galaxie' })])).toEqual({
      kind: 'reject',
      candidateId: CANDIDATE,
      reason: 'type inconnu',
    });
  });

  it('accepte un type visible du catalogue, proposé compris', () => {
    expect(planOne([newCard({ typeSlug: 'chantier' })])).toMatchObject({
      target: { type: { kind: 'existing', slug: 'chantier' } },
    });
  });

  it('retient un type proposé valide', () => {
    const proposedType = { slug: 'salon', label: 'Salon', parentSlug: 'projet' };

    expect(planOne([newCard({ typeSlug: null, proposedType })])).toMatchObject({
      target: { type: { kind: 'proposed', slug: 'salon', label: 'Salon', parentSlug: 'projet' } },
    });
  });

  it.each([
    ['un slug mal formé', { slug: 'Salon Pro', label: 'Salon', parentSlug: 'projet' }],
    ['un slug déjà au catalogue', { slug: 'chantier', label: 'Chantier', parentSlug: 'projet' }],
    ['un parent hors du socle', { slug: 'salon', label: 'Salon', parentSlug: 'chantier' }],
    ['un parent inconnu', { slug: 'salon', label: 'Salon', parentSlug: 'galaxie' }],
    ['un libellé vide', { slug: 'salon', label: '  ', parentSlug: 'projet' }],
    [
      'un libellé de plus de 60 caractères',
      { slug: 'salon', label: 'S'.repeat(61), parentSlug: 'projet' },
    ],
  ])('rejette un type proposé avec %s', (_case, proposedType) => {
    expect(planOne([newCard({ typeSlug: null, proposedType })])).toEqual({
      kind: 'reject',
      candidateId: CANDIDATE,
      reason: 'type inconnu',
    });
  });

  it("se rabat sur le type du catalogue quand le type proposé n'est pas valide", () => {
    const proposedType = { slug: 'client', label: 'Client', parentSlug: 'projet' };

    expect(planOne([newCard({ typeSlug: 'client', proposedType })])).toMatchObject({
      target: { type: { kind: 'existing', slug: 'client' } },
    });
  });
});

describe('planPlacement : relation, prédicat, alias', () => {
  it('garde une relation vers un fait actif de la fiche choisie', () => {
    expect(planOne([decision({ relation: 'supersedes', relatedFactId: ACME_FACT })])).toMatchObject(
      { relation: { kind: 'supersedes', factId: ACME_FACT } },
    );
    expect(planOne([decision({ relation: 'duplicate', relatedFactId: ACME_FACT })])).toMatchObject({
      relation: { kind: 'duplicate', factId: ACME_FACT },
    });
  });

  it('ramène à new une relation vers un fait hors des faits actifs de la fiche', () => {
    expect(
      planOne([decision({ relation: 'contradicts', relatedFactId: 'fait-inventé' })]),
    ).toMatchObject({ relation: { kind: 'new' } });
    expect(
      planOne([decision({ cardId: ORION, relation: 'contradicts', relatedFactId: ACME_FACT })]),
    ).toMatchObject({ relation: { kind: 'new' } });
  });

  it('ramène à new la relation d’une nouvelle fiche', () => {
    expect(planOne([newCard({ relation: 'supersedes', relatedFactId: ACME_FACT })])).toMatchObject({
      relation: { kind: 'new' },
    });
  });

  it('garde un prédicat du type de la fiche', () => {
    expect(planOne([decision()])).toMatchObject({ predicate: 'paiement' });
  });

  it("range en note un prédicat absent du type de la fiche, et n'y relie aucun fait", () => {
    // Le contexte donne les faits actifs du prédicat du candidat, pas ceux de `note`.
    const orionFact = {
      id: 'fact-orion-paiement',
      predicate: 'paiement',
      statement: 'Orion est payé à trente jours.',
      validFrom: '2026-09-01T00:00:00.000Z',
    };
    const cardOptions = [{ ...ORION_OPTION, activeFacts: [orionFact] }];

    expect(
      planOne([decision({ cardId: ORION, relation: 'supersedes', relatedFactId: orionFact.id })], {
        cardOptions,
      }),
    ).toMatchObject({ predicate: 'note', relation: { kind: 'new' } });
  });

  it('prend les prédicats du parent pour un type proposé', () => {
    const proposedType = { slug: 'salon', label: 'Salon', parentSlug: 'projet' };

    expect(
      planOne([newCard({ typeSlug: null, proposedType })], { predicate: 'echeance' }),
    ).toMatchObject({ predicate: 'echeance' });
    expect(planOne([newCard({ typeSlug: null, proposedType })])).toMatchObject({
      predicate: 'note',
    });
  });

  it('ajoute le nom du sujet, son e-mail et son domaine en minuscules', () => {
    const subject = { name: 'ACME', email: 'Compta@ACME.fr', domain: 'ACME.fr' };

    expect(planOne([decision()], { subject })).toMatchObject({
      aliases: [
        { alias: 'ACME', kind: 'name' },
        { alias: 'compta@acme.fr', kind: 'email' },
        { alias: 'acme.fr', kind: 'domain' },
      ],
    });
    expect(planOne([decision()])).toMatchObject({ aliases: [{ alias: 'ACME', kind: 'name' }] });
  });

  it('produit une action complète', () => {
    expect(planOne([decision({ relation: 'contradicts', relatedFactId: ACME_FACT })])).toEqual({
      kind: 'place',
      candidateId: CANDIDATE,
      target: { kind: 'existing', cardId: ACME },
      predicate: 'paiement',
      relation: { kind: 'contradicts', factId: ACME_FACT },
      aliases: [{ alias: 'ACME', kind: 'name' }],
    });
  });
});
