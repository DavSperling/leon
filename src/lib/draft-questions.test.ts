import { describe, expect, it } from 'vitest';
import {
  answersOf,
  type Flow,
  type FlowAction,
  flowReducer,
  OTHER,
  startFlow,
} from './draft-questions';

// La logique de la carte des demandes de Leon, sans écran : le rendu de test n'a pas de clic. Données inventées.

const CHOIX = [
  ['Oui', 'Non, proposer jeudi'],
  ['1 200 €', '1 500 €', 'Le tarif habituel'],
  ['Vendredi', 'La semaine prochaine'],
];
const play = (flow: Flow, ...actions: FlowAction[]) => actions.reduce(flowReducer, flow);
const next: FlowAction = { type: 'next' };
const previous: FlowAction = { type: 'previous' };

describe('startFlow : la carte s’ouvre', () => {
  it('sur la première question, sans rien de retenu', () => {
    expect(startFlow(CHOIX)).toEqual({
      step: 0,
      picks: [
        { choice: null, text: '' },
        { choice: null, text: '' },
        { choice: null, text: '' },
      ],
    });
  });

  it('une question sans choix, posée avant eux, n’a que son texte libre', () => {
    expect(startFlow([[], ['Oui', 'Non']]).picks.map((pick) => pick.choice)).toEqual([OTHER, null]);
  });
});

describe('flowReducer : d’une question à l’autre', () => {
  it('« Suivant » va à la question suivante, puis au récapitulatif après la dernière, et pas plus loin', () => {
    const steps = [1, 2, 3, 4].map(
      (times) => play(startFlow(CHOIX), ...Array(times).fill(next)).step,
    );

    expect(steps).toEqual([1, 2, 3, 3]);
  });

  it('on passe une question sans y répondre : rien n’est retenu pour elle', () => {
    const flow = play(startFlow(CHOIX), next, { type: 'pick', choice: 1 }, next, next);

    expect(flow.step).toBe(3);
    expect(answersOf(CHOIX, flow.picks)).toEqual(['', '1 500 €', '']);
  });

  it('« Précédent » revient, depuis une question comme depuis le récapitulatif, et s’arrête à la première', () => {
    const recap = play(startFlow(CHOIX), next, next, next);

    expect(play(recap, previous).step).toBe(2);
    expect(play(recap, previous, previous, previous).step).toBe(0);
    expect(play(recap, previous, previous, previous, previous).step).toBe(0);
  });

  it('du récapitulatif, « Modifier » rouvre une question ; une étape qui n’existe pas ne change rien', () => {
    const recap = play(startFlow(CHOIX), next, next, next);

    expect(play(recap, { type: 'goto', step: 1 }).step).toBe(1);
    expect(play(recap, { type: 'goto', step: 4 })).toBe(recap);
    expect(play(recap, { type: 'goto', step: -1 })).toBe(recap);
  });

  it('aller et venir garde ce qu’elle a retenu', () => {
    const flow = play(
      startFlow(CHOIX),
      { type: 'pick', choice: 0 },
      next,
      { type: 'pick', choice: OTHER },
      { type: 'write', text: 'Mille euros.' },
      next,
      next,
      { type: 'goto', step: 0 },
      next,
    );

    expect(flow).toEqual({
      step: 1,
      picks: [
        { choice: 0, text: '' },
        { choice: OTHER, text: 'Mille euros.' },
        { choice: null, text: '' },
      ],
    });
  });
});

describe('flowReducer : retenir un choix ou « Autre »', () => {
  it('un seul choix se retient à la fois, pour la question montrée seulement', () => {
    const flow = play(
      startFlow(CHOIX),
      { type: 'pick', choice: 0 },
      { type: 'pick', choice: 1 },
      next,
      { type: 'pick', choice: 2 },
    );

    expect(flow.picks.map((pick) => pick.choice)).toEqual([1, 2, null]);
  });

  it('« Autre » ouvre son texte libre, gardé si elle revient à un choix proposé puis à « Autre »', () => {
    const other = play(
      startFlow(CHOIX),
      { type: 'pick', choice: OTHER },
      { type: 'write', text: 'Plutôt mercredi.' },
    );
    expect(answersOf(CHOIX, other.picks)[0]).toBe('Plutôt mercredi.');

    const back = play(other, { type: 'pick', choice: 0 });
    expect(answersOf(CHOIX, back.picks)[0]).toBe('Oui');
    expect(answersOf(CHOIX, play(back, { type: 'pick', choice: OTHER }).picks)[0]).toBe(
      'Plutôt mercredi.',
    );
  });

  it('sur le récapitulatif, il n’y a rien à retenir', () => {
    const recap = play(startFlow(CHOIX), next, next, next);

    expect(
      play(recap, { type: 'pick', choice: 0 }, { type: 'write', text: 'Rien.' }).picks,
    ).toEqual(recap.picks);
  });
});

describe('answersOf : ses réponses à envoyer', () => {
  it('une réponse par question, dans l’ordre : le texte du choix retenu, son texte libre sans les blancs autour, ou vide', () => {
    expect(
      answersOf(CHOIX, [
        { choice: 1, text: 'Un texte libre abandonné.' },
        { choice: OTHER, text: '  Mille euros,\nhors taxes. \n' },
        { choice: null, text: '' },
      ]),
    ).toEqual(['Non, proposer jeudi', 'Mille euros,\nhors taxes.', '']);
  });

  it('« Autre » laissé vide ne répond rien, et un choix qui n’existe pas non plus', () => {
    expect(
      answersOf(CHOIX, [
        { choice: OTHER, text: ' \n ' },
        { choice: 7, text: '' },
        { choice: null, text: 'Jamais ouvert.' },
      ]),
    ).toEqual(['', '', '']);
  });

  it('autant de réponses que de questions, même sans rien de retenu', () => {
    expect(answersOf(CHOIX, startFlow(CHOIX).picks)).toEqual(['', '', '']);
    expect(answersOf([[]], startFlow([[]]).picks)).toEqual(['']);
  });
});
