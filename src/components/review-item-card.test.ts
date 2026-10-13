import { describe, expect, it, vi } from 'vitest';
import type { ReviewItemView } from '@/server/memory/review-list';
import { actionsFor, resolutionLabel } from './review-item-card';

vi.mock('@/app/(app)/a-verifier/actions', () => ({ resolveReviewAction: vi.fn() }));

type Detail = ReviewItemView['detail'];

const sensitive = { kind: 'sensitive_fact' } as Detail;
const entity = { kind: 'entity_match' } as Detail;
const type = {
  kind: 'proposed_type',
  type: { id: 't', slug: 'chantier', label: 'Chantier', parentLabel: 'Projet' },
  cardCount: 6,
} as Detail;
const conflict = { kind: 'conflict' } as Detail;

const labels = (detail: Detail) => actionsFor(detail).map((action) => action.label);
const confirming = (detail: Detail) =>
  actionsFor(detail).flatMap((action) => (action.confirm ? [action.label] : []));

describe('actionsFor', () => {
  it('donne à chaque question ses réponses, dites par leur effet', () => {
    expect(labels(sensitive)).toEqual(['Garder privé', 'Partager']);
    expect(labels(entity)).toEqual(['Non, garder deux fiches', 'Oui, fusionner']);
    expect(labels(type)).toEqual(['Ranger sous Projet', 'Valider le type']);
    expect(labels(conflict)).toEqual([
      'Garder le premier',
      'Garder le second',
      'Les deux sont faux',
    ]);
  });

  it("ne demande de confirmer que les actions qui élargissent l'audience", () => {
    expect(confirming(sensitive)).toEqual(['Partager']);
    expect(confirming(entity)).toEqual(['Oui, fusionner']);
    expect(confirming(type)).toEqual([]);
    expect(confirming(conflict)).toEqual([]);
    expect(actionsFor(sensitive).map((a) => a.confirm)).toEqual([
      undefined,
      'Confirmer le partage',
    ]);
    expect(actionsFor(entity).map((a) => a.confirm)).toEqual([undefined, 'Confirmer la fusion']);
  });

  it('annonce le partage et la fusion par leur toast', () => {
    expect(actionsFor(sensitive)[1]?.done).toBe('Partage enregistré.');
    expect(actionsFor(entity)[1]?.done).toBe('Fiches fusionnées.');
  });

  it('envoie la résolution qui correspond au libellé', () => {
    expect(actionsFor(sensitive)[1]?.resolution).toEqual({
      kind: 'sensitive_fact',
      decision: 'share',
    });
    expect(actionsFor(type)[0]?.resolution).toEqual({
      kind: 'proposed_type',
      decision: 'use_parent',
    });
    expect(actionsFor(conflict)[2]?.resolution).toEqual({
      kind: 'conflict',
      decision: 'both_wrong',
    });
  });
});

describe('resolutionLabel', () => {
  it('dit ce qui a été décidé', () => {
    expect(resolutionLabel({ kind: 'sensitive_fact', decision: 'keep_private' })).toBe(
      'Gardé privé',
    );
    expect(resolutionLabel({ kind: 'sensitive_fact', decision: 'share' })).toBe(
      "Partagé avec l'équipe",
    );
    expect(resolutionLabel({ kind: 'proposed_type', decision: 'use_parent' })).toBe(
      'Fiches rangées sous le type parent',
    );
  });

  it('nomme un élément clos sans décision', () => {
    expect(resolutionLabel({ kind: 'obsolete' })).toBe('Devenu sans objet');
  });
});
